// Shop-wide font customization, saved to app_settings like the rest of Settings
// (rate card, loyalty config, etc.) — same font for every login, not a per-device pref.

export interface FontConfig {
  family: string;
  weight: number;
  size: number; // base font-size in px, applied to <html> so all rem-based sizing scales with it
}

export const DEFAULT_FONT_CONFIG: FontConfig = {
  family: "Inter",
  weight: 400,
  size: 16,
};

// A practical, curated subset of Google Fonts — common UI/business-app choices.
// (Google Fonts has 1500+; a curated list avoids an unusably long dropdown.)
export const GOOGLE_FONTS = [
  "Inter",
  "Roboto",
  "Open Sans",
  "Lato",
  "Poppins",
  "Montserrat",
  "Nunito",
  "Nunito Sans",
  "Source Sans 3",
  "Work Sans",
  "Rubik",
  "Manrope",
  "DM Sans",
  "Outfit",
  "Plus Jakarta Sans",
  "Figtree",
  "Mulish",
  "Karla",
  "Barlow",
  "Urbanist",
  "Quicksand",
  "Raleway",
  "Noto Sans",
  "IBM Plex Sans",
  "Space Grotesk",
] as const;

/** Sentinel Select value for "type a Google Font name manually" — never saved as the family itself. */
export const CUSTOM_FONT_VALUE = "__custom__";

export const FONT_WEIGHTS = [300, 400, 500, 600, 700] as const;

export const FONT_SIZES = [14, 15, 16, 17, 18] as const;

/** Builds the Google Fonts CSS API v2 stylesheet URL for a given family + weight. */
export function googleFontUrl(family: string, weight: number): string {
  const familyParam = family.replace(/\s+/g, "+");
  return `https://fonts.googleapis.com/css2?family=${familyParam}:wght@${weight}&display=swap`;
}
