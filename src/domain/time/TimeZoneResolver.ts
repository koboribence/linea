import type { Activity } from '../activity/Activity';

type Lookup = (lat: number, lon: number) => string;

/**
 * Finds the time zone where the activity happened, so times show as the athlete saw them.
 * GPS position wins (exact IANA zone); otherwise the file's own UTC offset is kept.
 */
export class TimeZoneResolver {
  private lookup?: Promise<Lookup>;

  async resolve(activity: Activity): Promise<string | undefined> {
    const first = activity.points.find((p) => p.lat !== undefined && p.lon !== undefined);
    if (!first) return activity.meta.timeZone;
    try {
      // Lazy-loaded: the zone map is only needed for files with GPS
      this.lookup ??= import('@photostructure/tz-lookup').then((m) => m.default);
      return (await this.lookup)(first.lat!, first.lon!);
    } catch {
      return activity.meta.timeZone;
    }
  }
}
