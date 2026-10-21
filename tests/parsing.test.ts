import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { ActivityLoader } from '../src/domain/parsing/ActivityLoader';
import { ParseError } from '../src/domain/parsing/ParseError';
import { StatsCalculator } from '../src/domain/stats/StatsCalculator';
import { loadFixture, readFixture } from './helpers';

const calculator = new StatsCalculator();
const encode = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;

describe('FIT', () => {
  it('reads a Garmin run with doubled (steps/min) cadence', async () => {
    const activity = await loadFixture('garmin-fenix-5-run.fit');
    expect(activity.sport).toBe('run');
    expect(activity.meta.device).toContain('fenix5');
    expect(activity.hasGps && activity.hasHeartRate && activity.hasCadence).toBe(true);

    const stats = calculator.calculate(activity);
    expect(stats.distance).toBeCloseTo(157.56, 1);
    expect(stats.avgCadence).toBe(166);
  });

  it('reads a ride with power and prefers device totals', async () => {
    const activity = await loadFixture('Edge810-Vector-2013-08-16-15-35-10.fit');
    expect(activity.sport).toBe('ride');
    expect(activity.points).toHaveLength(4700);

    const stats = calculator.calculate(activity);
    expect(stats.distance).toBeCloseTo(41339.38, 1);
    expect(stats.elevationGain).toBe(514);
    expect(stats.avgPower).toBe(276);
    expect(stats.maxPower).toBe(619);
  });

  it('handles indoor rides without GPS: no fake 0 km distance', async () => {
    const activity = await loadFixture('sample-activity-indoor-trainer.fit');
    expect(activity.hasGps).toBe(false);

    const stats = calculator.calculate(activity);
    expect(stats.distance).toBeUndefined();
    expect(stats.avgPower).toBe(201);
    expect(stats.elapsedTime).toBeGreaterThan(2200);
  });

  it('keeps the readable part of a truncated file', async () => {
    const activity = await loadFixture('activity-unexpected-eof.fit');
    expect(activity.points.length).toBeGreaterThan(0);
  });
});

describe('TCX', () => {
  it('reads trackpoints and lap totals', async () => {
    const activity = await loadFixture('test.tcx');
    expect(activity.sport).toBe('run');
    expect(activity.points).toHaveLength(384);
    expect(activity.meta.device).toContain('Forerunner 410');

    const stats = calculator.calculate(activity);
    expect(stats.distance).toBeCloseTo(4689.24, 1);
    expect(stats.maxHeartRate).toBe(189);
    expect(stats.calories).toBe(379);
  });

  it('reports missing heart rate', async () => {
    const activity = await loadFixture('no_hr.tcx');
    expect(activity.hasHeartRate).toBe(false);
    expect(calculator.calculate(activity).avgHeartRate).toBeUndefined();
  });
});

describe('GPX', () => {
  it('reads a Strava export with hr, cadence and power extensions', async () => {
    const activity = await loadFixture('strava-ride-power.gpx');
    expect(activity.sport).toBe('ride');
    expect(activity.meta.name).toBe('Afternoon Ride');
    expect(activity.hasPower && activity.hasHeartRate && activity.hasCadence).toBe(true);
  });

  it('matches the FIT file it was exported from', async () => {
    const gpx = calculator.calculate(await loadFixture('strava-ride-power.gpx'));
    const fit = calculator.calculate(await loadFixture('Edge810-Vector-2013-08-16-15-35-10.fit'));
    expect(Math.abs(gpx.distance! - fit.distance!) / fit.distance!).toBeLessThan(0.005);
    expect(gpx.maxPower).toBe(fit.maxPower);
  });

  it('ignores a GPS spike when computing max speed', async () => {
    // This file has one 184 m jump in 2 s (92 m/s)
    const stats = calculator.calculate(await loadFixture('cerknicko-jezero.gpx'));
    expect(stats.maxSpeed).toBeLessThan(12);
  });

  it('skips time-based stats when timestamps are missing', async () => {
    const activity = await loadFixture('cerknicko-without-times.gpx');
    const stats = calculator.calculate(activity);
    expect(activity.hasTime).toBe(false);
    expect(stats.distance).toBeCloseTo(13665, -1);
    expect(stats.elapsedTime).toBeUndefined();
    expect(stats.avgSpeed).toBeUndefined();
  });
});

describe('ActivityLoader', () => {
  const loader = new ActivityLoader();

  it('unpacks gzipped files', async () => {
    const zipped = new Uint8Array(gzipSync(new Uint8Array(readFixture('test.tcx'))));
    const activity = await loader.load('Test.TCX.GZ', zipped.buffer);
    expect(activity.points).toHaveLength(384);
  });

  it.each([
    ['notes.txt', 'hello', 'unsupported'],
    ['broken.gpx', '<gpx><trk>', 'corrupt'],
    ['empty.gpx', '<gpx version="1.1"></gpx>', 'empty'],
    ['fake.fit', 'not a fit file at all', 'corrupt'],
  ])('rejects %s as %s', async (name, content, code) => {
    const result = loader.load(name, encode(content));
    await expect(result).rejects.toBeInstanceOf(ParseError);
    await expect(result).rejects.toHaveProperty('code', code);
  });
});
