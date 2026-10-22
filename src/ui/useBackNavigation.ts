import { useCallback, useEffect } from 'react';

/**
 * Makes a screen behave like its own page: entering adds a browser history entry,
 * so the browser's and the phone's back button return to the previous screen.
 * Returns the function the on-screen back button should call.
 */
export function useBackNavigation(active: boolean, onBack: () => void): () => void {
  useEffect(() => {
    if (!active) return;
    // StrictMode runs effects twice in development; push the entry only once
    if (!(history.state as { screen?: string } | null)?.screen) {
      history.pushState({ screen: 'editor' }, '');
    }
    const handlePop = () => onBack();
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, [active, onBack]);

  return useCallback(() => history.back(), []);
}
