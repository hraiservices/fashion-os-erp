"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { isNativePlatform } from "@/lib/capacitor";

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
    // The Capacitor shell must never run the service worker. It already IS an installed app, so
    // the offline shell and install prompt are both pointless there — and a service worker sitting
    // in front of a WebView's requests is actively harmful: a cold app start fires requests before
    // connectivity has settled, and a single failed asset fetch used to poison the page (see
    // public/sw.js). Unregister rather than merely skip, so a device that already installed a build
    // which registered one gets healed on the next successful load instead of staying broken.
    if (isNativePlatform()) {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister())).catch(() => {});
      }
      if ("caches" in window) {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
      }
      return;
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    if (isStandalone()) return; // already installed — nothing to offer
    if (isIOSSafari()) {
      const t = setTimeout(() => setShowIOSHint(true), 0);
      return () => clearTimeout(t);
    }
    function handler(e: Event) {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // A fresh deploy activates a new service worker in already-open tabs (sw.js calls
  // skipWaiting + clients.claim) without reloading them — a tab left open across a deploy
  // silently keeps running the old JS bundle, so client-side navigation can render against
  // stale code until the tab is manually refreshed. Reload once, but only for a genuine
  // mid-session update — the very first controllerchange on a fresh tab is just the new
  // worker claiming a page that had no controller yet, not something to reload for.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Native never has a worker of its own, and the unregister above changes the controller —
    // reloading on that would just fight the cleanup.
    if (isNativePlatform()) return;
    let hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    function onControllerChange() {
      if (!hadController) {
        hadController = true;
        return;
      }
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    }
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
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
