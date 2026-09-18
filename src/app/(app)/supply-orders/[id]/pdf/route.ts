import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { SupplyOrderPdf } from "@/lib/pdf/supply-order-pdf";
import { prisma } from "@/lib/prisma";
import { soLineTotal, soTotal } from "@/lib/so-utils";

const nf = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2 });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user || !user.active || !can(user, "view", "supplyOrder")) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const so = await prisma.supplyOrder.findUnique({
    where: { id },
    include: {
      items: true,
      vendor: true,
      deliverySection: true,
      requisition: true,
      procurement: true,
      parentSo: true,
    },
  });
  if (!so) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (so.soNumber.startsWith("DRAFT-")) {
    return NextResponse.json(
      { error: "PDF is available after issue" },
      { status: 409 },
    );
  }

  // Reference line: requisition + procurement basis.
  const reqDate = so.requisition.updatedAt.toLocaleDateString("en-IN");
  let procRef = "";
  if (so.procurement.mode === "TENDER") {
    procRef = `NIT ${so.procurement.nitNumber ?? "—"}${so.procurement.nitDate ? ` dated ${so.procurement.nitDate.toLocaleDateString("en-IN")}` : ""}`;
  } else if (so.procurement.mode === "EMPANELLED") {
    procRef = `Empanelment ref ${so.vendor.empanelmentRef ?? "—"}`;
  } else {
    procRef = `GeM order ${so.procurement.gemOrderRef ?? "—"}`;
  }
  const referenceLine = `Against Requisition ${so.requisition.reqNumber} dated ${reqDate}; ${procRef}`;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const qrDataUrl = await QRCode.toDataURL(`${appUrl}/supply-orders/${so.id}`, {
    margin: 0,
    width: 128,
  });

  const total = soTotal(
    so.items.map((l) => ({
      qty: Number(l.qty),
      rate: Number(l.rate),
      gstPercent: Number(l.gstPercent),
    })),
  );

  const buffer = await renderToBuffer(
    SupplyOrderPdf({
      data: {
        soNumber: so.soNumber,
        date: (so.issuedAt ?? new Date()).toLocaleDateString("en-IN"),
        version: so.version,
        parentSoNumber:
          so.parentSo && !so.parentSo.soNumber.startsWith("DRAFT-")
            ? so.parentSo.soNumber
            : null,
        vendor: {
          name: so.vendor.name,
          address: so.vendor.address,
          gstin: so.vendor.gstin,
        },
        referenceLine,
        lines: so.items.map((l) => ({
          description: l.description,
          unit: l.unit,
          qty: Number(l.qty).toString(),
          rate: nf.format(Number(l.rate)),
          gstPercent: Number(l.gstPercent).toString(),
          amount: nf.format(
            soLineTotal({
              qty: Number(l.qty),
              rate: Number(l.rate),
              gstPercent: Number(l.gstPercent),
            }),
          ),
        })),
        total: nf.format(total),
        totalNumber: total,
        deliveryDays: so.deliveryDays,
        deliveryLocation: so.deliverySection.name,
        terms: so.terms,
        qrDataUrl,
      },
    }),
  );

  const filename = `${so.soNumber.replaceAll("/", "_")}.pdf`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}
