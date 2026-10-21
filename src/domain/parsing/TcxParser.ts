import type { Activity } from '../activity/Activity';
import { sportFromText } from '../activity/SportType';
import type { TrackPoint } from '../activity/TrackPoint';
import type { DeviceSummary } from '../stats/ActivityStats';
import { XmlActivityParser } from './XmlActivityParser';

/** Garmin Training Center XML, including the ActivityExtension (speed, watts, run cadence). */
export class TcxParser extends XmlActivityParser {
  readonly format = 'tcx';

  parse(data: ArrayBuffer): Activity {
    const doc = this.parseXml(data);
    const activity = doc.getElementsByTagNameNS('*', 'Activity')[0];
    const points = Array.from(doc.getElementsByTagNameNS('*', 'Trackpoint'), (node) =>
      TcxParser.readPoint(node),
    );
    const laps = Array.from(doc.getElementsByTagNameNS('*', 'Lap'));
    const creator = activity && TcxParser.child(activity, 'Creator');
    const startTime = activity && TcxParser.toTime(TcxParser.childText(activity, 'Id'));

    return this.createActivity(
      {
        sport: sportFromText(activity?.getAttribute('Sport') ?? undefined),
        device: creator && TcxParser.childText(creator, 'Name'),
        startTime: startTime === undefined ? undefined : new Date(startTime),
      },
      points,
      TcxParser.summarizeLaps(laps),
    );
  }

  private static readPoint(node: Element): TrackPoint {
    const point: TrackPoint = {};
    for (const el of node.getElementsByTagName('*')) {
      const text = el.textContent;
      switch (el.localName) {
        case 'Time':
          point.time = TcxParser.toTime(text);
          break;
        case 'LatitudeDegrees':
          point.lat = TcxParser.toNumber(text);
          break;
        case 'LongitudeDegrees':
          point.lon = TcxParser.toNumber(text);
          break;
        case 'AltitudeMeters':
          point.ele = TcxParser.toNumber(text);
          break;
        case 'DistanceMeters':
          point.distance = TcxParser.toNumber(text);
          break;
        case 'Value':
          // <Value> is also used elsewhere; only the one inside <HeartRateBpm> is heart rate
          if (el.parentElement?.localName === 'HeartRateBpm') {
            point.heartRate = TcxParser.toNumber(text);
          }
          break;
        case 'Cadence':
        case 'RunCadence':
          point.cadence = TcxParser.toNumber(text);
          break;
        case 'Watts':
          point.power = TcxParser.toNumber(text);
          break;
        case 'Speed':
          point.speed = TcxParser.toNumber(text);
          break;
      }
    }
    return point;
  }

  /** Laps carry the device's own totals; combine them into one summary. */
  private static summarizeLaps(laps: Element[]): DeviceSummary {
    if (laps.length === 0) return {};
    let distance = 0;
    let calories = 0;
    let hrWeighted = 0;
    let hrSeconds = 0;
    let maxHeartRate: number | undefined;
    let maxSpeed: number | undefined;

    for (const lap of laps) {
      const seconds = TcxParser.childNumber(lap, 'TotalTimeSeconds') ?? 0;
      distance += TcxParser.childNumber(lap, 'DistanceMeters') ?? 0;
      calories += TcxParser.childNumber(lap, 'Calories') ?? 0;

      const avgHr = TcxParser.heartRate(lap, 'AverageHeartRateBpm');
      if (avgHr !== undefined) {
        hrWeighted += avgHr * seconds;
        hrSeconds += seconds;
      }
      const lapMaxHr = TcxParser.heartRate(lap, 'MaximumHeartRateBpm');
      if (lapMaxHr !== undefined) maxHeartRate = Math.max(maxHeartRate ?? 0, lapMaxHr);
      const lapMaxSpeed = TcxParser.childNumber(lap, 'MaximumSpeed');
      if (lapMaxSpeed !== undefined) maxSpeed = Math.max(maxSpeed ?? 0, lapMaxSpeed);
    }

    return {
      distance: distance || undefined,
      calories: calories || undefined,
      avgHeartRate: hrSeconds > 0 ? hrWeighted / hrSeconds : undefined,
      maxHeartRate,
      maxSpeed: maxSpeed || undefined,
    };
  }

  private static heartRate(lap: Element, name: string): number | undefined {
    const el = TcxParser.child(lap, name);
    return el && TcxParser.childNumber(el, 'Value');
  }
}
