import { Activity, type ActivityMeta, type SourceFormat } from '../activity/Activity';
import type { TrackPoint } from '../activity/TrackPoint';
import type { DeviceSummary } from '../stats/ActivityStats';
import { ParseError } from './ParseError';

/** Base class for all file format parsers. */
export abstract class ActivityParser {
  abstract readonly format: SourceFormat;

  /** Throws ParseError when the data cannot be turned into an activity. */
  abstract parse(data: ArrayBuffer): Activity;

  /** Shared final step for every format: drops empty samples and rejects files without data. */
  protected createActivity(
    meta: Omit<ActivityMeta, 'sourceFormat'>,
    points: TrackPoint[],
    summary: DeviceSummary = {},
  ): Activity {
    const samples = points.map(ActivityParser.compact).filter((p) => Object.keys(p).length > 0);
    if (samples.length === 0) throw new ParseError('empty');
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
