/** Client-safe supply-order helpers (no server imports). */

export interface SoLineAmounts {
  qty: number;
  rate: number;
  gstPercent: number;
}

export function soLineTotal(line: SoLineAmounts): number {
  return line.qty * line.rate * (1 + line.gstPercent / 100);
}

/** SO total including GST. */
export function soTotal(lines: SoLineAmounts[]): number {
  return lines.reduce((sum, l) => sum + soLineTotal(l), 0);
}
