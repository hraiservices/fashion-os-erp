import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { fmtDate } from "@/lib/format";
import { GST_TYPE_LABELS } from "@/lib/gst";
import { DOC_STATUS_LABELS } from "@/lib/sales";
import { amountInWords } from "@/lib/number-to-words";
import { blankInvoiceTemplate, type InvoiceTemplateConfig, type InvoiceTemplateFont } from "@/lib/invoice-template";
import type { SalesInvoice } from "@/lib/types";

// react-pdf's built-in fonts (Helvetica/Times/Courier) have no ₹ glyph — it would render as
// a missing box. "Rs." is the safe, always-rendering choice for this document specifically;
// the rest of the app keeps using the real ₹ symbol via lib/format's inr().
function money(n: number): string {
  return "Rs. " + Math.round(n || 0).toLocaleString("en-IN");
}

const BOLD_FONT: Record<InvoiceTemplateFont, string> = {
  Helvetica: "Helvetica-Bold",
  "Times-Roman": "Times-Bold",
  Courier: "Courier-Bold",
};

const PAPER_SIZE: Record<InvoiceTemplateConfig["paperSize"], "A4" | "LETTER"> = {
  A4: "A4",
  Letter: "LETTER",
};

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
  logo: { width: 64, height: 64, objectFit: "contain", marginBottom: 6 },
  shopName: { fontSize: 16 },
  muted: { color: "#6b7280", fontSize: 9 },
  invoiceTitle: { fontSize: 18, textAlign: "right" },
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
  colProduct: { flex: 3 },
  colQty: { flex: 1, textAlign: "right" },
  colPrice: { flex: 1.2, textAlign: "right" },
  colDisc: { flex: 1, textAlign: "right" },
  colAmount: { flex: 1.4, textAlign: "right" },
  totalsBlock: { marginTop: 10, alignSelf: "flex-end", width: 220 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  totalsLabel: { fontSize: 9, color: "#6b7280" },
  totalsValue: { fontSize: 9 },
  grandTotalRow: { flexDirection: "row", justifyContent: "space-between", borderTop: "1 solid #111827", marginTop: 4, paddingTop: 4 },
  grandTotalLabel: { fontSize: 11 },
  grandTotalValue: { fontSize: 11 },
  amountWords: { marginTop: 8, fontSize: 8, color: "#374151" },
  terms: { marginTop: 24, fontSize: 8, color: "#6b7280", lineHeight: 1.4 },
  bankDetails: { marginTop: 12, fontSize: 8, color: "#374151", lineHeight: 1.4 },
  qrBlock: { marginTop: 12, alignItems: "center" },
  qrImage: { width: 90, height: 90 },
  qrCaption: { fontSize: 7, color: "#6b7280", marginTop: 3 },
  signatureBlock: { marginTop: 28, alignItems: "flex-end" },
  signatureImage: { width: 100, height: 40, objectFit: "contain" },
  signatureCaption: { fontSize: 8, color: "#6b7280", marginTop: 2, borderTop: "1 solid #d1d5db", paddingTop: 2, minWidth: 100, textAlign: "center" },
  footer: { position: "absolute", bottom: 24, left: 32, right: 32, alignItems: "center", fontSize: 8, color: "#9ca3af" },
});

