// Manufacturing business logic — Work Orders that turn raw materials into finished-goods
// stock, using the same tailor pool as stitching orders.

export interface WorkOrderMaterial {
  rawMaterialId: string;
  rawMaterialName: string;
  unitName: string;
  unitCost: number;
  /** From the product's BOM × qty_to_produce, at creation time. */
  qtyPlanned: number;
  /** Filled in at completion — actually consumed into the finished product. */
  qtyUsed: number | null;
  /** Filled in at completion — lost to cutting/handling, still leaves stock, excluded from COGS. */
  qtyWasted: number | null;
}

export type WoStatus = "draft" | "in_progress" | "qc" | "completed";

export const WO_STATUS_LABELS: Record<WoStatus, string> = {
  draft: "Draft",
  in_progress: "In progress",
  qc: "Quality check",
  completed: "Completed",
};

/** Linear progression — a work order can only move to the next stage, same rule as stitching orders. */
export const WO_STAGES: WoStatus[] = ["draft", "in_progress", "qc", "completed"];

export function nextWoStatus(status: WoStatus): WoStatus | null {
  const i = WO_STAGES.indexOf(status);
  return i >= 0 && i < WO_STAGES.length - 1 ? WO_STAGES[i + 1] : null;
}

function genNumber(prefix: string): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = String(Math.floor(Math.random() * 900) + 100);
  return `${prefix}-${y}${m}${day}-${rand}`;
}

export const genWoNumber = () => genNumber("WO");

/** Prefills a work order's material list from a product's BOM, scaled by qty_to_produce. */
export function prefillMaterialsFromBom(
  bom: { rawMaterialId: string; rawMaterialName: string; unitName: string; qtyRequired: number }[],
  qtyToProduce: number,
  costByMaterialId: Map<string, number>
): WorkOrderMaterial[] {
  return bom.map((line) => ({
    rawMaterialId: line.rawMaterialId,
    rawMaterialName: line.rawMaterialName,
    unitName: line.unitName,
    unitCost: costByMaterialId.get(line.rawMaterialId) || 0,
    qtyPlanned: Math.round(line.qtyRequired * qtyToProduce * 1000) / 1000,
    qtyUsed: null,
    qtyWasted: null,
  }));
}

export interface TailorManufacturingStat {
  tailor: string;
  activeWOs: number;
  completedWOs: number;
  qtyProduced: number;
}

/** Manufacturing side of a tailor's workload — shown alongside stitching stats in the Tailor Performance report. */
export function getManufacturingTailorStats(workOrders: { tailor: string; status: WoStatus; qtyToProduce: number }[]): TailorManufacturingStat[] {
  const map = new Map<string, TailorManufacturingStat>();
  workOrders.forEach((w) => {
    if (!w.tailor) return;
    const row = map.get(w.tailor) || { tailor: w.tailor, activeWOs: 0, completedWOs: 0, qtyProduced: 0 };
    if (w.status === "completed") {
      row.completedWOs += 1;
      row.qtyProduced += w.qtyToProduce;
    } else {
      row.activeWOs += 1;
    }
    map.set(w.tailor, row);
  });
  return Array.from(map.values());
}

export interface WoCostBreakdown {
  materialCost: number;
  wastageCost: number;
  laborCost: number;
  totalCost: number;
  costPerUnit: number;
}

/**
 * COGS formula: material_cost only counts what actually went into the product (qty_used),
 * NOT wastage — wastage is a separate loss, reported on its own, deliberately excluded from
 * the product's cost so wastage % can be tracked without distorting per-unit profitability.
 * Both qty_used and qty_wasted still leave raw-material stock, though — only the cost
 * attribution differs.
 */
export function computeWoCost(materials: WorkOrderMaterial[], laborCostPerPiece: number, qtyToProduce: number): WoCostBreakdown {
  const round2 = (n: number) => Math.round(n * 100) / 100;

  const materialCost = materials.reduce((s, m) => s + (m.qtyUsed || 0) * m.unitCost, 0);
  const wastageCost = materials.reduce((s, m) => s + (m.qtyWasted || 0) * m.unitCost, 0);
  const laborCost = (laborCostPerPiece || 0) * (qtyToProduce || 0);
  const totalCost = materialCost + laborCost;
  const costPerUnit = qtyToProduce > 0 ? totalCost / qtyToProduce : 0;

  return {
    materialCost: round2(materialCost),
    wastageCost: round2(wastageCost),
    laborCost: round2(laborCost),
    totalCost: round2(totalCost),
    costPerUnit: round2(costPerUnit),
  };
}
