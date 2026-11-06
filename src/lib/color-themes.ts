export interface ColorThemeMeta {
  id: string;
  name: string;
  /** Swatch color shown in the picker — the theme's light-mode primary. */
  swatch: string;
}

/** Applied as a `theme-<id>` class on <html>, alongside next-themes' own light/dark class. */
export const COLOR_THEMES: ColorThemeMeta[] = [
  { id: "default", name: "Default (B&W)", swatch: "oklch(0.205 0 0)" },
  { id: "violet", name: "Violet", swatch: "oklch(0.541 0.221 292.717)" },
  { id: "blue", name: "Blue", swatch: "oklch(0.546 0.215 262.881)" },
  { id: "indigo", name: "Indigo", swatch: "oklch(0.457 0.24 277.023)" },
  { id: "sky", name: "Sky", swatch: "oklch(0.588 0.158 241.966)" },
  { id: "cyan", name: "Cyan", swatch: "oklch(0.609 0.126 221.723)" },
  { id: "teal", name: "Teal", swatch: "oklch(0.6 0.118 184.704)" },
  { id: "emerald", name: "Emerald", swatch: "oklch(0.596 0.145 163.225)" },
  { id: "amber", name: "Amber", swatch: "oklch(0.681 0.162 75.834)" },
  { id: "orange", name: "Orange", swatch: "oklch(0.646 0.222 41.116)" },
  { id: "rose", name: "Rose", swatch: "oklch(0.586 0.216 15.341)" },
  { id: "pink", name: "Pink", swatch: "oklch(0.592 0.249 0.584)" },
  { id: "slate", name: "Slate", swatch: "oklch(0.446 0.043 257.281)" },
  { id: "lime", name: "Lime", swatch: "oklch(0.648 0.2 131.684)" },
  { id: "fuchsia", name: "Fuchsia", swatch: "oklch(0.591 0.293 322.896)" },
  { id: "red", name: "Red", swatch: "oklch(0.577 0.245 27.325)" },
  { id: "purple", name: "Purple", swatch: "oklch(0.496 0.265 301.924)" },
  { id: "brown", name: "Brown", swatch: "oklch(0.485 0.065 45.5)" },
];

export const DEFAULT_COLOR_THEME = "violet";

export function isValidColorTheme(id: string): boolean {
  return COLOR_THEMES.some((t) => t.id === id) || isCustomColorTheme(id);
}

/** Saved/applied as `custom:#rrggbb` instead of a `theme-<id>` class — see customThemeVars(). */
export const CUSTOM_THEME_PREFIX = "custom:";

export function isValidHexColor(hex: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(hex);
}

export function isCustomColorTheme(id: string): boolean {
  return id.startsWith(CUSTOM_THEME_PREFIX) && isValidHexColor(id.slice(CUSTOM_THEME_PREFIX.length));
}

export function customColorHex(id: string): string {
  return id.slice(CUSTOM_THEME_PREFIX.length);
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG relative luminance, used only to pick a black-or-white foreground that stays legible on the custom color. */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const [rl, gl, bl] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

/** CSS vars to apply inline on <html> for a custom color, mirroring the per-hue class blocks in
 *  globals.css — color-mix() derives the lighter sidebar-accent tint and the dark "colored"
 *  sidebar tint from the one hex, so a custom color needs no hand-authored CSS. */
export function customThemeVars(hex: string): Record<string, string> {
  const foreground = relativeLuminance(hexToRgb(hex)) > 0.5 ? "oklch(0.145 0 0)" : "oklch(0.985 0 0)";
  return {
    "--primary": hex,
    "--primary-foreground": foreground,
    "--ring": hex,
    "--sidebar-primary": hex,
    "--sidebar-primary-foreground": foreground,
    "--sidebar-ring": hex,
    "--sidebar-accent": `color-mix(in srgb, ${hex} 60%, white)`,
    "--sidebar-accent-foreground": "oklch(0.145 0 0)",
    "--sidebar-colored-tint": `color-mix(in srgb, ${hex} 32%, black)`,
  };
}

/** The inline vars customThemeVars() sets — cleared when switching back to a preset theme so its CSS class rules (which have lower specificity than inline style) can apply again. */
export const CUSTOM_THEME_VAR_NAMES = [
  "--primary",
  "--primary-foreground",
  "--ring",
  "--sidebar-primary",
  "--sidebar-primary-foreground",
  "--sidebar-ring",
  "--sidebar-accent",
  "--sidebar-accent-foreground",
] as const;

export interface SidebarStyleMeta {
  id: string;
  name: string;
  description: string;
}

/** Applied as a `sidebar-<id>` class on <html> — independent of (and combinable with) the color theme. */
export const SIDEBAR_STYLES: SidebarStyleMeta[] = [
  { id: "light", name: "Light", description: "White sidebar, like classic Zoho Books (default)" },
  { id: "dark", name: "Dark Navy", description: "Fixed dark sidebar" },
  { id: "black", name: "Black", description: "Pure near-black sidebar" },
  { id: "colored", name: "Colored", description: "Dark tint of your accent color" },
];

export const DEFAULT_SIDEBAR_STYLE = "light";

export function isValidSidebarStyle(id: string): boolean {
  return SIDEBAR_STYLES.some((s) => s.id === id);
}

export interface CornerStyleMeta {
  id: string;
  name: string;
  /** Value for the --radius CSS var (see globals.css) — every other radius token is derived from it. */
  radius: string;
}

/** Applied by setting the --radius CSS var directly on <html> (not a class — the value itself varies). */
export const CORNER_STYLES: CornerStyleMeta[] = [
  { id: "sharp", name: "Sharp", radius: "0rem" },
  { id: "small", name: "Small", radius: "0.3rem" },
  { id: "default", name: "Default", radius: "0.625rem" },
  { id: "large", name: "Large", radius: "1rem" },
  { id: "full", name: "Full", radius: "1.5rem" },
];

export const DEFAULT_CORNER_STYLE = "default";

export function isValidCornerStyle(id: string): boolean {
  return CORNER_STYLES.some((c) => c.id === id);
}

export function cornerStyleRadius(id: string): string {
  return CORNER_STYLES.find((c) => c.id === id)?.radius ?? CORNER_STYLES.find((c) => c.id === DEFAULT_CORNER_STYLE)!.radius;
}
