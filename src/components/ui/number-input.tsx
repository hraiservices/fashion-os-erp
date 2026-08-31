"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";

/**
 * A `type="number"` input that shows blank (with a placeholder) instead of a literal "0" when
 * its value is zero — a plain `<input type="number" value={0}>` always renders "0", which reads
 * as a pre-filled amount rather than an empty field a customer hasn't touched yet. Drop-in
 * replacement for `<Input type="number" value={n} onChange={...} />` wherever the field's blank
 * state should mean "not entered" rather than "entered as zero" (prices, quantities, discounts,
 * limits, etc.) — anywhere 0 and "not set" are meant to look the same to the user.
 */
export const NumberInput = React.forwardRef<HTMLInputElement, Omit<React.ComponentProps<typeof Input>, "type" | "value" | "onChange"> & {
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
}>(function NumberInput({ value, onChange, placeholder = "0", inputMode, onFocus, ...props }, ref) {
  return (
    <Input
      {...props}
      ref={ref}
      type="number"
      inputMode={inputMode ?? "decimal"}
      placeholder={placeholder}
      value={value ? value : ""}
      onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
      onFocus={(e) => {
        // Native number fields let you tap in and immediately retype over the existing value;
        // without this you'd have to manually clear it first — a small thing that makes every
        // amount/quantity field feel like a web form rather than a native one.
        e.target.select();
        onFocus?.(e);
      }}
    />
  );
});
