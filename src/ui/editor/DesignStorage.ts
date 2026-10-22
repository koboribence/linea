import type { PosterDesign, RememberedDesign } from '../../domain/poster/PosterDesign';
import type { CustomTheme } from '../../domain/poster/ThemeCode';

const STORAGE_KEY = 'poster-style';

/**
 * Remembers the look (format, colors, toggles) and the picked stats for the next file.
 * Never the title or any of the activity's data.
 */
export class DesignStorage {
  /** Unknown stat ids in old or edited storage are harmless: only available stats are used. */
  static load(): RememberedDesign | undefined {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as RememberedDesign) : undefined;
    } catch {
      return undefined; // blocked storage or broken JSON: start from defaults
    }
  }

  static save(design: PosterDesign): void {
    // The title and a typed-in date belong to one activity; the photo is never stored
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { title, photo, manualDate, ...remembered } = design;
    DesignStorage.write(remembered);
  }

  /** Makes these colors the starting look for the next file (e.g. after opening a theme link). */
  static applyColors(theme: CustomTheme): void {
    DesignStorage.write({
      ...DesignStorage.load(),
      customBackground: theme.background,
      customAccent: theme.accent,
    });
  }

  private static write(remembered: RememberedDesign): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(remembered));
    } catch {
      // Not critical: the design just won't be remembered
    }
  }
}
