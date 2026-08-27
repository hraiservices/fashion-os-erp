import { useEffect, useState } from "react";

/** Resolves the delivery deadline to an exact millisecond target. When the order has a
 * delivery_time ("HH:mm"), that's the real promised moment. Legacy/blank-time orders fall
 * back to end-of-day, same as before this field existed. */
export function deliveryTarget(dateStr: string, timeStr?: string): number {
  const d = new Date(dateStr);
  if (timeStr) {
    const [h, m] = timeStr.split(":").map(Number);
    if (!Number.isNaN(h) && !Number.isNaN(m)) {
      d.setHours(h, m, 0, 0);
      return d.getTime();
    }
  }
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** Days : hours : minutes only (no seconds) — the compact form used anywhere the countdown
 * is shown inline in a list row rather than its own dedicated dashboard card. */
export function formatCountdownDHM(ms: number): { text: string; overdue: boolean } {
  const overdue = ms < 0;
  const abs = Math.abs(ms);
  const days = Math.floor(abs / 86_400_000);
  const hours = Math.floor((abs % 86_400_000) / 3_600_000);
  const minutes = Math.floor((abs % 3_600_000) / 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const dayPart = days === 1 ? "1d" : `${days}d`;
  return { text: `${dayPart} ${pad(hours)}h ${pad(minutes)}m`, overdue };
}

/** Ticks every `intervalMs` so live countdowns re-render — default 30s since minute-granularity
 * display doesn't need per-second updates. */
export function useCountdownNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
