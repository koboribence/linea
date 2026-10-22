import { useEffect, useState } from 'react';
import { useLocale } from './i18n/LocaleContext';
import { DropZone } from './ui/DropZone';
import { DesignStorage } from './ui/editor/DesignStorage';
import { EditorScreen } from './ui/editor/EditorScreen';
import { LanguageSwitch } from './ui/LanguageSwitch';
import { Logo } from './ui/Logo';
import { ThemeLibrary } from './ui/themes/ThemeLibrary';
import { ThemeLink } from './ui/themes/ThemeLink';
import { useActivityFile } from './ui/useActivityFile';
import { useBackNavigation } from './ui/useBackNavigation';

/** Colors arriving via a shared link (QR code) are saved once, on first render. */
function receiveThemeLink(): boolean {
  const theme = ThemeLink.consume();
  if (!theme) return false;
  ThemeLibrary.add(theme);
  DesignStorage.applyColors(theme);
  return true;
}

export function App() {
  const { i18n } = useLocale();
  const { state, loaded, open, preload, close } = useActivityFile();
  const goBack = useBackNavigation(loaded !== undefined, close);
  const [themeReceived] = useState(receiveThemeLink);

  // A file dropped outside the drop zone would make the browser navigate away from the app
  useEffect(() => {
    const block = (event: DragEvent) => event.preventDefault();
    window.addEventListener('dragover', block);
    window.addEventListener('drop', block);
    return () => {
      window.removeEventListener('dragover', block);
      window.removeEventListener('drop', block);
    };
  }, []);

  const error = state.status === 'error' ? i18n.t(`error.${state.code}`) : undefined;

  return (
    <div className={loaded ? 'app app--wide' : 'app'}>
      <header className="app__header">
        <div className="app__brand">
          {loaded && (
            <button
              type="button"
              className="back-button"
              aria-label={i18n.t('nav.backLabel')}
              onClick={goBack}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M15 5l-7 7 7 7" />
              </svg>
              <span>{i18n.t('nav.back')}</span>
            </button>
          )}
          <Logo />
        </div>
        <LanguageSwitch />
      </header>

      <main className="app__main">
        {loaded ? (
          // A new key per file resets the editor to that file's defaults
          <EditorScreen key={loaded.loadId} activity={loaded.activity} />
        ) : (
          <>
            <p className="app__tagline">{i18n.t('app.tagline')}</p>
            {themeReceived && (
              <p className="notice" role="status">
                {i18n.t('share.received')}
              </p>
            )}
            <DropZone
              onFile={open}
              onIntent={preload}
              busy={state.status === 'loading'}
              error={error}
            />
          </>
        )}
      </main>
    </div>
  );
}
