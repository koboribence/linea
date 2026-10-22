import { useEffect } from 'react';
import { useLocale } from './i18n/LocaleContext';
import { DropZone } from './ui/DropZone';
import { EditorScreen } from './ui/editor/EditorScreen';
import { LanguageSwitch } from './ui/LanguageSwitch';
import { Logo } from './ui/Logo';
import { useActivityFile } from './ui/useActivityFile';

export function App() {
  const { i18n } = useLocale();
  const { state, loaded, open, preload } = useActivityFile();

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
        <Logo />
        <LanguageSwitch />
      </header>

      <main className="app__main">
        {!loaded && <p className="app__tagline">{i18n.t('app.tagline')}</p>}
        <DropZone
          onFile={open}
          onIntent={preload}
          busy={state.status === 'loading'}
          compact={loaded !== undefined}
          error={error}
        />
        {/* A new key per file resets the editor to that file's defaults */}
        {loaded && <EditorScreen key={loaded.loadId} activity={loaded.activity} />}
      </main>
    </div>
  );
}
