import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { UnitFormatter } from '../domain/format/UnitFormatter';
import { I18n, type Language } from './I18n';

interface LocaleValue {
  i18n: I18n;
  format: UnitFormatter;
  setLanguage: (language: Language) => void;
}

const LocaleContext = createContext<LocaleValue | null>(null);

/** Provides translations and number formatting for the current language. */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(I18n.detect);

  const value = useMemo<LocaleValue>(() => {
    const i18n = new I18n(language);
    return {
      i18n,
      format: new UnitFormatter(i18n.locale),
      setLanguage: (next) => {
        I18n.remember(next);
        setLanguageState(next);
      },
    };
  }, [language]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLocale(): LocaleValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('useLocale must be used inside LocaleProvider');
  return value;
}
