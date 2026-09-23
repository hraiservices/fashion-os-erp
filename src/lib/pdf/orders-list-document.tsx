import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { fmtDate } from "@/lib/format";
import { blankStitchingOrderTemplate, type StitchingOrderTemplateConfig, type StitchingTemplateFont } from "@/lib/stitching-order-template";
import type { Order } from "@/lib/types";

// react-pdf's built-in fonts have no ₹ glyph — same workaround as invoice-document.tsx.
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
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  logo: { objectFit: "contain", marginBottom: 6 },
  shopName: { fontSize: 16 },
  muted: { color: "#6b7280", fontSize: 9 },
  title: { fontSize: 18, textAlign: "right" },
  badge: { fontSize: 8, color: "#6b7280", textAlign: "right", marginTop: 2 },
  summaryRow: { flexDirection: "row", marginTop: 14, borderTop: "1 solid #e5e7eb", borderBottom: "1 solid #e5e7eb", paddingVertical: 8 },
  summaryCell: { flex: 1, alignItems: "center" },
  summaryValue: { fontSize: 11 },
  summaryLabel: { fontSize: 7, color: "#6b7280", textTransform: "uppercase", marginTop: 2 },
  table: { marginTop: 16 },
  tableHeaderRow: { flexDirection: "row", backgroundColor: "#f9fafb", paddingVertical: 6, paddingHorizontal: 4, borderBottom: "1 solid #e5e7eb" },
  tableRow: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 4, borderTop: "1 solid #f3f4f6" },
  th: { fontSize: 7, color: "#374151", textTransform: "uppercase" },
  td: { fontSize: 8 },
  colOrder: { flex: 1.3 },
  colCustomer: { flex: 1.6 },
  colDate: { flex: 1 },
  colAmount: { flex: 0.9, textAlign: "right" },
  colStatus: { flex: 1, textAlign: "right" },
  statusPaid: { color: "#059669" },
  statusDue: { color: "#dc2626" },
  qrBlock: { marginTop: 16, alignItems: "center" },
  qrImage: { width: 90, height: 90 },
  qrCaption: { fontSize: 7, color: "#6b7280", marginTop: 3 },
  bankDetails: { marginTop: 14, fontSize: 8, color: "#374151", lineHeight: 1.4 },
  signatureBlock: { marginTop: 20, alignItems: "flex-end" },
  signatureImage: { width: 100, height: 40, objectFit: "contain" },
  signatureCaption: { fontSize: 8, color: "#6b7280", marginTop: 2, borderTop: "1 solid #d1d5db", paddingTop: 2, minWidth: 100, textAlign: "center" },
  footer: { position: "absolute", bottom: 24, left: 32, right: 32, alignItems: "center", fontSize: 8, color: "#9ca3af" },
});

/**
 * Shop-wide printable list of stitching orders for a chosen date range (Orders -> Print list) —
 * every customer's orders together, one row each, with payment status/total/due — as opposed to
 * the per-customer Statement (customer-statement-document.tsx) or the one-order-per-page receipt
 * (stitching-order-document.tsx). Reuses the shop's Stitching Order Template for the
 * logo/bank details/signature/QR letterhead, same as both of those. Rendered by
 * src/app/api/orders/print/pdf/route.tsx.
 */
export function OrdersListDocument({
  orders,
  dateField,
  from,
  to,
  shopName,
  shopPhone,
  shopAddress,
  generatedAt,
  template,
}: {
  orders: Order[];
  dateField: "order" | "delivery";
  from?: string;
  to?: string;
  shopName: string;
  shopPhone?: string;
  shopAddress?: string;
  generatedAt: string;
  template?: StitchingOrderTemplateConfig;
}) {
  const t = template || blankStitchingOrderTemplate();
  const bold = BOLD_FONT[t.font];
  const accent = t.colorTheme || "#6D28D9";

  const totalBilled = orders.reduce((s, o) => s + (o.total || 0), 0);
  const totalPaid = orders.reduce((s, o) => s + (o.advance || 0), 0);
  const totalDue = orders.reduce((s, o) => s + (o.balance || 0), 0);

  const rangeLabel = from || to ? `By ${dateField} date: ${from ? fmtDate(from) : "Start"} to ${to ? fmtDate(to) : "Today"}` : "All time";

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
            <Text style={[styles.title, { fontSize: t.titleFontSize, fontFamily: bold, color: accent }]}>ORDERS LIST</Text>
            <Text style={styles.badge}>Generated {fmtDate(generatedAt)}</Text>
            <Text style={styles.badge}>{rangeLabel}</Text>
            <Text style={styles.badge}>
              {orders.length} order{orders.length === 1 ? "" : "s"}
            </Text>
          </View>
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
            <Text style={[styles.summaryValue, { fontFamily: bold, color: accent }]}>{money(totalDue)}</Text>
            <Text style={styles.summaryLabel}>Balance Due</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={[styles.tableHeaderRow, { fontFamily: bold }]}>
            <Text style={[styles.th, styles.colOrder, { fontFamily: bold }]}>Order #</Text>
            <Text style={[styles.th, styles.colCustomer, { fontFamily: bold }]}>Customer</Text>
            <Text style={[styles.th, styles.colDate, { fontFamily: bold }]}>{dateField === "delivery" ? "Delivery" : "Order"} Date</Text>
            <Text style={[styles.th, styles.colAmount, { fontFamily: bold }]}>Total</Text>
            <Text style={[styles.th, styles.colAmount, { fontFamily: bold }]}>Paid</Text>
            <Text style={[styles.th, styles.colAmount, { fontFamily: bold }]}>Balance</Text>
            <Text style={[styles.th, styles.colStatus, { fontFamily: bold }]}>Status</Text>
          </View>
          {orders.map((o) => (
            <View key={o.id} style={styles.tableRow} wrap={false}>
              <Text style={[styles.td, styles.colOrder]}>{o.id}</Text>
              <Text style={[styles.td, styles.colCustomer]}>{o.name}</Text>
              <Text style={[styles.td, styles.colDate]}>{fmtDate(dateField === "delivery" ? o.deliveryDate : o.inDate)}</Text>
              <Text style={[styles.td, styles.colAmount]}>{money(o.total)}</Text>
              <Text style={[styles.td, styles.colAmount]}>{money(o.advance)}</Text>
              <Text style={[styles.td, styles.colAmount]}>{money(o.balance)}</Text>
              <Text style={[styles.td, styles.colStatus, o.balance > 0 ? styles.statusDue : styles.statusPaid]}>{o.balance > 0 ? "Due" : "Paid"}</Text>
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

        {t.showSignature && t.signatureDataUrl && (
          <View style={styles.signatureBlock}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image, not an HTML img */}
            <Image src={t.signatureDataUrl} style={styles.signatureImage} />
            <Text style={styles.signatureCaption}>Authorized Signatory</Text>
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text>{shopName || "Your Company"} — Generated from Fashion Flow</Text>
          {t.showPageNumbers && <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />}
        </View>
      </Page>
    </Document>
  );
}
