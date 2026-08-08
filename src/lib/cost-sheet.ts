// Ported from CostEstimatorView(), Stitching_Manager_Pro_v16.html ~line 11493.

export interface LineItem {
  id: string;
  expense_name: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
}

export interface TailorLineItem {
  id: string;
  tailor_name: string;
  tailor_charge: number;
}

export type ProfitMode = "percent" | "amount";

export interface ProfitConfig {
  mode: ProfitMode;
  amount: number;
  percent: number;
}

/** genSheetNo(), line ~11520. */
export function genSheetNo(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = String(Math.floor(Math.random() * 900) + 100);
  return `CS-${y}${m}${day}-${rand}`;
}

export function calcMaterialTotal(items: LineItem[]): number {
  return items.reduce((s, m) => s + (parseFloat(String(m.amount)) || 0), 0);
}

export function calcTailorTotal(items: TailorLineItem[]): number {
  return items.reduce((s, t) => s + (parseFloat(String(t.tailor_charge)) || 0), 0);
}

export function calcOverheadTotal(items: LineItem[]): number {
  return items.reduce((s, o) => s + (parseFloat(String(o.amount)) || 0), 0);
}

/** calcProfit(), line ~11535. */
export function calcProfit(totalExpense: number, profit: ProfitConfig): number {
  if (profit.mode === "amount") return parseFloat(String(profit.amount)) || 0;
  return Math.round((totalExpense * (parseFloat(String(profit.percent)) || 0)) / 100);
}

export interface CostSheetTotals {
  matTotal: number;
  tlTotal: number;
  ovTotal: number;
  totalExpense: number;
  profitAmount: number;
  finalPrice: number;
  profitPercentDisplay: number;
}

/** Totals computation shared by saveForm() and printSheet(), lines ~11582-11588 / ~11640-11647. */
export function computeTotals(materials: LineItem[], tailors: TailorLineItem[], overheads: LineItem[], profit: ProfitConfig): CostSheetTotals {
  const matTotal = calcMaterialTotal(materials);
  const tlTotal = calcTailorTotal(tailors);
  const ovTotal = calcOverheadTotal(overheads);
  const totalExpense = matTotal + tlTotal + ovTotal;
  const profitAmount = calcProfit(totalExpense, profit);
  const finalPrice = totalExpense + profitAmount;
  const profitPercentDisplay = finalPrice > 0 ? Math.round(((profitAmount / finalPrice) * 100 * 10)) / 10 : 0;
  return { matTotal, tlTotal, ovTotal, totalExpense, profitAmount, finalPrice, profitPercentDisplay };
}

export function newLineItem(defaults?: Partial<LineItem>): LineItem {
  return { id: `csi_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, expense_name: "", quantity: 1, unit: "Meter", rate: 0, amount: 0, ...defaults };
}

export function newTailorLineItem(): TailorLineItem {
  return { id: `cst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, tailor_name: "", tailor_charge: 0 };
}
