import type { GeoRoute } from '../route/RouteShape';
import { haversine } from '../stats/geo';

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
/** Points of the precomputed ground track along the route. */
const TRACK_STEPS = 800;
/**
 * The follow camera doesn't turn with the route: seen from this far, the whole map would
 * swing with it (a loop route means a full turn). It drifts slowly around north instead,
 * this many degrees in all, like the north-up still image.
 */
const FOLLOW_DRIFT = 40;
const FOLLOW_PITCH = 62;
const OVERVIEW_PITCH = 38;
const END_PITCH = 50;
/** The camera's ground height is averaged over at most this share of the route, each side. */
const GROUND_WINDOW_MAX = 0.15;
/** Moments checked when picking warm-up shots. */
const WARM_UP_STEPS = 600;
/**
 * How much the view may change before the next warm-up shot: moved by this share of the camera
 * distance, zoomed by this many zoom levels, turned or tilted by this many degrees.
 */
const WARM_UP_CHANGE = { moved: 0.12, zoomed: 0.18, turned: 12, tilted: 5 };
/** The chase camera is this much closer than the still image's view of the whole route. */
const FOLLOW_ZOOM = 1.18;
/** Opening and ending shots are at least this much further away than the chase camera. */
const PULL_BACK = 1.25;
/** The ending circles this far around the route while pulling back, degrees. */
const END_ORBIT = 70;
/** While the finished route is shown, the camera keeps drifting around it this far, degrees. */
const HOLD_ORBIT = 12;

/**
 * Camera choreography for a route flyover: intro (overview → start), follow (the camera
 * glides along with the route's head, drifting slowly around north), outro (pull back and
 * orbit), and a hold on the finished route.
 * shotAt(t) gives the camera for any moment t ∈ [0, 1], so frames can be rendered in any order.
 */
export class FlyoverPath {
  static readonly INTRO_END = 0.12;
  static readonly OUTRO_START = 0.74;
  /** From here the whole finished route is on screen until the end */
  static readonly HOLD_START = 0.9;
  /** Fixed tilt of still images (north up) */
  static readonly STILL_PITCH = 50;

