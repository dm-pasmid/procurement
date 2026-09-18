/**
 * Amount in words using the Indian numbering system (crore/lakh/thousand).
 * amountInWordsINR(1234567.5) →
 * "Rupees Twelve Lakh Thirty-Four Thousand Five Hundred Sixty-Seven and Paise Fifty Only"
 */

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty",
  "Ninety",
];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o ? `${TENS[t]}-${ONES[o]}` : TENS[t];
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (rest) parts.push(twoDigits(rest));
  return parts.join(" ");
}

/** Integer (0 … 99,99,99,99,999) to Indian-system words. */
export function integerInWordsIndian(n: number): string {
  if (!Number.isFinite(n) || n < 0) throw new Error("Amount must be a non-negative number");
  if (n === 0) return "Zero";

  const crore = Math.floor(n / 1_00_00_000);
  const lakh = Math.floor((n % 1_00_00_000) / 1_00_000);
  const thousand = Math.floor((n % 1_00_000) / 1_000);
  const rest = n % 1_000;

  const parts: string[] = [];
  if (crore) {
    parts.push(
      crore > 999
        ? `${integerInWordsIndian(crore)} Crore`
        : `${threeDigits(crore)} Crore`,
    );
  }
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));
  return parts.join(" ");
}

export function amountInWordsINR(amount: number | string): string {
  const value = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Amount must be a non-negative number");
  }
  const rupees = Math.floor(value);
  const paise = Math.round((value - rupees) * 100);

  let words = `Rupees ${integerInWordsIndian(rupees)}`;
  if (paise > 0) words += ` and Paise ${twoDigits(paise)}`;
  return `${words} Only`;
}
