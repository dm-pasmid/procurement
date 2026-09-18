import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { GrnPdf } from "@/lib/pdf/grn-pdf";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user || !user.active) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const grn = await prisma.grn.findUnique({
    where: { id },
    include: {
      items: true,
      receiver: true,
      ocCountersignedBy: true,
      so: { include: { vendor: true, deliverySection: true, items: true } },
    },
  });
  if (!grn) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!can(user, "view", "grn", { sectionId: grn.so.deliverySectionId })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (grn.status !== "COUNTERSIGNED") {
    return NextResponse.json(
      { error: "PDF is available after countersignature" },
      { status: 409 },
    );
  }

  const soLineById = new Map(grn.so.items.map((l) => [l.id, l]));
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const qrDataUrl = await QRCode.toDataURL(`${appUrl}/grn/${grn.id}`, {
    margin: 0,
    width: 128,
  });

  const buffer = await renderToBuffer(
    GrnPdf({
      data: {
        grnNumber: grn.grnNumber,
        date: (grn.ocCountersignedAt ?? grn.receiptDate).toLocaleDateString("en-IN"),
        soNumber: grn.so.soNumber,
        soDate: grn.so.issuedAt?.toLocaleDateString("en-IN") ?? "—",
        vendorName: grn.so.vendor.name,
        challanNumber: grn.challanNumber,
        challanDate: grn.challanDate.toLocaleDateString("en-IN"),
        deliverySection: grn.so.deliverySection.name,
        lines: grn.items.map((line) => {
          const soLine = soLineById.get(line.soItemId);
          return {
            description: soLine?.description ?? "—",
            unit: soLine?.unit ?? "—",
            ordered: soLine ? Number(soLine.qty).toString() : "—",
            received: Number(line.qtyReceived).toString(),
            accepted: Number(line.qtyAccepted).toString(),
            rejected: Number(line.qtyRejected).toString(),
            remarks: line.remarks ?? "—",
          };
        }),
        receiverName: grn.receiver.name,
        receiverDesignation: grn.receiver.designation,
        ocName: grn.ocCountersignedBy?.name ?? "—",
        countersignedOn:
          grn.ocCountersignedAt?.toLocaleDateString("en-IN") ?? "—",
        qrDataUrl,
      },
    }),
  );

  const filename = `${grn.grnNumber.replaceAll("/", "_")}.pdf`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}
