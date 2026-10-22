import type { GeoRoute } from '../route/RouteShape';
import { bearing, haversine } from '../stats/geo';

/** Where the camera is at one moment of the flyover. Map-library independent. */
export interface CameraShot {
  /** Point the camera looks at, [lon, lat] */
  target: [number, number];
  /** Ground elevation at the target in meters (before terrain exaggeration) */
  targetElevation: number;
  /** Straight-line distance from camera to target, meters */
  distance: number;
  /** Compass direction the camera faces, degrees */
  bearing: number;
  /** Tilt from straight down, degrees (0 = top-down, 90 = horizon) */
  pitch: number;
  /** How much of the route is drawn so far, 0…1 by distance */
  progress: number;
}

/** Vertical field of view of the map camera (MapLibre's default), degrees. */
const FOV = 36.87;
const RAD = Math.PI / 180;
/** Points of the precomputed heading track along the route. */
const HEADING_STEPS = 800;
/** Stretch (share of the route, each side) giving the local direction of travel. */
const LOCAL_DIRECTION = 0.01;
/** How quickly the camera follows a change of direction, per track step (0…1). */
const HEADING_EASE = 0.06;
/** Turning speed cap per track step, degrees (a U-turn takes ≈3 s of video). */
const MAX_TURN_STEP = 0.8;
const FOLLOW_PITCH = 62;
const OVERVIEW_PITCH = 38;
const END_PITCH = 50;
/** The ending circles this far around the route while pulling back, degrees. */
const END_ORBIT = 70;

/**
 * Camera choreography for a route flyover:
 * intro (overview → start), follow (chase cam along the route), outro (pull back and orbit).
 * shotAt(t) gives the camera for any moment t ∈ [0, 1], so frames can be rendered in any order.
 */
export class FlyoverPath {
  static readonly INTRO_END = 0.12;
  static readonly OUTRO_START = 0.82;

  private readonly total: number;
  private readonly center: [number, number];
  /** Size of the route's bounding box on the ground, meters */
  private readonly extentWidth: number;
  private readonly extentHeight: number;
  private readonly overviewDistance: number;
  private readonly chaseDistance: number;
  /** Smoothed camera heading, unwrapped degrees, HEADING_STEPS + 1 values */
  private readonly headings: number[];

  /**
   * aspect = output width / height (portrait videos need the camera further away);
   * closest = how near the chase camera may come, meters;
   * share = part of the image height the whole route may fill in overview shots.
   */
  constructor(
    private readonly route: GeoRoute,
    private readonly aspect: number,
    closest = 450,
    private readonly share = 1,
  ) {
    this.total = route.distances.at(-1) ?? 0;
    const lons = route.coordinates.map((c) => c[0]);
    const lats = route.coordinates.map((c) => c[1]);
    const [minLon, maxLon] = [Math.min(...lons), Math.max(...lons)];
    const [minLat, maxLat] = [Math.min(...lats), Math.max(...lats)];
    this.center = [(minLon + maxLon) / 2, (minLat + maxLat) / 2];

    this.extentWidth = haversine(this.center[1], minLon, this.center[1], maxLon);
    this.extentHeight = haversine(minLat, this.center[0], maxLat, this.center[0]);
    this.overviewDistance = this.fitDistance(OVERVIEW_PITCH, 0, share) * 1.2;
    this.chaseDistance = Math.max(closest, Math.min(1200, this.total * 0.03));
    this.headings = this.computeHeadings();
  }

  get length(): number {
    return this.total;
  }

  shotAt(t: number): CameraShot {
    const { INTRO_END, OUTRO_START } = FlyoverPath;
    if (t < INTRO_END) {
      return FlyoverPath.blend(this.overviewShot(), this.followShot(0), ease(t / INTRO_END));
    }
    if (t < OUTRO_START) {
      return this.followShot(easeSine((t - INTRO_END) / (OUTRO_START - INTRO_END)));
    }
    return FlyoverPath.blend(
      this.followShot(1),
      this.endShot(),
      ease((t - OUTRO_START) / (1 - OUTRO_START)),
    );
  }

  /**
   * A still view of the whole route, for the image background.
   * `share` is the part of the image height the route may fill (the space between title and stats).
   */
  overview(pitch: number, bearing: number, share = 1): CameraShot {
    return {
      ...this.overviewShot(),
      // A little extra: in perspective the near end of the route looks bigger than the box
      distance: this.fitDistance(pitch, bearing, share) * 1.2,
      pitch,
      bearing,
      progress: 1,
    };
  }

  /**
   * Camera distance at which the route's bounding box just fits: its width across the whole
   * image, its depth within `share` of the image height. Seen at an angle, depth looks shorter.
   */
  private fitDistance(pitch: number, bearing: number, share: number): number {
    const b = bearing * RAD;
    // The box as seen when the map is rotated
    const across =
      Math.abs(this.extentWidth * Math.cos(b)) + Math.abs(this.extentHeight * Math.sin(b));
    const along =
      Math.abs(this.extentWidth * Math.sin(b)) + Math.abs(this.extentHeight * Math.cos(b));
    const depth = along * Math.max(Math.cos(pitch * RAD), 0.35);
    const visible = 2 * Math.tan((FOV / 2) * RAD); // visible image height per meter of distance
    return Math.max(
      across / (visible * this.aspect),
      depth / (visible * Math.max(0.1, share)),
      300,
    );
  }

