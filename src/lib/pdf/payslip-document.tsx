import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { fmtDate } from "@/lib/format";
import type { Payslip, Employee, PayrollRun, EmployeeAdvance } from "@/lib/types";

// react-pdf's built-in fonts have no ₹ glyph — same convention as invoice-document.tsx.
function money(n: number): string {
  return "Rs. " + Math.round(n || 0).toLocaleString("en-IN");
}

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
  logo: { width: 56, height: 56, objectFit: "contain", marginBottom: 4 },
  shopName: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  muted: { color: "#6b7280", fontSize: 8 },
  title: { fontSize: 16, textAlign: "right", fontFamily: "Helvetica-Bold" },
  period: { fontSize: 9, color: "#6b7280", textAlign: "right", marginTop: 2 },
  infoBlock: { flexDirection: "row", justifyContent: "space-between", marginTop: 16, borderTop: "1 solid #e5e7eb", borderBottom: "1 solid #e5e7eb", paddingVertical: 10 },
  infoLabel: { fontSize: 7, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 },
  infoValue: { fontSize: 10, marginTop: 2 },
  sectionTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", marginTop: 18, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5, color: "#374151" },
  attendanceGrid: { flexDirection: "row", flexWrap: "wrap" },
  attendanceCell: { width: "25%", marginBottom: 8 },
  attendanceValue: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  attendanceLabel: { fontSize: 7, color: "#6b7280", textTransform: "uppercase" },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderTop: "1 solid #f3f4f6" },
  rowLabel: { fontSize: 9, color: "#374151" },
  rowValue: { fontSize: 9 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", borderTop: "1 solid #111827", marginTop: 6, paddingTop: 6 },
  totalLabel: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  totalValue: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  footer: { position: "absolute", bottom: 24, left: 32, right: 32, textAlign: "center", fontSize: 7, color: "#9ca3af" },
});

export function PayslipDocument({
  payslip,
  employee,
  run,
  advances,
  shopName,
  shopAddress,
  shopPhone,
  logoDataUrl,
}: {
  payslip: Payslip;
  employee: Employee;
  run: PayrollRun;
  advances: EmployeeAdvance[];
  shopName: string;
  shopAddress?: string;
  shopPhone?: string;
  logoDataUrl?: string | null;
}) {
  const advancesTotal = advances.reduce((s, a) => s + a.amount, 0);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            {logoDataUrl && <Image src={logoDataUrl} style={styles.logo} />}
            <Text style={styles.shopName}>{shopName || "Shop"}</Text>
            {shopAddress && <Text style={styles.muted}>{shopAddress}</Text>}
            {shopPhone && <Text style={styles.muted}>{shopPhone}</Text>}
          </View>
          <View>
            <Text style={styles.title}>SALARY SLIP</Text>
            <Text style={styles.period}>{fmtDate(run.periodStart)} – {fmtDate(run.periodEnd)}</Text>
          </View>
        </View>

        <View style={styles.infoBlock}>
          <View>
            <Text style={styles.infoLabel}>Employee</Text>
            <Text style={styles.infoValue}>{employee.name}</Text>
          </View>
          <View>
            <Text style={styles.infoLabel}>Role</Text>
            <Text style={styles.infoValue}>{employee.role || "—"}</Text>
          </View>
          <View>
            <Text style={styles.infoLabel}>Pay basis</Text>
            <Text style={styles.infoValue}>{employee.salaryType} — {money(employee.salaryRate)}</Text>
          </View>
          <View>
            <Text style={styles.infoLabel}>Status</Text>
            <Text style={styles.infoValue}>{payslip.status === "paid" ? "Paid" : "Draft"}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Attendance Summary</Text>
        <View style={styles.attendanceGrid}>
          <View style={styles.attendanceCell}>
            <Text style={styles.attendanceValue}>{payslip.presentDays}</Text>
            <Text style={styles.attendanceLabel}>Present</Text>
          </View>
          <View style={styles.attendanceCell}>
            <Text style={styles.attendanceValue}>{payslip.absentDays}</Text>
            <Text style={styles.attendanceLabel}>Absent</Text>
          </View>
          <View style={styles.attendanceCell}>
            <Text style={styles.attendanceValue}>{payslip.halfDays}</Text>
            <Text style={styles.attendanceLabel}>Half day</Text>
          </View>
          <View style={styles.attendanceCell}>
            <Text style={styles.attendanceValue}>{payslip.leaveDays}</Text>
            <Text style={styles.attendanceLabel}>Leave</Text>
          </View>
          <View style={styles.attendanceCell}>
            <Text style={styles.attendanceValue}>{payslip.hoursWorked}h</Text>
            <Text style={styles.attendanceLabel}>Hours worked</Text>
          </View>
          <View style={styles.attendanceCell}>
            <Text style={styles.attendanceValue}>{payslip.overtimeHours}h</Text>
            <Text style={styles.attendanceLabel}>Overtime hours</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Earnings & Deductions</Text>
        <View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Gross pay</Text>
            <Text style={styles.rowValue}>{money(payslip.grossPay)}</Text>
          </View>
          {payslip.overtimeHours > 0 && (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Overtime pay ({payslip.overtimeHours}h)</Text>
              <Text style={styles.rowValue}>{money(payslip.overtimePay)}</Text>
            </View>
          )}
          {payslip.pieceRatePay > 0 && (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Piece-rate pay</Text>
              <Text style={styles.rowValue}>{money(payslip.pieceRatePay)}</Text>
            </View>
          )}
          {advances.map((a) => (
            <View style={styles.row} key={a.id}>
              <Text style={styles.rowLabel}>Advance deducted — {fmtDate(a.date)}{a.note ? ` (${a.note})` : ""}</Text>
              <Text style={styles.rowValue}>− {money(a.amount)}</Text>
            </View>
          ))}
          {advancesTotal === 0 && payslip.deductions > 0 && (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Deductions</Text>
              <Text style={styles.rowValue}>− {money(payslip.deductions)}</Text>
            </View>
          )}
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Net Pay</Text>
          <Text style={styles.totalValue}>{money(payslip.netPay)}</Text>
        </View>

        <Text style={styles.footer}>This is a computer-generated salary slip.</Text>
      </Page>
    </Document>
  );
}
