import { Image, Text, View } from "@react-pdf/renderer";
import { amountInWordsINR } from "./amount-in-words";
import { Letterhead, pdfStyles } from "./letterhead";

export interface SupplyOrderPdfData {
  soNumber: string;
  date: string;
  version: number;
  parentSoNumber: string | null;
  vendor: { name: string; address: string | null; gstin: string | null };
  referenceLine: string;
  lines: {
    description: string;
    unit: string;
    qty: string;
    rate: string;
    gstPercent: string;
    amount: string;
  }[];
  total: string;
  totalNumber: number;
  deliveryDays: number;
  deliveryLocation: string;
  terms: string;
  qrDataUrl: string;
}

const nf = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2 });

const W = { sl: "5%", desc: "37%", unit: "8%", qty: "9%", rate: "13%", gst: "8%", amount: "20%" } as const;

export function SupplyOrderPdf({ data }: { data: SupplyOrderPdfData }) {
  return (
    <Letterhead title="SUPPLY ORDER" memoNumber={data.soNumber} date={data.date}>
      {data.parentSoNumber && (
        <Text style={{ marginBottom: 6, fontFamily: "Helvetica-Bold" }}>
          Amendment (version {data.version}) of Supply Order {data.parentSoNumber}
        </Text>
      )}

      {/* Vendor block */}
      <View style={{ marginBottom: 8 }}>
        <Text style={pdfStyles.bold}>To,</Text>
        <Text style={pdfStyles.bold}>{data.vendor.name}</Text>
        {data.vendor.address && <Text>{data.vendor.address}</Text>}
        {data.vendor.gstin && <Text>GSTIN: {data.vendor.gstin}</Text>}
      </View>

      <Text style={{ marginBottom: 8 }}>Ref: {data.referenceLine}</Text>

      <Text style={{ marginBottom: 8 }}>
        You are requested to supply the following stores at the rates and
        within the period stated below:
      </Text>

      {/* Item table */}
      <View style={pdfStyles.table}>
        <View style={pdfStyles.trHead}>
          <Text style={[pdfStyles.th, pdfStyles.first, { width: W.sl }]}>Sl</Text>
          <Text style={[pdfStyles.th, { width: W.desc }]}>Description</Text>
          <Text style={[pdfStyles.th, { width: W.unit }]}>Unit</Text>
          <Text style={[pdfStyles.th, pdfStyles.right, { width: W.qty }]}>Qty</Text>
          <Text style={[pdfStyles.th, pdfStyles.right, { width: W.rate }]}>Rate (Rs.)</Text>
          <Text style={[pdfStyles.th, pdfStyles.right, { width: W.gst }]}>GST %</Text>
          <Text style={[pdfStyles.th, pdfStyles.right, { width: W.amount }]}>Amount (Rs.)</Text>
        </View>
        {data.lines.map((line, i) => (
          <View key={i} style={pdfStyles.tr} wrap={false}>
            <Text style={[pdfStyles.td, pdfStyles.first, { width: W.sl }]}>{i + 1}</Text>
            <Text style={[pdfStyles.td, { width: W.desc }]}>{line.description}</Text>
            <Text style={[pdfStyles.td, { width: W.unit }]}>{line.unit}</Text>
            <Text style={[pdfStyles.td, pdfStyles.right, { width: W.qty }]}>{line.qty}</Text>
            <Text style={[pdfStyles.td, pdfStyles.right, { width: W.rate }]}>{line.rate}</Text>
            <Text style={[pdfStyles.td, pdfStyles.right, { width: W.gst }]}>{line.gstPercent}</Text>
            <Text style={[pdfStyles.td, pdfStyles.right, { width: W.amount }]}>{line.amount}</Text>
          </View>
        ))}
        <View style={pdfStyles.tr}>
          <Text style={[pdfStyles.td, pdfStyles.first, pdfStyles.bold, pdfStyles.right, { width: "80%" }]}>
            Total (incl. GST)
          </Text>
          <Text style={[pdfStyles.td, pdfStyles.bold, pdfStyles.right, { width: W.amount }]}>
            {data.total}
          </Text>
        </View>
      </View>

      <Text style={{ marginTop: 6 }}>
        Total: <Text style={pdfStyles.bold}>Rs. {nf.format(data.totalNumber)}</Text>{" "}
        (<Text style={pdfStyles.bold}>{amountInWordsINR(data.totalNumber)}</Text>)
      </Text>

      <View style={{ marginTop: 8 }}>
        <Text>
          Delivery: within{" "}
          <Text style={pdfStyles.bold}>{data.deliveryDays} days</Text> of this
          order, at <Text style={pdfStyles.bold}>{data.deliveryLocation}</Text>,
          Office of the District Magistrate & Collector, Paschim Medinipur.
        </Text>
      </View>

      <View style={{ marginTop: 8 }}>
        <Text style={pdfStyles.bold}>Terms & conditions:</Text>
        <Text style={{ marginTop: 2 }}>{data.terms}</Text>
      </View>

      {/* Signature + QR */}
      <View
        style={{
          marginTop: 42,
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
        <View style={{ alignItems: "center", width: 210 }}>
          <View
            style={{
              borderTopWidth: 0.75,
              borderTopColor: "#111111",
              width: "100%",
              marginBottom: 3,
            }}
          />
          <Text style={pdfStyles.bold}>Nezarath Deputy Collector</Text>
          <Text style={{ fontSize: 8, color: "#444444" }}>
            Paschim Medinipur
          </Text>
        </View>
      </View>
    </Letterhead>
  );
}
