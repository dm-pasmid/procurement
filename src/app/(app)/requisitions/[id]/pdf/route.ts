import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { RequisitionPdf } from "@/lib/pdf/requisition-pdf";
import { prisma } from "@/lib/prisma";

const BASIS_LABELS: Record<string, string> = {
  LAST_PURCHASE_RATE: "LPR",
  MARKET_SURVEY: "Market Survey",
  GEM: "GeM",
  RATE_CONTRACT: "Rate Contract",
  OTHER: "Other",
};

const nf = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2 });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user || !user.active) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const req = await prisma.requisition.findUnique({
    where: { id },
    include: {
      section: true,
      initiator: true,
      items: { include: { item: true } },
    },
  });
  if (!req) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!can(user, "view", "requisition", { sectionId: req.sectionId })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (req.reqNumber.startsWith("DRAFT-")) {
    return NextResponse.json(
      { error: "PDF is available after submission" },
      { status: 409 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const qrDataUrl = await QRCode.toDataURL(
    `${appUrl}/requisitions/${req.id}`,
    { margin: 0, width: 128 },
  );

  const buffer = await renderToBuffer(
    RequisitionPdf({
      data: {
        reqNumber: req.reqNumber,
        date: req.updatedAt.toLocaleDateString("en-IN"),
        fy: req.fy,
        sectionName: req.section.name,
        initiatorName: req.initiator.name,
        initiatorDesignation: req.initiator.designation,
        purpose: req.purpose,
        desiredDeliveryDays: req.desiredDeliveryDays,
        finalLevel: req.finalLevel,
        lines: req.items.map((line) => ({
          name: line.item?.name ?? line.itemNameFree ?? "—",
          nonMaster: !line.item,
          specification: line.specification,
          unit: line.unit,
          qty: Number(line.qty).toString(),
          estRate: nf.format(Number(line.estRate)),
          basis: BASIS_LABELS[line.estBasis] ?? line.estBasis,
          amount: nf.format(Number(line.qty) * Number(line.estRate)),
        })),
        total: nf.format(Number(req.estimatedTotal)),
        totalNumber: Number(req.estimatedTotal),
        qrDataUrl,
      },
    }),
  );

  const filename = `${req.reqNumber.replaceAll("/", "_")}.pdf`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}
