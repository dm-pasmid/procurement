/**
 * Shared PDF letterhead — reused by all documents (REQ, SO, GRN, BPM).
 * Placeholder emblem box until the office supplies artwork.
 */
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

export const pdfStyles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 54,
    paddingHorizontal: 42,
    fontSize: 9.5,
    fontFamily: "Helvetica",
    color: "#111111",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 2,
    borderBottomColor: "#1F3864",
    paddingBottom: 10,
    marginBottom: 6,
  },
  emblemBox: {
    width: 44,
    height: 44,
    borderWidth: 1.5,
    borderColor: "#1F3864",
    alignItems: "center",
    justifyContent: "center",
  },
  emblemText: { fontSize: 6, color: "#1F3864", fontFamily: "Helvetica-Bold" },
  officeName: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: "#1F3864",
  },
  officeSub: { fontSize: 9, color: "#444444", marginTop: 2 },
  docTitleWrap: {
    marginTop: 10,
    marginBottom: 8,
    alignItems: "center",
  },
  docTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 2,
    textDecoration: "underline",
    color: "#111111",
  },
  memoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  memoText: { fontSize: 9.5 },
  bold: { fontFamily: "Helvetica-Bold" },

  // shared table styles
  table: { borderWidth: 1, borderColor: "#333333" },
  tr: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#333333" },
  trHead: { flexDirection: "row", backgroundColor: "#E8EDF5" },
  th: {
    padding: 4,
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
    borderLeftWidth: 1,
    borderLeftColor: "#333333",
  },
  td: {
    padding: 4,
    fontSize: 8.5,
    borderLeftWidth: 1,
    borderLeftColor: "#333333",
  },
  first: { borderLeftWidth: 0 },
  right: { textAlign: "right" },

  footer: {
    position: "absolute",
    bottom: 20,
    left: 42,
    right: 42,
    borderTopWidth: 0.5,
    borderTopColor: "#999999",
    paddingTop: 4,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 7, color: "#666666" },
});

export function Letterhead({
  title,
  memoNumber,
  date,
  generatedNote,
  children,
}: {
  title: string;
  memoNumber: string;
  date: string;
  /** Footer note, e.g. verification hint. */
  generatedNote?: string;
  children: React.ReactNode;
}) {
  return (
    <Document title={`${title} ${memoNumber}`}>
      <Page size="A4" style={pdfStyles.page}>
        <View style={pdfStyles.headerRow} fixed>
          <View style={pdfStyles.emblemBox}>
            <Text style={pdfStyles.emblemText}>EMBLEM</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={pdfStyles.officeName}>
              Office of the District Magistrate & Collector, Paschim Medinipur
            </Text>
            <Text style={pdfStyles.officeSub}>
              Procurement Management System (PMS) — Government of West Bengal
            </Text>
          </View>
        </View>

        <View style={pdfStyles.docTitleWrap}>
          <Text style={pdfStyles.docTitle}>{title}</Text>
        </View>

        <View style={pdfStyles.memoRow}>
          <Text style={pdfStyles.memoText}>
            Memo No.: <Text style={pdfStyles.bold}>{memoNumber}</Text>
          </Text>
          <Text style={pdfStyles.memoText}>
            Date: <Text style={pdfStyles.bold}>{date}</Text>
          </Text>
        </View>

        {children}

        <View style={pdfStyles.footer} fixed>
          <Text style={pdfStyles.footerText}>
            {generatedNote ??
              "System-generated document. Physical file remains the instrument of sanction."}
          </Text>
          <Text
            style={pdfStyles.footerText}
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
