"use client";

import { RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { setWhatsAppPreference, useWhatsAppPreferenceStore } from "@/lib/whatsapp-launch";

const APP_LABELS = { regular: "WhatsApp", business: "WhatsApp Business" } as const;

/**
 * The "open with WhatsApp or WhatsApp Business" chooser (src/components/ui/whatsapp-button.tsx)
 * only asks once per device, then remembers the pick in localStorage. That preference used to
 * carry its own "Change" link next to every WhatsApp button in the app — removed because on a
 * tightly packed action row (e.g. the order board card) it collided with the button's own label.
 * This is where that reset moved to instead: a per-device setting, not a shop-wide one, which is
 * why it reads/writes localStorage directly rather than going through useAppSetting.
 */
export function WhatsAppAppChoiceSection() {
  const preference = useWhatsAppPreferenceStore();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">WhatsApp app on this device</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {preference ? (
            <>
              WhatsApp links on this device currently open in <span className="font-medium text-foreground">{APP_LABELS[preference]}</span>.
            </>
          ) : (
            "Not set yet — the next WhatsApp link you tap will ask which app to use."
          )}
        </p>
        {preference && (
          <Button type="button" variant="outline" size="sm" onClick={() => setWhatsAppPreference(null)}>
            <RotateCcw className="size-3.5" /> Ask again next time
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
