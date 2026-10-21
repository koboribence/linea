import type { Activity } from '../activity/Activity';
import type { SportType } from '../activity/SportType';
import type { TrackPoint } from '../activity/TrackPoint';
import type { ActivityStats, DeviceSummary } from './ActivityStats';
import { haversine } from './geo';

export interface StatsOptions {
  /** Below this speed (m/s) the athlete counts as stopped. */
  movingThreshold: Record<SportType, number>;
  /** Elevation changes smaller than this (m) are treated as GPS/barometer noise. */
  elevationHysteresis: number;
  /** Max speed is averaged over at least this many seconds to ignore GPS spikes. */
  maxSpeedWindow: number;
  /** Faster segments (m/s) are GPS glitches and are left out of max speed. */
  plausibleSpeed: Record<SportType, number>;
}

export const DEFAULT_STATS_OPTIONS: StatsOptions = {
  movingThreshold: { run: 0.5, ride: 1.0, other: 0.5 },
  elevationHysteresis: 3,
  maxSpeedWindow: 5,
  plausibleSpeed: { run: 12, ride: 30, other: 30 },
};

/** Computes summary stats from track points; device-reported totals take precedence. */
export class StatsCalculator {
  constructor(private readonly options: StatsOptions = DEFAULT_STATS_OPTIONS) {}

  calculate(activity: Activity): ActivityStats {
    const computed = this.compute(activity);
    return StatsCalculator.merge(computed, activity.deviceSummary);
  }

  private compute(activity: Activity): ActivityStats {
    const points = activity.points;
    const distances = this.cumulativeDistances(points);
    const distance = distances.length > 1 ? distances.at(-1)! - distances[0]! : undefined;
    const timed = activity.hasTime;
    const movingTime = timed ? this.movingTime(points, distances, activity.sport) : undefined;

    return {
      distance: distance || undefined,
      elapsedTime: timed ? this.elapsedTime(points) : undefined,
      movingTime,
      avgSpeed: distance && movingTime ? distance / movingTime : undefined,
      maxSpeed: timed ? this.maxSpeed(points, distances, activity.sport) : undefined,
      ...this.elevation(points),
      avgHeartRate: StatsCalculator.average(points, (p) => p.heartRate, false),
      maxHeartRate: StatsCalculator.max(points, (p) => p.heartRate),
      avgCadence: StatsCalculator.average(points, (p) => p.cadence, false),
      maxCadence: StatsCalculator.max(points, (p) => p.cadence),
      // Zero watts (coasting) counts toward average power, like on Garmin and Strava
      avgPower: activity.hasPower
        ? StatsCalculator.average(points, (p) => p.power, true)
        : undefined,
      maxPower: StatsCalculator.max(points, (p) => p.power),
      avgTemperature: StatsCalculator.average(points, (p) => p.temperature, true),
    };
  }

  /** Device distance where available, otherwise summed GPS segments. */
  private cumulativeDistances(points: readonly TrackPoint[]): number[] {
    const result: number[] = [];
    let total = 0;
    let prev: TrackPoint | undefined;
    for (const p of points) {
      if (p.distance !== undefined) {
        total = p.distance;
      } else if (
        prev?.lat !== undefined &&
        prev.lon !== undefined &&
        p.lat !== undefined &&
        p.lon !== undefined
      ) {
        total += haversine(prev.lat, prev.lon, p.lat, p.lon);
      }
      result.push(total);
      prev = p;
    }
    return result;
  }

  private elapsedTime(points: readonly TrackPoint[]): number | undefined {
    const first = points.find((p) => p.time !== undefined)?.time;
    const last = points.findLast((p) => p.time !== undefined)?.time;
    return first !== undefined && last !== undefined && last > first
      ? (last - first) / 1000
      : undefined;
  }

  private movingTime(
    points: readonly TrackPoint[],
    distances: number[],
    sport: SportType,
  ): number | undefined {
    const threshold = this.options.movingThreshold[sport];
    let moving = 0;
    for (let i = 1; i < points.length; i++) {
      const t0 = points[i - 1]!.time;
      const t1 = points[i]!.time;
      if (t0 === undefined || t1 === undefined || t1 <= t0) continue;
      const dt = (t1 - t0) / 1000;
      if ((distances[i]! - distances[i - 1]!) / dt >= threshold) moving += dt;
    }
    return moving > 0 ? moving : undefined;
  }

