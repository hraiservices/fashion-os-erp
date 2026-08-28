"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";

function noopSubscribe() {
  return () => {};
}
function getMountedSnapshot() {
  return true;
}
function getServerSnapshot() {
  return false;
}

/** Manual light/dark override — the app already ships full dark: styling, this just makes it reachable. */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // Avoid rendering theme-dependent UI before hydration to prevent a mismatch flash.
  const mounted = useSyncExternalStore(noopSubscribe, getMountedSnapshot, getServerSnapshot);

  if (!mounted) return <Button variant="ghost" size="icon-sm" className="size-9 sm:size-8" aria-label="Toggle theme" disabled />;

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="size-9 sm:size-8"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
