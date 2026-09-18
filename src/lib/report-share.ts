/**
 * Share a report as a WhatsApp click-to-chat message — text-only (wa.me can't attach a file,
 * same constraint as buildPayslipWhatsAppUrl), so the message carries the report's title, date
 * range and a short summary line; the recipient still gets the actual PDF/Excel from whoever
 * downloaded and forwarded it. No target number — omitting it opens WhatsApp's own contact
 * picker instead of pre-filling one person, since a report isn't addressed to a single person
 * the way an order update is.
 */
export function buildReportWhatsAppUrl(title: string, summaryLines: string[]): string {
  const message = [`*${title}*`, ...summaryLines].join("\n");
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
