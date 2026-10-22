import type { GeoRoute } from '../route/RouteShape';
import type { ActivityStats } from '../stats/ActivityStats';
import type { FlyoverPath } from './FlyoverPath';

export interface LiveValues {
  /** Meters from the activity start (including the hidden privacy zone) */
  distance: number;
  /** Seconds since the activity started; undefined without timestamps */
  elapsed?: number;
}

/** Distance and time "so far" at a point of the flyover, for counters that tick up in the video. */
export class LiveStats {
  constructor(
    private readonly route: GeoRoute,
    private readonly path: FlyoverPath,
    /** Activity start, epoch ms */
    private readonly startTime: number | undefined,
  ) {}

  at(progress: number): LiveValues {
    const { index, fraction } = this.path.locate(progress);
    const { distances, times, startDistance } = this.route;
    const next = Math.min(index + 1, distances.length - 1);
    const along = distances[index]! + (distances[next]! - distances[index]!) * fraction;

    const t0 = times[index];
    const t1 = times[next] ?? t0;
    const elapsed =
      this.startTime !== undefined && t0 !== undefined && t1 !== undefined
        ? Math.max(0, (t0 + (t1 - t0) * fraction - this.startTime) / 1000)
        : undefined;

    return { distance: startDistance + along, elapsed };
  }

  /**
   * The final stats as they stood at `progress`: distance and time count up, totals like
   * elevation gain grow with the distance covered, averages stay as they are.
   */
  snapshot(progress: number, final: ActivityStats): ActivityStats {
    const live = this.at(progress);
    const share = final.distance ? Math.min(1, live.distance / final.distance) : progress;
    const grow = (value: number | undefined) => (value === undefined ? undefined : value * share);
    const capped = (value: number | undefined, max: number | undefined) =>
      value === undefined || max === undefined ? grow(max) : Math.min(value, max);
    return {
      ...final,
      distance: capped(live.distance, final.distance),
      elapsedTime: capped(live.elapsed, final.elapsedTime),
      movingTime: grow(final.movingTime),
      elevationGain: grow(final.elevationGain),
      elevationLoss: grow(final.elevationLoss),
      calories: grow(final.calories),
    };
  }
}
