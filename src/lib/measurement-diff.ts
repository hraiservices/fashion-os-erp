/** Spots a measurement that moved a lot since the saved profile — a typo (35 for 32) or a real change worth confirming before cutting cloth. */

export interface MeasurementChange {
  key: string;
  label: string;
  before: number;
  after: number;
  diff: number;
}

const num = (v: string | undefined): number | null => {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Fields that differ from the baseline by at least `threshold` (same unit as the numbers entered). Both sides must hold a number. */
export function measurementChanges(baseline: Record<string, string>, current: Record<string, string>, threshold = 2): MeasurementChange[] {
  const out: MeasurementChange[] = [];
  for (const key of Object.keys(current)) {
    const before = num(baseline[key]);
    const after = num(current[key]);
    if (before == null || after == null) continue;
    const diff = Math.round((after - before) * 100) / 100;
    if (Math.abs(diff) >= threshold) out.push({ key, label: key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()), before, after, diff });
  }
  return out.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}
