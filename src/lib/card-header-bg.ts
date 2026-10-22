/** Settings for the faint repeating illustration shown behind major page headers (the
 *  Dashboard greeting, and every list/detail/report page's title bar via PageHeader) — a
 *  shop-wide look, stored once in app_settings like the invoice logo. */

export interface CardHeaderBgConfig {
  enabled: boolean;
  /** An admin-uploaded replacement, as a data URL (same convention as the invoice logo).
   *  Null means "use the shop's default illustration" (BUILTIN_CARD_HEADER_BG_URL). */
  imageUrl: string | null;
}

export const DEFAULT_CARD_HEADER_BG_CONFIG: CardHeaderBgConfig = { enabled: true, imageUrl: null };

/** Ships with the app as a static file (not stored in the database) — the default look until
 *  an admin uploads their own. */
export const BUILTIN_CARD_HEADER_BG_URL = "/patterns/couture-sewing-pattern.jpg";

export function resolveCardHeaderBgUrl(cfg: CardHeaderBgConfig): string {
  return cfg.imageUrl || BUILTIN_CARD_HEADER_BG_URL;
}
