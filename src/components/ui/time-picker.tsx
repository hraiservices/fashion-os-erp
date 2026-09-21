"use client";

import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5); // 0,5,...,55

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

/** "14:05" -> { h12: 2, m: 5, ampm: "PM" } */
function parse(value: string): { h12: number; m: number; ampm: "AM" | "PM" } {
  const [hStr, mStr] = value.split(":");
  const h24 = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h24) || Number.isNaN(m)) return { h12: 12, m: 0, ampm: "AM" };
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 || 12;
  return { h12, m, ampm };
}

function toValue(h12: number, m: number, ampm: "AM" | "PM"): string {
  const h24 = ampm === "AM" ? (h12 % 12) : (h12 % 12) + 12;
  return `${pad2(h24)}:${pad2(m)}`;
}

/**
 * Time field styled to match DatePicker (and the rest of the app's h-10 inputs).
 *
 * Previously an invisible native `<input type="time">` overlaid on a styled button, tapping
 * through to trigger the OS/browser's own time picker. That depends on browser support for
 * `showPicker()`/native picker UI, which is inconsistent across contexts (confirmed broken inside
 * a Base UI Dialog, and unsupported entirely on some browsers/webviews) -- reported as fields that
 * looked right but weren't clickable/selectable at all. This picker is fully self-built from the
 * same Select component already used elsewhere in this app (e.g. the Status field right next to
 * it in the attendance edit dialog), so it has no dependency on any browser's native time UI.
 */
export function TimePicker({
  value,
  onChange,
  className,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  id?: string;
  disabled?: boolean;
}) {
  const { h12, m, ampm } = parse(value || "12:00");

  function set(next: Partial<{ h12: number; m: number; ampm: "AM" | "PM" }>) {
    onChange(toValue(next.h12 ?? h12, next.m ?? m, next.ampm ?? ampm));
  }

  return (
    <div className={cn("flex h-10 w-full min-w-0 items-center gap-1 rounded-lg border border-input bg-transparent pl-2.5 pr-1", className)}>
      <Clock className="size-4 shrink-0 text-muted-foreground" />
      <Select value={value ? String(h12) : ""} onValueChange={(v) => v && set({ h12: parseInt(v, 10) })} disabled={disabled}>
        <SelectTrigger className="h-8 w-14 border-0 px-1.5 shadow-none">
          <SelectValue>{value ? h12 : "--"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {HOURS.map((h) => (
            <SelectItem key={h} value={String(h)}>
              {h}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-muted-foreground">:</span>
      <Select value={value ? String(m) : ""} onValueChange={(v) => v && set({ m: parseInt(v, 10) })} disabled={disabled}>
        <SelectTrigger className="h-8 w-14 border-0 px-1.5 shadow-none">
          <SelectValue>{value ? pad2(m) : "--"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {MINUTES.map((mm) => (
            <SelectItem key={mm} value={String(mm)}>
              {pad2(mm)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={value ? ampm : ""} onValueChange={(v) => v && set({ ampm: v as "AM" | "PM" })} disabled={disabled}>
        <SelectTrigger className="h-8 w-16 border-0 px-1.5 shadow-none">
          <SelectValue>{value ? ampm : "--"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="AM">AM</SelectItem>
          <SelectItem value="PM">PM</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
