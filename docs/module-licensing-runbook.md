# Module Licensing — Runbook

> **Onboarding a new customer?** [`customer-onboarding.md`](./customer-onboarding.md) automates
> steps 1-3 below (Supabase project, migrations, entitlements, Vercel project, env vars) via
> `npm run onboard-customer`. This doc is still the reference for what the script does under the
> hood, and for doing any of it by hand if you ever need to.

Fashion OS ERP is sold as separately-priced packages. Each customer runs their own isolated
deployment (own Supabase project + own Vercel deployment — not a shared database), and only the
platform owner (you) decides which modules, reports, and dashboard widgets exist in that
deployment. A customer's own shop admin cannot unlock anything you didn't turn on for them.

This is a different layer from the app's regular role permissions:

- **Roles/permissions** (`src/lib/permissions.ts`) — decide what a *logged-in user's role* can do
  *within* a deployment that already has a module (e.g. can a "sales" role delete an order).
- **Module licensing** (this doc) — decides what *exists in the deployment at all*, regardless of
  role. If a module is off, even the customer's own admin can't see or reach it.

---

## What's always included (core, never sold separately)

- Dashboard
- Stitching Orders (+ Board, + Alterations)
- Customers (CRM)
- Manufacturing (cutting/production tracking)
- Cost Estimator
- Activity Log
- Settings (shop profile, tailors, rate card, measurements, users & roles, appearance, etc.)

## What's individually sellable

| Module | Covers |
|---|---|
| **Inventory** | Raw materials, products, stock ledger, warehouses & transfers |
| **Purchases** | Vendors, purchase orders, bills, payments made, vendor credits |
| **Product Sales** | Quotations, invoices, recurring invoices, payments received |
| **Employees** | Staff directory, attendance, commission, payroll & salaries |
| **Expenses** | Expense tracking and categories |
| **POS** | Point-of-sale checkout screen |
| **AI Copilot** | AI chat assistant over the shop's data |
| **Reports** | The Reports center — individual reports are toggled separately, see below |

Reports and Dashboard Widgets each have their own individual on/off switch **on top of** their
owning module's switch. A report/widget is visible only if both its module is on *and* its own
flag is on. Turning a module off hides all of its reports/widgets regardless of their individual
flag — you can't cherry-pick a report from a module the customer didn't buy.

## Settings menu items

Every item under the Settings sidebar group (Shop Profile, Tailors, Rate Card, Loyalty, WhatsApp
Templates, Invoice Template, Price Lists, Bot/AI, Users & Roles, Appearance, Sidebar Navigation,
etc.) can be individually hidden per customer from the **Settings Menu** card on the Module
Licensing page — same per-item toggle pattern as Reports and Widgets, just not gated by a parent
module. Two items are permanently exempt and never appear in this list: **Account** (password
change must always stay reachable) and **Module Licensing** itself (already restricted to you
separately). As the platform owner, you always see every Settings item regardless of what you've
hidden for the customer — the toggle only affects what their own logged-in users see.

---

## One-time setup — per customer deployment

Do this once for each new Supabase project / Vercel deployment you spin up for a customer.

1. **Set your owner email as an environment variable.**
   In `.env.local` (and in the Vercel project's Environment Variables if it's deployed):
   ```
   NEXT_PUBLIC_SUPER_ADMIN_EMAIL=your-login-email@example.com
   ```
   This is the login email that will see the "Module Licensing" settings page. Nobody else
   can, no matter what role they're assigned in `user_roles`.

2. **Run the entitlements migration** in that project's Supabase SQL Editor.
   Open `supabase/migrations/add_module_entitlements.sql` and **replace
   `OWNER_EMAIL_PLACEHOLDER`** with the exact same email from step 1, then run it. This installs
   a `set_module_entitlements` database function that rejects any write attempt from a different
   email — so even a technically-savvy shop admin poking at the API directly from dev tools can't
   re-enable something you turned off.

3. **Redeploy / restart** so the new env var takes effect.

If you skip step 2, the Module Licensing page will save nothing (the write is rejected server-side)
even though you can see and click the checkboxes.

---

## Configuring a customer's package

1. Log in to their deployment with your owner email.
2. Go to **Settings → Module Licensing** (only visible to you).
3. **Modules** section — check on whatever they paid for, leave the rest unchecked.
4. **Reports** section — grouped by category, each report individually checkable. Reports whose
   module is off appear greyed out (can't be turned on independently).
5. **Dashboard Widgets** section — same pattern, one checkbox per widget tile.
6. Click **Save changes**. Effective immediately — no redeploy needed.

### Example: "Stitching Orders only" tier
Uncheck every module (Inventory, Purchases, Product Sales, Employees, Expenses, POS, AI Copilot,
Reports) and save. The customer is left with a lean tailoring-only app: orders, board,
alterations, customers, manufacturing, cost estimator, activity log, and their own settings.

### Example: fuller ERP tier
Check whichever modules match what they paid for (e.g. Inventory + Purchases + Product Sales for
a retail-plus-tailoring shop), then fine-tune individual reports/widgets if you're selling a
mid-tier package that excludes a few premium reports.

---

## What "disabled" actually does

- Nav sidebar entry disappears entirely (no greyed-out "upgrade" teaser).
- Typing the URL directly redirects the user away (enforced server-side, not just hidden in the UI).
- Disabled reports vanish from both the sidebar and the `/reports` page.
- Disabled dashboard widgets disappear and can't be re-added from the customize panel.
- ⌘K / Ctrl+K quick search no longer surfaces disabled reports or the Module Licensing settings
  entry for non-owners.

## What it does *not* do

- It doesn't scrub every incidental cross-module reference in the UI (e.g. a stray stock-count
  badge elsewhere in the app that happens to read inventory data). Scope is limited to nav access,
  direct routes, reports, and dashboard widgets.
