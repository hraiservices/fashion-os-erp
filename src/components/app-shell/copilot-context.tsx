"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * Shares the AI Copilot panel's open/closed state between CopilotBubble (which renders the
 * actual chat panel/sheet) and MobileTabBar (whose "Copilot" tab toggles it on mobile) — two
 * sibling components in the app shell, neither a parent of the other, so plain lifted state
 * isn't an option without this context.
 */
const CopilotOpenContext = createContext<{ open: boolean; setOpen: (v: boolean | ((o: boolean) => boolean)) => void } | null>(null);

export function CopilotOpenProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <CopilotOpenContext.Provider value={{ open, setOpen }}>{children}</CopilotOpenContext.Provider>;
}

export function useCopilotOpen() {
  const ctx = useContext(CopilotOpenContext);
  if (!ctx) throw new Error("useCopilotOpen must be used within a CopilotOpenProvider");
  return ctx;
}
