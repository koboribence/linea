import type { Box } from '../route/RouteShape';
import { haversine } from '../stats/geo';
import type { PlaceLevel } from './MapStyles';

/** A named place from the map data. */
export interface Place {
  name: string;
  kind: PlaceLevel;
  /** Importance from the map data: lower is more important */
  rank: number;
  /** [lon, lat] */
  lngLat: [number, number];
}

/** A place at its position on the image. */
export interface ScreenPlace extends Place {
  x: number;
  y: number;
  /** The place the activity started from: always named when in view */
  start?: boolean;
}

/** A name to draw: where (center of the text), and how strongly. */
export interface PlaceLabel {
  name: string;
  kind: PlaceLevel;
  x: number;
  y: number;
  start: boolean;
  /** 0…1: names fade in and out near the edge of the map area */
  opacity: number;
}

/** Map feature properties as the vector tiles carry them. */
export interface PlaceFeature {
  name?: unknown;
  class?: unknown;
  rank?: unknown;
  lngLat: [number, number];
}

export interface LabelOptions {
  /** Smallest kind of place named (the start is named whatever it is) */
  level: PlaceLevel;
  /** Where names may go: between title and stats, away from the image edges */
  area: Box;
  /** Size of a name's box on the image */
  measure: (name: string, kind: PlaceLevel) => { width: number; height: number };
  /** Free space kept around each name */
  spacing: number;
  /** Width of the fade at the edges of the area */
  fade: number;
  /** The route on the image: names keep `clearance` away from its line (and its markers) */
  avoid?: { x: number; y: number; newSegment?: boolean }[];
  clearance?: number;
  /**
   * Only places within this distance of the route are named (the route's places, not the
   * area's); one kind smaller than `level` too, if within half of it
   */
  near?: number;
  /**
   * Video: what the previous frames showed, and this frame's time in seconds. Names then keep
   * their spot while it stays roughly free, and fade out and in rather than pop or jump.
   */
  memory?: PlaceMemory;
  time?: number;
}

/** A name as the previous frames left it: its spot around the place, and how visible it is. */
interface Remembered {
  spot: number;
  /** 0…1 */
  opacity: number;
  /** Still wanted: false while fading out */
  wanted: boolean;
}

type Segment = [ax: number, ay: number, bx: number, by: number];

const ORDER: Record<PlaceLevel, number> = { village: 0, town: 1, city: 2 };
/** At most this many names, by level: a wide area stays sparse. */
const MAX_LABELS: Record<PlaceLevel, number> = { village: 7, town: 6, city: 5 };
/** How far (in steps around its place) the start's name may move to find a free spot. */
const START_RINGS = 5;
/** The start place is the nearest named place within this distance of the start, meters. */
const START_RADIUS = 4000;
/** Seconds for a name to fade in or out on video. */
const FADE_SECONDS = 0.3;
/** Frames further apart than this (seconds) don't follow each other: a seek, or a new start. */
const MAX_STEP = 0.25;
/** A name already shown keeps its spot even if the route comes this much closer than usual. */
const KEEP_CLEARANCE = 0.5;
/** …and stays named while within this much more than the usual distance from the route. */
const KEEP_NEAR = 1.3;

/**
 * What a video remembers of its town names from frame to frame. Picking spots afresh each
 * frame makes names pop in and out and hop across the route as the camera turns; with this
 * they stay where they are while they can, and change only by fading out and back in.
 */
export class PlaceMemory {
  private readonly names = new Map<string, Remembered>();
  private time?: number;

  static key(place: Place): string {
    return `${place.name}|${place.kind}`;
  }

  /**
   * Seconds since the previous frame; undefined (and everything forgotten) when this frame
   * doesn't follow it, so names show at once instead of fading in after a seek. A redraw of
   * the same moment shows its choice at once too.
   */
  step(time: number): number | undefined {
    const dt = this.time === undefined ? undefined : time - this.time;
    this.time = time;
    if (dt === undefined || dt <= 0 || dt > MAX_STEP) {
      this.names.clear();
      return undefined;
    }
    return dt;
  }

  /** The spot a name is shown at, while it is still wanted there. */
  spotOf(key: string): number | undefined {
    const name = this.names.get(key);
    return name?.wanted ? name.spot : undefined;
  }

  /**
   * Moves every name towards this frame's choice: wanted ones fade in at their spot; one that
   * has to change spot first fades out, then comes back at the new one; names no longer
   * wanted fade out where they are. Without `dt` (no previous frame) the choice shows at once.
   */
  update(wanted: Map<string, number>, dt: number | undefined): ReadonlyMap<string, Remembered> {
    for (const [key, spot] of wanted) {
      if (!this.names.has(key)) {
        this.names.set(key, { spot, opacity: dt === undefined ? 1 : 0, wanted: true });
      }
    }
    const rate = (dt ?? 0) / FADE_SECONDS;
    for (const [key, name] of this.names) {
      const spot = wanted.get(key);
      name.wanted = spot !== undefined;
      if (spot === name.spot) name.opacity = Math.min(1, name.opacity + rate);
      else if (name.opacity > rate) name.opacity -= rate;
      else if (spot !== undefined) Object.assign(name, { spot, opacity: 0 });
      else this.names.delete(key);
    }
    return this.names;
  }
}

