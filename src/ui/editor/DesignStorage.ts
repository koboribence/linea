import type { PosterDesign, PosterStyle } from '../../domain/poster/PosterDesign';
import type { CustomTheme } from '../../domain/poster/ThemeCode';

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
    DesignStorage.write(style);
  }

  /** Makes these colors the starting look for the next file (e.g. after opening a theme link). */
  static applyColors(theme: CustomTheme): void {
    DesignStorage.write({
      ...DesignStorage.load(),
      customBackground: theme.background,
      customAccent: theme.accent,
    });
  }

  private static write(style: Partial<PosterStyle>): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(style));
    } catch {
      // Not critical: the style just won't be remembered
    }
  }
}
