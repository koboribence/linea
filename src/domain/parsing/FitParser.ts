import {
  Decoder,
  Stream,
  type FitMessages,
  type RecordMesg,
  type SessionMesg,
} from '@garmin/fitsdk';
import type { Activity } from '../activity/Activity';
import { sportFromText } from '../activity/SportType';
import type { TrackPoint } from '../activity/TrackPoint';
import type { DeviceSummary } from '../stats/ActivityStats';
import { ActivityParser } from './ActivityParser';
import { ParseError } from './ParseError';

const SEMICIRCLE_TO_DEGREES = 180 / 2 ** 31;
const FIT_EPOCH_OFFSET = 631_065_600; // seconds between 1970-01-01 and 1989-12-31

/** Binary FIT files (Garmin, Wahoo, Coros, Polar, Suunto, Zwift…) via Garmin's official SDK. */
export class FitParser extends ActivityParser {
  readonly format = 'fit';

  parse(data: ArrayBuffer): Activity {
    const decoder = new Decoder(Stream.fromArrayBuffer(data));
    if (!decoder.isFIT()) throw new ParseError('corrupt', 'Missing FIT header');

    const { messages, errors } = decoder.read();
    const records = messages.recordMesgs ?? [];
    // Watches that crash mid-activity leave truncated files; keep whatever was decoded
    if (errors.length > 0 && records.length === 0) {
      throw new ParseError('corrupt', String(errors[0]));
    }

    const sessions = messages.sessionMesgs ?? [];
    const session = sessions[0];
    const sportName = String(session?.sport ?? messages.sportMesgs?.[0]?.sport ?? '');
    const startTime = FitParser.toMs(session?.startTime) ?? FitParser.toMs(records[0]?.timestamp);

    return this.createActivity(
      {
        sport: sportFromText(sportName),
        name: messages.sportMesgs?.[0]?.name,
        device: FitParser.deviceName(messages),
        startTime: startTime === undefined ? undefined : new Date(startTime),
        timeZone: FitParser.utcOffset(messages),
      },
      records.map((r) => FitParser.toPoint(r)),
      // Multisport files have several sessions; their totals don't describe the whole file
      sessions.length === 1 && session ? FitParser.toSummary(session) : {},
    );
  }

  private static toPoint(r: RecordMesg): TrackPoint {
    const cadence = r.cadence === undefined ? undefined : r.cadence + (r.fractionalCadence ?? 0);
    return {
      time: FitParser.toMs(r.timestamp),
      lat: r.positionLat === undefined ? undefined : r.positionLat * SEMICIRCLE_TO_DEGREES,
      lon: r.positionLong === undefined ? undefined : r.positionLong * SEMICIRCLE_TO_DEGREES,
      ele: r.enhancedAltitude ?? r.altitude,
      distance: r.distance,
      speed: r.enhancedSpeed ?? r.speed,
      heartRate: r.heartRate,
      cadence,
      power: r.power,
      temperature: r.temperature,
    };
  }

  private static toSummary(s: SessionMesg): DeviceSummary {
    return {
      // Devices write 0 when no GPS or speed sensor was present: that means "not measured"
      distance: s.totalDistance || undefined,
      calories: s.totalCalories || undefined,
      elapsedTime: s.totalElapsedTime,
      maxSpeed: s.enhancedMaxSpeed ?? s.maxSpeed,
      elevationGain: s.totalAscent,
      elevationLoss: s.totalDescent,
      avgHeartRate: s.avgHeartRate,
      maxHeartRate: s.maxHeartRate,
      avgCadence: s.avgRunningCadence ?? s.avgCadence,
      maxCadence: s.maxRunningCadence ?? s.maxCadence,
      avgPower: s.avgPower,
      maxPower: s.maxPower,
      avgTemperature: s.avgTemperature,
    };
  }

  private static deviceName(messages: FitMessages): string | undefined {
    const fileId = messages.fileIdMesgs?.[0];
    if (!fileId) return undefined;
    if (fileId.productName) return String(fileId.productName);
    const manufacturer = fileId.manufacturer === undefined ? '' : String(fileId.manufacturer);
    const product = fileId.garminProduct ?? fileId.product;
    const name = [manufacturer, product === undefined ? '' : String(product)].join(' ').trim();
    return name || undefined;
  }

  /** The device's UTC offset ("+02:00"), from the local and UTC timestamps of the activity. */
  private static utcOffset(messages: FitMessages): string | undefined {
    const activity = messages.activityMesgs?.[0];
    const utc = FitParser.toMs(activity?.timestamp);
    const local = FitParser.toMs(activity?.localTimestamp);
    if (utc === undefined || local === undefined) return undefined;

    // Real offsets are multiples of 15 minutes; rounding removes clock jitter
    const minutes = Math.round((local - utc) / 60_000 / 15) * 15;
    if (Math.abs(minutes) > 14 * 60) return undefined;
    const sign = minutes < 0 ? '-' : '+';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${sign}${pad(Math.floor(Math.abs(minutes) / 60))}:${pad(Math.abs(minutes) % 60)}`;
  }

  /** The decoder returns Dates; raw numbers are seconds since the FIT epoch (1989-12-31). */
  private static toMs(value: unknown): number | undefined {
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return (value + FIT_EPOCH_OFFSET) * 1000;
    return undefined;
  }
}
