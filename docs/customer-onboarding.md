# Customer Onboarding — `scripts/onboard-customer.mjs`

Automates the manual process in [`module-licensing-runbook.md`](./module-licensing-runbook.md) end
to end. The architecture hasn't changed — every customer still gets their own isolated Supabase
project and Vercel deployment, full data isolation, nothing shared — this script just stops you
doing the setup steps by hand.

If you'd rather do it manually (or the script fails partway and you want to finish a step
yourself), the manual runbook still applies — everything below produces exactly the same result
the manual steps do.

---

## One-time setup

1. Copy the config template:
   ```bash
   cp scripts/onboard.local.example.json scripts/onboard.local.json
   ```
   This file is gitignored — real tokens never get committed.

2. Fill in `scripts/onboard.local.json`:

   | Field | Where to get it |
   |---|---|
   | `platformOwnerEmail` | Your own login email — the same address you'd put in `NEXT_PUBLIC_SUPER_ADMIN_EMAIL`. Only this email will ever see Module Licensing in any customer's deployment. |
   | `supabase.accessToken` | Supabase dashboard → your avatar → **Access Tokens** → Generate new token. Needs project-creation scope. |
   | `supabase.organizationId` | Supabase dashboard → your org → the URL is `supabase.com/dashboard/org/<this-id>`. |
   | `supabase.region` | Where the customer's database should live, e.g. `ap-south-1` for Mumbai. |
   | `supabase.plan` | `"free"` or `"pro"` depending on what tier you provision customers on. |
   | `vercel.accessToken` | Vercel dashboard → **Settings** → **Tokens** → Create. |
   | `vercel.teamId` | Only if new customer projects should live under a Vercel team — leave `""` for your personal account. |
   | `vercel.githubRepo` | `"your-username/fashion-os-erp"` — the repo must already exist on GitHub and be the one Vercel deploys from. |
   | `vercel.productionBranch` | Usually `"main"`. |
   | `appDefaults.appName` | Default browser-tab name for new deployments (you're asked per-customer too, this is just the pre-filled default). |

---

## Onboarding a new customer

```bash
npm run onboard-customer
```

You'll be asked:
- Shop/customer name
- A project slug (used for the Supabase + Vercel project names — auto-suggested from the name)
- App display name (defaults to your `appDefaults.appName`)
- Which of the 8 modules they bought (`y`/`n` for each: inventory, purchases, sales, employees, expenses, pos, copilot, reports)

Then it prints the plan and asks you to type `yes` to confirm — this is the one deliberate stop,
because the next step creates **billable** Supabase and Vercel resources.

### What happens after you confirm
1. Creates the Supabase project, waits for it to go active (1-3 minutes)
2. Runs every file in `supabase/migrations/` against it, in order — including substituting your
   real email into `add_module_entitlements.sql`'s `OWNER_EMAIL_PLACEHOLDER`
3. Writes the `moduleEntitlements` row for whichever modules you said they bought
4. Creates the Vercel project, linked to your GitHub repo
5. Generates and sets every environment variable the app needs — a **fresh** VAPID keypair and
   `ATTENDANCE_SESSION_SECRET` per customer, never reused across deployments
6. Attempts to trigger the first deployment

At the end it prints the Supabase dashboard link, the Vercel project link, and the database
password (save it somewhere — it's not stored anywhere else).

---

## Try it safely first

```bash
npm run onboard-customer -- --dry-run --name="Test Shop" --modules=employees,reports
```

Prints the exact plan (project names, modules) and stops — **creates nothing**. Good for
sanity-checking your config file before running it for real.

---

## Non-interactive mode

If typing through prompts is inconvenient, or you hit the readline/piped-stdin issue below, pass
everything as flags instead:

```bash
npm run onboard-customer -- \
  --name="Sharma Tailors" \
  --slug=sharma-tailors \
  --app-name="Fashion Flow" \
  --modules=employees,reports \
  --yes
```

`--modules` is a comma list from: `inventory,purchases,sales,employees,expenses,pos,copilot,reports`.
`--yes` skips the billing confirmation — only use this once you trust the flow.

---

## Resuming a failed run

If the script fails partway (e.g. Vercel project creation fails after the Supabase project was
already created), don't start over — resume from where it stopped:

```bash
npm run onboard-customer -- --resume-supabase=<project-ref> --resume-vercel=<vercel-project-id>
```

Both flags are optional and independent — pass whichever phases already succeeded. Resuming skips
re-running migrations for a resumed Supabase project (they're assumed already applied).

---

## What's still manual

1. **Favicon / theme-color**, for white-labeled customers — swap `public/icon.svg`,
   `public/icon-192.png`, `public/icon-512.png`, and the `viewport.themeColor` hex in
   `src/app/layout.tsx` before handing the deployment over. One-time per deployment, not
   automatable from a script that only has API access.
2. **Razorpay auto-billing**, if this customer is on a subscription rather than manual/cash billing
   — run `add_billing_events.sql`, set `RAZORPAY_WEBHOOK_SECRET`, point their Razorpay webhook at
   `/api/webhooks/razorpay`. See the module-licensing runbook's Razorpay section.
3. **Add them to `scripts/customers.local.json`** so they show up in `npm run usage-report` — the
   script reminds you of this at the end but doesn't do it for you (that file is a manually curated
   list of customers you actively want to track, not "every deployment that exists").

---

## Troubleshooting

| Symptom | What to do |
|---|---|
| "Could not read scripts/onboard.local.json" | You skipped the one-time setup — copy the `.example.json` and fill it in. |
| Timed out waiting for Supabase project to become active | Rare, but check the Supabase dashboard directly — it may just need another minute. Once it's active, resume with `--resume-supabase=<ref>`. |
| "Could not connect to the new database directly" | Some Supabase regions need the pooler connection instead of the direct one. Run the migrations by hand once via the Supabase SQL Editor (copy/paste each file in `supabase/migrations/`, in filename order), then resume with `--resume-supabase=<ref>` to skip straight to the Vercel phase. |
| One migration file fails, others succeed | The script logs which one and keeps going — check that file manually afterward. A `CREATE POLICY "authenticated_all"` failure specifically usually means it's already applied (Postgres doesn't support `IF NOT EXISTS` on policies) — harmless, see the module-licensing runbook. |
| Deployment doesn't trigger automatically | The script warns you when this happens — open the Vercel dashboard for the new project and click **Redeploy**, or push any commit to the production branch. This is the least stable step in the whole flow; a manual click is the expected fallback, not a bug. |
| Interactive prompts hang after the first question | A Node `readline`/piped-stdin quirk seen on some Windows shells (confirmed on Git Bash while building this). Use the non-interactive flags (`--name=`, `--slug=`, `--modules=`, `--yes`) instead — see above. |
