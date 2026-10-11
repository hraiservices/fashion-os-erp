import { toast } from "sonner";
import { getAlertPrefs } from "@/hooks/use-alert-prefs";
import { hapticAlert } from "@/lib/haptics";
import { inQuietHours } from "@/lib/notification-alerts";
import { playNotificationSound } from "@/lib/notification-sound";

/** Shop-local minutes since midnight (IST), so quiet hours mean the same thing on every device. */
function istMinutes(now = new Date()): number {
  const t = new Date(now.getTime() + 5.5 * 3_600_000);
  return t.getUTCHours() * 60 + t.getUTCMinutes();
}

/**
 * The CRITICAL alert: a pop-up that stays until dismissed (tap it to open the item), plus sound and vibration unless
 * this device has them off or it is inside the person's quiet hours (the pop-up still shows then, silently).
 */
export function announceCritical(a: { id: string; title: string; body: string; url: string | null }, open: (url: string) => void) {
  const prefs = getAlertPrefs();
  const quiet = inQuietHours(prefs, istMinutes());
  if (prefs.popups) {
    toast.warning(a.title, {
      id: a.id,
      description: a.body,
      duration: Infinity,
      closeButton: true,
      ...(a.url ? { action: { label: "Open", onClick: () => open(a.url!) } } : {}),
    });
  }
  if (quiet) return;
  if (prefs.sound) playNotificationSound("critical");
  if (prefs.vibration) hapticAlert();
}
