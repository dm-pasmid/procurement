import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { RegisterColumn } from "@/lib/registers";

const s = StyleSheet.create({
  page: {
    paddingTop: 32,
    paddingBottom: 40,
    paddingHorizontal: 28,
    fontSize: 7.5,
    fontFamily: "Helvetica",
    color: "#111111",
  },
  header: {
    borderBottomWidth: 2,
    borderBottomColor: "#1F3864",
    paddingBottom: 6,
    marginBottom: 6,
  },
  office: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#1F3864", textAlign: "center" },
  title: { fontSize: 10, fontFamily: "Helvetica-Bold", textAlign: "center", marginTop: 3 },
  sub: { fontSize: 7.5, color: "#666666", textAlign: "center", marginTop: 2 },
  trHead: { flexDirection: "row", backgroundColor: "#1F3864" },
  th: { color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 7, padding: 3, borderLeftWidth: 0.5, borderLeftColor: "#ffffff" },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#cccccc" },
  trAlt: { backgroundColor: "#F4F6F9" },
  td: { padding: 3, fontSize: 7, borderLeftWidth: 0.5, borderLeftColor: "#e2e2e2" },
  right: { textAlign: "right" },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 28,
    right: 28,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.5,
    borderTopColor: "#999999",
    paddingTop: 3,
  },
  footerText: { fontSize: 6.5, color: "#666666" },
  empty: { padding: 12, fontSize: 8, color: "#666666", textAlign: "center" },
});

const nf = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2 });

export interface RegisterPdfData {
  title: string;
  fy: string;
  sectionScoped: boolean;
  columns: RegisterColumn[];
  rows: Record<string, string | number>[];
  generatedAt: string;
}

export function RegisterPdf({ data }: { data: RegisterPdfData }) {
  const totalWidth = data.columns.reduce((s, c) => s + (c.width ?? 16), 0);
  const pct = (c: RegisterColumn) => `${(((c.width ?? 16) / totalWidth) * 100).toFixed(2)}%`;

  return (
    <Document title={`${data.title} ${data.fy}`}>
      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={s.header} fixed>
          <Text style={s.office}>
            Office of the District Magistrate &amp; Collector, Paschim Medinipur
          </Text>
          <Text style={s.title}>
            {data.title} — FY {data.fy}
          </Text>
          <Text style={s.sub}>
            Generated {data.generatedAt}
            {data.sectionScoped ? " · section-scoped view" : ""} · Procurement
            Management System (PMS)
          </Text>
        </View>

        <View wrap={false} fixed>
          <View style={s.trHead}>
            {data.columns.map((c) => (
              <Text
                key={c.key}
                style={[s.th, c.numeric ? s.right : {}, { width: pct(c) }]}
              >
                {c.label}
              </Text>
            ))}
          </View>
        </View>

        {data.rows.length === 0 && <Text style={s.empty}>No records for this register.</Text>}
        {data.rows.map((row, ri) => (
          <View key={ri} style={[s.tr, ri % 2 === 1 ? s.trAlt : {}]} wrap={false}>
            {data.columns.map((c) => {
              const v = row[c.key];
              const text = c.numeric && typeof v === "number" ? nf.format(v) : String(v ?? "");
              return (
                <Text key={c.key} style={[s.td, c.numeric ? s.right : {}, { width: pct(c) }]}>
                  {text}
                </Text>
              );
            })}
          </View>
        ))}

        <View style={s.footer} fixed>
          <Text style={s.footerText}>PMS — Internal use only. Generated live from transactions.</Text>
          <Text
            style={s.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
