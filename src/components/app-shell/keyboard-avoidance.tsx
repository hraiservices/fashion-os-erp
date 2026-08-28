"use client";

import { useEffect } from "react";

/**
 * Mobile browsers resize the visual viewport when the on-screen keyboard opens, but they don't
 * reliably scroll the focused field above it — on a bottom sheet or a long form, the field
 * (and the Save button below it) can end up hidden behind the keyboard with no way to see what
 * you're typing. Native apps always keep the focused field in view. Scoped to coarse-pointer
 * (touch) devices only, since desktop has no on-screen keyboard to avoid.
 */
export function KeyboardAvoidance() {
  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) return;

    function onFocusIn(e: FocusEvent) {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (!["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      // Let the on-screen keyboard finish animating in before scrolling, otherwise the
      // viewport measurement race leaves the field mis-positioned.
      setTimeout(() => {
        target.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 300);
    }

    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  return null;
}
