import type { GeoRoute } from '../route/RouteShape';
import type { ActivityStats } from '../stats/ActivityStats';
import type { FlyoverPath } from './FlyoverPath';

/** How far along the shown route a moment of the flyover is, 0…1. */
export interface LiveShares {
  /** Share of the route's distance */
  distance: number;
  /** Share of the route's time; the distance share where timestamps are missing */
  time: number;
}

/**
 * Stats "so far" at a point of the flyover, for counters that tick up in the video.
 * Every counter runs from 0 at the start of the shown route to its final value at its end,
 * even when a privacy zone hides the first meters or the clock started before the first point.
 */
export class LiveStats {
  constructor(
    private readonly route: GeoRoute,
    private readonly path: FlyoverPath,
  ) {}

  at(progress: number): LiveShares {
    const { index, fraction } = this.path.locate(progress);
    const { distances, times } = this.route;
    const next = Math.min(index + 1, distances.length - 1);
    const lerp = (a: number, b: number) => a + (b - a) * fraction;

    const length = distances.at(-1) ?? 0;
    const distance = length > 0 ? lerp(distances[index]!, distances[next]!) / length : progress;

    const first = times[0];
    const last = times.at(-1);
    const t0 = times[index];
    const t1 = times[next] ?? t0;
    const timed = first !== undefined && last !== undefined && last > first && t0 !== undefined;
    const time = timed ? (lerp(t0, t1 ?? t0) - first) / (last - first) : distance;

    return { distance: clamp(distance), time: clamp(time) };
  }

  /**
   * The final stats as they stood at `progress`: distance, times and totals like elevation
   * gain count up, averages stay as they are (so the layout doesn't jump).
   */
  snapshot(progress: number, final: ActivityStats): ActivityStats {
    const share = this.at(progress);
    const by = (value: number | undefined, part: number) =>
      value === undefined ? undefined : value * part;
    return {
      ...final,
      distance: by(final.distance, share.distance),
      elapsedTime: by(final.elapsedTime, share.time),
      movingTime: by(final.movingTime, share.time),
      elevationGain: by(final.elevationGain, share.distance),
      elevationLoss: by(final.elevationLoss, share.distance),
      calories: by(final.calories, share.time),
    };
  }
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
