import { Activity, type ActivityMeta, type SourceFormat } from '../activity/Activity';
import type { TrackPoint } from '../activity/TrackPoint';
import type { DeviceSummary } from '../stats/ActivityStats';
import { ParseError } from './ParseError';

/** Base class for all file format parsers. */
export abstract class ActivityParser {
  abstract readonly format: SourceFormat;

  /** Throws ParseError when the data cannot be turned into an activity. */
  abstract parse(data: ArrayBuffer): Activity;

  /** Shared final step: validation and unit normalization for every format. */
  protected createActivity(
    meta: Omit<ActivityMeta, 'sourceFormat'>,
    points: TrackPoint[],
    summary: DeviceSummary = {},
  ): Activity {
    const samples = points.map(ActivityParser.compact).filter((p) => Object.keys(p).length > 0);
    if (samples.length === 0) throw new ParseError('empty');

    // Files store running cadence per leg (strides/min); runners think in steps/min
    if (meta.sport === 'run') {
      for (const p of samples) if (p.cadence !== undefined) p.cadence *= 2;
      if (summary.avgCadence !== undefined) summary.avgCadence *= 2;
      if (summary.maxCadence !== undefined) summary.maxCadence *= 2;
    }

    return new Activity({ ...meta, sourceFormat: this.format }, samples, summary);
  }

  /** Drops undefined fields so "has this channel" checks stay simple. */
  private static compact<T extends object>(record: T): T {
    for (const key of Object.keys(record) as (keyof T)[]) {
      if (record[key] === undefined) delete record[key];
    }
    return record;
  }
}
