import { Color } from './Color';

export type ThemeId = 'volt' | 'chalk' | 'ocean' | 'dusk' | 'forest' | 'graphite';

export interface ThemeColors {
  /** Diagonal gradient, top-left → bottom-right */
  background: [string, string];
  text: string;
  muted: string;
  /** Route, highlights; the "fast / high" end of gradients */
  accent: string;
  /** The "slow / low" end of route gradients */
  accentSoft: string;
  /** Soft light around the route; looks good on dark backgrounds only */
  glow: boolean;
}

export interface CustomColors {
  background?: string;
  accent?: string;
}

/** Ready-made color sets plus user overrides. */
export class PosterTheme {
  static readonly PRESETS: Record<ThemeId, ThemeColors> = {
    volt: {
      background: ['#0e0f12', '#1b1e24'],
      text: '#f5f5f0',
      muted: '#8a8f98',
      accent: '#d4ff3a',
      accentSoft: '#f5f5f0',
      glow: true,
    },
    chalk: {
      background: ['#f5f5f0', '#e6e6de'],
      text: '#0e0f12',
      muted: '#5b6069',
      accent: '#0e0f12',
      accentSoft: '#aeb2b9',
      glow: false,
    },
    ocean: {
      background: ['#071526', '#0f2d4d'],
      text: '#eaf2ff',
      muted: '#8fa6c4',
      accent: '#4dd8ff',
      accentSoft: '#3a5f8c',
      glow: true,
    },
    dusk: {
      background: ['#1f0b1e', '#46152f'],
      text: '#fff1f0',
      muted: '#c49aa6',
      accent: '#ff5d8f',
      accentSoft: '#ffc15e',
      glow: true,
    },
    forest: {
      background: ['#0c1a13', '#173627'],
      text: '#eef6ee',
      muted: '#93ae9c',
      accent: '#9bef7a',
      accentSoft: '#3f6b50',
      glow: true,
    },
    graphite: {
      background: ['#1a1b1f', '#2a2c31'],
      text: '#ffffff',
      muted: '#9a9da3',
      accent: '#ffffff',
      accentSoft: '#5e6168',
      glow: false,
    },
  };

  static readonly IDS = Object.keys(PosterTheme.PRESETS) as ThemeId[];

  /** Preset colors with the user's own background and/or accent applied on top. */
  static resolve(id: ThemeId, custom: CustomColors = {}): ThemeColors {
    const preset = PosterTheme.PRESETS[id];
    let colors: ThemeColors = { ...preset };

    if (custom.background) {
      const bg = Color.parse(custom.background);
      // Text color follows the background's brightness so it stays readable
      const text = Color.parse(bg.isDark ? '#f5f5f0' : '#0e0f12');
      colors = {
        ...colors,
        background: [bg.toHex(), bg.mix(text, 0.06).toHex()],
        text: text.toHex(),
        muted: text.mix(bg, 0.45).toHex(),
        glow: bg.isDark,
      };
    }
    if (custom.accent) {
      const accent = Color.parse(custom.accent);
      const bg = Color.parse(colors.background[0]);
      colors = { ...colors, accent: accent.toHex(), accentSoft: accent.mix(bg, 0.6).toHex() };
    }
    return colors;
  }
}
