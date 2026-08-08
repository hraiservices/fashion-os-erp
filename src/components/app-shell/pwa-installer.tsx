"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => void;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Ported from the pwaPrompt state + beforeinstallprompt handling, Stitching_Manager_Pro_v16.html
 * ~lines 16287-16310 / 17600-17602. Registers the service worker and exposes a manual
 * "Install App" button — no auto-banner, matching the old app's UX.
 */
export function PwaInstaller() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    function handler(e: Event) {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!prompt) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-9 sm:h-8"
      onClick={() => {
        prompt.prompt();
        prompt.userChoice.then(() => setPrompt(null));
      }}
    >
      <Download className="size-4" />
      <span className="hidden sm:inline">Install</span>
    </Button>
  );
}
