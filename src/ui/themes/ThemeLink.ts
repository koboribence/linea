import { ThemeCode, type CustomTheme } from '../../domain/poster/ThemeCode';

const HASH_KEY = 'theme';

/**
 * Theme links look like https://…/#theme=v1-0e0f12-d4ff3a. The part after # never
 * reaches a server, so sharing colors stays as private as the rest of the app.
 */
export class ThemeLink {
  static create(theme: CustomTheme): string {
    const { origin, pathname } = window.location;
    return `${origin}${pathname}#${HASH_KEY}=${ThemeCode.encode(theme)}`;
  }

  /** Reads a theme from the current address and removes it, so a reload doesn't repeat it. */
  static consume(): CustomTheme | undefined {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const code = params.get(HASH_KEY);
    if (code === null) return undefined;
    const { pathname, search } = window.location;
    history.replaceState(history.state, '', pathname + search);
    return ThemeCode.decode(code);
  }
}