/**
 * Which town names appear on the map, and where. Drawn by the poster renderer rather than the
 * map, so names never stick out of the image, never sit under the title or the stats, stay
 * sparse on wide areas, and the start place is always named.
 */
export class PlaceLabels {
  /** Places from the map's features, each once (tiles repeat them). */
  static fromFeatures(features: PlaceFeature[]): Place[] {
    const places = new Map<string, Place>();
    for (const feature of features) {
      const kind = feature.class;
      if (kind !== 'city' && kind !== 'town' && kind !== 'village') continue;
      if (typeof feature.name !== 'string' || feature.name === '') continue;
      const key = `${feature.name}|${kind}`;
      if (places.has(key)) continue;
      const rank = typeof feature.rank === 'number' ? feature.rank : 99;
      places.set(key, { name: feature.name, kind, rank, lngLat: feature.lngLat });
    }
    return [...places.values()];
  }

  /** The named place nearest to where the activity started, if there is one close by. */
  static startPlace(places: Place[], start: [number, number]): Place | undefined {
    let best: Place | undefined;
    let bestDistance = START_RADIUS;
    for (const place of places) {
      const distance = haversine(start[1], start[0], place.lngLat[1], place.lngLat[0]);
      if (distance < bestDistance) {
        best = place;
        bestDistance = distance;
      }
    }
    return best;
  }

  /** One kind smaller: places right by the route may be named a level below the area's. */
  static widen(level: PlaceLevel): PlaceLevel {
    return level === 'city' ? 'town' : 'village';
  }

  /** The places worth projecting: big enough for the level, or the start. */
  static relevant(places: Place[], level: PlaceLevel, start?: Place): Place[] {
    return places.filter((place) => place === start || ORDER[place.kind] >= ORDER[level]);
  }

  /** Places paired with their projected points (same order); those out of view are dropped. */
  static onScreen(
    places: Place[],
    points: ({ x: number; y: number } | undefined)[],
    start?: Place,
  ): ScreenPlace[] {
    return places.flatMap((place, i) => {
      const point = points[i];
      return point ? [{ ...place, ...point, start: place === start }] : [];
    });
  }

