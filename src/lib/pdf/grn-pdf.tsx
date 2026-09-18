import { Image, Text, View } from "@react-pdf/renderer";
import { Letterhead, pdfStyles } from "./letterhead";

export interface GrnPdfData {
  grnNumber: string;
  date: string;
  soNumber: string;
  soDate: string;
  vendorName: string;
  challanNumber: string;
  challanDate: string;
  deliverySection: string;
  lines: {
    description: string;
    unit: string;
    ordered: string;
    received: string;
    accepted: string;
    rejected: string;
    remarks: string;
  }[];
  receiverName: string;
  receiverDesignation: string;
  ocName: string;
  countersignedOn: string;
  qrDataUrl: string;
}

const W = { sl: "5%", desc: "29%", unit: "7%", ordered: "10%", received: "10%", accepted: "10%", rejected: "10%", remarks: "19%" } as const;

export function GrnPdf({ data }: { data: GrnPdfData }) {
  return (
    <Letterhead
      title="GOODS RECEIPT NOTE"
      memoNumber={data.grnNumber}
      date={data.date}
    >
      <View style={{ marginBottom: 8 }}>
        <Text>
          Against Supply Order{" "}
          <Text style={pdfStyles.bold}>{data.soNumber}</Text> dated{" "}
          <Text style={pdfStyles.bold}>{data.soDate}</Text> · Vendor{" "}
          <Text style={pdfStyles.bold}>{data.vendorName}</Text>
        </Text>
        <Text style={{ marginTop: 2 }}>
          Challan No. <Text style={pdfStyles.bold}>{data.challanNumber}</Text>{" "}
          dated <Text style={pdfStyles.bold}>{data.challanDate}</Text> ·
          Received at <Text style={pdfStyles.bold}>{data.deliverySection}</Text>
        </Text>
      </View>

      <View style={pdfStyles.table}>
        <View style={pdfStyles.trHead}>
          <Text style={[pdfStyles.th, pdfStyles.first, { width: W.sl }]}>Sl</Text>
          <Text style={[pdfStyles.th, { width: W.desc }]}>Description</Text>
          <Text style={[pdfStyles.th, { width: W.unit }]}>Unit</Text>
          <Text style={[pdfStyles.th, pdfStyles.right, { width: W.ordered }]}>Ordered</Text>
          <Text style={[pdfStyles.th, pdfStyles.right, { width: W.received }]}>Received</Text>
          <Text style={[pdfStyles.th, pdfStyles.right, { width: W.accepted }]}>Accepted</Text>
          <Text style={[pdfStyles.th, pdfStyles.right, { width: W.rejected }]}>Rejected</Text>
          <Text style={[pdfStyles.th, { width: W.remarks }]}>Remarks</Text>
        </View>
        {data.lines.map((line, i) => (
          <View key={i} style={pdfStyles.tr} wrap={false}>
            <Text style={[pdfStyles.td, pdfStyles.first, { width: W.sl }]}>{i + 1}</Text>
            <Text style={[pdfStyles.td, { width: W.desc }]}>{line.description}</Text>
            <Text style={[pdfStyles.td, { width: W.unit }]}>{line.unit}</Text>
            <Text style={[pdfStyles.td, pdfStyles.right, { width: W.ordered }]}>{line.ordered}</Text>
            <Text style={[pdfStyles.td, pdfStyles.right, { width: W.received }]}>{line.received}</Text>
            <Text style={[pdfStyles.td, pdfStyles.right, { width: W.accepted }]}>{line.accepted}</Text>
            <Text style={[pdfStyles.td, pdfStyles.right, { width: W.rejected }]}>{line.rejected}</Text>
            <Text style={[pdfStyles.td, { width: W.remarks }]}>{line.remarks}</Text>
          </View>
        ))}
      </View>

      <Text style={{ marginTop: 10, fontSize: 8.5 }}>
        Certified that the stores noted above have been received and accepted
        in the quantities stated.
      </Text>

      {/* Signatures + QR */}
      <View
        style={{
          marginTop: 44,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-end",
        }}
        wrap={false}
      >
        <View style={{ alignItems: "center" }}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop */}
          <Image src={data.qrDataUrl} style={{ width: 64, height: 64 }} />
          <Text style={{ fontSize: 6.5, color: "#666666", marginTop: 2 }}>
            Scan to verify
          </Text>
        </View>
        <View style={{ alignItems: "center", width: 170 }}>
          <View style={{ borderTopWidth: 0.75, borderTopColor: "#111111", width: "100%", marginBottom: 3 }} />
          <Text style={pdfStyles.bold}>Received by</Text>
          <Text style={{ fontSize: 8, color: "#444444" }}>{data.receiverName}</Text>
          <Text style={{ fontSize: 7.5, color: "#666666" }}>
            {data.receiverDesignation}
          </Text>
        </View>
        <View style={{ alignItems: "center", width: 170 }}>
          <View style={{ borderTopWidth: 0.75, borderTopColor: "#111111", width: "100%", marginBottom: 3 }} />
          <Text style={pdfStyles.bold}>Countersigned — Officer-in-Charge</Text>
          <Text style={{ fontSize: 8, color: "#444444" }}>{data.ocName}</Text>
          <Text style={{ fontSize: 7.5, color: "#666666" }}>
            on {data.countersignedOn}
          </Text>
        </View>
      </View>
    </Letterhead>
  );
}
