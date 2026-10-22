import type { StyleSpecification } from 'maplibre-gl';
import { describe, expect, it } from 'vitest';
import { FlyoverPath } from '../src/domain/map/FlyoverPath';
import { LiveStats } from '../src/domain/map/LiveStats';
import { MapStyles } from '../src/domain/map/MapStyles';
import { SunPosition } from '../src/domain/map/SunPosition';
import { PrivacyZone } from '../src/domain/route/PrivacyZone';
import { RouteShape } from '../src/domain/route/RouteShape';
import { StatsCalculator } from '../src/domain/stats/StatsCalculator';
import { bearing, haversine, offset } from '../src/domain/stats/geo';
import { loadFixture } from './helpers';

const ride = await loadFixture('Edge810-Vector-2013-08-16-15-35-10.fit');
const route = RouteShape.fromActivity(ride, new PrivacyZone(200), 'speed')!;
const path = new FlyoverPath(route.geo, 1080 / 1920);

describe('geo helpers', () => {
  it('offset and bearing agree with each other and with the distance', () => {
    const [lon, lat] = offset(47.5, 19.05, 60, 1000);
    expect(haversine(47.5, 19.05, lat, lon)).toBeCloseTo(1000, 0);
    expect(bearing(47.5, 19.05, lat, lon)).toBeCloseTo(60, 0);
  });
});

describe('FlyoverPath', () => {
  it('starts high above the whole route, flies close, and ends with the route complete', () => {
    const intro = path.shotAt(0);
    const follow = path.shotAt(0.5);
    const end = path.shotAt(1);
    expect(intro.progress).toBe(0);
    expect(intro.distance).toBeGreaterThan(follow.distance * 2);
    expect(follow.progress).toBeGreaterThan(0.2);
    expect(follow.progress).toBeLessThan(0.8);
    expect(end.progress).toBe(1);
    expect(end.distance).toBeGreaterThan(follow.distance);
  });

  it('moves smoothly: no jumps between neighbouring frames', () => {
    for (let i = 1; i <= 300; i++) {
      const a = path.shotAt((i - 1) / 300);
      const b = path.shotAt(i / 300);
      const moved = haversine(a.target[1], a.target[0], b.target[1], b.target[0]);
      expect(moved).toBeLessThan(path.length / 60);
      const turn = Math.abs(((b.bearing - a.bearing + 540) % 360) - 180);
      expect(turn).toBeLessThan(6);
    }
  });

  it('keeps the chase camera close enough for the hills to show', () => {
    const distance = path.shotAt(0.5).distance;
    expect(distance).toBeGreaterThanOrEqual(450);
    expect(distance).toBeLessThanOrEqual(1200);
  });

  it('draws the route up to the current point, with coloring values alongside', () => {
    const partial = path.partialRoute(0.4);
    expect(partial.coordinates.at(-1)).toEqual(path.pointAt(0.4));
    expect(partial.values).toHaveLength(partial.coordinates.length);
  });
});

describe('LiveStats', () => {
  const stats = new StatsCalculator().calculate(ride);
  const live = new LiveStats(route.geo, path, ride.startTime?.getTime());

  it('counts distance and time up along the route, never past the final value', () => {
    let previous = 0;
    for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
      const now = live.snapshot(progress, stats);
      expect(now.distance!).toBeGreaterThanOrEqual(previous);
      expect(now.distance!).toBeLessThanOrEqual(stats.distance!);
      expect(now.elapsedTime!).toBeLessThanOrEqual(stats.elapsedTime!);
      previous = now.distance!;
    }
    // The privacy zone hides the first 200 m, which still counts as covered distance
    expect(live.snapshot(0, stats).distance).toBeGreaterThanOrEqual(190);
    expect(live.snapshot(0.5, stats).avgPower).toBe(stats.avgPower);
  });
});

describe('MapStyles', () => {
  const base: StyleSpecification = {
    version: 8,
    sources: {},
    layers: [
      { id: 'background', type: 'background' },
      { id: 'water', type: 'fill', source: 'x' },
      { id: 'building', type: 'fill', source: 'x', 'source-layer': 'building' },
      { id: 'highway_minor', type: 'line', source: 'x', paint: { 'line-color': '#181818' } },
      { id: 'highway_name_other', type: 'symbol', source: 'x' },
      { id: 'place_city', type: 'symbol', source: 'x' },
    ],
  };
  const look = MapStyles.look(route.geo, ride.startTime);

  it('keeps the street map for images, with terrain and shading, and drops label clutter', () => {
    const style = MapStyles.build('streets', base, look);
    const ids = style.layers.map((l) => l.id);
    expect(style.terrain).toEqual({ source: 'terrain', exaggeration: look.exaggeration });
    expect(ids).toEqual([
      'background',
      'water',
      'building',
      'shading',
      'highway_minor',
      'place_city',
    ]);
  });

  it('gives videos lighter streets and 3D buildings', () => {
    const style = MapStyles.build('night', base, look);
    const ids = style.layers.map((l) => l.id);
    expect(ids).toEqual([
      'background',
      'water',
      'building-3d',
      'shading',
      'highway_minor',
      'place_city',
    ]);
    expect(style.layers.find((l) => l.id === 'building-3d')?.type).toBe('fill-extrusion');
    const road = style.layers.find((l) => l.id === 'highway_minor');
    expect(road?.type === 'line' && road.paint?.['line-color']).not.toBe('#181818');
  });

  it('adds the elevation colors under the shading on the neon map', () => {
    const ids = MapStyles.build('neon', base, look).layers.map((l) => l.id);
    expect(ids).toContain('relief');
    expect(ids.indexOf('relief')).toBeLessThan(ids.indexOf('shading'));
  });

  it('lights the dawn map from the sun, with a moonlight fallback at night', () => {
    // Budapest, summer noon: sun high in the south
    const noon = SunPosition.at(new Date('2024-06-21T11:00:00Z'), 47.5, 19.05);
    expect(noon.azimuth).toBeGreaterThan(160);
    expect(noon.azimuth).toBeLessThan(200);
    expect(noon.altitude).toBeGreaterThan(60);
    // Sunrise side in the morning
    const morning = SunPosition.at(new Date('2024-06-21T04:30:00Z'), 47.5, 19.05);
    expect(morning.azimuth).toBeGreaterThan(50);
    expect(morning.azimuth).toBeLessThan(100);

    expect(MapStyles.lighting(noon).altitude).toBe(55);
    const midnight = SunPosition.at(new Date('2024-06-21T22:00:00Z'), 47.5, 19.05);
    expect(MapStyles.lighting(midnight)).toEqual({ direction: 315, altitude: 30 });
  });

  it('lifts flat terrain more than mountains', () => {
    expect(MapStyles.exaggeration(40)).toBeGreaterThan(MapStyles.exaggeration(2000));
  });
});

describe('toScreenRoute', () => {
  it('splits the line where points are hidden and drops stray single points', async () => {
    const { toScreenRoute } = await import('../src/ui/map/toScreenRoute');
    const p = (x: number) => ({ x, y: 0 });
    const route = toScreenRoute(
      [p(1), p(2), undefined, p(3), undefined, p(4), p(5)],
      [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
    );
    expect(route.map((pt) => pt.x)).toEqual([1, 2, 4, 5]);
    expect(route.map((pt) => pt.newSegment ?? false)).toEqual([false, false, true, false]);
    expect(route[2]!.value).toBe(0.5);
  });
});
