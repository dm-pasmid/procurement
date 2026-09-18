import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { BpmPdf } from "@/lib/pdf/bpm-pdf";
import { prisma } from "@/lib/prisma";

const nf = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2 });

const DEDUCTION_LABELS: Record<string, string> = {
  SECURITY_DEPOSIT: "Security Deposit",
  LD_PENALTY: "LD / Penalty",
  TDS_IT: "TDS (IT)",
  TDS_GST: "TDS (GST)",
  OTHER: "Other",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user || !user.active || !can(user, "view", "bill")) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const bill = await prisma.bill.findUnique({
    where: { id },
    include: {
      items: true,
      deductions: true,
      so: {
        include: {
          vendor: true,
          items: true,
          grns: { where: { status: "COUNTERSIGNED" } },
          bills: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  });
  if (!bill) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (bill.status === "ENTERED") {
    return NextResponse.json(
      { error: "Generate the Bill Passing Memo first" },
      { status: 409 },
    );
  }

  const soLineById = new Map(bill.so.items.map((l) => [l.id, l]));
  const grnItems = await prisma.grnItem.findMany({
    where: { grn: { soId: bill.soId, status: "COUNTERSIGNED" } },
  });
  const acceptedFor = (soItemId: string) =>
    grnItems
      .filter((g) => g.soItemId === soItemId)
      .reduce((s, g) => s + Number(g.qtyAccepted), 0);

  // Running-bill context: position of this bill and totals of earlier ones.
  const sequence = bill.so.bills.findIndex((b) => b.id === bill.id) + 1;
  const previouslyBilled = bill.so.bills
    .filter((b) => b.createdAt < bill.createdAt)
    .reduce((s, b) => s + Number(b.computedPayable), 0);
  const soTotal = bill.so.items.reduce(
    (s, l) => s + Number(l.qty) * Number(l.rate) * (1 + Number(l.gstPercent) / 100),
    0,
  );
  const balanceAfterThis = Math.max(
    0,
    soTotal - previouslyBilled - Number(bill.computedPayable),
  );

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const qrDataUrl = await QRCode.toDataURL(`${appUrl}/bills/${bill.id}`, {
    margin: 0,
    width: 128,
  });

  const buffer = await renderToBuffer(
    BpmPdf({
      data: {
        bpmNumber: bill.bpmNumber,
        date: new Date().toLocaleDateString("en-IN"),
        billSequence: sequence,
        soNumber: bill.so.soNumber,
        grnNumbers: bill.so.grns.map((g) => g.grnNumber).join(", "),
        vendorName: bill.so.vendor.name,
        vendorBillNumber: bill.vendorBillNumber,
        vendorBillDate: bill.vendorBillDate.toLocaleDateString("en-IN"),
        previouslyBilled: nf.format(previouslyBilled),
        balanceAfterThis: nf.format(balanceAfterThis),
        lines: bill.items.map((line) => {
          const soLine = soLineById.get(line.soItemId);
          const deviations = line.lineDeviations as { notes?: string[] };
          const gstFactor = soLine ? 1 + Number(soLine.gstPercent) / 100 : 1;
          return {
            description: soLine?.description ?? "—",
            ordered: soLine ? Number(soLine.qty).toString() : "—",
            accepted: acceptedFor(line.soItemId).toString(),
            billed: Number(line.billedQty).toString(),
            payableQty: Number(line.payableQty).toString(),
            soRate: soLine ? nf.format(Number(soLine.rate)) : "—",
            billedRate: nf.format(Number(line.billedRate)),
            payableAmount: nf.format(
              Number(line.payableQty) * Number(line.payableRate) * gstFactor,
            ),
            notes: deviations.notes ?? [],
          };
        }),
        claimed: nf.format(Number(bill.claimedAmount)),
        computedPayable: nf.format(Number(bill.computedPayable)),
        deductions: bill.deductions.map((d) => ({
          label: DEDUCTION_LABELS[d.type] ?? d.type,
          amount: nf.format(Number(d.amount)),
          remarks: d.remarks,
        })),
        deductionsTotal: nf.format(Number(bill.deductionsTotal)),
        netPayable: nf.format(Number(bill.netPayable)),
        netPayableNumber: Number(bill.netPayable),
        qrDataUrl,
      },
    }),
  );

  const filename = `${bill.bpmNumber.replaceAll("/", "_")}.pdf`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}
