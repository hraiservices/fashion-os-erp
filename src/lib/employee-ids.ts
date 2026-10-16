/**
 * Employees who log in are given a hidden login address like `emp-<uuid>@dashboard.local`, and some stored text
 * (history lines, notification messages) was written with that id in place of the person's name. These helpers turn
 * any such id back into the employee's real name when text is shown, and never let the raw id appear.
 */
const EMPLOYEE_ID_RE = /\bemp-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:@dashboard\.local)?/gi;

/** Replaces every `emp-<uuid>` (optionally with its `@dashboard.local` suffix) with the employee's name; an id nobody
 *  recognises becomes "Staff" rather than leaking. `nameById` is keyed by the bare uuid. */
export function scrubEmployeeIds(text: string | null | undefined, nameById?: Map<string, string>): string {
  if (!text) return "";
  return text.replace(EMPLOYEE_ID_RE, (match) => {
    const id = match.replace(/@dashboard\.local$/i, "").slice("emp-".length);
    return nameById?.get(id) || "Staff";
  });
}