  /**
   * The names to draw: the start first, then by importance (cities, towns, villages; then
   * the map's rank). Each name tries a few spots: on its place, then above, below, beside
   * it. A spot is taken only inside the area, clear of the route and of names placed before;
   * a name with no such spot is left out. The start is always named: pulled inside the area,
   * moved further from its place if needed, and as a last resort even over the route.
   */
  static choose(places: ScreenPlace[], options: LabelOptions): PlaceLabel[] {
    const { level, area, measure, spacing, fade, clearance = 0, near, memory } = options;
    const route = PlaceLabels.segments(options.avoid ?? []);
    const dt = memory && options.time !== undefined ? memory.step(options.time) : undefined;
    const shownAt = (place: Place) => memory?.spotOf(PlaceMemory.key(place));
    const shown = (place: Place) => shownAt(place) !== undefined;
    // Along the route: close enough to it, the smaller kind only very close
    const alongRoute = (place: ScreenPlace) => {
      if (place.start) return true;
      const smaller = ORDER[place.kind] < ORDER[level];
      if (smaller && ORDER[place.kind] < ORDER[PlaceLabels.widen(level)]) return false;
      if (near === undefined || route.length === 0) return !smaller;
      const distance = PlaceLabels.distanceTo(place, route);
      return distance <= (smaller ? near / 2 : near) * (shown(place) ? KEEP_NEAR : 1);
    };
    const ordered = places.filter(alongRoute).sort(
      (a, b) =>
        Number(Boolean(b.start)) - Number(Boolean(a.start)) ||
        // Names already on screen keep their place before new ones get one
        Number(shown(b)) - Number(shown(a)) ||
        ORDER[b.kind] - ORDER[a.kind] ||
        a.rank - b.rank ||
        a.name.localeCompare(b.name),
    );
    const placed: Box[] = [];
    const labels: (PlaceLabel & { key: string; spot: number })[] = [];
    for (const place of ordered) {
      if (labels.length >= MAX_LABELS[level] + (labels[0]?.start ? 1 : 0)) break;
      // The start may sit just outside (e.g. at the bottom edge): it is pulled in below
      const reach = place.start ? Math.max(area.width, area.height) * 0.08 : 0;
      if (!PlaceLabels.contains(PlaceLabels.grow(area, reach), place.x, place.y)) continue;
      const { width, height } = measure(place.name, place.kind);

      const spots = PlaceLabels.placeSpots(place, width, height, area);
      const boxAt = ({ x, y }: { x: number; y: number }) => ({
        x: x - width / 2,
        y: y - height / 2,
        width,
        height,
      });
      const free = (spot: { x: number; y: number }, clearOfRoute: boolean, keep = 1) => {
        const box = boxAt(spot);
        if (!PlaceLabels.inside(area, box)) return false;
        const padded = PlaceLabels.grow(box, spacing);
        if (placed.some((other) => PlaceLabels.overlap(padded, other))) return false;
        return (
          !clearOfRoute || !PlaceLabels.crosses(PlaceLabels.grow(box, clearance * keep), route)
        );
      };
      // A name on screen stays where it is while that's roughly free
      const before = spots[shownAt(place) ?? -1];
      const spot =
        (before && free(before, true, KEEP_CLEARANCE) ? before : undefined) ??
        spots.find((candidate) => free(candidate, true)) ??
        (place.start
          ? PlaceLabels.leastCovering(
              spots.filter((c) => free(c, false)),
              boxAt,
              route,
              clearance,
            )
          : undefined);
      if (!spot) continue;

      const box = boxAt(spot);
      placed.push(PlaceLabels.grow(box, spacing));
      labels.push({
        key: PlaceMemory.key(place),
        spot: spots.indexOf(spot),
        name: place.name,
        kind: place.kind,
        x: spot.x,
        y: spot.y,
        start: Boolean(place.start),
        opacity: PlaceLabels.edgeOpacity(area, box, fade),
      });
    }
    if (!memory)
      return labels.map(({ name, kind, x, y, start, opacity }) => ({
        name,
        kind,
        x,
        y,
        start,
        opacity,
      }));

    // Video: each name shows at the spot it is fading at, as visible as it has faded so far
    const names = memory.update(new Map(labels.map(({ key, spot }) => [key, spot])), dt);
    return places.flatMap((place) => {
      const name = names.get(PlaceMemory.key(place));
      if (!name || name.opacity <= 0) return [];
      const { width, height } = measure(place.name, place.kind);
      const spot = PlaceLabels.placeSpots(place, width, height, area)[name.spot];
      if (!spot) return [];
      const box = { x: spot.x - width / 2, y: spot.y - height / 2, width, height };
      const eased = name.opacity * name.opacity * (3 - 2 * name.opacity);
      const opacity = eased * PlaceLabels.edgeOpacity(area, box, fade);
      if (opacity <= 0) return [];
      return [
        { ...spot, name: place.name, kind: place.kind, start: Boolean(place.start), opacity },
      ];
    });
  }

  /** The spots a place's name may take, by index: the same spot keeps its index frame to frame. */
  private static placeSpots(
    place: ScreenPlace,
    width: number,
    height: number,
    area: Box,
  ): { x: number; y: number }[] {
    const spots = PlaceLabels.spots(place, width, height, place.start ? START_RINGS : 1);
    return place.start
      ? spots.map((spot) => PlaceLabels.pullInside(spot, width, height, area))
      : spots;
  }

  /**
   * A free spot (its center) for a box of this size near `anchor`: off the anchor itself,
   * then above, below, beside and diagonal, up to `rings` steps away. Free means inside
   * `area`, clear of the `taken` boxes and `clearance` away from the route.
   */
  static freeSpot(
    anchor: { x: number; y: number },
    width: number,
    height: number,
    options: {
      area: Box;
      taken: Box[];
      avoid?: { x: number; y: number; newSegment?: boolean }[];
      clearance?: number;
      rings: number;
    },
  ): { x: number; y: number } | undefined {
    const route = PlaceLabels.segments(options.avoid ?? []);
    const clearance = options.clearance ?? 0;
    return PlaceLabels.spots(anchor, width, height, options.rings)
      .slice(1)
      .find((spot) => {
        const box = { x: spot.x - width / 2, y: spot.y - height / 2, width, height };
        return (
          PlaceLabels.inside(options.area, box) &&
          !options.taken.some((other) => PlaceLabels.overlap(box, other)) &&
          !PlaceLabels.crosses(PlaceLabels.grow(box, clearance), route)
        );
      });
  }

