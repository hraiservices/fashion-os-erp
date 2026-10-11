/**
 * Notification sounds, synthesized with the Web Audio API (no audio file to host or version).
 *
 * Browsers keep audio locked until the person has tapped or typed in the page once, and a context created inside a
 * realtime callback is born "suspended" — which is why the old per-call `new AudioContext()` chime was usually
 * silent. So: one shared context, unlocked on the first tap/key (`installAudioUnlock`), resumed before every play.
 */
let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  return ctx;
}

let unlockInstalled = false;
/** Call once at app start: the first tap or key press unlocks audio for the rest of the session. */
export function installAudioUnlock() {
  if (typeof window === "undefined" || unlockInstalled) return;
  unlockInstalled = true;
  const unlock = () => {
    void audioContext()?.resume().catch(() => {});
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

function tone(c: AudioContext, freq: number, start: number, length: number, volume: number, type: OscillatorType = "sine") {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, start + length);
  osc.connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + length + 0.02);
}

/** "normal" = soft two-tone ping; "critical" = a firmer three-note alert, played twice, that is hard to miss. */
export function playNotificationSound(kind: "normal" | "critical" = "normal") {
  const c = audioContext();
  if (!c) return;
  const play = () => {
    const now = c.currentTime + 0.02;
    if (kind === "normal") {
      tone(c, 880, now, 0.18, 0.15);
      tone(c, 1174.66, now + 0.12, 0.18, 0.15);
      return;
    }
    for (const offset of [0, 0.75]) {
      tone(c, 880, now + offset, 0.2, 0.35, "triangle");
      tone(c, 1174.66, now + offset + 0.17, 0.2, 0.35, "triangle");
      tone(c, 1568, now + offset + 0.34, 0.3, 0.35, "triangle");
    }
  };
  // Still locked (no tap yet) → resume() stays pending and nothing is heard; that is expected and not an error.
  if (c.state === "suspended") void c.resume().then(play).catch(() => {});
  else play();
}
