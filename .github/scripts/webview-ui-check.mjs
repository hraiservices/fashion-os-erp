/**
 * Drives the REAL WebView inside the running Android app over the Chrome DevTools Protocol
 * (adb forwards the WebView's devtools socket; see emulator-smoke.sh).
 *
 * Screenshots alone can't tell you a layout is broken unless a human looks at every one, so this
 * asserts the two things that actually characterised the reported breakage: stylesheets failing
 * to load, and content overflowing the viewport ("squeezed"). Those are measurable.
 *
 * Why raw CDP rather than Playwright: playwright-core's connectOverCDP immediately calls
 * Browser.setDownloadBehavior, which Android's WebView does not implement ("Browser context
 * management is not supported"), so it cannot attach at all. The subset used here — Runtime,
 * Page, DOM — is what WebView does support. Node 22 ships a global WebSocket, so there is no
 * dependency to install.
 *
 * Credentials are optional and come from the environment, never from the repo. Without them this
 * still checks the login screen, which is enough to catch a dead or unstyled app.
 */
import { writeFileSync } from "node:fs";

const OUT = "artifacts";
const MOBILE = process.env.FF_TEST_MOBILE || "";
const PIN = process.env.FF_TEST_PIN || "";
const ORIGIN = process.env.FF_ORIGIN || "https://app.fashionflow.app";
const CDP = "http://localhost:9222";

const results = [];
let failures = 0;

function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Minimal CDP client: one socket, id-matched request/response, events on a listener list. */
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = [];
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method) {
        for (const fn of this.listeners) fn(msg);
      }
    });
  }

  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", () => reject(new Error(`cannot open ${url}`)), { once: true });
    });
    return new Cdp(ws);
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`${method} timed out`));
      }, 60000);
    });
  }

  /** Resolves when `predicate` sees a matching event, or rejects after `timeout`. */
  waitFor(predicate, timeout = 45000) {
    return new Promise((resolve, reject) => {
      const fn = (msg) => {
        if (!predicate(msg)) return;
        this.listeners.splice(this.listeners.indexOf(fn), 1);
        resolve(msg);
      };
      this.listeners.push(fn);
      setTimeout(() => {
        const i = this.listeners.indexOf(fn);
        if (i !== -1) {
          this.listeners.splice(i, 1);
          reject(new Error("timed out waiting for event"));
        }
      }, timeout);
    });
  }

  /** Runs an expression in the page and returns its value, awaiting promises. */
  async evaluate(expression) {
    const r = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || "evaluate threw");
    return r.result.value;
  }
}

/** The WebView advertises its own ws:// host; rewrite it to the adb-forwarded port. */
async function findPageTarget() {
  // The forwarded socket can be up a moment before the WebView registers its page target.
  let page;
  for (let i = 0; i < 15 && !page; i++) {
    try {
      const list = await fetch(`${CDP}/json/list`).then((r) => r.json());
      page = list.find((t) => t.type === "page") || list[0];
    } catch {
      /* devtools endpoint not answering yet */
    }
    if (!page) await sleep(2000);
  }
  if (!page) throw new Error("no debuggable page in the WebView");
  const path = page.webSocketDebuggerUrl
    ? new URL(page.webSocketDebuggerUrl).pathname
    : `/devtools/page/${page.id}`;
  return { url: page.url, ws: `ws://localhost:9222${path}` };
}

/** The two failure modes we actually saw: missing CSS, and content wider than the screen. */
async function auditLayout(cdp, label) {
  const m = await cdp.evaluate(`(() => {
    const rules = [...document.styleSheets].reduce((n, s) => {
      try { return n + s.cssRules.length; } catch { return n; }
    }, 0);
    return {
      cssRules: rules,
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
      bodyText: document.body.innerText.slice(0, 120),
    };
  })()`);
  const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/${label}.png`, Buffer.from(shot.data, "base64"));
  check(`${label}: stylesheets loaded`, m.cssRules > 50, `${m.cssRules} rules`);
  check(
    `${label}: no horizontal overflow`,
    m.scrollW <= m.innerW + 2,
    `scrollW ${m.scrollW} vs innerW ${m.innerW}`
  );
  return m;
}

/**
 * React tracks input values on the DOM node, so assigning `.value` directly is ignored on the
 * next render. Going through the prototype's native setter and then dispatching `input` is the
 * standard way to make a controlled component observe a scripted change.
 */
const TYPE_HELPER = `
  window.__ffType = (placeholder, value) => {
    const el = document.querySelector('input[placeholder="' + placeholder + '"]');
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  };
  window.__ffClickSignIn = () => {
    const b = [...document.querySelectorAll("button")].find((x) => /sign in/i.test(x.textContent || ""));
    if (!b) return false;
    b.click();
    return true;
  };
  true;
`;

async function navigate(cdp, url) {
  const loaded = cdp.waitFor((m) => m.method === "Page.loadEventFired").catch(() => {});
  await cdp.send("Page.navigate", { url });
  await loaded;
  await sleep(4000);
}

const target = await findPageTarget();
const cdp = await Cdp.connect(target.ws);
await cdp.send("Page.enable");
await cdp.send("Runtime.enable");

console.log("WebView URL:", target.url);
check("WebView loaded the app (not an error page)", !target.url.startsWith("file://"), target.url);

await auditLayout(cdp, "10-login-screen");

if (MOBILE && PIN) {
  console.log("Credentials present — signing in.");
  try {
    await cdp.evaluate(TYPE_HELPER);
    const filled =
      (await cdp.evaluate(`window.__ffType("10-digit number", ${JSON.stringify(MOBILE)})`)) &&
      (await cdp.evaluate(`window.__ffType("4-6 digit PIN", ${JSON.stringify(PIN)})`));
    if (!filled) throw new Error("login fields not found on the page");
    if (!(await cdp.evaluate("window.__ffClickSignIn()"))) throw new Error("sign in button not found");

    // Client-side routing means no load event necessarily fires; poll the URL instead.
    let url = "";
    for (let i = 0; i < 45; i++) {
      url = await cdp.evaluate("location.pathname");
      if (!url.includes("/login")) break;
      await sleep(1000);
    }
    check("signed in", !url.includes("/login"), url);
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
      await navigate(cdp, `${ORIGIN}${path}`);
      await auditLayout(cdp, label);
    } catch (e) {
      check(`${label}: reachable`, false, e.message.split("\n")[0]);
    }
  }
} else {
  console.log("No FF_TEST_MOBILE / FF_TEST_PIN set — checked the login screen only.");
}

writeFileSync(`${OUT}/ui-check.json`, JSON.stringify(results, null, 2));
cdp.ws.close();

console.log(`\n${results.length - failures}/${results.length} checks passed`);
process.exit(failures > 0 ? 1 : 0);
