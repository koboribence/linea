/**
 * Text measured in user-visible characters: an emoji like 🏃‍♂️ counts as one, not five
 * UTF-16 units, and is never cut in half.
 */
export class Graphemes {
  private static readonly segmenter =
    typeof Intl.Segmenter === 'function'
      ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
      : undefined;

  static split(text: string): string[] {
    if (!Graphemes.segmenter) return Array.from(text); // code points: close enough on old browsers
    return Array.from(Graphemes.segmenter.segment(text), (s) => s.segment);
  }

  static count(text: string): number {
    return Graphemes.split(text).length;
  }

  static truncate(text: string, max: number): string {
    const parts = Graphemes.split(text);
    return parts.length <= max ? text : parts.slice(0, max).join('');
  }
}
