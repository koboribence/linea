import type { PosterDesign, PosterStyle } from '../../domain/poster/PosterDesign';

const STORAGE_KEY = 'poster-style';

/** Remembers the look (format, colors, toggles) for the next file. Never the activity's data. */
export class DesignStorage {
  static load(): Partial<PosterStyle> | undefined {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Partial<PosterStyle>) : undefined;
    } catch {
      return undefined; // blocked storage or broken JSON: start from defaults
    }
  }

  static save(design: PosterDesign): void {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { title, stats, ...style } = design;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(style));
    } catch {
      // Not critical: the style just won't be remembered
    }
  }
}
