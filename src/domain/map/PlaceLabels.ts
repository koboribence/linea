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
}

type Segment = [ax: number, ay: number, bx: number, by: number];

const ORDER: Record<PlaceLevel, number> = { village: 0, town: 1, city: 2 };
/** At most this many names, by level: a wide area stays sparse. */
const MAX_LABELS: Record<PlaceLevel, number> = { village: 7, town: 6, city: 5 };
/** How far (in steps around its place) the start's name may move to find a free spot. */
const START_RINGS = 5;
/** The start place is the nearest named place within this distance of the start, meters. */
const START_RADIUS = 4000;

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
    const { level, area, measure, spacing, fade, clearance = 0 } = options;
    const route = PlaceLabels.segments(options.avoid ?? []);
    const ordered = places
      .filter((place) => place.start || ORDER[place.kind] >= ORDER[level])
      .sort(
        (a, b) =>
          Number(Boolean(b.start)) - Number(Boolean(a.start)) ||
          ORDER[b.kind] - ORDER[a.kind] ||
          a.rank - b.rank ||
          a.name.localeCompare(b.name),
      );
    const placed: Box[] = [];
    const labels: PlaceLabel[] = [];
    for (const place of ordered) {
      if (labels.length >= MAX_LABELS[level] + (labels[0]?.start ? 1 : 0)) break;
      // The start may sit just outside (e.g. at the bottom edge): it is pulled in below
      const reach = place.start ? Math.max(area.width, area.height) * 0.08 : 0;
      if (!PlaceLabels.contains(PlaceLabels.grow(area, reach), place.x, place.y)) continue;
      const { width, height } = measure(place.name, place.kind);

      const spots = PlaceLabels.spots(place, width, height, place.start ? START_RINGS : 1).map(
        (spot) => (place.start ? PlaceLabels.pullInside(spot, width, height, area) : spot),
      );
      const boxAt = ({ x, y }: { x: number; y: number }) => ({
        x: x - width / 2,
        y: y - height / 2,
        width,
        height,
      });
      const free = (spot: { x: number; y: number }, clearOfRoute: boolean) => {
        const box = boxAt(spot);
        if (!PlaceLabels.inside(area, box)) return false;
        const padded = PlaceLabels.grow(box, spacing);
        if (placed.some((other) => PlaceLabels.overlap(padded, other))) return false;
        return !clearOfRoute || !PlaceLabels.crosses(PlaceLabels.grow(box, clearance), route);
      };
      const spot =
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
        name: place.name,
        kind: place.kind,
        x: spot.x,
        y: spot.y,
        start: Boolean(place.start),
        opacity: PlaceLabels.edgeOpacity(area, box, fade),
      });
    }
    return labels;
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