  /** Where a name may go around its place: on it, then above, below, right, left; `rings` deep. */
  private static spots(
    place: { x: number; y: number },
    width: number,
    height: number,
    rings: number,
  ): { x: number; y: number }[] {
    const gap = height * 0.6;
    const spots = [{ x: place.x, y: place.y }];
    for (let ring = 1; ring <= rings; ring++) {
      const dy = ring * (height + gap);
      const dx = width / 2 + ring * gap * 1.5;
      spots.push(
        { x: place.x, y: place.y - dy },
        { x: place.x, y: place.y + dy },
        { x: place.x + dx, y: place.y },
        { x: place.x - dx, y: place.y },
        // Diagonals: often free where the route leaves its start straight up, down or sideways
        { x: place.x + dx, y: place.y - dy },
        { x: place.x - dx, y: place.y - dy },
        { x: place.x + dx, y: place.y + dy },
        { x: place.x - dx, y: place.y + dy },
      );
    }
    return spots;
  }

  /** Of the given spots, the one whose name covers the least of the route. */
  private static leastCovering(
    spots: { x: number; y: number }[],
    boxAt: (spot: { x: number; y: number }) => Box,
    route: Segment[],
    clearance: number,
  ): { x: number; y: number } | undefined {
    let best: { x: number; y: number } | undefined;
    let bestCount = Infinity;
    for (const spot of spots) {
      const box = PlaceLabels.grow(boxAt(spot), clearance);
      const count = route.filter((segment) => PlaceLabels.crosses(box, [segment])).length;
      if (count < bestCount) {
        best = spot;
        bestCount = count;
      }
    }
    return best;
  }

  private static pullInside(
    spot: { x: number; y: number },
    width: number,
    height: number,
    area: Box,
  ): { x: number; y: number } {
    return {
      x: Math.min(Math.max(spot.x, area.x + width / 2), area.x + area.width - width / 2),
      y: Math.min(Math.max(spot.y, area.y + height / 2), area.y + area.height - height / 2),
    };
  }

  /** The route's line as segments (gaps, where the route is hidden, are skipped). */
  private static segments(points: { x: number; y: number; newSegment?: boolean }[]): Segment[] {
    const segments: Segment[] = [];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!;
      const b = points[i]!;
      if (!b.newSegment) segments.push([a.x, a.y, b.x, b.y]);
    }
    if (points.length === 1)
      segments.push([points[0]!.x, points[0]!.y, points[0]!.x, points[0]!.y]);
    return segments;
  }

  /** Shortest distance from a point to the line. */
  private static distanceTo(point: { x: number; y: number }, segments: Segment[]): number {
    let best = Infinity;
    for (const [ax, ay, bx, by] of segments) {
      const dx = bx - ax;
      const dy = by - ay;
      const length = dx * dx + dy * dy;
      const t = length === 0 ? 0 : ((point.x - ax) * dx + (point.y - ay) * dy) / length;
      const k = Math.max(0, Math.min(1, t));
      best = Math.min(best, Math.hypot(point.x - (ax + k * dx), point.y - (ay + k * dy)));
    }
    return best;
  }

  /** Whether any segment touches the box (Liang–Barsky clipping). */
  private static crosses(box: Box, segments: Segment[]): boolean {
    const right = box.x + box.width;
    const bottom = box.y + box.height;
    return segments.some(([ax, ay, bx, by]) => {
      if (Math.max(ax, bx) < box.x || Math.min(ax, bx) > right) return false;
      if (Math.max(ay, by) < box.y || Math.min(ay, by) > bottom) return false;
      const dx = bx - ax;
      const dy = by - ay;
      let t0 = 0;
      let t1 = 1;
      const edges: [number, number][] = [
        [-dx, ax - box.x],
        [dx, right - ax],
        [-dy, ay - box.y],
        [dy, bottom - ay],
      ];
      for (const [p, q] of edges) {
        if (p === 0) {
          if (q < 0) return false;
          continue;
        }
        const r = q / p;
        if (p < 0) t0 = Math.max(t0, r);
        else t1 = Math.min(t1, r);
        if (t0 > t1) return false;
      }
      return true;
    });
  }

  /** 1 inside, fading towards 0 within `fade` of the area's edges. */
  private static edgeOpacity(area: Box, box: Box, fade: number): number {
    if (fade <= 0) return 1;
    const gap = Math.min(
      box.x - area.x,
      box.y - area.y,
      area.x + area.width - (box.x + box.width),
      area.y + area.height - (box.y + box.height),
    );
    return Math.max(0, Math.min(1, gap / fade));
  }

  private static contains(area: Box, x: number, y: number): boolean {
    return x >= area.x && x <= area.x + area.width && y >= area.y && y <= area.y + area.height;
  }

  private static inside(area: Box, box: Box): boolean {
    return (
      box.x >= area.x &&
      box.y >= area.y &&
      box.x + box.width <= area.x + area.width &&
      box.y + box.height <= area.y + area.height
    );
  }

  private static grow(box: Box, by: number): Box {
    return { x: box.x - by, y: box.y - by, width: box.width + 2 * by, height: box.height + 2 * by };
  }

  private static overlap(a: Box, b: Box): boolean {
    return (
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
    );
  }
}
