import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { fmtDate } from "@/lib/format";
import { amountInWords } from "@/lib/number-to-words";
import { LINING_LABELS, type Lining } from "@/lib/business-rules";
import { blankStitchingOrderTemplate, type StitchingOrderTemplateConfig, type StitchingTemplateFont } from "@/lib/stitching-order-template";
import type { Order } from "@/lib/types";

// Same reasoning as invoice-document.tsx's money() — react-pdf's built-in fonts have no ₹ glyph.
function money(n: number): string {
  return "Rs. " + Math.round(n || 0).toLocaleString("en-IN");
}

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
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
  logo: { objectFit: "contain", marginBottom: 6 },
  shopName: { fontSize: 16 },
  muted: { color: "#6b7280", fontSize: 9 },
  title: { fontSize: 18, textAlign: "right" },
  badge: { fontSize: 8, color: "#6b7280", textAlign: "right", marginTop: 2 },
  section: { marginTop: 14 },
  twoCol: { flexDirection: "row", justifyContent: "space-between" },
  label: { fontSize: 8, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 },
  value: { fontSize: 10, marginTop: 2 },
  table: { marginTop: 16, borderTop: "1 solid #e5e7eb", borderBottom: "1 solid #e5e7eb" },
  tableHeaderRow: { flexDirection: "row", backgroundColor: "#f9fafb", paddingVertical: 6, paddingHorizontal: 4 },
  tableRow: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 4, borderTop: "1 solid #f3f4f6" },
  th: { fontSize: 8, color: "#374151", textTransform: "uppercase" },
  td: { fontSize: 9 },
  colGarment: { flex: 3 },
  colLining: { flex: 1.5 },
  colQty: { flex: 1, textAlign: "right" },
  colAmount: { flex: 1.4, textAlign: "right" },
  measureGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 6 },
  measureCell: { width: "25%", marginBottom: 6 },
  measureLabel: { fontSize: 7, color: "#6b7280", textTransform: "uppercase" },
  measureValue: { fontSize: 9 },
  totalsBlock: { marginTop: 10, alignSelf: "flex-end", width: 220 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  totalsLabel: { fontSize: 9, color: "#6b7280" },
  totalsValue: { fontSize: 9 },
  grandTotalRow: { flexDirection: "row", justifyContent: "space-between", borderTop: "1 solid #111827", marginTop: 4, paddingTop: 4 },
  grandTotalLabel: { fontSize: 11 },
  grandTotalValue: { fontSize: 11 },
  amountWords: { marginTop: 8, fontSize: 8, color: "#374151" },
  special: { marginTop: 14, fontSize: 9, color: "#374151", lineHeight: 1.4 },
  bankDetails: { marginTop: 12, fontSize: 8, color: "#374151", lineHeight: 1.4 },
  terms: { marginTop: 12, fontSize: 8, color: "#374151", lineHeight: 1.4 },
  qrBlock: { marginTop: 12, alignItems: "center" },
  qrImage: { width: 90, height: 90 },
  qrCaption: { fontSize: 7, color: "#6b7280", marginTop: 3 },
  signatureBlock: { marginTop: 28, alignItems: "flex-end" },
  signatureImage: { width: 100, height: 40, objectFit: "contain" },
  signatureCaption: { fontSize: 8, color: "#6b7280", marginTop: 2, borderTop: "1 solid #d1d5db", paddingTop: 2, minWidth: 100, textAlign: "center" },
  footer: { position: "absolute", bottom: 24, left: 32, right: 32, alignItems: "center", fontSize: 8, color: "#9ca3af" },
});

/**
 * Customer-facing stitching-order receipt PDF — same customizable-template pattern as
 * InvoiceDocument (colors/paper/font/field-visibility, stored in app_settings under
 * "stitchingOrderTemplates"), applied to Order instead of SalesInvoice. Rendered by
 * src/app/api/orders/[id]/pdf/route.tsx.
 */
