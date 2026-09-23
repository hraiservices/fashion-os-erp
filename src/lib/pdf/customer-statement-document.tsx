import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { fmtDate } from "@/lib/format";
import type { LedgerTransaction } from "@/lib/customer-ledger";

// react-pdf's built-in fonts have no ₹ glyph — same workaround as invoice-document.tsx.
function money(n: number): string {
  return "Rs. " + Math.round(n || 0).toLocaleString("en-IN");
}

const TYPE_LABEL: Record<LedgerTransaction["type"], string> = {
  stitching: "Stitching Order",
  retail: "Product Sale",
};

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  shopName: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  muted: { color: "#6b7280", fontSize: 9 },
  title: { fontSize: 18, textAlign: "right", fontFamily: "Helvetica-Bold" },
  badge: { fontSize: 8, color: "#6b7280", textAlign: "right", marginTop: 2 },
  section: { marginTop: 10 },
  value: { fontSize: 10 },
  summaryRow: { flexDirection: "row", marginTop: 14, borderTop: "1 solid #e5e7eb", borderBottom: "1 solid #e5e7eb", paddingVertical: 8 },
  summaryCell: { flex: 1, alignItems: "center" },
  summaryValue: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  summaryLabel: { fontSize: 7, color: "#6b7280", textTransform: "uppercase", marginTop: 2 },
  table: { marginTop: 16 },
  tableHeaderRow: { flexDirection: "row", backgroundColor: "#f9fafb", paddingVertical: 6, paddingHorizontal: 4, borderBottom: "1 solid #e5e7eb" },
  tableRow: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 4, borderTop: "1 solid #f3f4f6" },
  th: { fontSize: 7, color: "#374151", textTransform: "uppercase", fontFamily: "Helvetica-Bold" },
  td: { fontSize: 8 },
  colDate: { flex: 1.1 },
  colType: { flex: 1.3 },
  colRef: { flex: 1.3 },
  colDesc: { flex: 2 },
  colAmount: { flex: 1, textAlign: "right" },
  footer: { position: "absolute", bottom: 24, left: 32, right: 32, alignItems: "center", fontSize: 8, color: "#9ca3af" },
});

/**
 * Server-rendered PDF counterpart to the on-screen combined Customer Statement
 * (src/app/(app)/crm/[mobile]/statement/page.tsx) — same LedgerTransaction[] rows
 * (buildCustomerTransactions) and summary tiles, so the download always matches whatever the
 * staff member is looking at (including its date-range/type filter, described in `filterLabel`).
 * Rendered by src/app/api/customers/[mobile]/statement/pdf/route.tsx.
 */
export function CustomerStatementDocument({
  customerName,
  customerMobile,
  filterLabel,
  transactions,
  shopName,
  shopPhone,
  shopAddress,
  generatedAt,
}: {
  customerName: string;
  customerMobile: string;
  filterLabel: string;
  transactions: LedgerTransaction[];
  shopName: string;
  shopPhone?: string;
  shopAddress?: string;
  generatedAt: string;
}) {
  const totalBilled = transactions.reduce((s, t) => s + t.billed, 0);
  const totalPaid = transactions.reduce((s, t) => s + t.paid, 0);
  const stitchBalance = transactions.filter((t) => t.type === "stitching").reduce((s, t) => s + t.balance, 0);
  const retailBalance = transactions.filter((t) => t.type === "retail").reduce((s, t) => s + t.balance, 0);
  const totalBalance = stitchBalance + retailBalance;

  return (
    <Document>
      <Page size="A4" style={{ padding: 32, fontSize: 10, fontFamily: "Helvetica", color: "#111827" }} wrap>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.shopName}>{shopName || "Your Company"}</Text>
            {shopAddress && <Text style={styles.muted}>{shopAddress}</Text>}
            {shopPhone && <Text style={styles.muted}>{shopPhone}</Text>}
          </View>
          <View>
            <Text style={styles.title}>CUSTOMER STATEMENT</Text>
            <Text style={styles.badge}>Generated {fmtDate(generatedAt)}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.value, { fontFamily: "Helvetica-Bold" }]}>{customerName}</Text>
          <Text style={styles.muted}>
            {customerMobile} · {filterLabel}
          </Text>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryValue}>{money(totalBilled)}</Text>
            <Text style={styles.summaryLabel}>Total Billed</Text>
          </View>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryValue}>{money(totalPaid)}</Text>
            <Text style={styles.summaryLabel}>Total Paid</Text>
          </View>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryValue}>{money(stitchBalance)}</Text>
            <Text style={styles.summaryLabel}>Stitch Due</Text>
          </View>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryValue}>{money(retailBalance)}</Text>
            <Text style={styles.summaryLabel}>Sales Due</Text>
          </View>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryValue}>{money(totalBalance)}</Text>
            <Text style={styles.summaryLabel}>Balance Due</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.th, styles.colDate]}>Date</Text>
            <Text style={[styles.th, styles.colType]}>Type</Text>
            <Text style={[styles.th, styles.colRef]}>Reference</Text>
            <Text style={[styles.th, styles.colDesc]}>Description</Text>
            <Text style={[styles.th, styles.colAmount]}>Billed</Text>
            <Text style={[styles.th, styles.colAmount]}>Paid</Text>
            <Text style={[styles.th, styles.colAmount]}>Balance</Text>
          </View>
          {transactions.map((t) => (
            <View key={t.id} style={styles.tableRow} wrap={false}>
              <Text style={[styles.td, styles.colDate]}>{fmtDate(t.date)}</Text>
              <Text style={[styles.td, styles.colType]}>{TYPE_LABEL[t.type]}</Text>
              <Text style={[styles.td, styles.colRef]}>{t.reference}</Text>
              <Text style={[styles.td, styles.colDesc]}>{t.description}</Text>
              <Text style={[styles.td, styles.colAmount]}>{money(t.billed)}</Text>
              <Text style={[styles.td, styles.colAmount]}>{t.paid > 0 ? money(t.paid) : "—"}</Text>
              <Text style={[styles.td, styles.colAmount]}>{money(t.balance)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.footer} fixed>
          <Text>{shopName || "Your Company"} — Thank you for your business</Text>
        </View>
      </Page>
    </Document>
  );
}
