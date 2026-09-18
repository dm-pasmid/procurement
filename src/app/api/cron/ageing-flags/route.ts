import { NextResponse } from "next/server";
import { runAgeingFlags } from "@/lib/ageing-flags";

/**
 * Nightly ageing pass. Configure in vercel.json crons; when CRON_SECRET is
 * set, requests must carry it as a bearer token (Vercel does automatically).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }
  }

  const result = await runAgeingFlags();
  return NextResponse.json({ ok: true, ...result });
}