export function StitchingOrderDocument({
  order,
  shopName,
  shopPhone,
  shopAddress,
  tailorName,
  measurementLabels,
  template,
}: {
  order: Order;
  shopName: string;
  shopPhone?: string;
  shopAddress?: string;
  tailorName?: string;
  measurementLabels?: string[];
  template?: StitchingOrderTemplateConfig;
}) {
  const t = template || blankStitchingOrderTemplate();
  const bold = BOLD_FONT[t.font];
  const accent = t.colorTheme || "#6D28D9";
  const measureEntries = (measurementLabels || Object.keys(order.measurements || {}))
    .map((label) => [label, order.measurements?.[label]])
    .filter(([, v]) => v !== undefined && v !== null && v !== "");

  return (
    <Document>
      <Page size={PAPER_SIZE[t.paperSize]} orientation={t.orientation} style={{ padding: t.margin, fontSize: 10, fontFamily: t.font, color: "#111827" }}>
        <View style={styles.headerRow}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image, not an HTML img */}
            {t.showLogo && t.logoDataUrl && <Image src={t.logoDataUrl} style={[styles.logo, { width: t.logoWidth, height: t.logoWidth }]} />}
            <Text style={[styles.shopName, { fontSize: t.shopNameFontSize, fontFamily: t.boldShopName ? bold : t.font }]}>{shopName || "Your Company"}</Text>
            {shopAddress && <Text style={styles.muted}>{shopAddress}</Text>}
            {shopPhone && <Text style={styles.muted}>{shopPhone}</Text>}
          </View>
          <View>
            <Text style={[styles.title, { fontSize: t.titleFontSize, fontFamily: bold, color: accent }]}>STITCHING ORDER</Text>
            <Text style={[styles.badge, { fontSize: t.orderNumberFontSize }]}>{order.id}</Text>
            <Text style={styles.badge}>{order.balance > 0 ? `Balance due: ${money(order.balance)}` : "Paid in full"}</Text>
          </View>
        </View>

        <View style={[styles.section, styles.twoCol]}>
          <View>
            <Text style={styles.label}>Customer</Text>
            <Text style={[styles.value, { fontSize: t.customerNameFontSize, fontFamily: t.boldCustomerName ? bold : t.font }]}>{order.name}</Text>
            <Text style={styles.value}>{order.mobile}</Text>
          </View>
          <View>
            <Text style={styles.label}>Order date</Text>
            <Text style={styles.value}>{fmtDate(order.inDate)}</Text>
          </View>
          <View>
            <Text style={styles.label}>Delivery date</Text>
            <Text style={styles.value}>{fmtDate(order.deliveryDate)}</Text>
          </View>
          {t.showTailorName && tailorName && (
            <View>
              <Text style={styles.label}>Tailor</Text>
              <Text style={styles.value}>{tailorName}</Text>
            </View>
          )}
        </View>

        {t.showGarmentsTable && (
          <View style={styles.table}>
            <View style={[styles.tableHeaderRow, { fontFamily: bold }]}>
              <Text style={[styles.th, styles.colGarment, { fontFamily: bold }]}>Garment</Text>
              <Text style={[styles.th, styles.colLining, { fontFamily: bold }]}>Lining</Text>
              <Text style={[styles.th, styles.colQty, { fontFamily: bold }]}>Qty</Text>
              <Text style={[styles.th, styles.colAmount, { fontFamily: bold }]}>Amount</Text>
            </View>
            {order.garments.map((g, i) => (
              <View key={g.lineId || i} style={styles.tableRow}>
                <Text style={[styles.td, styles.colGarment]}>{g.type}</Text>
                <Text style={[styles.td, styles.colLining]}>{g.lining ? LINING_LABELS[g.lining as Lining] || g.lining : "—"}</Text>
                <Text style={[styles.td, styles.colQty]}>{g.no || 1}</Text>
                <Text style={[styles.td, styles.colAmount]}>{money(g.amount || 0)}</Text>
              </View>
            ))}
          </View>
        )}

        {t.showMeasurements && measureEntries.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.label}>Measurements</Text>
            <View style={styles.measureGrid}>
              {measureEntries.map(([label, value]) => (
                <View key={String(label)} style={styles.measureCell}>
                  <Text style={styles.measureLabel}>{String(label)}</Text>
                  <Text style={styles.measureValue}>{String(value)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {t.showPaymentSummary && (
          <View style={styles.totalsBlock}>
            <View style={[styles.grandTotalRow, { borderTopColor: accent }]}>
              <Text style={[styles.grandTotalLabel, { fontFamily: bold }]}>Total</Text>
              <Text style={[styles.grandTotalValue, { fontFamily: bold }]}>{money(order.total)}</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Advance paid</Text>
              <Text style={styles.totalsValue}>{money(order.advance)}</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={[styles.totalsLabel, { fontFamily: bold, color: "#111827" }]}>Balance due</Text>
              <Text style={[styles.totalsValue, { fontFamily: bold }]}>{money(order.balance)}</Text>
            </View>
          </View>
        )}

        {t.showAmountInWords && t.showPaymentSummary && <Text style={styles.amountWords}>{amountInWords(order.total)}</Text>}

        {t.showQrCode && t.qrCodeDataUrl && (
          <View style={styles.qrBlock}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image, not an HTML img */}
            <Image src={t.qrCodeDataUrl} style={styles.qrImage} />
            <Text style={styles.qrCaption}>Scan to pay</Text>
          </View>
        )}

        {t.showSpecialInstructions && order.special && (
          <View style={styles.special}>
            <Text style={{ fontFamily: bold, marginBottom: 3, color: "#374151" }}>Special Instructions</Text>
            <Text>{order.special}</Text>
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
          <Text>{shopName || "Your Company"} · Generated from Fashion Flow</Text>
          {t.showPageNumbers && <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />}
        </View>
      </Page>
    </Document>
  );
}
