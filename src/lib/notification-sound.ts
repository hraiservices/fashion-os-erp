/**
 * Short two-tone "ping" for a new notification arriving via realtime — synthesized with the Web
 * Audio API rather than an <audio> file so there's no asset to fetch/host/version. Browsers
 * block audio until the user has interacted with the page at least once; that failure is
 * expected (e.g. right after a fresh load with no click yet) and silently ignored, not surfaced
 * as an error — a missed chime isn't worth bothering the user about.
 */
export function playNotificationSound() {
  if (typeof window === "undefined") return;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;

  try {
    const ctx = new Ctx();
    const now = ctx.currentTime;

    [880, 1174.66].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.12;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.15, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.2);
    });

    setTimeout(() => ctx.close(), 500);
  } catch {
    // Autoplay blocked or AudioContext unavailable — non-fatal, notification still shows visually.
  }
}
