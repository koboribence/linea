/** Immutable RGB color with the few operations the poster needs. */
export class Color {
  private constructor(
    readonly r: number,
    readonly g: number,
    readonly b: number,
  ) {}

  /** "#d4ff3a" or "#fff" */
  static parse(hex: string): Color {
    let value = hex.trim().replace('#', '');
    if (value.length === 3) value = [...value].map((c) => c + c).join('');
    const n = parseInt(value, 16);
    if (value.length !== 6 || Number.isNaN(n)) return new Color(0, 0, 0);
    return new Color((n >> 16) & 255, (n >> 8) & 255, n & 255);
  }

  /** t = 0 → this color, t = 1 → other */
  mix(other: Color, t: number): Color {
    const blend = (a: number, b: number) => Math.round(a + (b - a) * t);
    return new Color(blend(this.r, other.r), blend(this.g, other.g), blend(this.b, other.b));
  }

  /** WCAG relative luminance, 0 (black) … 1 (white) */
  get luminance(): number {
    const channel = (v: number) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(this.r) + 0.7152 * channel(this.g) + 0.0722 * channel(this.b);
  }

  /** WCAG contrast ratio with another color, 1 (none) … 21 (black on white) */
  contrast(other: Color): number {
    const [light, dark] = [this.luminance, other.luminance].sort((x, y) => y - x);
    return (light! + 0.05) / (dark! + 0.05);
  }

  get isDark(): boolean {
    return this.luminance < 0.4;
  }

  toHex(): string {
    return '#' + [this.r, this.g, this.b].map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  toRgba(alpha: number): string {
    return `rgba(${this.r}, ${this.g}, ${this.b}, ${alpha})`;
  }
}
