import type { Activity } from '../activity/Activity';
import { haversine } from '../stats/geo';

/** Elevation sampled at even distances along the route, for the profile chart. */
export class ElevationProfile {
  private constructor(readonly samples: readonly number[]) {}

  get min(): number {
    return Math.min(...this.samples);
  }

  get max(): number {
    return Math.max(...this.samples);
  }

  /** Undefined when there's no elevation or the course is flat (< 10 m range). */
  static fromActivity(activity: Activity, sampleCount = 160): ElevationProfile | undefined {
    const distances: number[] = [];
    const elevations: number[] = [];
    let total = 0;
    let prev: (typeof activity.points)[number] | undefined;

    for (const p of activity.points) {
      if (prev?.lat !== undefined && p.lat !== undefined) {
        total += haversine(prev.lat, prev.lon!, p.lat, p.lon!);
      } else if (p.distance !== undefined) {
        total = p.distance;
      }
      if (p.ele !== undefined) {
        distances.push(total);
        elevations.push(p.ele);
      }
      prev = p;
    }
    if (elevations.length < 2 || total === 0) return undefined;

    // Walk once through the points, picking the elevation at each even distance step
    const samples: number[] = [];
    let j = 0;
    for (let i = 0; i < sampleCount; i++) {
      const target = (total * i) / (sampleCount - 1);
      while (j < distances.length - 1 && distances[j + 1]! <= target) j++;
      samples.push(elevations[j]!);
    }

    const profile = new ElevationProfile(samples);
    return profile.max - profile.min >= 10 ? profile : undefined;
  }
}
