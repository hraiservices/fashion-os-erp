/** Settings for the faint repeating illustration shown behind major page headers (the
 *  Dashboard greeting, and every list/detail/report page's title bar via PageHeader) — a
 *  shop-wide look, stored once in app_settings like the invoice logo. */

export interface CardHeaderBgConfig {
  enabled: boolean;
  /** An admin-uploaded replacement, as a data URL (same convention as the invoice logo).
   *  Null means "use the shop's default illustration" (BUILTIN_CARD_HEADER_BG_URL). */
  imageUrl: string | null;
  /** Light-mode opacity, as a whole percent (5-60) — reported "hardly visible" at the earlier
   *  fixed 16%, so this is now admin-tunable from Settings → Personalize → Appearance instead of
   *  a judgment call baked into the code. Dark mode always renders at half this, inverted (see
   *  cardHeaderBgDarkOpacity) — the artwork is dark linework on a light ground, so a flat opacity
   *  on a dark background would read as grey smudging rather than a faded watermark. */
  opacity: number;
}

export const DEFAULT_CARD_HEADER_BG_CONFIG: CardHeaderBgConfig = { enabled: true, imageUrl: null, opacity: 30 };

export const MIN_CARD_HEADER_BG_OPACITY = 5;
export const MAX_CARD_HEADER_BG_OPACITY = 60;

function clampOpacityPercent(pct: number): number {
  return Math.min(MAX_CARD_HEADER_BG_OPACITY, Math.max(MIN_CARD_HEADER_BG_OPACITY, pct || DEFAULT_CARD_HEADER_BG_CONFIG.opacity));
}

/** Light-mode CSS opacity (0-1), clamped to a sane range even if a stored value predates the
 *  clamp or was tampered with directly in app_settings. */
export function cardHeaderBgOpacity(cfg: CardHeaderBgConfig): number {
  return clampOpacityPercent(cfg.opacity) / 100;
}

/** Dark-mode CSS opacity (0-1) — always half the light-mode value. */
export function cardHeaderBgDarkOpacity(cfg: CardHeaderBgConfig): number {
  return cardHeaderBgOpacity(cfg) / 2;
}

/** Ships with the app as a static file (not stored in the database) — the default look until
 *  an admin uploads their own. */
export const BUILTIN_CARD_HEADER_BG_URL = "/patterns/couture-sewing-pattern.jpg";

export function resolveCardHeaderBgUrl(cfg: CardHeaderBgConfig): string {
  return cfg.imageUrl || BUILTIN_CARD_HEADER_BG_URL;
}
