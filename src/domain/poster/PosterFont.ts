export type FontId = 'sport' | 'script' | 'scifi' | 'editorial' | 'halloween';

/** One font in a role (title, numbers, labels). */
export interface FontFace {
  /** CSS font-family list; the first one must support Hungarian (ő, ű) */
  family: string;
  weight: number;
  italic?: boolean;
}

/** A matched set of fonts for the poster, plus how the title behaves in it. */
export interface PosterFont {
  title: FontFace;
  /** Stat values: always with clear, even-height digits */
  value: FontFace;
  /** Small labels and the date line */
  label: FontFace;
  /** Sporty fonts look best in capitals; handwriting is written in normal case */
  uppercase: boolean;
  /** Start size of the title relative to the default (wide fonts start smaller) */
  titleScale: number;
  /** Vertical title metrics relative to its size: baseline of the first line, line step, space below */
  titleAscent: number;
  titleLineHeight: number;
  titleDescent: number;
  /** A seasonal set, swapped for the current season (now: Halloween) */
  seasonal?: boolean;
}

const EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"';
const INTER = 'Inter, system-ui, sans-serif';
const BARLOW = '"Barlow Condensed", "Arial Narrow", sans-serif';

/** The selectable font sets. All are open-licensed (OFL) and include Hungarian letters. */
export class PosterFonts {
  static readonly PRESETS: Record<FontId, PosterFont> = {
    sport: {
      title: { family: `${BARLOW}, ${EMOJI}`, weight: 800, italic: true },
      value: { family: BARLOW, weight: 700 },
      label: { family: INTER, weight: 600 },
      uppercase: true,
      titleScale: 1,
      titleAscent: 0.78,
      titleLineHeight: 0.92,
      titleDescent: 0.14,
    },
    script: {
      title: { family: `Pacifico, cursive, ${EMOJI}`, weight: 400 },
      value: { family: 'Quicksand, sans-serif', weight: 700 },
      label: { family: 'Quicksand, sans-serif', weight: 700 },
      uppercase: false,
      titleScale: 0.8,
      titleAscent: 0.98,
      titleLineHeight: 1.22,
      titleDescent: 0.32,
    },
    scifi: {
      title: { family: `Oxanium, sans-serif, ${EMOJI}`, weight: 800 },
      value: { family: 'Oxanium, sans-serif', weight: 700 },
      label: { family: 'Oxanium, sans-serif', weight: 600 },
      uppercase: true,
      titleScale: 0.78,
      titleAscent: 0.82,
      titleLineHeight: 1.02,
      titleDescent: 0.2,
    },
    editorial: {
      title: { family: `"Playfair Display", Georgia, serif, ${EMOJI}`, weight: 900, italic: true },
      value: { family: '"DM Serif Display", Georgia, serif', weight: 400 },
      label: { family: INTER, weight: 600 },
      uppercase: false,
      titleScale: 0.82,
      titleAscent: 0.9,
      titleLineHeight: 1.08,
      titleDescent: 0.26,
    },
    halloween: {
      title: { family: `Butcherman, fantasy, ${EMOJI}`, weight: 400 },
      value: { family: '"Metal Mania", fantasy', weight: 400 },
      label: { family: INTER, weight: 600 },
      uppercase: true,
      titleScale: 0.9,
      titleAscent: 1.0, // its big accents need room above the capitals
      titleLineHeight: 1.08,
      titleDescent: 0.26,
      seasonal: true,
    },
  };

  static readonly IDS = Object.keys(PosterFonts.PRESETS) as FontId[];

  /** Canvas/CSS font shorthand, e.g. "italic 800 120px Barlow…" */
  static css(face: FontFace, size: number): string {
    return `${face.italic ? 'italic ' : ''}${face.weight} ${size}px ${face.family}`;
  }
}
