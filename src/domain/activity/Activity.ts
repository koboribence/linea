import type { DeviceSummary } from '../stats/ActivityStats';
import type { SportType } from './SportType';
import type { TrackPoint } from './TrackPoint';

export type SourceFormat = 'fit' | 'gpx' | 'tcx';

export interface ActivityMeta {
  sport: SportType;
  sourceFormat: SourceFormat;
  startTime?: Date;
  name?: string;
  /** Recording device or exporting app */
  device?: string;
  /** Where the activity happened: IANA name ("Europe/Budapest") or UTC offset ("+02:00") */
  timeZone?: string;
}

/** A parsed workout: metadata, samples and the device's own summary. Immutable. */
export class Activity {
  readonly hasGps: boolean;
  readonly hasTime: boolean;
  readonly hasElevation: boolean;
  readonly hasHeartRate: boolean;
  readonly hasCadence: boolean;
  readonly hasPower: boolean;

  constructor(
    readonly meta: ActivityMeta,
    readonly points: readonly TrackPoint[],
    readonly deviceSummary: DeviceSummary = {},
  ) {
    this.hasGps = points.some((p) => p.lat !== undefined && p.lon !== undefined);
    // A few stray timestamps (e.g. on a planned route) are not enough for time-based stats
    this.hasTime = points.filter((p) => p.time !== undefined).length >= points.length * 0.9;
    this.hasElevation = points.some((p) => p.ele !== undefined);
    this.hasHeartRate = points.some((p) => p.heartRate !== undefined && p.heartRate > 0);
    this.hasCadence = points.some((p) => p.cadence !== undefined && p.cadence > 0);
    this.hasPower = points.some((p) => p.power !== undefined && p.power > 0);
  }

  get sport(): SportType {
    return this.meta.sport;
  }

  get startTime(): Date | undefined {
    if (this.meta.startTime) return this.meta.startTime;
    const first = this.points.find((p) => p.time !== undefined)?.time;
    return first === undefined ? undefined : new Date(first);
  }

  /** Copy with changed metadata (e.g. detected sport or time zone); points are shared. */
  withMeta(changes: Partial<ActivityMeta>): Activity {
    return new Activity({ ...this.meta, ...changes }, this.points, this.deviceSummary);
  }
}
