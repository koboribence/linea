import { en } from './messages/en';
import { hu, type MessageKey, type Messages } from './messages/hu';

export type Language = 'hu' | 'en';

const CATALOG: Record<Language, Messages> = { hu, en };
const LOCALES: Record<Language, string> = { hu: 'hu-HU', en: 'en-GB' };
const STORAGE_KEY = 'language';

/** Translations for one language. Create a new instance to switch language. */
export class I18n {
  static readonly LANGUAGES: readonly Language[] = ['hu', 'en'];

  constructor(readonly language: Language) {}

  /** Locale tag for Intl number and date formatting. */
  get locale(): string {
    return LOCALES[this.language];
  }

  /** t('meta.points', { count: 12 }) → "12 mérési pont" */
  t(key: MessageKey, params?: Record<string, string | number>): string {
    const text = CATALOG[this.language][key];
    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, (match, name: string) => String(params[name] ?? match));
  }

  /** Saved choice first, then the browser's language; Hungarian browsers get Hungarian. */
  static detect(): Language {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'hu' || saved === 'en') return saved;
    } catch {
      // Storage can be blocked (private mode); fall through to the browser language
    }
    return navigator.language.toLowerCase().startsWith('hu') ? 'hu' : 'en';
  }

  static remember(language: Language): void {
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // Not critical: the choice just won't survive a reload
    }
  }
}
