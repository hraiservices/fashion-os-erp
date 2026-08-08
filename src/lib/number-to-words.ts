const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function threeDigitsToWords(n: number): string {
  let words = "";
  if (n >= 100) {
    words += `${ONES[Math.floor(n / 100)]} Hundred`;
    n %= 100;
    if (n > 0) words += " ";
  }
  if (n >= 20) {
    words += TENS[Math.floor(n / 10)];
    if (n % 10 > 0) words += `-${ONES[n % 10]}`;
  } else if (n > 0) {
    words += ONES[n];
  }
  return words;
}

/** Indian numbering system (thousand/lakh/crore) — "Rupees Four Thousand Two Hundred Fifty-Six Only". */
export function amountInWords(amount: number): string {
  const n = Math.round(Math.abs(amount || 0));
  if (n === 0) return "Rupees Zero Only";

  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const hundred = n % 1000;

  const parts: string[] = [];
  if (crore > 0) parts.push(`${threeDigitsToWords(crore)} Crore`);
  if (lakh > 0) parts.push(`${threeDigitsToWords(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${threeDigitsToWords(thousand)} Thousand`);
  if (hundred > 0) parts.push(threeDigitsToWords(hundred));

  return `Rupees ${parts.join(" ")} Only`;
}
