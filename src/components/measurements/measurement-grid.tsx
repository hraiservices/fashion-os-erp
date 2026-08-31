"use client";

import { useState } from "react";
import { Languages, Keyboard } from "lucide-react";
import { toMKey, measureLabel, type MeasureLang } from "@/lib/measurements";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

/** Editable grid of measurement inputs, driven by the shop's configured field list. */
export function MeasurementGrid({
  fields,
  values,
  onChange,
  lang,
  onLangChange,
}: {
  fields: string[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  lang: MeasureLang;
  onLangChange?: (lang: MeasureLang) => void;
}) {
  // Measurements are free text on purpose (fractions like "32 1/2", sizes like "S/M", a quick
  // note) — never validated as numbers, so this never restricts what can be typed. It only
  // picks which virtual keyboard a phone shows: "decimal" is faster for the common case (plain
  // numbers) but hides letters, so anyone entering a size/fraction/note needs a way back to the
  // full keyboard rather than being stuck on a number pad.
  const [numericKeyboard, setNumericKeyboard] = useState(true);

  if (fields.length === 0) {
    return <p className="text-sm text-muted-foreground">No measurement fields configured. Add them in Settings → Measurements.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setNumericKeyboard((v) => !v)}>
          <Keyboard className="size-3.5" />
          {numericKeyboard ? "Full keyboard" : "Number pad"}
        </Button>
        {onLangChange && (
          <Button type="button" variant="outline" size="sm" onClick={() => onLangChange(lang === "en" ? "hi" : "en")}>
            <Languages className="size-3.5" />
            {lang === "en" ? "हिंदी" : "English"}
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {fields.map((f) => {
          const key = toMKey(f);
          return (
            <div key={key}>
              <Label htmlFor={`meas-${key}`} className="mb-1 block truncate text-xs font-medium">
                {measureLabel(f, lang)}
              </Label>
              <Input
                id={`meas-${key}`}
                inputMode={numericKeyboard ? "decimal" : "text"}
                placeholder="—"
                value={values[key] ?? ""}
                onChange={(e) => onChange(key, e.target.value)}
                className="text-center"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Read-only display of saved measurements. */
export function MeasurementView({ fields, values, lang = "en" }: { fields: string[]; values: Record<string, string>; lang?: MeasureLang }) {
  const filled = fields.filter((f) => (values[toMKey(f)] ?? "").trim() !== "");
  if (filled.length === 0) {
    return <p className="text-sm text-muted-foreground">No measurements saved yet.</p>;
  }
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {filled.map((f) => {
        const key = toMKey(f);
        return (
          <div key={key} className="rounded-lg bg-muted/50 px-2 py-1.5 text-center">
            <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{measureLabel(f, lang)}</p>
            <p className="text-sm font-semibold tabular-nums">{values[key]}</p>
          </div>
        );
      })}
    </div>
  );
}