  private readonly total: number;
  private readonly center: [number, number];
  /** Size of the route's bounding box on the ground, meters */
  private readonly extentWidth: number;
  private readonly extentHeight: number;
  private readonly overviewDistance: number;
  private readonly chaseDistance: number;
  /** Smoothed ground height under the camera's target, TRACK_STEPS + 1 values */
  private readonly ground: number[];
  /** Average ground height, for shots of the whole route */
  private readonly meanGround: number;

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
    // Far enough to see the area around the route, a bit closer than the still image
    const still = this.fitDistance(FlyoverPath.STILL_PITCH, 0, share) * 1.2;
    this.chaseDistance = Math.max(closest, still / FOLLOW_ZOOM);
    this.overviewDistance = Math.max(
      this.fitDistance(OVERVIEW_PITCH, 0, share) * 1.2,
      this.chaseDistance * PULL_BACK,
    );
    this.ground = this.computeGround();
    this.meanGround = this.ground.reduce((sum, h) => sum + h, 0) / this.ground.length;
  }

  get length(): number {
    return this.total;
  }

  shotAt(t: number): CameraShot {
    const { INTRO_END, OUTRO_START, HOLD_START } = FlyoverPath;
    if (t < INTRO_END) {
      return FlyoverPath.blend(this.overviewShot(), this.followShot(0), ease(t / INTRO_END));
    }
    if (t < OUTRO_START) {
      return this.followShot(easeSine((t - INTRO_END) / (OUTRO_START - INTRO_END)));
    }
    if (t < HOLD_START) {
      return FlyoverPath.blend(
        this.followShot(1),
        this.endShot(0),
        ease((t - OUTRO_START) / (HOLD_START - OUTRO_START)),
      );
    }
    // The finished route stays in view; a slow drift (starting from rest) keeps it alive
    const hold = Math.min(1, (t - HOLD_START) / (1 - HOLD_START));
    return this.endShot(HOLD_ORBIT * hold * hold);
  }

  /**
   * Shots that together show everything the flight will show, for loading the map ahead:
   * a new one whenever the view has changed noticeably since the last (moved, zoomed, turned
   * or tilted). Where the views overlap a lot, far fewer than evenly spaced ones.
   */
  warmUpShots(): CameraShot[] {
    const shots = [this.shotAt(0)];
    for (let i = 1; i <= WARM_UP_STEPS; i++) {
      const shot = this.shotAt(i / WARM_UP_STEPS);
      const last = shots.at(-1)!;
      const moved =
        haversine(last.target[1], last.target[0], shot.target[1], shot.target[0]) /
        Math.min(last.distance, shot.distance);
      const zoomed = Math.abs(Math.log2(shot.distance / last.distance));
      const turned = Math.abs(((shot.bearing - last.bearing + 540) % 360) - 180);
      const tilted = Math.abs(shot.pitch - last.pitch);
      const changed =
        moved > WARM_UP_CHANGE.moved ||
        zoomed > WARM_UP_CHANGE.zoomed ||
        turned > WARM_UP_CHANGE.turned ||
        tilted > WARM_UP_CHANGE.tilted;
      if (changed || i === WARM_UP_STEPS) shots.push(shot);
    }
    return shots;
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

  /** Height the camera aims at, from the precomputed smooth ground track. */
  private groundAt(progress: number): number {
    const position = Math.max(0, Math.min(1, progress)) * TRACK_STEPS;
    const i = Math.min(Math.floor(position), TRACK_STEPS - 1);
    return this.ground[i]! + (this.ground[i + 1]! - this.ground[i]!) * (position - i);
  }

  /** Compass direction of the follow camera: a slow, even drift across north. */
  private followBearing(progress: number): number {
    return (FOLLOW_DRIFT * (progress - 0.5) + 360) % 360;
  }

  /**
   * Recorded elevation is noisy (several meters from one point to the next), and terrain
   * exaggeration multiplies it: followed directly, it makes the whole view bob up and down.
   * Averaged over about the stretch the camera sees, big hills still lift it, noise doesn't.
   */
  private computeGround(): number[] {
    let values = Array.from({ length: TRACK_STEPS + 1 }, (_, i) =>
      this.elevationAt(i / TRACK_STEPS),
    );
    const share = this.total > 0 ? Math.min(GROUND_WINDOW_MAX, this.chaseDistance / this.total) : 0;
    const radius = Math.max(1, Math.round(share * TRACK_STEPS));
    // Three box blurs in a row: close to a bell-shaped (Gaussian) average
    for (let pass = 0; pass < 3; pass++) {
      values = values.map((_, i) => {
        const from = Math.max(0, i - radius);
        const to = Math.min(values.length - 1, i + radius);
        let sum = 0;
        for (let j = from; j <= to; j++) sum += values[j]!;
        return sum / (to - from + 1);
      });
    }
    return values;
  }

  private followShot(progress: number): CameraShot {
    return {
      target: this.pointAt(progress),
      targetElevation: this.groundAt(progress),
      distance: this.chaseDistance,
      bearing: this.followBearing(progress),
      pitch: FOLLOW_PITCH,
      progress,
    };
  }

  private overviewShot(): CameraShot {
    return {
      target: this.center,
      targetElevation: this.meanGround,
      distance: this.overviewDistance,
      bearing: (this.followBearing(0) - 25 + 360) % 360,
      pitch: OVERVIEW_PITCH,
      progress: 0,
    };
  }

  /** The whole route in view, `drift` degrees further around than the end of the orbit. */
  private endShot(drift: number): CameraShot {
    const bearing = this.followBearing(1) + END_ORBIT + drift;
    return {
      target: this.center,
      targetElevation: this.meanGround,
      distance: Math.max(
        this.fitDistance(END_PITCH, bearing, this.share) * 1.2,
        this.chaseDistance * PULL_BACK,
      ),
      bearing: (bearing + 360) % 360,
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
