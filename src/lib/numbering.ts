import { DocType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Financial year runs April–March.
 * deriveFy(new Date("2026-07-04")) === "2026-27"
 * deriveFy(new Date("2026-02-10")) === "2025-26"
 */
export function deriveFy(date: Date = new Date()): string {
  const year = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  const next = (year + 1) % 100;
  return `${year}-${String(next).padStart(2, "0")}`;
}

const DOC_PREFIX: Record<DocType, string> = {
  REQ: "REQ",
  SO: "SO",
  GRN: "GRN",
  BPM: "BPM",
};

export function formatNumber(docType: DocType, fy: string, serial: number): string {
  return `${DOC_PREFIX[docType]}/PMS/${fy}/${String(serial).padStart(4, "0")}`;
}

/**
 * Allocates the next gapless serial for (docType, fy) and returns the formatted
 * document number, e.g. "REQ/PMS/2026-27/0041".
 *
 * Concurrency-safe: the NumberSeries row is locked with SELECT ... FOR UPDATE,
 * so concurrent allocations serialise on the row and can never hand out the
 * same serial twice.
 *
 * Gapless discipline: allocate inside the SAME transaction that inserts the
 * document — pass the surrounding transaction client as `tx`. If the insert
 * rolls back, the serial allocation rolls back with it and no gap is created.
 * When called without `tx`, a dedicated transaction is opened (the number is
 * then committed immediately and a caller-side failure would leave a gap).
 */
export async function allocateNumber(
  docType: DocType,
  fy: string,
  tx?: Prisma.TransactionClient,
): Promise<string> {
  if (tx) {
    return allocateInTx(tx, docType, fy);
  }
  return prisma.$transaction((trx) => allocateInTx(trx, docType, fy));
}

async function allocateInTx(
  tx: Prisma.TransactionClient,
  docType: DocType,
  fy: string,
): Promise<string> {
  // Ensure the series row exists (no-op when it already does).
  await tx.$executeRaw`
    INSERT INTO "NumberSeries" ("fy", "docType", "lastSerial")
    VALUES (${fy}, ${docType}::"DocType", 0)
    ON CONFLICT ("fy", "docType") DO NOTHING
  `;

  // Lock the row for the remainder of the transaction.
  const rows = await tx.$queryRaw<{ id: number; lastSerial: number }[]>`
    SELECT "id", "lastSerial"
    FROM "NumberSeries"
    WHERE "fy" = ${fy} AND "docType" = ${docType}::"DocType"
    FOR UPDATE
  `;
  const series = rows[0];
  if (!series) {
    throw new Error(`NumberSeries row missing for ${docType}/${fy}`);
  }

  const nextSerial = series.lastSerial + 1;
  await tx.numberSeries.update({
    where: { id: series.id },
    data: { lastSerial: nextSerial },
  });

  return formatNumber(docType, fy, nextSerial);
}
