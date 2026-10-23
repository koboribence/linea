import { describe, expect, it } from 'vitest';
import { Activity } from '../src/domain/activity/Activity';
import { ElevationProfile } from '../src/domain/route/ElevationProfile';
import { PrivacyZone } from '../src/domain/route/PrivacyZone';
import { RouteHighlights } from '../src/domain/route/RouteHighlights';
import { RouteShape } from '../src/domain/route/RouteShape';
import { RouteSimplifier } from '../src/domain/route/RouteSimplifier';
import { loadFixture, syntheticActivity } from './helpers';

describe('PrivacyZone', () => {
  const distances = [0, 100, 200, 300, 400, 500, 600, 700, 800];

  it('drops points within the distance from both ends', () => {
    expect(new PrivacyZone(200).keepRange(distances)).toEqual([2, 6]);
    expect(new PrivacyZone(0).keepRange(distances)).toEqual([0, 8]);
  });

  it('returns nothing when the route is shorter than the hidden part', () => {
    expect(new PrivacyZone(500).keepRange(distances)).toBeUndefined();
  });
});

describe('RouteSimplifier', () => {
  it('removes points on a straight line but keeps corners', () => {
    const xs = [0, 1, 2, 3, 3, 3];
    const ys = [0, 0, 0, 0, 1, 2];
    expect(RouteSimplifier.simplify(xs, ys, 0.01)).toEqual([0, 3, 5]);
  });
});

describe('RouteShape', () => {
  it('shrinks a long ride to a drawable number of points', async () => {
    const ride = await loadFixture('Edge810-Vector-2013-08-16-15-35-10.fit');
    const shape = RouteShape.fromActivity(ride, new PrivacyZone(200), 'speed')!;
    expect(shape.pointCount).toBeLessThan(ride.points.length / 3);
    expect(shape.hasValues).toBe(true);
  });

  it('fits into a box, keeping proportions and normalized values', async () => {
    const ride = await loadFixture('Edge810-Vector-2013-08-16-15-35-10.fit');
    const box = { x: 100, y: 200, width: 800, height: 600 };
    const points = RouteShape.fromActivity(ride, new PrivacyZone(0), 'elevation')!.fitTo(box);

    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(box.x - 1e-6);
      expect(p.x).toBeLessThanOrEqual(box.x + box.width + 1e-6);
      expect(p.y).toBeGreaterThanOrEqual(box.y - 1e-6);
      expect(p.y).toBeLessThanOrEqual(box.y + box.height + 1e-6);
      expect(p.value).toBeGreaterThanOrEqual(0);
      expect(p.value).toBeLessThanOrEqual(1);
    }
  });

  it('puts north at the top', () => {
    // Two points: south one first
    const activity = new Activity({ sport: 'run', sourceFormat: 'gpx' }, [
      { lat: 47.0, lon: 19.0 },
      { lat: 47.01, lon: 19.0 },
    ]);
    const [south, north] = RouteShape.fromActivity(activity, new PrivacyZone(0), 'solid')!.fitTo({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    expect(north!.y).toBeLessThan(south!.y);
  });
});

describe('ElevationProfile', () => {
  it('samples evenly and skips flat courses', async () => {
    const ride = await loadFixture('Edge810-Vector-2013-08-16-15-35-10.fit');
    const profile = ElevationProfile.fromActivity(ride, 100)!;
    expect(profile.samples).toHaveLength(100);
    expect(profile.max - profile.min).toBeGreaterThan(100);

    const flat = await loadFixture('garmin-edge-820-bike.fit');
    expect(ElevationProfile.fromActivity(flat)).toBeUndefined();
  });
});

describe('RouteHighlights', () => {
  it('finds where the peaks happened, along the shown route', async () => {
    const ride = await loadFixture('Edge810-Vector-2013-08-16-15-35-10.fit');
    const route = RouteShape.fromActivity(ride, new PrivacyZone(200), 'speed')!;
    const highlights = RouteHighlights.find(ride, route.geo);
    expect(highlights.map((h) => h.id)).toEqual([
      'maxSpeed',
      'maxHeartRate',
      'maxPower',
      'highestPoint',
    ]);
    for (const h of highlights) {
      expect(h.progress).toBeGreaterThanOrEqual(0);
      expect(h.progress).toBeLessThanOrEqual(1);
    }
    // The highest point is where the recorded elevation peaks
    const top = Math.max(...ride.points.flatMap((p) => (p.ele === undefined ? [] : [p.ele])));
    const at = highlights.find((h) => h.id === 'highestPoint')!.lngLat;
    const point = ride.points.find((p) => p.lon === at[0] && p.lat === at[1])!;
    expect(point.ele).toBe(top);
  });

  it('ignores peaks inside the privacy zone', () => {
    // 10 m steps north; the highest heart rate is 10 m from the hidden start
    const points = Array.from({ length: 60 }, (_, i) => ({
      lat: 47.5 + i * 0.00009,
      lon: 19,
      heartRate: i === 1 ? 190 : i === 30 ? 170 : 140,
    }));
    const activity = syntheticActivity('ride', points);
    const route = RouteShape.fromActivity(activity, new PrivacyZone(200), 'solid')!;
    const heart = RouteHighlights.find(activity, route.geo).find((h) => h.id === 'maxHeartRate')!;
    expect(heart.lngLat).toEqual([19, points[30]!.lat]);
  });

  it('shows runners their top speed as pace', () => {
    expect(RouteHighlights.statFor('maxSpeed', 'run')).toBe('bestPace');
    expect(RouteHighlights.statFor('maxSpeed', 'ride')).toBe('maxSpeed');
    expect(RouteHighlights.statFor('highestPoint', 'run')).toBe('maxElevation');
  });
});

describe('RouteShape.cut', () => {
  it('keeps the first share of a line by length, ending exactly there', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    expect(RouteShape.cut(line, 0.25)).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 0 },
    ]);
    expect(RouteShape.cut(line, 0.75).at(-1)).toEqual({ x: 10, y: 5 });
    expect(RouteShape.cut(line, 1)).toEqual(line);
  });
});
