import type { Activity } from '../activity/Activity';
import type { TrackPoint } from '../activity/TrackPoint';
import { haversine } from '../stats/geo';
import { PrivacyZone } from './PrivacyZone';
import { RouteSimplifier } from './RouteSimplifier';

/** What the route line color follows. */
export type RouteColoring = 'solid' | 'speed' | 'elevation' | 'heartRate';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A route in geographic coordinates, already privacy-trimmed and simplified. */
export interface GeoRoute {
  /** [longitude, latitude] pairs, as maps expect them */
  coordinates: [number, number][];
  /** Meters above sea level, where recorded */
  elevations: (number | undefined)[];
  /** Meters along the route from its (trimmed) start */
  distances: number[];
  /** Epoch ms per point, where recorded (for live time counters) */
  times: (number | undefined)[];
  /** Meters of the activity hidden before the trimmed start (the privacy zone) */
  startDistance: number;
  /** 0…1 per point for gradient coloring */
  values?: number[];
}

export interface ScreenPoint {
  x: number;
  y: number;
  /** 0 (low) … 1 (high) for gradient coloring; undefined when the line is a single color */
  value?: number;
  /** Starts a new piece of line (the route was hidden in between, e.g. behind the camera) */
  newSegment?: boolean;
}

/** Simplification tolerance as a share of the route's size (~1 px on a 1000 px drawing). */
const SIMPLIFY_RATIO = 0.001;
/** Finer tolerance for map use (~4 m on a 20 km route), where the camera can come close. */
const GEO_SIMPLIFY_RATIO = 0.0002;
/** Points on each side used to smooth speed for coloring. */
const SPEED_SMOOTHING = 5;

/**
 * A route ready to draw: privacy-trimmed, projected (Web Mercator, north up) and simplified.
 * Coordinates are in projection units; fitTo() scales them into a drawing box.
 */
export class RouteShape {
  private constructor(
    private readonly xs: number[],
    private readonly ys: number[],
    private readonly values: number[] | undefined,
    /** The same route in geographic coordinates, for maps */
    readonly geo: GeoRoute,
  ) {}

  static fromActivity(
    activity: Activity,
    privacy: PrivacyZone,
    coloring: RouteColoring,
  ): RouteShape | undefined {
    const gps = activity.points.filter((p) => p.lat !== undefined && p.lon !== undefined);
    const distances = RouteShape.cumulativeDistances(gps);
    const range = privacy.keepRange(distances);
    if (!range) return undefined;

    const points = gps.slice(range[0], range[1] + 1);
    const metric = RouteShape.metric(points, distances.slice(range[0], range[1] + 1), coloring);
    const xs = points.map((p) => RouteShape.mercatorX(p.lon!));
    const ys = points.map((p) => RouteShape.mercatorY(p.lat!));

    const size = Math.max(RouteShape.extent(xs), RouteShape.extent(ys));
    const kept = RouteSimplifier.simplify(xs, ys, size * SIMPLIFY_RATIO);
    const values = metric && RouteShape.normalize(kept.map((i) => metric[i]!));

    // Maps zoom in close (3D flyover), so they get a much finer version of the same line
    const start = distances[range[0]]!;
    const keptGeo = RouteSimplifier.simplify(xs, ys, size * GEO_SIMPLIFY_RATIO);
    const geo: GeoRoute = {
      coordinates: keptGeo.map((i) => [points[i]!.lon!, points[i]!.lat!]),
      elevations: keptGeo.map((i) => points[i]!.ele),
      distances: keptGeo.map((i) => distances[range[0] + i]! - start),
      times: keptGeo.map((i) => points[i]!.time),
      startDistance: start,
      values: metric && RouteShape.normalize(keptGeo.map((i) => metric[i]!)),
    };

    return new RouteShape(
      kept.map((i) => xs[i]!),
      kept.map((i) => ys[i]!),
      values,
      geo,
    );
  }

  get pointCount(): number {
    return this.xs.length;
  }

  get hasValues(): boolean {
    return this.values !== undefined;
  }

