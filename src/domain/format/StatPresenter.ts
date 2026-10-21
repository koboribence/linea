import type { Activity } from '../activity/Activity';
import type { ActivityStats } from '../stats/ActivityStats';
import type { FormattedValue, UnitFormatter } from './UnitFormatter';

export type StatId =
  | 'distance'
  | 'movingTime'
  | 'elapsedTime'
  | 'avgPace'
  | 'bestPace'
  | 'avgSpeed'
  | 'maxSpeed'
  | 'elevationGain'
  | 'elevationLoss'
  | 'minElevation'
  | 'maxElevation'
  | 'avgHeartRate'
  | 'maxHeartRate'
  | 'avgCadence'
  | 'maxCadence'
  | 'avgPower'
  | 'maxPower'
  | 'avgTemperature'
  | 'calories';

export type StatGroupId = 'overview' | 'elevation' | 'sensors';

export interface StatItem extends FormattedValue {
  id: StatId;
}

export interface StatGroup {
  id: StatGroupId;
  items: StatItem[];
}

/** Decides which stats to show for an activity, in which order and format. Empty groups are dropped. */
export class StatPresenter {
  constructor(private readonly format: UnitFormatter) {}

  groups(activity: Activity, stats: ActivityStats): StatGroup[] {
    const f = this.format;
    const run = activity.sport === 'run';
    const item = (id: StatId, value: number | undefined, render: (v: number) => FormattedValue) =>
      value === undefined ? undefined : { id, ...render(value) };

    const groups: { id: StatGroupId; items: (StatItem | undefined)[] }[] = [
      {
        id: 'overview',
        items: [
          item('distance', stats.distance, (v) => f.distance(v)),
          item('movingTime', stats.movingTime, (v) => f.duration(v)),
          item('elapsedTime', stats.elapsedTime, (v) => f.duration(v)),
          // Runners read pace, cyclists read speed
          run
            ? item('avgPace', stats.avgSpeed, (v) => f.pace(v))
            : item('avgSpeed', stats.avgSpeed, (v) => f.speed(v)),
          run
            ? item('bestPace', stats.maxSpeed, (v) => f.pace(v))
            : item('maxSpeed', stats.maxSpeed, (v) => f.speed(v)),
          item('calories', stats.calories, (v) => f.calories(v)),
        ],
      },
      {
        id: 'elevation',
        items: [
          item('elevationGain', stats.elevationGain, (v) => f.elevation(v)),
          item('elevationLoss', stats.elevationLoss, (v) => f.elevation(v)),
          item('maxElevation', stats.maxElevation, (v) => f.elevation(v)),
          item('minElevation', stats.minElevation, (v) => f.elevation(v)),
        ],
      },
      {
        id: 'sensors',
        items: [
          item('avgHeartRate', stats.avgHeartRate, (v) => f.heartRate(v)),
          item('maxHeartRate', stats.maxHeartRate, (v) => f.heartRate(v)),
          item('avgPower', stats.avgPower, (v) => f.power(v)),
          item('maxPower', stats.maxPower, (v) => f.power(v)),
          item('avgCadence', stats.avgCadence, (v) => f.cadence(v, activity.sport)),
          item('maxCadence', stats.maxCadence, (v) => f.cadence(v, activity.sport)),
          item('avgTemperature', stats.avgTemperature, (v) => f.temperature(v)),
        ],
      },
    ];

    return groups
      .map((g) => ({ id: g.id, items: g.items.filter((i): i is StatItem => i !== undefined) }))
      .filter((g) => g.items.length > 0);
  }
}
