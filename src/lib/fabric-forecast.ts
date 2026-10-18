/**
 * What raw material to buy before the next busy stretch. For each material: what the shop used (and bought) in the same
 * weeks last year and how fast it has been used lately, against what is on the shelf now. Plain arithmetic, no AI — the
 * AI only words the message to the vendor. Pure.
 */

export interface LedgerMove {
  itemId: string;
  movement: number;
  refType: string;
  createdAt: string;
}

export interface MaterialInfo {
  id: string;
  name: string;
  unit: string;
  stock: number;
  costPerUnit: number;
  lowStockAlert: number;
}

export interface ForecastRow {
  id: string;
  name: string;
  unit: string;
  stock: number;
  /** Used in the same weeks last year. */
  usedLastYear: number;
  /** Bought in the same weeks last year. */
  boughtLastYear: number;
  /** Used in the last 90 days, scaled to the forecast horizon. */
  recentPace: number;
  /** Expected need over the horizon. */
  need: number;
  /** How much to order: need + a low-stock cushion − stock, never negative. */
  suggested: number;
  estCost: number;
}

const USE_TYPES = new Set(["work_order_consume", "adjustment"]);

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const round = (n: number) => Math.round(n * 100) / 100;

export function forecastMaterials(materials: MaterialInfo[], moves: LedgerMove[], today: string, horizonDays = 45): ForecastRow[] {
  const lyStart = addDays(today, -365);
  const lyEnd = addDays(lyStart, horizonDays);
  const recentStart = addDays(today, -90);
  const used = new Map<string, { ly: number; ago90: number }>();
  const bought = new Map<string, number>();
  for (const m of moves) {
    const day = m.createdAt.slice(0, 10);
    if (m.movement < 0 && USE_TYPES.has(m.refType)) {
      const cur = used.get(m.itemId) ?? { ly: 0, ago90: 0 };
      if (day >= lyStart && day < lyEnd) cur.ly += -m.movement;
      if (day >= recentStart && day < today) cur.ago90 += -m.movement;
      used.set(m.itemId, cur);
    } else if (m.movement > 0 && m.refType === "purchase" && day >= lyStart && day < lyEnd) {
      bought.set(m.itemId, (bought.get(m.itemId) ?? 0) + m.movement);
    }
  }
  const rows: ForecastRow[] = [];
  for (const mat of materials) {
    const u = used.get(mat.id) ?? { ly: 0, ago90: 0 };
    const recentPace = (u.ago90 / 90) * horizonDays;
    const boughtLastYear = bought.get(mat.id) ?? 0;
    // Last year's usage is the best sign of the season; if usage wasn't recorded, fall back to what was bought then.
    const need = Math.max(u.ly || boughtLastYear, recentPace);
    if (need <= 0) continue;
    const suggested = Math.max(0, Math.ceil(need + mat.lowStockAlert - mat.stock));
    rows.push({ id: mat.id, name: mat.name, unit: mat.unit, stock: round(mat.stock), usedLastYear: round(u.ly), boughtLastYear: round(boughtLastYear), recentPace: round(recentPace), need: round(need), suggested, estCost: Math.round(suggested * mat.costPerUnit) });
  }
  return rows.sort((a, b) => b.estCost - a.estCost || b.suggested - a.suggested);
}
