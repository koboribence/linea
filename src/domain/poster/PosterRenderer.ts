import type { ElevationProfile } from '../route/ElevationProfile';
import type { Box, ScreenPoint } from '../route/RouteShape';
import { Graphemes } from '../format/Graphemes';
import { Color } from './Color';
import { PhotoPlacement } from './PhotoPlacement';
import { PosterFonts, type FontFace, type PosterFont } from './PosterFont';
import { Readability } from './Readability';
import type { PhotoImage, PosterScene, PosterStat } from './PosterScene';

const BASE_WIDTH = 1080;
/** Gap between stat columns, in units */
const STAT_GAP = 32;
/** The brand wordmark always uses the brand font, whatever font set the poster has */
const LOGO_FONT: FontFace = {
  family: '"Barlow Condensed", "Arial Narrow", sans-serif',
  weight: 800,
  italic: true,
};

interface TitleLayout {
  lines: string[];
  size: number;
  bottom: number;
}

interface StatsLayout {
  stats: PosterStat[];
  /** What the sizes were measured on: the stats themselves, or their final values (video) */
  sizing: PosterStat[];
  columns: number;
  columnWidth: number;
  labelSize: number;
  valueSize: number;
  rowHeight: number;
  top: number;
}

interface Layout {
  title: TitleLayout;
  stats?: StatsLayout;
  /** Separator line above the stats */
  divider?: number;
  elevation?: Box;
  middle: Box;
  /** Shown big in the middle when there is no route */
  hero?: PosterStat;
}

/**
 * Draws a PosterScene onto a canvas. All sizes are designed for a 1080 px wide image
 * and scaled by `u` (unit), so every format and resolution looks the same.
 */
export class PosterRenderer {
  private readonly u: number;
  /** Side margin */
  private readonly pad: number;
  /** Top and bottom margins: larger on stories, where Instagram overlays its own UI */
  private readonly padTop: number;
  private readonly padBottom: number;
  private readonly accent: Color;
  private readonly font: PosterFont;

