import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { toMKey, measureLabel, type MeasureLang } from "@/lib/measurements";
import { fmtDate } from "@/lib/format";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
  logo: { width: 56, height: 56, objectFit: "contain", marginBottom: 4 },
  shopName: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  muted: { color: "#6b7280", fontSize: 8 },
  title: { fontSize: 16, textAlign: "right", fontFamily: "Helvetica-Bold" },
  subtitle: { fontSize: 9, color: "#6b7280", textAlign: "right", marginTop: 2 },
  infoBlock: { flexDirection: "row", justifyContent: "space-between", marginTop: 16, borderTop: "1 solid #e5e7eb", borderBottom: "1 solid #e5e7eb", paddingVertical: 10 },
  infoLabel: { fontSize: 7, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 },
  infoValue: { fontSize: 11, marginTop: 2, fontFamily: "Helvetica-Bold" },
  sectionTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", marginTop: 20, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5, color: "#374151" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: "25%", marginBottom: 12, paddingRight: 8 },
  cellLabel: { fontSize: 7, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.3 },
  cellValue: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 2 },
  footer: { position: "absolute", bottom: 24, left: 32, right: 32, textAlign: "center", fontSize: 7, color: "#9ca3af" },
});

export function MeasurementDocument({
  customerName,
  customerMobile,
  fields,
  values,
  lang = "en",
  shopName,
  shopAddress,
  shopPhone,
  logoDataUrl,
}: {
  customerName: string;
  customerMobile: string;
  fields: string[];
  values: Record<string, string>;
  lang?: MeasureLang;
  shopName: string;
  shopAddress?: string;
  shopPhone?: string;
  logoDataUrl?: string | null;
}) {
  const filled = fields.filter((f) => (values[toMKey(f)] ?? "").trim() !== "");

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image, not an HTML img */}
            {logoDataUrl && <Image src={logoDataUrl} style={styles.logo} />}
            <Text style={styles.shopName}>{shopName || "Measurement Card"}</Text>
            {shopAddress && <Text style={styles.muted}>{shopAddress}</Text>}
            {shopPhone && <Text style={styles.muted}>{shopPhone}</Text>}
          </View>
          <View>
            <Text style={styles.title}>Measurement Card</Text>
            <Text style={styles.subtitle}>{fmtDate(new Date().toISOString())}</Text>
          </View>
        </View>

        <View style={styles.infoBlock}>
          <View>
            <Text style={styles.infoLabel}>Customer</Text>
            <Text style={styles.infoValue}>{customerName || "—"}</Text>
          </View>
          <View>
            <Text style={styles.infoLabel}>Mobile</Text>
            <Text style={styles.infoValue}>{customerMobile || "—"}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Measurements</Text>
        {filled.length === 0 ? (
          <Text style={styles.muted}>No measurements saved yet.</Text>
        ) : (
          <View style={styles.grid}>
            {filled.map((f) => {
              const key = toMKey(f);
              return (
                <View key={key} style={styles.cell}>
                  <Text style={styles.cellLabel}>{measureLabel(f, lang)}</Text>
                  <Text style={styles.cellValue}>{values[key]}</Text>
                </View>
              );
            })}
          </View>
        )}

        <Text style={styles.footer}>Generated from {shopName || "Stitching Manager"} — for tailoring reference only.</Text>
      </Page>
    </Document>
  );
}
