import { ThemeCode, type CustomTheme } from '../../domain/poster/ThemeCode';

const STORAGE_KEY = 'saved-themes';

/** The user's saved color pairs, newest first, kept in this browser only. */
export class ThemeLibrary {
  static readonly MAX = 6;

  static load(): CustomTheme[] {
    try {
      const codes = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown;
      if (!Array.isArray(codes)) return [];
      // Stored as codes, so a tampered entry is simply dropped
      return codes.flatMap((code) => {
        const theme = typeof code === 'string' ? ThemeCode.decode(code) : undefined;
        return theme ? [theme] : [];
      });
    } catch {
      return [];
    }
  }

  /** Adds the theme in front (or moves it there); the oldest falls off above MAX. */
  static add(theme: CustomTheme): CustomTheme[] {
    const others = ThemeLibrary.load().filter((t) => !ThemeCode.equals(t, theme));
    return ThemeLibrary.store([theme, ...others].slice(0, ThemeLibrary.MAX));
  }

  static remove(theme: CustomTheme): CustomTheme[] {
    return ThemeLibrary.store(ThemeLibrary.load().filter((t) => !ThemeCode.equals(t, theme)));
  }

  private static store(themes: CustomTheme[]): CustomTheme[] {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(themes.map((t) => ThemeCode.encode(t))));
    } catch {
      // Storage blocked: the list still works until the page is closed
    }
    return themes;
  }
}
