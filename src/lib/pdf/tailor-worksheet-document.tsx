import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { fmtDate } from "@/lib/format";
import type { TailorWorksheetSection, WorksheetGarment } from "@/lib/tailor-worksheet";

// Deliberately large, plain text throughout — this is meant to be handed to a non-technical
// tailor as a physical piece of paper, not read on a screen. No dense tables, no small print.
const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 12, fontFamily: "Helvetica" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  logo: { width: 48, height: 48, objectFit: "contain", marginBottom: 4 },
  shopName: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  tailorName: { fontSize: 22, fontFamily: "Helvetica-Bold", textAlign: "right" },
  dateLine: { fontSize: 11, color: "#6b7280", textAlign: "right", marginTop: 2 },
  sectionTitle: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 8 },
  overdueBox: { backgroundColor: "#FEF3E2", border: "1 solid #F0B45E", borderRadius: 6, padding: 12, marginBottom: 6 },
  pendingBox: { backgroundColor: "#F3F4F6", borderRadius: 6, padding: 12, marginBottom: 6 },
  todayBox: { backgroundColor: "#F3F4F6", borderRadius: 6, padding: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingVertical: 8, borderTop: "1 solid rgba(0,0,0,0.08)" },
  rowFirst: { borderTop: "none" },
  garmentLine: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  customerLine: { fontSize: 11, color: "#374151", marginTop: 2 },
  qtyBadge: { fontSize: 13, fontFamily: "Helvetica-Bold", textAlign: "right" },
  dueBadge: { fontSize: 9, color: "#6b7280", textAlign: "right", marginTop: 2 },
  emptyLine: { fontSize: 12, color: "#6b7280", fontStyle: "italic", marginTop: 8 },
  footer: { position: "absolute", bottom: 24, left: 32, right: 32, textAlign: "center", fontSize: 8, color: "#9ca3af" },
});

function GarmentRow({ g, first }: { g: WorksheetGarment; first: boolean }) {
  return (
    <View style={[styles.row, first ? styles.rowFirst : {}]}>
      <View>
        <Text style={styles.garmentLine}>
          {g.garmentType}
          {g.lining ? ` (${g.lining})` : ""}
        </Text>
        <Text style={styles.customerLine}>{g.customerName} — {g.orderId}</Text>
      </View>
      <View>
        <Text style={styles.qtyBadge}>Qty {g.qty}</Text>
        {g.deliveryDate && <Text style={styles.dueBadge}>Due {fmtDate(g.deliveryDate)}</Text>}
      </View>
    </View>
  );
}

export function TailorWorksheetDocument({
  sections,
  date,
  shopName,
  logoDataUrl,
}: {
  sections: TailorWorksheetSection[];
  date: string;
  shopName: string;
  logoDataUrl?: string | null;
}) {
  return (
    <Document>
      {sections.map((section) => (
        <Page key={section.tailorId} size="A4" style={styles.page}>
          <View style={styles.headerRow}>
            <View>
              {logoDataUrl && <Image src={logoDataUrl} style={styles.logo} />}
              <Text style={styles.shopName}>{shopName || "Shop"}</Text>
            </View>
            <View>
              <Text style={styles.tailorName}>{section.tailorName}</Text>
              <Text style={styles.dateLine}>{fmtDate(date)}</Text>
            </View>
          </View>

          {section.overdue.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>⚠ Overdue ({section.overdue.length})</Text>
              <View style={styles.overdueBox}>
                {section.overdue.map((g, i) => (
                  <GarmentRow key={g.key} g={g} first={i === 0} />
                ))}
              </View>
            </>
          )}

          {section.pendingFromBefore.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Pending from before ({section.pendingFromBefore.length})</Text>
              <View style={styles.pendingBox}>
                {section.pendingFromBefore.map((g, i) => (
                  <GarmentRow key={g.key} g={g} first={i === 0} />
                ))}
              </View>
            </>
          )}

          <Text style={styles.sectionTitle}>Today&apos;s work ({section.newToday.length})</Text>
          {section.newToday.length > 0 ? (
            <View style={styles.todayBox}>
              {section.newToday.map((g, i) => (
                <GarmentRow key={g.key} g={g} first={i === 0} />
              ))}
            </View>
          ) : (
            <Text style={styles.emptyLine}>No new work today.</Text>
          )}

          <Text style={styles.footer}>Please finish anything pending from before first.</Text>
        </Page>
      ))}
    </Document>
  );
}
