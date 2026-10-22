import { Color } from './Color';

/**
 * Contrast rules of WCAG 2.2, level AA: small text needs 4.5:1 against what is behind it,
 * large text (titles, big numbers) and graphics (the route line) 3:1.
 */
export class Readability {
  static readonly TEXT = 4.5;
  static readonly LARGE_TEXT = 3;
  static readonly GRAPHICS = 3;

  /** Lowest contrast of a color against every given background. */
  static worstContrast(color: Color, backgrounds: Color[]): number {
    return Math.min(...backgrounds.map((bg) => color.contrast(bg)));
  }

  /** Light or dark text, whichever stands out more on the backgrounds (always ≥ 4.5:1 on one). */
  static textColorFor(backgrounds: Color[], light: Color, dark: Color): Color {
    return Readability.worstContrast(light, backgrounds) >=
      Readability.worstContrast(dark, backgrounds)
      ? light
      : dark;
  }

  /**
   * The color itself if it already reaches `ratio` on the backgrounds, otherwise the least
   * change toward `toward` (usually the text color) that does.
   */
  static ensure(color: Color, backgrounds: Color[], ratio: number, toward: Color): Color {
    if (Readability.worstContrast(color, backgrounds) >= ratio) return color;
    let low = 0;
    let high = 1;
    for (let i = 0; i < 12; i++) {
      const mid = (low + high) / 2;
      if (Readability.worstContrast(color.mix(toward, mid), backgrounds) >= ratio) high = mid;
      else low = mid;
    }
    return color.mix(toward, high);
  }

  /**
   * How opaque a cover of `cover` color must be over `under` so that `text` on top reaches
   * `ratio`, 0…1. Canvas blending mixes the colors exactly like Color.mix.
   */
  static coverOpacity(text: Color, under: Color, cover: Color, ratio: number): number {
    if (text.contrast(under) >= ratio) return 0;
    let low = 0;
    let high = 1;
    for (let i = 0; i < 12; i++) {
      const mid = (low + high) / 2;
      if (text.contrast(under.mix(cover, mid)) >= ratio) high = mid;
      else low = mid;
    }
    return high;
  }
}
