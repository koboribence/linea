import type { Activity } from '../activity/Activity';
import type { SportType } from '../activity/SportType';
import type { StatId } from '../format/StatPresenter';
import type { TrackPoint } from '../activity/TrackPoint';
import { haversine } from '../stats/geo';
import type { GeoRoute } from './RouteShape';

/** Moments a video can point out on the route. */
export type HighlightId = 'maxSpeed' | 'maxHeartRate' | 'maxPower' | 'highestPoint';

export interface Highlight {
  id: HighlightId;
  /** Where it happened, [lon, lat] */
  lngLat: [number, number];
  /** How far along the shown route, 0…1 (as the flyover's progress) */
  progress: number;
}

/** Points on each side used to smooth speed, so one GPS jump doesn't become the top speed. */
const SPEED_SMOOTHING = 3;

/**
 * Where on the route the activity's peaks happened: top speed, highest heart rate and power,
 * the highest point. Only peaks on the shown route count: one inside a privacy zone would
 * give away the hidden start or finish.
 */
export class RouteHighlights {
  static readonly IDS: HighlightId[] = ['maxSpeed', 'maxHeartRate', 'maxPower', 'highestPoint'];

  /** The stat whose value a highlight shows (runners see their top speed as pace). */
  static statFor(id: HighlightId, sport: SportType): StatId {
    if (id === 'maxSpeed') return sport === 'run' ? 'bestPace' : 'maxSpeed';
    if (id === 'highestPoint') return 'maxElevation';
    return id;
  }

  static find(activity: Activity, route: GeoRoute): Highlight[] {
    const points = activity.points.filter((p) => p.lat !== undefined && p.lon !== undefined);
    const along = RouteHighlights.distances(points);
    const length = route.distances.at(-1) ?? 0;
    if (points.length < 2 || length <= 0) return [];

    const progressAt = (i: number) => (along[i]! - route.startDistance) / length;
    const shown = (i: number) => progressAt(i) >= 0 && progressAt(i) <= 1;
    const peak = (value: (p: TrackPoint, i: number) => number | undefined) => {
      let best = -1;
      let bestValue = -Infinity;
      points.forEach((point, i) => {
        const v = value(point, i);
        if (v !== undefined && shown(i) && v > bestValue) {
          best = i;
          bestValue = v;
        }
      });
      return best;
    };

    const speeds = RouteHighlights.speeds(points, along);
    const found: [HighlightId, number][] = [
      ['maxSpeed', peak((_, i) => speeds[i])],
      ['maxHeartRate', peak((p) => p.heartRate || undefined)],
      ['maxPower', peak((p) => p.power || undefined)],
      ['highestPoint', peak((p) => p.ele)],
    ];
    return found.flatMap(([id, i]) =>
      i < 0 ? [] : [{ id, lngLat: [points[i]!.lon!, points[i]!.lat!], progress: progressAt(i) }],
    );
  }

  private static distances(points: TrackPoint[]): number[] {
    const result = [0];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!;
      const b = points[i]!;
      result.push(result[i - 1]! + haversine(a.lat!, a.lon!, b.lat!, b.lon!));
    }
    return result;
  }

  /** Speed per point (m/s): the device's own where recorded, else from smoothed GPS. */
  private static speeds(points: TrackPoint[], along: number[]): (number | undefined)[] {
    return points.map((point, i) => {
      if (point.speed !== undefined) return point.speed;
      const a = Math.max(0, i - SPEED_SMOOTHING);
      const b = Math.min(points.length - 1, i + SPEED_SMOOTHING);
      const t0 = points[a]!.time;
      const t1 = points[b]!.time;
      if (t0 === undefined || t1 === undefined || t1 <= t0) return undefined;
      return ((along[b]! - along[a]!) * 1000) / (t1 - t0);
    });
  }
}
