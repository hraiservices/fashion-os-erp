"use client";

import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

/** "14:05" -> "2:05 PM" */
function fmt12h(value: string): string {
  const [hStr, mStr] = value.split(":");
  const h = parseInt(hStr, 10);
  if (Number.isNaN(h)) return value;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${mStr} ${ampm}`;
}

/**
 * Time field styled to match DatePicker (and the rest of the app's h-10 inputs). Native
 * `<input type="time">` sizes itself inconsistently across mobile browsers — Android Chrome in
 * particular renders it noticeably taller than a text input, ignoring `h-10` — so the native
 * input here is an invisible full-size overlay on top of a plain styled button; tapping anywhere
 * still opens the OS/browser time picker, but the visible surface is CSS we fully control.
 */
export function TimePicker({
  value,
  onChange,
  className,
  id,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <div className={cn("relative h-10 w-full", className)}>
      <div
        className={cn(
          "flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-3 text-sm font-normal",
          !value && "text-muted-foreground",
          disabled && "pointer-events-none opacity-50"
        )}
      >
        <Clock className="size-4 shrink-0 text-muted-foreground" />
        {value ? fmt12h(value) : "Pick a time"}
      </div>
      <input
        id={id}
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  );
}
