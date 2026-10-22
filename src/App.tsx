import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale } from './i18n/LocaleContext';
import { BusyContext } from './ui/BusyContext';
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
  // While a video is being made the app is locked; the phone's back gesture must not leave either
  const [busy, setBusy] = useState(false);
  const closeUnlessBusy = useCallback(() => {
    if (busy) history.pushState({ screen: 'editor' }, '');
    else close();
  }, [busy, close]);
  const goBack = useBackNavigation(loaded !== undefined, closeUnlessBusy);
  const busyValue = useMemo(() => ({ busy, setBusy }), [busy]);
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
    <BusyContext.Provider value={busyValue}>
      <div className={loaded ? 'app app--wide' : 'app'}>
        <header className="app__header lockable" inert={busy}>
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
          {!loaded && <p className="app__tagline">{i18n.t('app.tagline')}</p>}
          {!loaded && themeReceived && (
            <p className="notice" role="status">
              {i18n.t('share.received')}
            </p>
          )}
          <div className="lockable" inert={busy}>
            <DropZone
              onFile={open}
              onIntent={preload}
              busy={state.status === 'loading'}
              compact={loaded !== undefined}
              error={error}
            />
          </div>
          {/* A new key per file starts a fresh editor; the remembered look and stats carry over */}
          {loaded && <EditorScreen key={loaded.loadId} activity={loaded.activity} />}
        </main>
      </div>
    </BusyContext.Provider>
  );
}
