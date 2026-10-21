import { I18n } from '../i18n/I18n';
import { useLocale } from '../i18n/LocaleContext';

export function LanguageSwitch() {
  const { i18n, setLanguage } = useLocale();

  return (
    <div className="lang-switch" role="group" aria-label={i18n.t('lang.label')}>
      {I18n.LANGUAGES.map((language) => (
        <button
          key={language}
          type="button"
          className="lang-switch__option"
          aria-pressed={language === i18n.language}
          onClick={() => setLanguage(language)}
        >
          {language.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