export function InvoiceDocument({
  invoice,
  shopName,
  shopPhone,
  shopAddress,
  shopGstin,
  customerGstin,
  paidTotal,
  balance,
  template,
}: {
  invoice: SalesInvoice;
  shopName: string;
  shopPhone: string;
  shopAddress?: string;
  shopGstin?: string;
  customerGstin?: string;
  paidTotal: number;
  balance: number;
  template?: InvoiceTemplateConfig;
}) {
  const t = template || blankInvoiceTemplate();
  const bold = BOLD_FONT[t.font];
  const accent = t.colorTheme || "#6D28D9";
  const lineSubtotal = invoice.items.reduce((s, i) => s + i.amount, 0);
  const discountAmount = lineSubtotal - invoice.taxableAmount + invoice.shippingCharges;

  return (
    <Document>
      <Page size={PAPER_SIZE[t.paperSize]} orientation={t.orientation} style={{ padding: t.margin, fontSize: 10, fontFamily: t.font, color: "#111827" }}>
        <View style={styles.headerRow}>
          <View>
            {t.showLogo && t.logoDataUrl && <Image src={t.logoDataUrl} style={[styles.logo, { width: t.logoWidth, height: t.logoWidth }]} />}
            <Text style={[styles.shopName, { fontSize: t.shopNameFontSize, fontFamily: t.boldShopName ? bold : t.font }]}>{shopName || "Your Shop"}</Text>
            {shopAddress && <Text style={styles.muted}>{shopAddress}</Text>}
            {shopPhone && <Text style={styles.muted}>{shopPhone}</Text>}
            {shopGstin && <Text style={styles.muted}>GSTIN: {shopGstin}</Text>}
          </View>
          <View>
            <Text style={[styles.invoiceTitle, { fontSize: t.invoiceTitleFontSize, fontFamily: bold, color: accent }]}>INVOICE</Text>
            <Text style={[styles.badge, { fontSize: t.invoiceNumberFontSize }]}>{invoice.invoiceNumber}</Text>
            <Text style={styles.badge}>{DOC_STATUS_LABELS[invoice.docStatus]}</Text>
          </View>
        </View>

        <View style={[styles.section, styles.twoCol]}>
          <View>
            <Text style={styles.label}>Billed to</Text>
            <Text style={[styles.value, { fontSize: t.customerNameFontSize, fontFamily: t.boldCustomerName ? bold : t.font }]}>{invoice.customerName}</Text>
            <Text style={styles.value}>{invoice.customerMobile}</Text>
            {customerGstin && <Text style={styles.value}>GSTIN: {customerGstin}</Text>}
          </View>
          <View>
            <Text style={styles.label}>Invoice date</Text>
            <Text style={styles.value}>{fmtDate(invoice.invoiceDate)}</Text>
          </View>
          <View>
            <Text style={styles.label}>Due date</Text>
            <Text style={styles.value}>{invoice.dueDate ? fmtDate(invoice.dueDate) : "—"}</Text>
          </View>
        </View>

        {invoice.subject && (
          <View style={styles.section}>
            <Text style={styles.label}>Subject</Text>
            <Text style={styles.value}>{invoice.subject}</Text>
          </View>
        )}

        <View style={styles.table}>
          <View style={[styles.tableHeaderRow, { fontFamily: bold }]}>
            <Text style={[styles.th, styles.colProduct, { fontFamily: bold }]}>Product</Text>
            <Text style={[styles.th, styles.colQty, { fontFamily: bold }]}>Qty</Text>
            <Text style={[styles.th, styles.colPrice, { fontFamily: bold }]}>Price</Text>
            <Text style={[styles.th, styles.colDisc, { fontFamily: bold }]}>Disc %</Text>
            <Text style={[styles.th, styles.colAmount, { fontFamily: bold }]}>Amount</Text>
          </View>
          {invoice.items.map((item, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={[styles.td, styles.colProduct]}>{item.productName}</Text>
              <Text style={[styles.td, styles.colQty]}>{item.qty}</Text>
              <Text style={[styles.td, styles.colPrice]}>{money(item.unitPrice)}</Text>
              <Text style={[styles.td, styles.colDisc]}>{item.discountPercent > 0 ? `${item.discountPercent}%` : "—"}</Text>
              <Text style={[styles.td, styles.colAmount]}>{money(item.amount)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsBlock}>
          {t.showSubtotal && (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Line subtotal</Text>
              <Text style={styles.totalsValue}>{money(lineSubtotal)}</Text>
            </View>
          )}
          {t.showDiscount && invoice.discountValue > 0 && (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Discount ({invoice.discountType === "percent" ? `${invoice.discountValue}%` : "flat"})</Text>
              <Text style={styles.totalsValue}>-{money(discountAmount)}</Text>
            </View>
          )}
          {t.showShipping && invoice.shippingCharges > 0 && (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Shipping charges</Text>
              <Text style={styles.totalsValue}>{money(invoice.shippingCharges)}</Text>
            </View>
          )}
          {t.showTax && (
            <>
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>Taxable amount</Text>
                <Text style={styles.totalsValue}>{money(invoice.taxableAmount)}</Text>
              </View>
              {invoice.gstType === "intra" && (
                <>
                  <View style={styles.totalsRow}>
                    <Text style={styles.totalsLabel}>CGST</Text>
                    <Text style={styles.totalsValue}>{money(invoice.cgst)}</Text>
                  </View>
                  <View style={styles.totalsRow}>
                    <Text style={styles.totalsLabel}>SGST</Text>
                    <Text style={styles.totalsValue}>{money(invoice.sgst)}</Text>
                  </View>
                </>
              )}
              {invoice.gstType === "inter" && (
                <View style={styles.totalsRow}>
                  <Text style={styles.totalsLabel}>IGST</Text>
                  <Text style={styles.totalsValue}>{money(invoice.igst)}</Text>
                </View>
              )}
            </>
          )}
          {invoice.roundOff !== 0 && (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Round off</Text>
              <Text style={styles.totalsValue}>
                {invoice.roundOff > 0 ? "+" : ""}
                {money(invoice.roundOff)}
              </Text>
            </View>
          )}
          <View style={[styles.grandTotalRow, { borderTopColor: accent }]}>
            <Text style={[styles.grandTotalLabel, { fontFamily: bold }]}>Total ({GST_TYPE_LABELS[invoice.gstType]})</Text>
            <Text style={[styles.grandTotalValue, { fontFamily: bold }]}>{money(invoice.total)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Paid</Text>
            <Text style={styles.totalsValue}>{money(paidTotal)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={[styles.totalsLabel, { fontFamily: bold, color: "#111827" }]}>Balance due</Text>
            <Text style={[styles.totalsValue, { fontFamily: bold }]}>{money(balance)}</Text>
          </View>
        </View>

        {t.showAmountInWords && <Text style={styles.amountWords}>{amountInWords(invoice.total)}</Text>}

        {t.showQrCode && t.qrCodeDataUrl && (
          <View style={styles.qrBlock}>
            <Image src={t.qrCodeDataUrl} style={styles.qrImage} />
            <Text style={styles.qrCaption}>Scan to pay</Text>
          </View>
        )}

        {invoice.notes && (
          <View style={styles.section}>
            <Text style={styles.label}>Notes</Text>
            <Text style={styles.value}>{invoice.notes}</Text>
          </View>
        )}

        {invoice.terms && (
          <View style={styles.terms}>
            <Text style={{ fontFamily: bold, marginBottom: 3, color: "#374151" }}>Terms & Conditions</Text>
            <Text>{invoice.terms}</Text>
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
            <Image src={t.signatureDataUrl} style={styles.signatureImage} />
            <Text style={styles.signatureCaption}>Authorized Signatory</Text>
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text>{shopName || "Your Shop"} · Generated from Fashion Flow</Text>
          {t.showPageNumbers && <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />}
        </View>
      </Page>
    </Document>
  );
}
