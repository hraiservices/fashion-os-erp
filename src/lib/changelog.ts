/**
 * The "Recent Updates" tab on the Dashboard — same spirit as Zoho's own changelog tab.
 *
 * SHIPPED_UPDATES is auto-generated from git history (see scripts/generate-changelog.mjs,
 * which regenerates src/lib/changelog.generated.ts on every `npm run build`/`npm run dev`):
 * each entry is a merged PR's title and description, since this repo's PR titles are already
 * written in plain, customer-presentable language. To change what shows up here, write a good
 * PR title/description when you ship the change — don't hand-edit the generated file.
 *
 * UPCOMING_FEATURES ("coming soon") isn't derivable from history (it's forward-looking), so it
 * stays hand-maintained here — fine to leave empty when nothing is actively planned.
 */

export interface ChangelogEntry {
  date: string; // "YYYY-MM-DD"
  title: string;
  description: string;
}

export { SHIPPED_UPDATES } from "./changelog.generated";

export const UPCOMING_FEATURES: ChangelogEntry[] = [];
