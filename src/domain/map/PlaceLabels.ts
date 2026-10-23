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
}

const ORDER: Record<PlaceLevel, number> = { village: 0, town: 1, city: 2 };
/** At most this many names, by level: a wide area stays sparse. */
const MAX_LABELS: Record<PlaceLevel, number> = { village: 7, town: 6, city: 5 };
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
   * the map's rank). A name is left out when its box would leave the area or touch a name
   * already placed; the start's name is nudged inside instead, if its point is in the area.
   */
  static choose(places: ScreenPlace[], options: LabelOptions): PlaceLabel[] {
    const { level, area, measure, spacing, fade } = options;
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
      let { x, y } = place;
      if (place.start) {
        // Shifted inside rather than dropped, so the start is always named
        x = Math.min(Math.max(x, area.x + width / 2), area.x + area.width - width / 2);
        y = Math.min(Math.max(y, area.y + height / 2), area.y + area.height - height / 2);
      }
      const box = { x: x - width / 2, y: y - height / 2, width, height };
      if (!PlaceLabels.inside(area, box)) continue;
      const padded = PlaceLabels.grow(box, spacing);
      if (placed.some((other) => PlaceLabels.overlap(padded, other))) continue;
      placed.push(padded);
      labels.push({
        name: place.name,
        kind: place.kind,
        x,
        y,
        start: Boolean(place.start),
        opacity: PlaceLabels.edgeOpacity(area, box, fade),
      });
    }
    return labels;
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
