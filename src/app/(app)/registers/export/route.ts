import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { RegisterPdf } from "@/lib/pdf/register-pdf";
import {
  loadRegister,
  registerMeta,
  registersForRole,
  type RegisterKey,
} from "@/lib/registers";
import { registerWorkbook } from "@/lib/registers-excel";
import { deriveFy } from "@/lib/numbering";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !user.active || !can(user, "view", "register")) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const url = new URL(request.url);
  const key = (url.searchParams.get("register") ?? "") as RegisterKey;
  const format = url.searchParams.get("format") ?? "xlsx";
  const fy = url.searchParams.get("fy") ?? deriveFy();

  const meta = registerMeta(key);
  const allowed = registersForRole(user.role).some((r) => r.key === key);
  if (!meta || !allowed) {
    return NextResponse.json({ error: "Register not available for your role" }, { status: 403 });
  }

  const filters: Record<string, string | undefined> = {
    status: url.searchParams.get("status") ?? undefined,
    type: url.searchParams.get("type") ?? undefined,
    severity: url.searchParams.get("severity") ?? undefined,
  };

  const data = await loadRegister(key, {
    role: user.role,
    sectionId: user.sectionId,
    fy,
    filters,
  });

  const base = `${key}-register-${fy}`;

  if (format === "pdf") {
    const buffer = await renderToBuffer(
      RegisterPdf({
        data: {
          title: data.title,
          fy: data.fy,
          sectionScoped: data.sectionScoped,
          columns: data.columns,
          rows: data.rows,
          generatedAt: new Date().toLocaleString("en-IN"),
        },
      }),
    );
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${base}.pdf"`,
      },
    });
  }

  const buffer = await registerWorkbook(data);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${base}.xlsx"`,
    },
  });
}
