import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { fmtDate } from "@/lib/format";
import type { LedgerTransaction } from "@/lib/customer-ledger";
import { blankStitchingOrderTemplate, type StitchingOrderTemplateConfig, type StitchingTemplateFont } from "@/lib/stitching-order-template";

// react-pdf's built-in fonts have no ₹ glyph — same workaround as invoice-document.tsx.
function money(n: number): string {
  return "Rs. " + Math.round(n || 0).toLocaleString("en-IN");
}

const TYPE_LABEL: Record<LedgerTransaction["type"], string> = {
  stitching: "Stitching Order",
  retail: "Product Sale",
};

const BOLD_FONT: Record<StitchingTemplateFont, string> = {
  Helvetica: "Helvetica-Bold",
  "Times-Roman": "Times-Bold",
  Courier: "Courier-Bold",
};

const PAPER_SIZE: Record<StitchingOrderTemplateConfig["paperSize"], "A4" | "LETTER"> = {
  A4: "A4",
  Letter: "LETTER",
};

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  logo: { objectFit: "contain", marginBottom: 6 },
  shopName: { fontSize: 16 },
  muted: { color: "#6b7280", fontSize: 9 },
  title: { fontSize: 18, textAlign: "right" },
  badge: { fontSize: 8, color: "#6b7280", textAlign: "right", marginTop: 2 },
  section: { marginTop: 10 },
  value: { fontSize: 10 },
  summaryRow: { flexDirection: "row", marginTop: 14, borderTop: "1 solid #e5e7eb", borderBottom: "1 solid #e5e7eb", paddingVertical: 8 },
  summaryCell: { flex: 1, alignItems: "center" },
  summaryValue: { fontSize: 11 },
  summaryLabel: { fontSize: 7, color: "#6b7280", textTransform: "uppercase", marginTop: 2 },
  table: { marginTop: 16 },
  tableHeaderRow: { flexDirection: "row", backgroundColor: "#f9fafb", paddingVertical: 6, paddingHorizontal: 4, borderBottom: "1 solid #e5e7eb" },
  tableRow: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 4, borderTop: "1 solid #f3f4f6" },
  th: { fontSize: 7, color: "#374151", textTransform: "uppercase" },
  td: { fontSize: 8 },
  colDate: { flex: 1.1 },
  colType: { flex: 1.3 },
  colRef: { flex: 1.3 },
  colDesc: { flex: 1.7 },
  colStage: { flex: 1 },
  colAmount: { flex: 1, textAlign: "right" },
  qrBlock: { marginTop: 16, alignItems: "center" },
  qrImage: { width: 90, height: 90 },
  qrCaption: { fontSize: 7, color: "#6b7280", marginTop: 3 },
  bankDetails: { marginTop: 14, fontSize: 8, color: "#374151", lineHeight: 1.4 },
  terms: { marginTop: 14, fontSize: 8, color: "#374151", lineHeight: 1.4 },
  signatureBlock: { marginTop: 20, alignItems: "flex-end" },
  signatureImage: { width: 100, height: 40, objectFit: "contain" },
  signatureCaption: { fontSize: 8, color: "#6b7280", marginTop: 2, borderTop: "1 solid #d1d5db", paddingTop: 2, minWidth: 100, textAlign: "center" },
  footer: { position: "absolute", bottom: 24, left: 32, right: 32, alignItems: "center", fontSize: 8, color: "#9ca3af" },
});

