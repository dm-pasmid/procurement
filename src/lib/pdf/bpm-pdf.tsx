import { Image, Text, View } from "@react-pdf/renderer";
import { amountInWordsINR } from "./amount-in-words";
import { Letterhead, pdfStyles } from "./letterhead";

export interface BpmPdfData {
  bpmNumber: string;
  date: string;
  billSequence: number;
  soNumber: string;
  grnNumbers: string;
  vendorName: string;
  vendorBillNumber: string;
  vendorBillDate: string;
  previouslyBilled: string;
  balanceAfterThis: string;
  lines: {
    description: string;
    ordered: string;
    accepted: string;
    billed: string;
    payableQty: string;
    soRate: string;
    billedRate: string;
    payableAmount: string;
    notes: string[];
  }[];
  claimed: string;
  computedPayable: string;
  deductions: { label: string; amount: string; remarks: string | null }[];
  deductionsTotal: string;
  netPayable: string;
  netPayableNumber: number;
  qrDataUrl: string;
}

const W = { sl: "4%", desc: "24%", ordered: "9%", accepted: "9%", billed: "9%", payable: "9%", soRate: "12%", billedRate: "12%", amount: "12%" } as const;

export function BpmPdf({ data }: { data: BpmPdfData }) {
  return (
    <Letterhead
      title="BILL PASSING MEMO"
      memoNumber={data.bpmNumber}
      date={data.date}
    >
      <View style={{ marginBottom: 8 }}>
        <Text style={pdfStyles.bold}>
          Bill {data.billSequence} against Supply Order {data.soNumber}
        </Text>
        <Text style={{ marginTop: 2 }}>
          GRN(s): <Text style={pdfStyles.bold}>{data.grnNumbers}</Text> · Vendor{" "}
          <Text style={pdfStyles.bold}>{data.vendorName}</Text> · Vendor bill{" "}
          <Text style={pdfStyles.bold}>{data.vendorBillNumber}</Text> dated{" "}
          <Text style={pdfStyles.bold}>{data.vendorBillDate}</Text>
        </Text>
        <Text style={{ marginTop: 2 }}>
          Previously billed against this SO:{" "}
          <Text style={pdfStyles.bold}>Rs. {data.previouslyBilled}</Text> ·
          Balance after this bill:{" "}
          <Text style={pdfStyles.bold}>Rs. {data.balanceAfterThis}</Text>
        </Text>
      </View>

      {/* Comparison table */}
      <View style={pdfStyles.table}>
        <View style={pdfStyles.trHead}>
          <Text style={[pdfStyles.th, pdfStyles.first, { width: W.sl }]}>Sl</Text>
          <Text style={[pdfStyles.th, { width: W.desc }]}>Item</Text>
          <Text style={[pdfStyles.th, pdfStyles.right, { width: W.ordered }]}>Ordered</Text>
          <Text style={[pdfStyles.th, pdfStyles.right, { width: W.accepted }]}>Accepted</Text>
          <Text style={[pdfStyles.th, pdfStyles.right, { width: W.billed }]}>Billed</Text>
          <Text style={[pdfStyles.th, pdfStyles.right, { width: W.payable }]}>Payable</Text>
          <Text style={[pdfStyles.th, pdfStyles.right, { width: W.soRate }]}>SO rate</Text>
          <Text style={[pdfStyles.th, pdfStyles.right, { width: W.billedRate }]}>Billed rate</Text>
          <Text style={[pdfStyles.th, pdfStyles.right, { width: W.amount }]}>Amount (Rs.)</Text>
        </View>
        {data.lines.map((line, i) => (
          <View key={i} wrap={false}>
            <View style={pdfStyles.tr}>
              <Text style={[pdfStyles.td, pdfStyles.first, { width: W.sl }]}>{i + 1}</Text>
              <Text style={[pdfStyles.td, { width: W.desc }]}>{line.description}</Text>
              <Text style={[pdfStyles.td, pdfStyles.right, { width: W.ordered }]}>{line.ordered}</Text>
              <Text style={[pdfStyles.td, pdfStyles.right, { width: W.accepted }]}>{line.accepted}</Text>
              <Text style={[pdfStyles.td, pdfStyles.right, { width: W.billed }]}>{line.billed}</Text>
              <Text style={[pdfStyles.td, pdfStyles.right, { width: W.payable }]}>{line.payableQty}</Text>
              <Text style={[pdfStyles.td, pdfStyles.right, { width: W.soRate }]}>{line.soRate}</Text>
              <Text style={[pdfStyles.td, pdfStyles.right, { width: W.billedRate }]}>{line.billedRate}</Text>
              <Text style={[pdfStyles.td, pdfStyles.right, { width: W.amount }]}>{line.payableAmount}</Text>
            </View>
            {line.notes.length > 0 && (
              <View style={[pdfStyles.tr, { backgroundColor: "#FDF6EC" }]}>
                <Text
                  style={[
                    pdfStyles.td,
                    pdfStyles.first,
                    { width: "100%", fontFamily: "Helvetica-Oblique", fontSize: 7.5, color: "#8a5a00" },
                  ]}
                >
                  {line.notes.join("  ·  ")}
                </Text>
              </View>
            )}
          </View>
        ))}
      </View>

      {/* Summary */}
      <View style={{ marginTop: 10, alignSelf: "flex-end", width: 260 }}>
        <SummaryRow label="Claimed amount" value={`Rs. ${data.claimed}`} />
        <SummaryRow label="Computed payable" value={`Rs. ${data.computedPayable}`} />
        {data.deductions.map((d, i) => (
          <SummaryRow
            key={i}
            label={`Less: ${d.label}${d.remarks ? ` (${d.remarks})` : ""}`}
            value={`− Rs. ${d.amount}`}
          />
        ))}
        <SummaryRow label="Total deductions" value={`− Rs. ${data.deductionsTotal}`} />
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            borderTopWidth: 1,
            borderTopColor: "#111111",
            marginTop: 2,
            paddingTop: 2,
          }}
        >
          <Text style={[pdfStyles.bold, { fontSize: 10 }]}>NET PAYABLE</Text>
          <Text style={[pdfStyles.bold, { fontSize: 10 }]}>Rs. {data.netPayable}</Text>
        </View>
      </View>

      {/* Certificate */}
      <View style={{ marginTop: 14, borderWidth: 0.75, borderColor: "#333333", padding: 8 }}>
        <Text style={{ fontSize: 9 }}>
          Certified that the stores have been received in good condition as per
          GRN(s) referenced above and the bill has been verified against the
          Supply Order. Passed for payment of{" "}
          <Text style={pdfStyles.bold}>Rs. {data.netPayable}</Text> (
          <Text style={pdfStyles.bold}>{amountInWordsINR(data.netPayableNumber)}</Text>
          ).
        </Text>
      </View>

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
          <Image src={data.qrDataUrl} style={{ width: 60, height: 60 }} />
          <Text style={{ fontSize: 6.5, color: "#666666", marginTop: 2 }}>
            Scan to verify
          </Text>
        </View>
        <SignatureBlock title="Dealing Assistant" />
        <SignatureBlock title="Nezarath Deputy Collector" />
        <SignatureBlock title="Sanctioning Authority" />
      </View>
    </Letterhead>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 1 }}>
      <Text style={{ fontSize: 8.5, flexShrink: 1, paddingRight: 6 }}>{label}</Text>
      <Text style={{ fontSize: 8.5 }}>{value}</Text>
    </View>
  );
}

function SignatureBlock({ title }: { title: string }) {
  return (
    <View style={{ alignItems: "center", width: 140 }}>
      <View
        style={{
          borderTopWidth: 0.75,
          borderTopColor: "#111111",
          width: "100%",
          marginBottom: 3,
        }}
      />
      <Text style={[pdfStyles.bold, { fontSize: 8.5, textAlign: "center" }]}>{title}</Text>
    </View>
  );
}
