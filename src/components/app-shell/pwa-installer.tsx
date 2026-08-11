"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => void;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

function isIOSSafari(): boolean {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  return isIOS;
}

/**
 * Ported from the pwaPrompt state + beforeinstallprompt handling, Stitching_Manager_Pro_v16.html
 * ~lines 16287-16310 / 17600-17602. Registers the service worker and exposes a manual
 * "Install App" button — no auto-banner, matching the old app's UX.
 *
 * `beforeinstallprompt` is a Chromium-only event (Chrome/Edge/Samsung Internet) — it never
 * fires on Safari or Firefox, so the original version of this button simply never appeared
 * there with no explanation. iOS in particular has no programmatic install API at all (Apple
 * restriction) — the only path is the user manually doing Share → Add to Home Screen — so on
 * iOS we show a button that surfaces those instructions instead of just disappearing.
 */
export function PwaInstaller() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSHint, setShowIOSHint] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    if (isStandalone()) return; // already installed — nothing to offer
    if (isIOSSafari()) {
      setShowIOSHint(true);
      return;
    }
    function handler(e: Event) {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (showIOSHint) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-9 sm:h-8"
        onClick={() =>
          toast("Install this app", {
            description: 'Tap the Share icon in Safari, then "Add to Home Screen".',
            duration: 8000,
          })
        }
      >
        <Download className="size-4" />
        <span className="hidden sm:inline">Install</span>
      </Button>
    );
  }

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
