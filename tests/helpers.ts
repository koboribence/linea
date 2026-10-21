import { readFileSync } from 'node:fs';
import { Activity } from '../src/domain/activity/Activity';
import type { SportType } from '../src/domain/activity/SportType';
import type { TrackPoint } from '../src/domain/activity/TrackPoint';
import { ActivityLoader } from '../src/domain/parsing/ActivityLoader';

export function readFixture(name: string): ArrayBuffer {
  const buffer = readFileSync(`tests/fixtures/${name}`);
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

export function loadFixture(name: string): Promise<Activity> {
  return new ActivityLoader().load(name, readFixture(name));
}

/** Synthetic activity: one point per second, starting at t=0. */
export function syntheticActivity(sport: SportType, points: Omit<TrackPoint, 'time'>[]): Activity {
  return new Activity(
    { sport, sourceFormat: 'gpx' },
    points.map((p, i) => ({ ...p, time: i * 1000 })),
  );
}
