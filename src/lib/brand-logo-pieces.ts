/**
 * The Fashion Flow wordmark cut into its 17 separate shapes — seven letters, the dot on the "i",
 * the second line's F / l / o / w, its four coloured dots, and the red arrow — so each can animate
 * on its own. Every piece is a transparent WebP in public/brand/logo/, and its box is given as a
 * percentage of the whole logo, so they line up exactly at any size (together they rebuild the
 * original artwork to within an average of under 1/255 per pixel). Listed in reading order, which
 * is the order they appear in on the sign-in screen.
 *
 * `kind` only decides how a piece arrives: letters spring up, dots drop in, the arrow slides in.
 */
export type LogoPiece = { file: string; left: number; top: number; w: number; h: number; kind: "letter" | "dot" | "arrow" };

/** Width / height of the whole wordmark. */
export const FF_LOGO_ASPECT = 1.8781;

export const FF_LOGO_PIECES: LogoPiece[] = [
  { file: "p01.webp", left: -0.564, top: 0.353, w: 15.334, h: 44.523, kind: "letter" },
  { file: "p02.webp", left: 11.477, top: 11.307, w: 17.592, h: 33.922, kind: "letter" },
  { file: "p03.webp", left: 29.163, top: 11.131, w: 13.829, h: 33.922, kind: "letter" },
  { file: "p04.webp", left: 43.368, top: -1.060, w: 15.804, h: 46.290, kind: "letter" },
  { file: "p06.webp", left: 59.548, top: 11.484, w: 5.080, h: 33.569, kind: "letter" },
  { file: "p05.webp", left: 59.172, top: -0.883, w: 5.927, h: 11.484, kind: "dot" },
  { file: "p07.webp", left: 64.911, top: 10.954, w: 18.250, h: 34.099, kind: "letter" },
  { file: "p08.webp", left: 83.443, top: 10.954, w: 16.087, h: 34.099, kind: "letter" },
  { file: "p09.webp", left: -0.564, top: 56.360, w: 15.052, h: 44.346, kind: "letter" },
  { file: "p10.webp", left: 13.264, top: 89.399, w: 5.174, h: 10.424, kind: "dot" },
  { file: "p11.webp", left: 20.508, top: 53.534, w: 4.986, h: 47.173, kind: "letter" },
  { file: "p12.webp", left: 27.093, top: 89.399, w: 5.268, h: 10.424, kind: "dot" },
  { file: "p13.webp", left: 32.361, top: 67.138, w: 18.909, h: 33.922, kind: "letter" },
  { file: "p14.webp", left: 49.953, top: 89.399, w: 5.268, h: 10.424, kind: "dot" },
  { file: "p15.webp", left: 52.023, top: 68.375, w: 25.588, h: 32.332, kind: "letter" },
  { file: "p16.webp", left: 76.011, top: 89.399, w: 5.268, h: 10.424, kind: "dot" },
  { file: "p17.webp", left: 85.983, top: 65.194, w: 14.581, h: 32.332, kind: "arrow" },
];

export const ffLogoSrc = (piece: LogoPiece) => `/brand/logo/${piece.file}`;

/** Fetches every piece into the browser cache, so the sign-in animation never waits on an image. */
export function preloadFfLogo(): void {
  if (typeof window === "undefined") return;
  for (const piece of FF_LOGO_PIECES) new Image().src = ffLogoSrc(piece);
}
