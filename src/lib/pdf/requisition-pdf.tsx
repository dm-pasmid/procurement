import { Image, Text, View } from "@react-pdf/renderer";
import { amountInWordsINR } from "./amount-in-words";
import { Letterhead, pdfStyles } from "./letterhead";

export interface RequisitionPdfData {
  reqNumber: string;
  date: string; // dd/mm/yyyy
  fy: string;
  sectionName: string;
  initiatorName: string;
  initiatorDesignation: string;
  purpose: string;
  desiredDeliveryDays: number | null;
  finalLevel: string;
  lines: {
    name: string;
    nonMaster: boolean;
    specification: string | null;
    unit: string;
    qty: string;
    estRate: string;
    basis: string;
    amount: string;
  }[];
  total: string;
  totalNumber: number;
  /** data-URL of the QR code linking to the requisition */
  qrDataUrl: string;
}

const nf = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2 });

// Column widths (%): sl 5, item 24, spec 20, unit 7, qty 8, rate 12, basis 12, amount 12
const W = { sl: "5%", item: "24%", spec: "20%", unit: "7%", qty: "8%", rate: "12%", basis: "12%", amount: "12%" } as const;

export function RequisitionPdf({ data }: { data: RequisitionPdfData }) {
  return (
    <Letterhead
      title="REQUISITION"
      memoNumber={data.reqNumber}
      date={data.date}
    >
      {/* Meta */}
      <View style={{ marginBottom: 8 }}>
        <Text>
          Section: <Text style={pdfStyles.bold}>{data.sectionName}</Text>
          {"    "}Financial year: <Text style={pdfStyles.bold}>{data.fy}</Text>
          {"    "}Final approval level:{" "}
          <Text style={pdfStyles.bold}>{data.finalLevel}</Text>
          {data.desiredDeliveryDays != null && (
            <>
              {"    "}Desired delivery:{" "}
              <Text style={pdfStyles.bold}>
                {data.desiredDeliveryDays} days
              </Text>
            </>
          )}
        </Text>
      </View>

      {/* Purpose */}
      <View style={{ marginBottom: 10 }}>
        <Text style={pdfStyles.bold}>Purpose / Justification:</Text>
        <Text style={{ marginTop: 2 }}>{data.purpose}</Text>
      </View>

      {/* Item table */}
      <View style={pdfStyles.table}>
        <View style={pdfStyles.trHead}>
          <Text style={[pdfStyles.th, pdfStyles.first, { width: W.sl }]}>Sl</Text>
          <Text style={[pdfStyles.th, { width: W.item }]}>Item</Text>
          <Text style={[pdfStyles.th, { width: W.spec }]}>Specification</Text>
          <Text style={[pdfStyles.th, { width: W.unit }]}>Unit</Text>
          <Text style={[pdfStyles.th, pdfStyles.right, { width: W.qty }]}>Qty</Text>
          <Text style={[pdfStyles.th, pdfStyles.right, { width: W.rate }]}>Est. Rate (Rs.)</Text>
          <Text style={[pdfStyles.th, { width: W.basis }]}>Basis</Text>
          <Text style={[pdfStyles.th, pdfStyles.right, { width: W.amount }]}>Amount (Rs.)</Text>
        </View>
        {data.lines.map((line, i) => (
          <View key={i} style={pdfStyles.tr} wrap={false}>
            <Text style={[pdfStyles.td, pdfStyles.first, { width: W.sl }]}>{i + 1}</Text>
            <Text style={[pdfStyles.td, { width: W.item }]}>
              {line.name}
              {line.nonMaster ? " *" : ""}
            </Text>
            <Text style={[pdfStyles.td, { width: W.spec }]}>{line.specification ?? "—"}</Text>
            <Text style={[pdfStyles.td, { width: W.unit }]}>{line.unit}</Text>
            <Text style={[pdfStyles.td, pdfStyles.right, { width: W.qty }]}>{line.qty}</Text>
            <Text style={[pdfStyles.td, pdfStyles.right, { width: W.rate }]}>{line.estRate}</Text>
            <Text style={[pdfStyles.td, { width: W.basis }]}>{line.basis}</Text>
            <Text style={[pdfStyles.td, pdfStyles.right, { width: W.amount }]}>{line.amount}</Text>
          </View>
        ))}
        <View style={pdfStyles.tr}>
          <Text style={[pdfStyles.td, pdfStyles.first, pdfStyles.bold, pdfStyles.right, { width: "76%" }]}>
            Total Estimate
          </Text>
          <Text style={[pdfStyles.td, pdfStyles.bold, pdfStyles.right, { width: W.basis }]}> </Text>
          <Text style={[pdfStyles.td, pdfStyles.bold, pdfStyles.right, { width: W.amount }]}>
            {data.total}
          </Text>
        </View>
      </View>

      <Text style={{ marginTop: 6 }}>
        Total estimate: <Text style={pdfStyles.bold}>Rs. {nf.format(data.totalNumber)}</Text>{" "}
        (<Text style={pdfStyles.bold}>{amountInWordsINR(data.totalNumber)}</Text>)
      </Text>
      {data.lines.some((l) => l.nonMaster) && (
        <Text style={{ marginTop: 4, fontSize: 7.5, color: "#666666" }}>
          * Item not present in the item master.
        </Text>
      )}

      {/* Signatures + QR */}
      <View
        style={{
          marginTop: 48,
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
        <View style={{ alignItems: "center", width: 150 }}>
          <View style={{ borderTopWidth: 0.75, borderTopColor: "#111111", width: "100%", marginBottom: 3 }} />
          <Text style={pdfStyles.bold}>Initiating Official</Text>
          <Text style={{ fontSize: 8, color: "#444444" }}>
            {data.initiatorName}
          </Text>
          <Text style={{ fontSize: 7.5, color: "#666666" }}>
            {data.initiatorDesignation}
          </Text>
        </View>
        <View style={{ alignItems: "center", width: 150 }}>
          <View style={{ borderTopWidth: 0.75, borderTopColor: "#111111", width: "100%", marginBottom: 3 }} />
          <Text style={pdfStyles.bold}>Officer-in-Charge</Text>
          <Text style={{ fontSize: 7.5, color: "#666666" }}>
            (Signature & date)
          </Text>
        </View>
      </View>
    </Letterhead>
  );
}
