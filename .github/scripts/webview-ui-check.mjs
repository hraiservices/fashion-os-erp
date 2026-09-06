/**
 * Drives the REAL WebView inside the running Android app over the Chrome DevTools Protocol
 * (adb forwards the WebView's devtools socket; see emulator-smoke.sh).
 *
 * Screenshots alone can't tell you a layout is broken unless a human looks at every one, so this
 * asserts the two things that actually characterised the reported breakage: stylesheets failing
 * to load, and content overflowing the viewport ("squeezed"). Those are measurable.
 *
 * Credentials are optional and come from the environment, never from the repo. Without them this
 * still checks the login screen, which is enough to catch a dead or unstyled app.
 */
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";

const OUT = "artifacts";
const MOBILE = process.env.FF_TEST_MOBILE || "";
const PIN = process.env.FF_TEST_PIN || "";
const ORIGIN = process.env.FF_ORIGIN || "https://app.fashionflow.app";

const results = [];
let failures = 0;

function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

/** The two failure modes we actually saw: missing CSS, and content wider than the screen. */
async function auditLayout(page, label) {
  const m = await page.evaluate(() => {
    const rules = [...document.styleSheets].reduce((n, s) => {
      try { return n + s.cssRules.length; } catch { return n; }
    }, 0);
    return {
      cssRules: rules,
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
      bodyText: document.body.innerText.slice(0, 120),
    };
  });
  await page.screenshot({ path: `${OUT}/${label}.png` });
  check(`${label}: stylesheets loaded`, m.cssRules > 50, `${m.cssRules} rules`);
  check(`${label}: no horizontal overflow`, m.scrollW <= m.innerW + 2, `scrollW ${m.scrollW} vs innerW ${m.innerW}`);
  return m;
}

const browser = await chromium.connectOverCDP("http://localhost:9222");
const ctx = browser.contexts()[0];
const page = ctx.pages()[0] ?? (await ctx.waitForEvent("page"));
await page.waitForLoadState("domcontentloaded").catch(() => {});

console.log("WebView URL:", page.url());
check("WebView loaded the app (not an error page)", !page.url().startsWith("file://"), page.url());

await auditLayout(page, "10-login-screen");

if (MOBILE && PIN) {
  console.log("Credentials present — signing in.");
  try {
    await page.getByPlaceholder("10-digit number").fill(MOBILE, { timeout: 20000 });
    await page.getByPlaceholder("4-6 digit PIN").fill(PIN);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 45000 });
    check("signed in", true, page.url());
  } catch (e) {
    check("signed in", false, e.message.split("\n")[0]);
  }

  // The screens reported as distorted: the order and invoice creation forms.
  for (const [label, path] of [
    ["20-dashboard", "/dashboard"],
    ["30-new-order", "/orders/new"],
    ["40-new-invoice", "/sales/invoices/new"],
  ]) {
    try {
      await page.goto(`${ORIGIN}${path}`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(4000);
      await auditLayout(page, label);
    } catch (e) {
      check(`${label}: reachable`, false, e.message.split("\n")[0]);
    }
  }
} else {
  console.log("No FF_TEST_MOBILE / FF_TEST_PIN set — checked the login screen only.");
}

writeFileSync(`${OUT}/ui-check.json`, JSON.stringify(results, null, 2));
await browser.close();

console.log(`\n${results.length - failures}/${results.length} checks passed`);
process.exit(failures > 0 ? 1 : 0);
