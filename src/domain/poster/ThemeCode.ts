/** A user's own color pair, as hex strings ("#0e0f12"). */
export interface CustomTheme {
  background: string;
  accent: string;
}

const VERSION = 'v1';
const PATTERN = /^v1-([0-9a-f]{6})-([0-9a-f]{6})$/i;

/**
 * Short text form of a custom theme for links and QR codes: "v1-0e0f12-d4ff3a".
 * The version prefix lets later formats (e.g. full templates) coexist with old links.
 */
export class ThemeCode {
  static encode(theme: CustomTheme): string {
    const hex = (color: string) => color.replace('#', '').toLowerCase();
    return `${VERSION}-${hex(theme.background)}-${hex(theme.accent)}`;
  }

  /** Undefined for anything that isn't a valid code, so links can't inject junk. */
  static decode(code: string): CustomTheme | undefined {
    const match = PATTERN.exec(code.trim());
    if (!match) return undefined;
    return { background: `#${match[1]!.toLowerCase()}`, accent: `#${match[2]!.toLowerCase()}` };
  }

  static equals(a: CustomTheme, b: CustomTheme): boolean {
    return ThemeCode.encode(a) === ThemeCode.encode(b);
  }
}