/**
 * Server-rendered PDF counterpart to the on-screen combined Customer Statement
 * (src/app/(app)/crm/[mobile]/statement/page.tsx) — same LedgerTransaction[] rows
 * (buildCustomerTransactions) and summary tiles, so the download always matches whatever the
 * staff member is looking at (including its date-range/type filter, described in `filterLabel`).
 *
 * Reuses the shop's existing Stitching Order Template (Settings -> Stitching Order Template) for
 * logo/bank details/signature/QR/colors — a statement spans many documents, so it deliberately
 * skips that template's per-document fields (garments table, measurements) rather than needing a
 * second template setting of its own. Rendered by
 * src/app/api/customers/[mobile]/statement/pdf/route.tsx.
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
  template,
}: {
  customerName: string;
  customerMobile: string;
  filterLabel: string;
  transactions: LedgerTransaction[];
  shopName: string;
  shopPhone?: string;
  shopAddress?: string;
  generatedAt: string;
  template?: StitchingOrderTemplateConfig;
}) {
  const t = template || blankStitchingOrderTemplate();
  const bold = BOLD_FONT[t.font];
  const accent = t.colorTheme || "#6D28D9";

  const totalBilled = transactions.reduce((s, t) => s + t.billed, 0);
  const totalPaid = transactions.reduce((s, t) => s + t.paid, 0);
  const stitchBalance = transactions.filter((t) => t.type === "stitching").reduce((s, t) => s + t.balance, 0);
  const retailBalance = transactions.filter((t) => t.type === "retail").reduce((s, t) => s + t.balance, 0);
  const totalBalance = stitchBalance + retailBalance;

  return (
    <Document>
      <Page size={PAPER_SIZE[t.paperSize]} orientation={t.orientation} style={{ padding: t.margin, fontSize: 10, fontFamily: t.font, color: "#111827" }} wrap>
        <View style={styles.headerRow}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image, not an HTML img */}
            {t.showLogo && t.logoDataUrl && <Image src={t.logoDataUrl} style={[styles.logo, { width: t.logoWidth, height: t.logoWidth }]} />}
            <Text style={[styles.shopName, { fontSize: t.shopNameFontSize, fontFamily: t.boldShopName ? bold : t.font }]}>{shopName || "Your Company"}</Text>
            {shopAddress && <Text style={styles.muted}>{shopAddress}</Text>}
            {shopPhone && <Text style={styles.muted}>{shopPhone}</Text>}
          </View>
          <View>
            <Text style={[styles.title, { fontSize: t.titleFontSize, fontFamily: bold, color: accent }]}>CUSTOMER STATEMENT</Text>
            <Text style={styles.badge}>Generated {fmtDate(generatedAt)}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.value, { fontSize: t.customerNameFontSize, fontFamily: t.boldCustomerName ? bold : t.font }]}>{customerName}</Text>
          <Text style={styles.muted}>
            {customerMobile} · {filterLabel}
          </Text>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCell}>
            <Text style={[styles.summaryValue, { fontFamily: bold }]}>{money(totalBilled)}</Text>
            <Text style={styles.summaryLabel}>Total Billed</Text>
          </View>
          <View style={styles.summaryCell}>
            <Text style={[styles.summaryValue, { fontFamily: bold }]}>{money(totalPaid)}</Text>
            <Text style={styles.summaryLabel}>Total Paid</Text>
          </View>
          <View style={styles.summaryCell}>
            <Text style={[styles.summaryValue, { fontFamily: bold }]}>{money(stitchBalance)}</Text>
            <Text style={styles.summaryLabel}>Stitch Due</Text>
          </View>
          <View style={styles.summaryCell}>
            <Text style={[styles.summaryValue, { fontFamily: bold }]}>{money(retailBalance)}</Text>
            <Text style={styles.summaryLabel}>Sales Due</Text>
          </View>
          <View style={styles.summaryCell}>
            <Text style={[styles.summaryValue, { fontFamily: bold, color: accent }]}>{money(totalBalance)}</Text>
            <Text style={styles.summaryLabel}>Balance Due</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={[styles.tableHeaderRow, { fontFamily: bold }]}>
            <Text style={[styles.th, styles.colDate, { fontFamily: bold }]}>Date</Text>
            <Text style={[styles.th, styles.colType, { fontFamily: bold }]}>Type</Text>
            <Text style={[styles.th, styles.colRef, { fontFamily: bold }]}>Reference</Text>
            <Text style={[styles.th, styles.colDesc, { fontFamily: bold }]}>Description</Text>
            <Text style={[styles.th, styles.colStage, { fontFamily: bold }]}>Stage</Text>
            <Text style={[styles.th, styles.colAmount, { fontFamily: bold }]}>Billed</Text>
            <Text style={[styles.th, styles.colAmount, { fontFamily: bold }]}>Paid</Text>
            <Text style={[styles.th, styles.colAmount, { fontFamily: bold }]}>Balance</Text>
          </View>
          {transactions.map((tr) => (
            <View key={tr.id} style={styles.tableRow} wrap={false}>
              <Text style={[styles.td, styles.colDate]}>{fmtDate(tr.date)}</Text>
              <Text style={[styles.td, styles.colType]}>{TYPE_LABEL[tr.type]}</Text>
              <Text style={[styles.td, styles.colRef]}>{tr.reference}</Text>
              <Text style={[styles.td, styles.colDesc]}>{tr.description}</Text>
              <Text style={[styles.td, styles.colStage]}>{tr.stage || "—"}</Text>
              <Text style={[styles.td, styles.colAmount]}>{money(tr.billed)}</Text>
              <Text style={[styles.td, styles.colAmount]}>{tr.paid > 0 ? money(tr.paid) : "—"}</Text>
              <Text style={[styles.td, styles.colAmount]}>{money(tr.balance)}</Text>
            </View>
          ))}
        </View>

        {t.showQrCode && t.qrCodeDataUrl && (
          <View style={styles.qrBlock}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image, not an HTML img */}
            <Image src={t.qrCodeDataUrl} style={styles.qrImage} />
            <Text style={styles.qrCaption}>Scan to pay</Text>
          </View>
        )}

        {t.showBankDetails && t.bankDetails && (
          <View style={styles.bankDetails}>
            <Text style={{ fontFamily: bold, marginBottom: 3, color: "#374151" }}>Bank Details</Text>
            <Text>{t.bankDetails}</Text>
          </View>
        )}

        {t.showTerms && t.terms && (
          <View style={styles.terms}>
            <Text style={{ fontFamily: bold, marginBottom: 3, color: "#374151" }}>Terms & Conditions</Text>
            <Text>{t.terms}</Text>
          </View>
        )}

        {t.showSignature && t.signatureDataUrl && (
          <View style={styles.signatureBlock}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image, not an HTML img */}
            <Image src={t.signatureDataUrl} style={styles.signatureImage} />
            <Text style={styles.signatureCaption}>Authorized Signatory</Text>
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text>{shopName || "Your Company"} — Thank you for your business</Text>
          {t.showPageNumbers && <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />}
        </View>
      </Page>
    </Document>
  );
}
