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
];

export const DEFAULT_COLOR_THEME = "violet";

export function isValidColorTheme(id: string): boolean {
  return COLOR_THEMES.some((t) => t.id === id);
}

export interface SidebarStyleMeta {
  id: string;
  name: string;
  description: string;
}

/** Applied as a `sidebar-<id>` class on <html> — independent of (and combinable with) the color theme. */
export const SIDEBAR_STYLES: SidebarStyleMeta[] = [
  { id: "dark", name: "Dark Navy", description: "Fixed dark sidebar (default)" },
  { id: "black", name: "Black", description: "Pure near-black sidebar" },
  { id: "light", name: "Light", description: "White sidebar, like classic Zoho Books" },
  { id: "colored", name: "Colored", description: "Dark tint of your accent color" },
];

export const DEFAULT_SIDEBAR_STYLE = "dark";

export function isValidSidebarStyle(id: string): boolean {
  return SIDEBAR_STYLES.some((s) => s.id === id);
}