- It's per-deployment, not per-user. Every user in a given customer's deployment sees the same set
  of licensed modules — you can't give one staff member Inventory and hide it from another staff
  member at the same shop (that's what roles/permissions are for, separately).

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "Module Licensing" not in Settings menu | Your login email doesn't match `NEXT_PUBLIC_SUPER_ADMIN_EMAIL` exactly (case-insensitive, but must be the full address) |
| Save button errors "Failed to save" | Migration wasn't run, or the email inside the SQL function doesn't match your login email |
| Toggled a module off but it's still visible | Hard-refresh / clear the browser's cached session — nav and route checks are cached client-side briefly |
| Existing customer suddenly missing something after this feature shipped | Shouldn't happen — no `moduleEntitlements` row defaults to everything enabled, matching pre-feature behavior. If it does, check the row wasn't accidentally saved with modules unchecked. |

---

# Extensions — billing, limits, branding, export

Everything below builds on the same `moduleEntitlements` setting and Settings → Module Licensing
page described above.

## Expiry / "paid until"

Settings → Module Licensing now has a **Billing** card with a "Paid until" date. Blank = never
expires. Set it manually for cash/bank-transfer customers. When it lapses (or is within 7 days),
every logged-in user sees a non-blocking amber banner asking them to renew — nothing locks up,
it's a nudge only.

## Usage limits (soft caps)

Same page, **Usage Limits** card: "Max orders per month" and "Max staff accounts." Leave blank for
unlimited. Once a customer hits the cap, they see a one-time warning toast when creating the next
order or adding the next staff member — the action still succeeds. There is no hard block anywhere
in this system.

## Branded login

Automatic — the login page already reads Settings → Shop Profile's name/logo. No extra setup
needed per customer beyond what they already configure themselves.

## Self-serve data export

Any admin-role user can go to Settings → Account and click "Download all my data" to get a JSON
dump of their orders, customers, invoices, inventory, and other business tables. No setup needed.

## Razorpay auto-unlock (billing webhook)

1. Run `supabase/migrations/add_billing_events.sql` in that customer's Supabase project.
2. Add `RAZORPAY_WEBHOOK_SECRET` to that deployment's env vars (from Razorpay's webhook settings).
3. Also confirm `SUPABASE_SERVICE_ROLE_KEY` is set (same requirement as the AI-briefing cron).
4. In Razorpay, point the subscription's webhook URL at `https://<that-deployment>/api/webhooks/razorpay`.

Once wired, a successful payment automatically updates "Paid until" on the Billing card — no
manual toggling needed for that customer going forward. A cancelled/failed payment does **not**
immediately cut anything off; it's logged (`billing_events` table, viewable in Supabase) and the
existing paid-until date simply lapses on its own schedule.

## Usage-check script (manual, run by hand)

`scripts/customers.local.example.json` is a committed **template** (safe, fake values — shows the
shape). `scripts/customers.local.json` (no `example`) is the **real** file with actual customer
credentials — it's in `.gitignore`, so it can never get pushed to GitHub by accident.

1. Copy the template:
   ```bash
   cp scripts/customers.local.example.json scripts/customers.local.json
   ```
2. Edit `scripts/customers.local.json` — one entry per customer deployment:
   ```json
   [
     {
       "name": "Sharma Tailors",
       "supabaseUrl": "https://abcxyz123.supabase.co",
       "serviceRoleKey": "eyJhbGciOi...(long key)..."
     },
     {
       "name": "Priya Boutique",
       "supabaseUrl": "https://qrstuv456.supabase.co",
       "serviceRoleKey": "eyJhbGciOi...(long key)..."
     }
   ]
   ```
   For each customer, get the two values from their Supabase dashboard → that project → Project
   Settings → API:
   - `supabaseUrl` — "Project URL"
   - `serviceRoleKey` — the **service_role** key, not the public **anon** key. The service-role
     key bypasses that project's normal access rules so the script can read row counts and
     settings directly — exactly why this file must never be committed or shared.
3. Run:
   ```bash
   npm run usage-report
   ```
4. Prints a table: licensed modules, paid-until date, order counts, last activity — one row per
   customer, straight to your terminal. Not automated or scheduled — run it by hand before
   renewal conversations. If you run it before step 1–2, it tells you the file is missing and
   exits cleanly rather than erroring.

## White-label branding

- **Receipts & printed reports**: automatically pick up the shop logo from Settings → Shop
  Profile — no action needed.
- **App name (browser tab title)**: set `NEXT_PUBLIC_APP_NAME` in that deployment's env vars.
- **Favicon / theme color**: not automatic — swap `public/icon.svg`, `public/icon-192.png`,
  `public/icon-512.png`, and the `viewport.themeColor` hex in `src/app/layout.tsx` before
  deploying a white-labeled customer instance. Since every customer is already a separate
  deployment, this is a one-time manual step per deployment, not a code feature.