  private constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly scene: PosterScene,
  ) {
    this.u = scene.width / BASE_WIDTH;
    this.pad = 80 * this.u;
    // Story: profile name and progress bar on top, reply bar at the bottom
    const isStory = scene.height / scene.width > 1.5;
    this.padTop = (isStory ? 200 : 100) * this.u;
    this.padBottom = (isStory ? 230 : 72) * this.u;
    this.accent = Color.parse(scene.colors.accent);
    this.font = scene.font;
  }

  /**
   * Resolves when the poster's fonts (including Hungarian accented letters) are ready to draw.
   * Font files download on first use only, so unused font sets cost nothing.
   */
  static async loadFonts(font: PosterFont): Promise<void> {
    const faces = [font.title, font.value, font.label, LOGO_FONT];
    await Promise.all(
      faces.map((face) => document.fonts.load(PosterFonts.css(face, 100), 'ÁÉŐŰáéőű 0123')),
    );
  }

  static render(canvas: HTMLCanvasElement, scene: PosterScene): void {
    canvas.width = scene.width;
    canvas.height = scene.height;
    const ctx = canvas.getContext('2d');
    if (ctx) new PosterRenderer(ctx, scene).draw();
  }

  /**
   * The middle area where the route goes (between title and stats). The map background
   * uses it to frame the route in the same place the 2D route would be.
   */
  static middleBox(scene: PosterScene): Box {
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return { x: 0, y: 0, width: scene.width, height: scene.height };
    return new PosterRenderer(ctx, scene).layout().middle;
  }

  private draw(): void {
    const { scene } = this;
    const layout = this.layout();
    this.drawBackground(layout);
    this.drawHeader(layout.title);
    // On a map background the map has already drawn the route
    if (scene.map?.route) this.drawRoutePoints(scene.map.route, scene.map.showStart !== false);
    else if (scene.route && !scene.map) this.drawRoute(layout.middle);
    else if (layout.hero) this.drawHero(layout.hero, layout.middle);
    if (layout.elevation && scene.elevation) {
      this.drawElevation(scene.elevation, layout.elevation);
    }
    if (layout.stats) this.drawStats(layout.stats, layout.divider!);
    if (scene.logo) this.drawLogo(scene.logo);
    if (scene.map) this.drawAttribution(scene.map.attribution);
  }

  // ── Layout ────────────────────────────────────────────────────────────

  private layout(): Layout {
    const { u, pad, scene } = this;
    const isStory = scene.height / scene.width > 1.5;
    const title = this.layoutTitle(isStory);

    const hero = scene.route || scene.map ? undefined : scene.stats[0];
    const gridStats = hero ? scene.stats.slice(1) : scene.stats;
    const bottom = scene.logo ? this.logoBaseline() - 80 * u : scene.height - this.padBottom;
    const middleTop = title.bottom + 56 * u;

    // Many stats can crowd out the route: shrink them until the middle keeps its share
    const minMiddle = scene.height * 0.24;
    let stats: StatsLayout | undefined;
    for (let scale = 1; scale >= 0.5; scale -= 0.1) {
      stats =
        gridStats.length > 0
          ? this.layoutStats(gridStats, bottom, isStory, scale, this.sizingFor(gridStats))
          : undefined;
      if (!stats || stats.top - 40 * u - 56 * u - middleTop >= minMiddle) break;
    }
    const divider = stats ? stats.top - 40 * u : undefined;
    let middleBottom = (divider ?? bottom) - 56 * u;

    // The profile only fits when the route keeps enough room
    let elevation: Box | undefined;
    if (scene.elevation) {
      const height = (isStory ? 150 : 100) * u;
      const remaining = middleBottom - height - 40 * u - middleTop;
      if (remaining >= scene.height * 0.22) {
        elevation = { x: pad, y: middleBottom - height, width: scene.width - 2 * pad, height };
        middleBottom -= height + 40 * u;
      }
    }

    const middle = {
      x: pad,
      y: middleTop,
      width: scene.width - 2 * pad,
      height: middleBottom - middleTop,
    };
    return { title, stats, divider, elevation, middle, hero };
  }

  /** Largest title size (down to a minimum) that fits in two lines. */
  private layoutTitle(isStory: boolean): TitleLayout {
    const { u, pad, scene } = this;
    const maxWidth = scene.width - 2 * pad;
    const top = scene.eyebrow ? this.padTop + 26 * u + 22 * u : this.padTop;
    const font = this.font;
    const text = font.uppercase ? scene.title.toLocaleUpperCase() : scene.title;
    const max = (isStory ? 136 : 112) * u * font.titleScale;
    const min = 48 * u;

    let size = max;
    let lines = this.wrap(text, size, maxWidth);
    while (lines.length > 2 && size > min) {
      size -= 4 * u;
      lines = this.wrap(text, size, maxWidth);
    }
    if (lines.length > 2) lines = [lines[0]!, lines.slice(1).join(' ')];
    // A single word longer than the line (no space to break at) is cut too
    lines = lines.map((line) => this.ellipsize(line, maxWidth));
    const height = font.titleAscent + (lines.length - 1) * font.titleLineHeight + font.titleDescent;
    return { lines, size, bottom: top + height * size };
  }

  /** Up to 3 per row; 4 make a 2×2 block on tall stories. Every value fits its own column. */
  private static columnsFor(count: number, isStory: boolean): number {
    if (count <= 3) return count;
    if (count === 4) return isStory ? 2 : 4;
    return 3;
  }

  /** Final values to measure on, when the scene has matching ones (video counters). */
  private sizingFor(stats: PosterStat[]): PosterStat[] {
    const sizing = this.scene.statsSizing;
    return sizing?.length === stats.length ? sizing : stats;
  }

  private layoutStats(
    stats: PosterStat[],
    bottom: number,
    isStory: boolean,
    scale: number,
    sizing: PosterStat[],
  ): StatsLayout {
    const { u, pad, scene } = this;
    const columns = PosterRenderer.columnsFor(stats.length, isStory);
    const rows = Math.ceil(stats.length / columns);
    const columnWidth = (scene.width - 2 * pad - (columns - 1) * STAT_GAP * u) / columns;

    // Shrink labels and numbers until the widest one fits its column
    let labelSize = Math.max(17, 24 * scale) * u;
    for (const stat of sizing) {
      const width = this.labelWidth(stat.label, labelSize);
      if (width > columnWidth) labelSize = Math.max(16 * u, (labelSize * columnWidth) / width);
    }
    let valueSize = (columns <= 2 ? 120 : columns === 3 ? 100 : 88) * u * scale;
    for (const stat of sizing) {
      const width = this.valueWidth(stat, valueSize);
      if (width > columnWidth) valueSize *= columnWidth / width;
    }

    const rowHeight = labelSize + 14 * u + valueSize * 0.74;
    const rowGap = Math.max(32, 56 * scale) * u;
    const top = bottom - rows * rowHeight - (rows - 1) * rowGap;
    return {
      stats,
      sizing,
      columns,
      columnWidth,
      labelSize,
      valueSize,
      rowHeight: rowHeight + rowGap,
      top,
    };
  }

  // ── Drawing ───────────────────────────────────────────────────────────

  private drawBackground(layout: Layout): void {
    const { ctx, scene } = this;
    const { middle } = layout;
    ctx.clearRect(0, 0, scene.width, scene.height);
    if (scene.transparent) return;
    if (scene.map) return this.drawMapBackdrop(scene.map.image, layout);

    const [from, to] = scene.colors.background;
    const gradient = ctx.createLinearGradient(0, 0, scene.width, scene.height);
    gradient.addColorStop(0, from);
    gradient.addColorStop(1, to);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, scene.width, scene.height);

    // Photo on the theme background (which shows where the photo was moved away),
    // then the same background again on top as an adjustable overlay
    if (scene.photo) {
      const { image, settings } = scene.photo;
      const rect = PhotoPlacement.rect(image, scene, settings);
      ctx.drawImage(image.source, rect.x, rect.y, rect.width, rect.height);
      ctx.globalAlpha = settings.overlay;
      ctx.fillRect(0, 0, scene.width, scene.height);
      ctx.globalAlpha = 1;
    }

    // Faint accent light behind the route makes dark themes feel lit
    if (scene.colors.glow) {
      const cx = middle.x + middle.width / 2;
      const cy = middle.y + middle.height / 2;
      const radius = scene.width * 0.7;
      const light = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      light.addColorStop(0, this.accent.toRgba(0.12));
      light.addColorStop(1, this.accent.toRgba(0));
      ctx.fillStyle = light;
      ctx.fillRect(0, 0, scene.width, scene.height);
    }
  }

  private drawHeader(title: TitleLayout): void {
    const { ctx, u, pad, scene } = this;
    const maxWidth = scene.width - 2 * pad;
    ctx.textAlign = 'left';
    this.textShadow();

    let y = this.padTop;
    if (scene.eyebrow) {
      this.setFont(PosterFonts.css(this.font.label, 26 * u), 3 * u);
      ctx.fillStyle = scene.colors.accentText;
      ctx.textBaseline = 'top';
      ctx.fillText(this.ellipsize(scene.eyebrow.toLocaleUpperCase(), maxWidth), pad, y);
      y += 26 * u + 22 * u;
    }

    const { titleAscent, titleLineHeight } = this.font;
    this.setFont(PosterFonts.css(this.font.title, title.size));
    ctx.fillStyle = scene.colors.text;
    ctx.textBaseline = 'alphabetic';
    title.lines.forEach((line, i) => {
      ctx.fillText(line, pad, y + title.size * (titleAscent + i * titleLineHeight));
    });
  }

  /** 2D route: fitted into the middle box. */
  private drawRoute(middle: Box): void {
    const inset = this.scene.routeWidth * this.u * 2;
    this.drawRoutePoints(
      this.scene.route!.fitTo({
        x: middle.x + inset,
        y: middle.y + inset,
        width: middle.width - 2 * inset,
        height: middle.height - 2 * inset,
      }),
    );
  }

  /** Draws a route at given screen points: 2D fitted, or projected onto the 3D map. */
  private drawRoutePoints(points: ScreenPoint[], showStart = true): void {
    const { ctx, u, scene } = this;
    const width = scene.routeWidth * u;
    if (points.length < 2) return;

    this.noShadow();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = width;

    // On a map the line must stand out (3:1); where its colors are too close to the map's,
    // a black or white casing underneath keeps it visible
    const casing = scene.map && this.routeCasing(points[0]!.value !== undefined);
    if (casing) {
      ctx.strokeStyle = casing;
      ctx.lineWidth = width + 6 * u;
      this.tracePath(points);
      ctx.stroke();
      ctx.lineWidth = width;
    }

    // Pass 1: the whole line in the accent color, glowing on dark themes and always on maps
    if (scene.colors.glow || scene.map) {
      ctx.shadowColor = this.accent.toRgba(0.65);
      ctx.shadowBlur = 36 * u;
    }
    ctx.strokeStyle = scene.colors.accent;
    this.tracePath(points);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Pass 2: gradient coloring, segment by segment
    if (points[0]!.value !== undefined) {
      const soft = Color.parse(scene.colors.accentSoft);
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1]!;
        const b = points[i]!;
        if (b.newSegment) continue;
        ctx.strokeStyle = soft.mix(this.accent, ((a.value ?? 0) + (b.value ?? 0)) / 2).toHex();
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    this.drawMarkers(showStart ? points[0] : undefined, points.at(-1)!, width);
  }

  /** A casing color when the route's colors don't reach 3:1 against the map, else undefined. */
  private routeCasing(gradient: boolean): string | undefined {
    const { colors, map } = this.scene;
    const lineColors = [this.accent, ...(gradient ? [Color.parse(colors.accentSoft)] : [])];
    const mapColors = [map!.contrast.land, map!.contrast.extreme].map((hex) => Color.parse(hex));
    const weakest = Math.min(
      ...lineColors.map((line) => Readability.worstContrast(line, mapColors)),
    );
    if (weakest >= Readability.GRAPHICS) return undefined;
    const white = Color.parse('#ffffff');
    const black = Color.parse('#000000');
    return Readability.textColorFor(lineColors, white, black).toHex();
  }

  /** Start: open ring, finish: filled dot (same as the logo). */
  private drawMarkers(start: ScreenPoint | undefined, finish: ScreenPoint, width: number): void {
    const { ctx, scene } = this;
    const ring = width * 1.3;

    ctx.fillStyle = scene.colors.accent;
    ctx.beginPath();
    ctx.arc(finish.x, finish.y, width * 1.15, 0, Math.PI * 2);
    ctx.fill();
    if (!start) return;

    ctx.beginPath();
    ctx.arc(start.x, start.y, ring, 0, Math.PI * 2);
    if (scene.transparent) {
      // Punch a real hole, so the photo underneath shows through the ring
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.fillStyle = scene.colors.background[0];
      ctx.fill();
    }
    ctx.lineWidth = width * 0.55;
    ctx.strokeStyle = scene.colors.accent;
    ctx.stroke();
  }

  private drawHero(stat: PosterStat, middle: Box): void {
    const { ctx, u, scene } = this;
    const cx = middle.x + middle.width / 2;
    const labelSize = 30 * u;
    const gap = 24 * u;

    // As big as fits both the width and the height of the middle area (digits are ~0.74 tall)
    let size = Math.min(300 * u, Math.max(0, middle.height - labelSize - gap) / 0.74);
    const width = this.valueWidth(stat, size);
    if (width > middle.width) size *= middle.width / width;

    const blockHeight = labelSize + gap + size * 0.74;
    const top = middle.y + (middle.height - blockHeight) / 2;
    this.textShadow();
    this.setFont(PosterFonts.css(this.font.label, labelSize), 4 * u);
    ctx.fillStyle = scene.colors.muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(stat.label.toLocaleUpperCase(), cx, top + labelSize);

    const total = this.valueWidth(stat, size);
    this.drawValue(stat, cx - total / 2, top + blockHeight, size, scene.colors.accent);
  }

  /**
   * Map background: the rendered map (or nothing, when video frames put the live map under it),
   * with the theme color fading in at the top and bottom. Behind text the cover is at least as
   * opaque as WCAG AA contrast needs over the map's most contrasting color.
   */
  private drawMapBackdrop(image: PhotoImage | undefined, layout: Layout): void {
    const { ctx, scene, u } = this;
    if (image) ctx.drawImage(image.source, 0, 0, scene.width, scene.height);
    const { top, bottom } = this.coverOpacity(layout);
    const bg = Color.parse(scene.colors.background[0]);
    const fade = scene.height * 0.1;
    const scrim = (stops: [number, number][]) => {
      const gradient = ctx.createLinearGradient(0, stops[0]![0], 0, stops.at(-1)![0]);
      const span = stops.at(-1)![0] - stops[0]![0];
      for (const [y, alpha] of stops) {
        gradient.addColorStop((y - stops[0]![0]) / span, bg.toRgba(alpha));
      }
      ctx.fillStyle = gradient;
      ctx.fillRect(0, stops[0]![0], scene.width, span);
    };

    const headerEnd = layout.title.bottom + 16 * u;
    scrim([
      [0, Math.max(0.88, top)],
      [headerEnd, top],
      [headerEnd + fade, 0],
    ]);
    const footerStart = this.footerTop(layout) - 16 * u;
    scrim([
      [footerStart - fade, 0],
      [footerStart, bottom],
      [scene.height, Math.max(0.92, bottom)],
    ]);
  }

  /** Where the text (or the elevation profile) at the bottom begins. */
  private footerTop(layout: Layout): number {
    const { u, scene } = this;
    if (layout.elevation) return layout.elevation.y;
    if (layout.divider !== undefined) return layout.divider;
    return scene.logo ? this.logoBaseline() - 60 * u : this.logoBaseline() + 20 * u;
  }

  /**
   * Opacity the theme-colored cover needs behind the header and the footer, so that over the
   * map's most contrasting color small text reaches 4.5:1, big text and the profile 3:1.
   */
  private coverOpacity(layout: Layout): { top: number; bottom: number } {
    const { scene } = this;
    const { colors } = scene;
    const under = Color.parse(scene.map!.contrast.extreme);
    const cover = Color.parse(colors.background[0]);
    const need = (hex: string, ratio: number) =>
      Readability.coverOpacity(Color.parse(hex), under, cover, ratio);
    const top = Math.max(
      need(colors.text, Readability.LARGE_TEXT),
      scene.eyebrow ? need(colors.accentText, Readability.TEXT) : 0,
    );
    const bottom = Math.max(
      need(colors.text, Readability.LARGE_TEXT),
      need(colors.muted, Readability.TEXT),
      layout.elevation ? need(colors.accent, Readability.GRAPHICS) : 0,
    );
    return { top, bottom };
  }

  /** Data credits the map licenses require, small but legible, at the very bottom. */
  private drawAttribution(lines: string[]): void {
    const { ctx, u, scene } = this;
    this.noShadow();
    this.setFont(PosterFonts.css({ family: 'Inter, system-ui, sans-serif', weight: 500 }, 14 * u));
    ctx.fillStyle = scene.colors.muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const bottom = this.logoBaseline() + 56 * u;
    lines.forEach((line, i) => {
      const y = bottom - (lines.length - 1 - i) * 19 * u;
      ctx.fillText(this.ellipsize(line, scene.width - 2 * this.pad), scene.width / 2, y);
    });
  }

  private drawElevation(profile: ElevationProfile, box: Box): void {
    const { ctx, u } = this;
    const { samples, min, max } = profile;
    const span = max - min || 1;
    const x = (i: number) => box.x + (i / (samples.length - 1)) * box.width;
    const y = (v: number) => box.y + box.height - ((v - min) / span) * box.height;

    this.noShadow();
    ctx.beginPath();
    ctx.moveTo(box.x, box.y + box.height);
    samples.forEach((v, i) => ctx.lineTo(x(i), y(v)));
    ctx.lineTo(box.x + box.width, box.y + box.height);
    ctx.closePath();
    const fill = ctx.createLinearGradient(0, box.y, 0, box.y + box.height);
    fill.addColorStop(0, this.accent.toRgba(0.38));
    fill.addColorStop(1, this.accent.toRgba(0.02));
    ctx.fillStyle = fill;
    ctx.fill();

    ctx.beginPath();
    samples.forEach((v, i) => (i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v))));
    ctx.strokeStyle = this.accent.toRgba(0.9);
    ctx.lineWidth = 3 * u;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Video: a dot riding along the profile shows where the flyover is
    const marker = this.scene.elevationMarker;
    if (marker !== undefined) {
      const i = Math.round(Math.max(0, Math.min(1, marker)) * (samples.length - 1));
      ctx.fillStyle = this.accent.toRgba(0.25);
      ctx.fillRect(x(i) - 1 * u, box.y, 2 * u, box.height);
      ctx.beginPath();
      ctx.arc(x(i), y(samples[i]!), 9 * u, 0, Math.PI * 2);
      ctx.fillStyle = this.scene.colors.accent;
      ctx.fill();
      ctx.lineWidth = 3 * u;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    }
  }

  private drawStats(layout: StatsLayout, divider: number): void {
    const { ctx, u, pad, scene } = this;
    ctx.globalAlpha = scene.statsOpacity ?? 1;
    ctx.fillStyle = Color.parse(scene.colors.muted).toRgba(0.4);
    ctx.fillRect(pad, divider, scene.width - 2 * pad, 2 * u);
    this.textShadow();

    const { stats, columns, columnWidth } = layout;
    const step = columnWidth + STAT_GAP * u;
    // A lone stat or a short last row (e.g. 3 + 2) looks balanced only when centered
    const centered = stats.length % columns !== 0 || stats.length === 1;

    stats.forEach((stat, i) => {
      const column = i % columns;
      const row = Math.floor(i / columns);
      const inRow = Math.min(columns, stats.length - row * columns);
      const rowShift = ((columns - inRow) * step) / 2;
      const x = pad + rowShift + column * step;
      const top = layout.top + row * layout.rowHeight;

      this.setLabelFont(layout.labelSize);
      ctx.fillStyle = scene.colors.muted;
      ctx.textAlign = centered ? 'center' : 'left';
      ctx.textBaseline = 'top';
      const label = this.ellipsize(stat.label.toLocaleUpperCase(), columnWidth);
      ctx.fillText(label, centered ? x + columnWidth / 2 : x, top);

      const baseline = top + layout.labelSize + 14 * u + layout.valueSize * 0.74;
      const valueX = centered ? x + (columnWidth - this.valueWidth(stat, layout.valueSize)) / 2 : x;
      this.drawValue(stat, valueX, baseline, layout.valueSize, scene.colors.text);
    });
    ctx.globalAlpha = 1;
  }

  private drawLogo(name: string): void {
    const { ctx, u, scene } = this;
    const baseline = this.logoBaseline();
    this.textShadow();
    this.setFont(PosterFonts.css(LOGO_FONT, 38 * u));
    ctx.fillStyle = scene.colors.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const text = name.toLocaleUpperCase();
    const width = ctx.measureText(text).width;
    // Centered horizontally, at the bottom of the safe area
    const x = (scene.width - width) / 2;
    ctx.fillText(text, x, baseline);

    // Underline drawn like a route: ring at the start, dot at the finish
    const y = baseline + 12 * u;
    ctx.strokeStyle = scene.colors.accent;
    ctx.lineWidth = 3 * u;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + 4 * u, y);
    ctx.quadraticCurveTo(x + width * 0.5, y - 5 * u, x + width, y + 1 * u);
    ctx.stroke();
    ctx.fillStyle = scene.colors.accent;
    ctx.beginPath();
    ctx.arc(x + width, y + 1 * u, 4 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2.5 * u;
    ctx.beginPath();
    ctx.arc(x + 4 * u, y, 4 * u, 0, Math.PI * 2);
    ctx.stroke();
  }

  /** The logo sits at the bottom edge of the safe area. */
  private logoBaseline(): number {
    return this.scene.height - this.padBottom - 16 * this.u;
  }

  // ── Text helpers ──────────────────────────────────────────────────────

  /** Big number with a smaller unit after it, sharing the baseline. */
  private drawValue(
    stat: PosterStat,
    x: number,
    baseline: number,
    size: number,
    color: string,
  ): void {
    const { ctx, scene } = this;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    this.setFont(PosterFonts.css(this.font.value, size));
    ctx.fillStyle = color;
    const valueWidth = this.fillNumber(stat.value, x, baseline);
    if (!stat.unit) return;

    this.setFont(PosterFonts.css(this.font.value, size * 0.4));
    ctx.fillStyle = scene.colors.muted;
    ctx.fillText(stat.unit, x + valueWidth + size * 0.08, baseline);
  }

  /** Stat label style; letter spacing grows with the size. */
  private setLabelFont(size: number): void {
    this.setFont(PosterFonts.css(this.font.label, size), size * 0.125);
  }

  private labelWidth(label: string, size: number): number {
    this.setLabelFont(size);
    return this.ctx.measureText(label.toLocaleUpperCase()).width;
  }

  /** On a sticker or a background photo the text sits on busy pixels; a soft shadow keeps it readable. */
  private textShadow(): void {
    if (!this.scene.transparent && !this.scene.photo) return this.noShadow();
    this.ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    this.ctx.shadowBlur = 16 * this.u;
    this.ctx.shadowOffsetY = 2 * this.u;
  }

  private noShadow(): void {
    this.ctx.shadowBlur = 0;
    this.ctx.shadowOffsetY = 0;
    this.ctx.shadowColor = 'transparent';
  }

  private valueWidth(stat: PosterStat, size: number): number {
    this.setFont(PosterFonts.css(this.font.value, size));
    let width = this.numberWidth(stat.value);
    if (stat.unit) {
      this.setFont(PosterFonts.css(this.font.value, size * 0.4));
      width += size * 0.08 + this.ctx.measureText(stat.unit).width;
    }
    return width;
  }

  /**
   * Counters on video use equal-width digits (like a stopwatch): most fonts draw a "1"
   * narrower than an "8", which would make a ticking number wobble. Images keep the font's
   * own spacing.
   */
  private get tabularDigits(): boolean {
    return this.scene.statsSizing !== undefined;
  }

  /** Width of a number in the current font. */
  private numberWidth(text: string): number {
    if (!this.tabularDigits) return this.ctx.measureText(text).width;
    const slot = this.digitSlot();
    let width = 0;
    for (const char of text) width += /\d/.test(char) ? slot : this.ctx.measureText(char).width;
    return width;
  }

  /** Draws a number in the current font; returns its width. */
  private fillNumber(text: string, x: number, baseline: number): number {
    const { ctx } = this;
    if (!this.tabularDigits) {
      ctx.fillText(text, x, baseline);
      return ctx.measureText(text).width;
    }
    const slot = this.digitSlot();
    let at = x;
    for (const char of text) {
      const width = ctx.measureText(char).width;
      const cell = /\d/.test(char) ? slot : width;
      // Each digit centered in its equal-width cell
      ctx.fillText(char, at + (cell - width) / 2, baseline);
      at += cell;
    }
    return at - x;
  }

  /** The widest digit of the current font. */
  private digitSlot(): number {
    let widest = 0;
    for (const digit of '0123456789') widest = Math.max(widest, this.ctx.measureText(digit).width);
    return widest;
  }

  /** Greedy word wrap at the given title size. */
  private wrap(text: string, size: number, maxWidth: number): string[] {
    this.setFont(PosterFonts.css(this.font.title, size));
    const lines: string[] = [];
    let line = '';
    for (const word of text.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && this.ctx.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  /** Shortens text with "…" to fit the width, using the current font. Never splits an emoji. */
  private ellipsize(text: string, maxWidth: number): string {
    if (this.ctx.measureText(text).width <= maxWidth) return text;
    const chars = Graphemes.split(text);
    let end = chars.length;
    const cut = () => chars.slice(0, end).join('').trimEnd() + '…';
    while (end > 1 && this.ctx.measureText(cut()).width > maxWidth) end--;
    return cut();
  }

  private setFont(font: string, letterSpacing = 0): void {
    this.ctx.font = font;
    // Not supported everywhere yet; without it the text is just a bit tighter
    if ('letterSpacing' in this.ctx) this.ctx.letterSpacing = `${letterSpacing}px`;
  }

  private tracePath(points: ScreenPoint[]): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(points[0]!.x, points[0]!.y);
    for (let i = 1; i < points.length; i++) {
      const p = points[i]!;
      if (p.newSegment) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
  }
}