  /** Scales the route into the box, centered, keeping its proportions. */
  fitTo(box: Box): ScreenPoint[] {
    const [minX, maxX] = RouteShape.bounds(this.xs);
    const [minY, maxY] = RouteShape.bounds(this.ys);
    const width = maxX - minX || 1;
    const height = maxY - minY || 1;
    const scale = Math.min(box.width / width, box.height / height);
    const offsetX = box.x + (box.width - width * scale) / 2;
    const offsetY = box.y + (box.height - height * scale) / 2;
    return this.xs.map((x, i) => ({
      x: offsetX + (x - minX) * scale,
      y: offsetY + (this.ys[i]! - minY) * scale,
      value: this.values?.[i],
    }));
  }

  /** The first `share` of a line by its length, ending exactly there (the head of the route). */
  static cut(points: ScreenPoint[], share: number): ScreenPoint[] {
    const lengths = [0];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!;
      const b = points[i]!;
      lengths.push(lengths[i - 1]! + Math.hypot(b.x - a.x, b.y - a.y));
    }
    const target = lengths.at(-1)! * Math.max(0, Math.min(1, share));
    const kept: ScreenPoint[] = [points[0]!];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!;
      const b = points[i]!;
      if (lengths[i]! <= target) {
        kept.push(b);
        continue;
      }
      const k = (target - lengths[i - 1]!) / (lengths[i]! - lengths[i - 1]! || 1);
      kept.push({ ...b, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
      break;
    }
    return kept;
  }

  private static cumulativeDistances(points: readonly TrackPoint[]): number[] {
    const result = [0];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!;
      const b = points[i]!;
      result.push(result[i - 1]! + haversine(a.lat!, a.lon!, b.lat!, b.lon!));
    }
    return result;
  }

  /** Raw value per point for the chosen coloring; gaps are filled with the previous value. */
  private static metric(
    points: readonly TrackPoint[],
    distances: readonly number[],
    coloring: RouteColoring,
  ): number[] | undefined {
    let raw: (number | undefined)[];
    if (coloring === 'speed') raw = RouteShape.smoothedSpeed(points, distances);
    else if (coloring === 'elevation') raw = points.map((p) => p.ele);
    else if (coloring === 'heartRate') raw = points.map((p) => p.heartRate || undefined);
    else return undefined;

    const firstKnown = raw.find((v) => v !== undefined);
    if (firstKnown === undefined) return undefined;
    let last = firstKnown;
    return raw.map((v) => (last = v ?? last));
  }

  private static smoothedSpeed(
    points: readonly TrackPoint[],
    distances: readonly number[],
  ): (number | undefined)[] {
    return points.map((_, i) => {
      const a = Math.max(0, i - SPEED_SMOOTHING);
      const b = Math.min(points.length - 1, i + SPEED_SMOOTHING);
      const t0 = points[a]!.time;
      const t1 = points[b]!.time;
      if (t0 === undefined || t1 === undefined || t1 <= t0) return undefined;
      return ((distances[b]! - distances[a]!) * 1000) / (t1 - t0);
    });
  }

  /** Maps values to 0…1 between the 5th and 95th percentile, so outliers don't flatten the colors. */
  private static normalize(values: number[]): number[] {
    const sorted = [...values].sort((a, b) => a - b);
    const low = sorted[Math.floor(sorted.length * 0.05)]!;
    const high = sorted[Math.floor(sorted.length * 0.95)]!;
    const span = high - low || 1;
    return values.map((v) => Math.max(0, Math.min(1, (v - low) / span)));
  }

  private static mercatorX(lon: number): number {
    return (lon * Math.PI) / 180;
  }

  /** Negated so north points up on screen. */
  private static mercatorY(lat: number): number {
    return -Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  }

  private static extent(values: readonly number[]): number {
    const [min, max] = RouteShape.bounds(values);
    return max - min;
  }

  /** Loop instead of Math.min(...values): spreading huge arrays overflows the argument limit. */
  private static bounds(values: readonly number[]): [number, number] {
    let min = Infinity;
    let max = -Infinity;
    for (const v of values) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return [min, max];
  }
}
