"use client";

import { useEffect, useState } from "react";
import { Store, ArrowRight, Loader2 } from "lucide-react";
import { Preferences } from "@capacitor/preferences";
import { isNativePlatform } from "@/lib/capacitor";
import { resolveShopUrl, SHOP_URL_PREFERENCE_KEY } from "@/lib/app-launch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The native app's actual entry point (capacitor.config.ts's server.url) — see
 * src/lib/app-launch.ts for why this exists and how a shop gets resolved/remembered. Plain web
 * visitors (this deployment's own staff opening fashionflow.app/launch in a browser by mistake,
 * or a search crawler) have no business here, so they're bounced straight to "/" without ever
 * seeing the form below.
 */
export default function LaunchPage() {
  const [checking, setChecking] = useState(true);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!isNativePlatform()) {
      window.location.replace("/");
      return;
    }
    Preferences.get({ key: SHOP_URL_PREFERENCE_KEY }).then(({ value }) => {
      if (value) {
        window.location.replace(value);
        return;
      }
      setChecking(false);
    });
  }, []);

  async function go() {
    const url = resolveShopUrl(input);
    if (!url) {
      setError("Enter your shop's code or web address");
      return;
    }
    setError(null);
    setRedirecting(true);
    // Saved before navigating away — once this redirects cross-origin to the resolved shop's
    // own domain, that origin's localStorage/IndexedDB can't see anything written here, but
    // @capacitor/preferences is native storage the whole app shares regardless of which site's
    // JS is currently running, so it survives the jump and every later app open reads it back.
    await Preferences.set({ key: SHOP_URL_PREFERENCE_KEY, value: url });
    window.location.href = url;
  }

  if (checking) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1.5 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10">
            <Store className="size-6 text-primary" />
          </div>
          <h1 className="text-xl font-semibold">Welcome to Fashion Flow</h1>
          <p className="text-sm text-muted-foreground">Enter your shop&rsquo;s code or web address to get started</p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm font-bold text-muted-foreground">Shop code or web address</Label>
          <Input
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="e.g. swaroop"
            className="h-11 rounded-xl"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && go()}
            disabled={redirecting}
          />
          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
        </div>

        <Button className="h-11 w-full rounded-xl" onClick={go} disabled={redirecting}>
          {redirecting ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Connecting…
            </>
          ) : (
            <>
              Continue <ArrowRight className="size-4" />
            </>
          )}
        </Button>

        <p className="text-center text-xs text-muted-foreground">Don&rsquo;t know your shop code? Ask whoever set up your Fashion Flow account.</p>
      </div>
    </div>
  );
}
