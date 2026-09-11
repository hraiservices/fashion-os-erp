/** Length conversion for the utility rail's unit converter — tailoring measurements are almost
 *  always inches or cm, with meters/feet as occasional fallbacks, so that's the full unit set;
 *  not a general-purpose measurement-conversion library. */

export const LENGTH_UNITS = ["in", "cm", "m", "ft"] as const;
export type LengthUnit = (typeof LENGTH_UNITS)[number];

export const LENGTH_UNIT_LABELS: Record<LengthUnit, string> = {
  in: "Inches",
  cm: "Centimeters",
  m: "Meters",
  ft: "Feet",
};

const TO_CM: Record<LengthUnit, number> = { in: 2.54, cm: 1, m: 100, ft: 30.48 };

/** Converts `value` (in `from` units) to every supported unit at once, so the widget can show
 *  all four side by side instead of a single from/to pair. */
export function convertLength(value: number, from: LengthUnit): Record<LengthUnit, number> {
  const cm = value * TO_CM[from];
  const out = {} as Record<LengthUnit, number>;
  for (const unit of LENGTH_UNITS) out[unit] = cm / TO_CM[unit];
  return out;
}
