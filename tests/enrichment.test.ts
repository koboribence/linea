import { describe, expect, it } from 'vitest';
import { Activity } from '../src/domain/activity/Activity';
import { SportClassifier } from '../src/domain/activity/SportClassifier';
import { FitParser } from '../src/domain/parsing/FitParser';
import { loadFixture, readFixture } from './helpers';

describe('time zone', () => {
  it('comes from the GPS position', async () => {
    const ride = await loadFixture('Edge810-Vector-2013-08-16-15-35-10.fit');
    expect(ride.meta.timeZone).toBe('America/St_Johns');
  });

  it('reads the UTC offset from FIT files (used when there is no GPS)', () => {
    const run = new FitParser().parse(readFixture('garmin-fenix-5-run.fit'));
    expect(run.meta.timeZone).toBe('-07:00');
  });

  it('stays unknown when neither GPS nor offset exists', async () => {
    const indoor = await loadFixture('sample-activity-indoor-trainer.fit');
    expect(indoor.meta.timeZone).toBeUndefined();
  });
});

describe('SportClassifier', () => {
  const classifier = new SportClassifier();
  // 1 point per second at the given speed (m/s)
  const steady = (speed: number) =>
    new Activity(
      { sport: 'other', sourceFormat: 'gpx' },
      Array.from({ length: 120 }, (_, i) => ({ time: i * 1000, distance: i * speed })),
    );

  it('keeps the sport stated in the file', async () => {
    const run = await loadFixture('test.tcx');
    expect(classifier.classify(run)).toBe('run');
  });

  it('guesses from average speed when the file is silent', () => {
    expect(classifier.classify(steady(7))).toBe('ride');
    expect(classifier.classify(steady(3))).toBe('run');
    expect(classifier.classify(steady(1.2))).toBe('other');
  });

  it('is applied while loading', async () => {
    // GPX without <type>, ~11 km/h average
    const activity = await loadFixture('cerknicko-jezero.gpx');
    expect(activity.sport).toBe('run');
  });
});