  private maxSpeed(
    points: readonly TrackPoint[],
    distances: number[],
    sport: SportType,
  ): number | undefined {
    const windowMs = this.options.maxSpeedWindow * 1000;
    const glitches = this.glitchCounts(points, distances, sport);
    let best = 0;
    let start = 0;
    for (let end = 0; end < points.length; end++) {
      const tEnd = points[end]!.time;
      if (tEnd === undefined) continue;
      // Move the window start forward while the window stays long enough
      while (start < end) {
        const next = points[start + 1]?.time;
        if (next === undefined || tEnd - next < windowMs) break;
        start++;
      }
      const tStart = points[start]!.time;
      if (tStart === undefined || tEnd - tStart < windowMs) continue;
      if (glitches[end]! - glitches[start]! > 0) continue;
      best = Math.max(best, ((distances[end]! - distances[start]!) * 1000) / (tEnd - tStart));
    }
    return best > 0 ? best : undefined;
  }

  /** Running count of implausibly fast segments; a window contains one if the count changes. */
  private glitchCounts(
    points: readonly TrackPoint[],
    distances: number[],
    sport: SportType,
  ): number[] {
    const limit = this.options.plausibleSpeed[sport];
    const counts = [0];
    for (let i = 1; i < points.length; i++) {
      const t0 = points[i - 1]!.time;
      const t1 = points[i]!.time;
      const dt = t0 !== undefined && t1 !== undefined ? (t1 - t0) / 1000 : 0;
      const glitch = dt > 0 && (distances[i]! - distances[i - 1]!) / dt > limit;
      counts.push(counts[i - 1]! + (glitch ? 1 : 0));
    }
    return counts;
  }

  private elevation(points: readonly TrackPoint[]): Partial<ActivityStats> {
    const hysteresis = this.options.elevationHysteresis;
    let gain = 0;
    let loss = 0;
    let min = Infinity;
    let max = -Infinity;
    let reference: number | undefined;
    let last: number | undefined;
    let trend: 'up' | 'down' | undefined;

    for (const { ele } of points) {
      if (ele === undefined) continue;
      min = Math.min(min, ele);
      max = Math.max(max, ele);
      last = ele;
      if (reference === undefined) {
        reference = ele;
      } else if (ele - reference >= hysteresis) {
        gain += ele - reference;
        reference = ele;
        trend = 'up';
      } else if (reference - ele >= hysteresis) {
        loss += reference - ele;
        reference = ele;
        trend = 'down';
      }
    }

    if (reference === undefined || last === undefined) return {};
    // The final stretch may be below the threshold; count it if it continues the current trend
    if (trend === 'up' && last > reference) gain += last - reference;
    if (trend === 'down' && last < reference) loss += reference - last;
    return { elevationGain: gain, elevationLoss: loss, minElevation: min, maxElevation: max };
  }

  private static average(
    points: readonly TrackPoint[],
    pick: (p: TrackPoint) => number | undefined,
    includeZero: boolean,
  ): number | undefined {
    let sum = 0;
    let count = 0;
    for (const p of points) {
      const value = pick(p);
      if (value === undefined || (!includeZero && value === 0)) continue;
      sum += value;
      count++;
    }
    return count > 0 ? sum / count : undefined;
  }

  private static max(
    points: readonly TrackPoint[],
    pick: (p: TrackPoint) => number | undefined,
  ): number | undefined {
    let best: number | undefined;
    for (const p of points) {
      const value = pick(p);
      if (value !== undefined && value > 0 && (best === undefined || value > best)) best = value;
    }
    return best;
  }

  /** Device values override computed ones, but only where the device actually reported them. */
  static merge(computed: ActivityStats, device: DeviceSummary): ActivityStats {
    const result: ActivityStats = { ...computed };
    for (const key of Object.keys(device) as (keyof ActivityStats)[]) {
      const value = device[key];
      if (value !== undefined && Number.isFinite(value)) result[key] = value;
    }
    return result;
  }
}
