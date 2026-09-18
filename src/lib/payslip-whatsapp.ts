import { normalizeIndianMobile } from "@/lib/business-rules";
import { inr, fmtDate } from "@/lib/format";
import type { Employee, Payslip, PayrollRun } from "@/lib/types";

/**
 * Payday WhatsApp notification — click-to-chat only (wa.me can't attach the PDF), so the
 * message carries the net-pay figure itself; the employee still downloads the actual salary
 * slip from the app. Mirrors buildWhatsAppUrl()'s normalizeIndianMobile() handling in
 * business-rules.ts so a mobile typed/imported with spaces or a leading +91/0 still resolves
 * to the same wa.me link as a plain 10-digit number.
 */
export function buildPayslipWhatsAppMessage(employee: Pick<Employee, "name">, payslip: Pick<Payslip, "netPay" | "status">, run: Pick<PayrollRun, "periodStart" | "periodEnd">, shopName?: string): string {
  const period = `${fmtDate(run.periodStart)} – ${fmtDate(run.periodEnd)}`;
  const payLine = payslip.status === "paid" ? `has been paid: *${inr(payslip.netPay)}*` : `is ready: *${inr(payslip.netPay)}*`;
  return `Dear *${employee.name}*,\n\nYour salary for *${period}* ${payLine}${shopName ? `\n- *${shopName}*` : ""}`;
}

export function buildPayslipWhatsAppUrl(
  employee: Pick<Employee, "name" | "mobile">,
  payslip: Pick<Payslip, "netPay" | "status">,
  run: Pick<PayrollRun, "periodStart" | "periodEnd">,
  shopName?: string
): string {
  const mobile = normalizeIndianMobile(employee.mobile);
  const message = buildPayslipWhatsAppMessage(employee, payslip, run, shopName);
  return `https://wa.me/91${mobile}?text=${encodeURIComponent(message)}`;
}
