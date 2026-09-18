import "server-only";
import ExcelJS from "exceljs";
import type { RegisterResult } from "@/lib/registers";

const OFFICE = "Office of the District Magistrate & Collector, Paschim Medinipur";
const NAVY = "FF1F3864";

/** Builds an .xlsx workbook for a register with the office header block. */
export async function registerWorkbook(data: RegisterResult): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "PMS";
  wb.created = new Date();
  const ws = wb.addWorksheet(data.title.slice(0, 28), {
    views: [{ state: "frozen", ySplit: 5 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 },
  });

  const colCount = data.columns.length;
  const lastCol = String.fromCharCode(64 + Math.min(colCount, 26));

  // Header block (rows 1–4).
  ws.mergeCells(`A1:${lastCol}1`);
  ws.getCell("A1").value = OFFICE;
  ws.getCell("A1").font = { bold: true, size: 13, color: { argb: NAVY } };
  ws.getCell("A1").alignment = { horizontal: "center" };

  ws.mergeCells(`A2:${lastCol}2`);
  ws.getCell("A2").value = `${data.title} — FY ${data.fy}`;
  ws.getCell("A2").font = { bold: true, size: 11 };
  ws.getCell("A2").alignment = { horizontal: "center" };

  ws.mergeCells(`A3:${lastCol}3`);
  ws.getCell("A3").value =
    `Generated ${new Date().toLocaleString("en-IN")}${data.sectionScoped ? " · section-scoped view" : ""}`;
  ws.getCell("A3").font = { italic: true, size: 9, color: { argb: "FF666666" } };
  ws.getCell("A3").alignment = { horizontal: "center" };

  // Header row (row 5).
  const headerRow = ws.getRow(5);
  data.columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.label;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.alignment = { horizontal: col.numeric ? "right" : "left", vertical: "middle", wrapText: true };
    cell.border = { bottom: { style: "thin" } };
    ws.getColumn(i + 1).width = col.width ?? 16;
  });
  headerRow.height = 22;

  // Data rows.
  data.rows.forEach((row) => {
    const r = ws.addRow(data.columns.map((c) => row[c.key] ?? ""));
    data.columns.forEach((col, i) => {
      const cell = r.getCell(i + 1);
      cell.alignment = { horizontal: col.numeric ? "right" : "left", vertical: "top", wrapText: !col.numeric };
      if (col.numeric && typeof row[col.key] === "number") {
        cell.numFmt = "#,##,##0.00";
      }
    });
  });

  ws.headerFooter.oddFooter = "&LPMS — Internal use only&RPage &P of &N";

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
