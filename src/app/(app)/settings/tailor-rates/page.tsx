import { redirect } from "next/navigation";

/** Tailor Payable Rates merged into the Rate Card page (src/app/(app)/settings/rates/page.tsx)
 *  — redirect any bookmarked/linked visit here rather than leave a dead page. */
export default function Page() {
  redirect("/settings/rates");
}
