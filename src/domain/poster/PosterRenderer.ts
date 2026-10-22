import type { ElevationProfile } from '../route/ElevationProfile';
import type { Box, ScreenPoint } from '../route/RouteShape';
import { Color } from './Color';
import type { PosterScene, PosterStat } from './PosterScene';

const BASE_WIDTH = 1080;
const DISPLAY_FONT = '"Barlow Condensed", "Arial Narrow", sans-serif';
const BODY_FONT = 'Inter, system-ui, sans-serif';

interface TitleLayout {
  lines: string[];
  size: number;
  bottom: number;
}

interface StatsLayout {
  stats: PosterStat[];
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
  /** Font faces the poster uses; load them before the first render. */
  static readonly FONT_FACES = [
    `italic 800 100px ${DISPLAY_FONT}`,
    `700 100px ${DISPLAY_FONT}`,
    `600 100px ${BODY_FONT}`,
  ];

  private readonly u: number;
  private readonly pad: number;
  private readonly accent: Color;

  private constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly scene: PosterScene,
  ) {
    this.u = scene.width / BASE_WIDTH;
    this.pad = 80 * this.u;
    this.accent = Color.parse(scene.colors.accent);
  }

  /** Resolves when the fonts (including Hungarian accented letters) are ready to draw. */
  static async loadFonts(): Promise<void> {
    await Promise.all(
      PosterRenderer.FONT_FACES.map((f) => document.fonts.load(f, 'ÁÉŐŰáéőű 0123')),
    );
  }

  static render(canvas: HTMLCanvasElement, scene: PosterScene): void {
    canvas.width = scene.width;
    canvas.height = scene.height;
    const ctx = canvas.getContext('2d');
    if (ctx) new PosterRenderer(ctx, scene).draw();
  }

  private draw(): void {
    const layout = this.layout();
    this.drawBackground(layout.middle);
    this.drawHeader(layout.title);
    if (this.scene.route) this.drawRoute(layout.middle);
    else if (layout.hero) this.drawHero(layout.hero, layout.middle);
    if (layout.elevation && this.scene.elevation) {
      this.drawElevation(this.scene.elevation, layout.elevation);
    }
    if (layout.stats) this.drawStats(layout.stats, layout.divider!);
    if (this.scene.logo) this.drawLogo(this.scene.logo);
  }

  // ── Layout ────────────────────────────────────────────────────────────

  private layout(): Layout {
    const { u, pad, scene } = this;
    const isStory = scene.height / scene.width > 1.5;
    const title = this.layoutTitle(isStory);

    const hero = scene.route ? undefined : scene.stats[0];
    const gridStats = hero ? scene.stats.slice(1) : scene.stats;
    const bottom = scene.logo ? scene.height - 150 * u : scene.height - pad;
    const stats = gridStats.length > 0 ? this.layoutStats(gridStats, bottom, isStory) : undefined;
    const divider = stats ? stats.top - 40 * u : undefined;

    const middleTop = title.bottom + 56 * u;
    let middleBottom = (divider ?? bottom) - 56 * u;

    // The profile only fits when the route keeps enough room
    let elevation: Box | undefined;
    if (scene.elevation) {
      const height = (isStory ? 150 : 100) * u;
      const remaining = middleBottom - height - 40 * u - middleTop;
      if (remaining >= scene.height * 0.26) {
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
    const top = scene.eyebrow ? pad + 26 * u + 22 * u : pad;
    const text = scene.title.toLocaleUpperCase();
    const max = (isStory ? 136 : 112) * u;
    const min = 60 * u;

    let size = max;
    let lines = this.wrap(text, size, maxWidth);
    while (lines.length > 2 && size > min) {
      size -= 4 * u;
      lines = this.wrap(text, size, maxWidth);
    }
    if (lines.length > 2) lines = [lines[0]!, this.ellipsize(lines.slice(1).join(' '), maxWidth)];
    return { lines, size, bottom: top + lines.length * size * 0.92 };
  }

  private layoutStats(stats: PosterStat[], bottom: number, isStory: boolean): StatsLayout {
    const { u, pad, scene } = this;
    const columns = isStory && stats.length === 4 ? 2 : stats.length;
    const rows = Math.ceil(stats.length / columns);
    const gap = 32 * u;
    const columnWidth = (scene.width - 2 * pad - (columns - 1) * gap) / columns;

    // Shrink labels and numbers until the widest one fits its column
    let labelSize = 24 * u;
    for (const stat of stats) {
      const width = this.labelWidth(stat.label, labelSize);
      if (width > columnWidth) labelSize = Math.max(17 * u, (labelSize * columnWidth) / width);
    }
    let valueSize = (columns <= 2 ? 120 : 96) * u;
    for (const stat of stats) {
      const width = this.valueWidth(stat, valueSize);
      if (width > columnWidth) valueSize *= columnWidth / width;
    }

    const rowHeight = labelSize + 14 * u + valueSize * 0.74;
    const rowGap = 56 * u;
    const top = bottom - rows * rowHeight - (rows - 1) * rowGap;
    return {
      stats,
      columns,
      columnWidth,
      labelSize,
      valueSize,
      rowHeight: rowHeight + rowGap,
      top,
    };
  }

  // ── Drawing ───────────────────────────────────────────────────────────

  private drawBackground(middle: Box): void {
    const { ctx, scene } = this;
    ctx.clearRect(0, 0, scene.width, scene.height);
    if (scene.transparent) return;

    const [from, to] = scene.colors.background;
    const gradient = ctx.createLinearGradient(0, 0, scene.width, scene.height);
    gradient.addColorStop(0, from);
    gradient.addColorStop(1, to);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, scene.width, scene.height);

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

    let y = pad;
    if (scene.eyebrow) {
      this.setFont(`600 ${26 * u}px ${BODY_FONT}`, 3 * u);
      ctx.fillStyle = scene.colors.accent;
      ctx.textBaseline = 'top';
      ctx.fillText(this.ellipsize(scene.eyebrow.toLocaleUpperCase(), maxWidth), pad, y);
      y += 26 * u + 22 * u;
    }

    this.setFont(`italic 800 ${title.size}px ${DISPLAY_FONT}`);
    ctx.fillStyle = scene.colors.text;
    ctx.textBaseline = 'alphabetic';
    title.lines.forEach((line, i) => {
      ctx.fillText(line, pad, y + title.size * 0.78 + i * title.size * 0.92);
    });
  }

  private drawRoute(middle: Box): void {
    const { ctx, u, scene } = this;
    const route = scene.route!;
    const width = scene.routeWidth * u;
    const inset = width * 2;
    const points = route.fitTo({
      x: middle.x + inset,
      y: middle.y + inset,
      width: middle.width - 2 * inset,
      height: middle.height - 2 * inset,
    });
    if (points.length < 2) return;

    this.noShadow();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = width;

    // Pass 1: the whole line in the accent color, with glow if the theme wants it
    if (scene.colors.glow) {
      ctx.shadowColor = this.accent.toRgba(0.65);
      ctx.shadowBlur = 36 * u;
    }
    ctx.strokeStyle = scene.colors.accent;
    this.tracePath(points);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Pass 2: gradient coloring, segment by segment
    if (route.hasValues) {
      const soft = Color.parse(scene.colors.accentSoft);
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1]!;
        const b = points[i]!;
        ctx.strokeStyle = soft.mix(this.accent, ((a.value ?? 0) + (b.value ?? 0)) / 2).toHex();
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    this.drawMarkers(points[0]!, points.at(-1)!, width);
  }

  /** Start: open ring, finish: filled dot (same as the logo). */
  private drawMarkers(start: ScreenPoint, finish: ScreenPoint, width: number): void {
    const { ctx, scene } = this;
    const ring = width * 1.3;

    ctx.fillStyle = scene.colors.accent;
    ctx.beginPath();
    ctx.arc(finish.x, finish.y, width * 1.15, 0, Math.PI * 2);
    ctx.fill();

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
    let size = 300 * u;
    const width = this.valueWidth(stat, size);
    if (width > middle.width) size *= middle.width / width;

    const cy = middle.y + middle.height / 2;
    this.textShadow();
    this.setFont(`600 ${30 * u}px ${BODY_FONT}`, 4 * u);
    ctx.fillStyle = scene.colors.muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(stat.label.toLocaleUpperCase(), cx, cy - size * 0.42);

    const total = this.valueWidth(stat, size);
    this.drawValue(stat, cx - total / 2, cy + size * 0.36, size, scene.colors.accent);
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
  }

  private drawStats(layout: StatsLayout, divider: number): void {
    const { ctx, u, pad, scene } = this;
    ctx.fillStyle = Color.parse(scene.colors.muted).toRgba(0.4);
    ctx.fillRect(pad, divider, scene.width - 2 * pad, 2 * u);
    this.textShadow();

    layout.stats.forEach((stat, i) => {
      const column = i % layout.columns;
      const row = Math.floor(i / layout.columns);
      const x = pad + column * (layout.columnWidth + 32 * u);
      const top = layout.top + row * layout.rowHeight;

      this.setLabelFont(layout.labelSize);
      ctx.fillStyle = scene.colors.muted;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(this.ellipsize(stat.label.toLocaleUpperCase(), layout.columnWidth), x, top);

      const baseline = top + layout.labelSize + 14 * u + layout.valueSize * 0.74;
      this.drawValue(stat, x, baseline, layout.valueSize, scene.colors.text);
    });
  }

  private drawLogo(name: string): void {
    const { ctx, u, pad, scene } = this;
    const baseline = scene.height - 66 * u;
    this.textShadow();
    this.setFont(`italic 800 ${38 * u}px ${DISPLAY_FONT}`);
    ctx.fillStyle = scene.colors.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const text = name.toLocaleUpperCase();
    ctx.fillText(text, pad, baseline);

    // Underline drawn like a route: ring at the start, dot at the finish
    const width = ctx.measureText(text).width;
    const y = baseline + 12 * u;
    ctx.strokeStyle = scene.colors.accent;
    ctx.lineWidth = 3 * u;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pad + 4 * u, y);
    ctx.quadraticCurveTo(pad + width * 0.5, y - 5 * u, pad + width, y + 1 * u);
    ctx.stroke();
    ctx.fillStyle = scene.colors.accent;
    ctx.beginPath();
    ctx.arc(pad + width, y + 1 * u, 4 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2.5 * u;
    ctx.beginPath();
    ctx.arc(pad + 4 * u, y, 4 * u, 0, Math.PI * 2);
    ctx.stroke();
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
    this.setFont(`700 ${size}px ${DISPLAY_FONT}`);
    ctx.fillStyle = color;
    ctx.fillText(stat.value, x, baseline);
    if (!stat.unit) return;

    const valueWidth = ctx.measureText(stat.value).width;
    this.setFont(`700 ${size * 0.4}px ${DISPLAY_FONT}`);
    ctx.fillStyle = scene.colors.muted;
    ctx.fillText(stat.unit, x + valueWidth + size * 0.08, baseline);
  }

  /** Stat label style; letter spacing grows with the size. */
  private setLabelFont(size: number): void {
    this.setFont(`600 ${size}px ${BODY_FONT}`, size * 0.125);
  }

  private labelWidth(label: string, size: number): number {
    this.setLabelFont(size);
    return this.ctx.measureText(label.toLocaleUpperCase()).width;
  }

  /** On a transparent sticker the text sits on an unknown photo; a soft shadow keeps it readable. */
  private textShadow(): void {
    if (!this.scene.transparent) return this.noShadow();
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
    this.setFont(`700 ${size}px ${DISPLAY_FONT}`);
    let width = this.ctx.measureText(stat.value).width;
    if (stat.unit) {
      this.setFont(`700 ${size * 0.4}px ${DISPLAY_FONT}`);
      width += size * 0.08 + this.ctx.measureText(stat.unit).width;
    }
    return width;
  }

  /** Greedy word wrap at the given title size. */
  private wrap(text: string, size: number, maxWidth: number): string[] {
    this.setFont(`italic 800 ${size}px ${DISPLAY_FONT}`);
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

  /** Shortens text with "…" to fit the width, using the current font. */
  private ellipsize(text: string, maxWidth: number): string {
    if (this.ctx.measureText(text).width <= maxWidth) return text;
    let end = text.length;
    while (end > 1 && this.ctx.measureText(text.slice(0, end) + '…').width > maxWidth) end--;
    return text.slice(0, end).trimEnd() + '…';
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
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]!.x, points[i]!.y);
  }
}