  /** Index of the last point at or before `progress`, and how far it is to the next one (0…1). */
  locate(progress: number): { index: number; fraction: number } {
    const target = Math.max(0, Math.min(1, progress)) * this.total;
    const { distances } = this.route;
    let lo = 0;
    let hi = distances.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (distances[mid]! <= target) lo = mid;
      else hi = mid;
    }
    const span = distances[hi]! - distances[lo]!;
    return { index: lo, fraction: span > 0 ? (target - distances[lo]!) / span : 0 };
  }

  /**
   * The route drawn up to `progress`, ending exactly at the interpolated head point,
   * with the coloring values (0…1) per point when the route has them.
   */
  partialRoute(progress: number): { coordinates: [number, number][]; values?: number[] } {
    const { index } = this.locate(progress);
    const { coordinates, values } = this.route;
    return {
      coordinates: [...coordinates.slice(0, index + 1), this.pointAt(progress)],
      values: values && [...values.slice(0, index + 1), values[index]!],
    };
  }

  pointAt(progress: number): [number, number] {
    const { index, fraction } = this.locate(progress);
    const a = this.route.coordinates[index]!;
    const b = this.route.coordinates[Math.min(index + 1, this.route.coordinates.length - 1)]!;
    return [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
  }

  private elevationAt(progress: number): number {
    const { index, fraction } = this.locate(progress);
    const { elevations } = this.route;
    const a = elevations[index] ?? 0;
    const b = elevations[Math.min(index + 1, elevations.length - 1)] ?? a;
    return a + (b - a) * fraction;
  }

  /** Camera direction at `progress`, read from the precomputed smooth heading track. */
  private headingAt(progress: number): number {
    const position = Math.max(0, Math.min(1, progress)) * HEADING_STEPS;
    const i = Math.min(Math.floor(position), HEADING_STEPS - 1);
    const fraction = position - i;
    const heading = this.headings[i]! + (this.headings[i + 1]! - this.headings[i]!) * fraction;
    return ((heading % 360) + 360) % 360;
  }

  /**
   * The camera's heading along the whole route, computed once: the local direction of travel,
   * smoothed forwards and backwards with a cap on the turning speed. Hairpins and out-and-back
   * turns become a calm sweep instead of a snap, and every frame just reads from the track.
   */
  private computeHeadings(): number[] {
    const raw: number[] = [];
    for (let i = 0; i <= HEADING_STEPS; i++) {
      const p = i / HEADING_STEPS;
      const a = this.pointAt(Math.max(0, p - LOCAL_DIRECTION));
      const b = this.pointAt(Math.min(1, p + LOCAL_DIRECTION));
      const direction = bearing(a[1], a[0], b[1], b[0]);
      // Unwrapped, so 359° → 1° is a 2° step and not a 358° one
      const previous = raw[i - 1];
      raw.push(previous === undefined ? direction : previous + wrap(direction - previous));
    }
    const smooth = (values: number[]) => {
      const out = [values[0]!];
      for (let i = 1; i < values.length; i++) {
        const step = (values[i]! - out[i - 1]!) * HEADING_EASE;
        out.push(out[i - 1]! + Math.max(-MAX_TURN_STEP, Math.min(MAX_TURN_STEP, step)));
      }
      return out;
    };
    // Forward and backward passes averaged: smooth without lagging behind the route
    const forward = smooth(raw);
    const backward = smooth([...raw].reverse()).reverse();
    return forward.map((f, i) => (f + backward[i]!) / 2);
  }

  private followShot(progress: number): CameraShot {
    return {
      target: this.pointAt(progress),
      targetElevation: this.elevationAt(progress),
      distance: this.chaseDistance,
      bearing: this.headingAt(progress),
      pitch: FOLLOW_PITCH,
      progress,
    };
  }

  private overviewShot(): CameraShot {
    return {
      target: this.center,
      targetElevation: this.elevationAt(0.5),
      distance: this.overviewDistance,
      bearing: this.headingAt(0) - 25,
      pitch: OVERVIEW_PITCH,
      progress: 0,
    };
  }

  private endShot(): CameraShot {
    return {
      target: this.center,
      targetElevation: this.elevationAt(0.5),
      distance: this.fitDistance(END_PITCH, this.headingAt(1) + END_ORBIT, this.share) * 1.2,
      bearing: this.headingAt(1) + END_ORBIT,
      pitch: END_PITCH,
      progress: 1,
    };
  }

  /** Smooth transition between two shots: distance in log space (natural zoom), bearing the short way. */
  private static blend(a: CameraShot, b: CameraShot, k: number): CameraShot {
    const lerp = (x: number, y: number) => x + (y - x) * k;
    let turn = ((b.bearing - a.bearing + 540) % 360) - 180;
    if (turn === -180) turn = 180;
    return {
      target: [lerp(a.target[0], b.target[0]), lerp(a.target[1], b.target[1])],
      targetElevation: lerp(a.targetElevation, b.targetElevation),
      distance: Math.exp(lerp(Math.log(a.distance), Math.log(b.distance))),
      bearing: (a.bearing + turn * k + 360) % 360,
      pitch: lerp(a.pitch, b.pitch),
      progress: lerp(a.progress, b.progress),
    };
  }
}

/** Slow start and end (cubic). */
function ease(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Gentle start and end, nearly constant speed in the middle. */
function easeSine(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

/** Signed difference of two angles, in -180…180. */
function wrap(degrees: number): number {
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}
