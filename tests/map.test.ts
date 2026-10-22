import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';
import { describe, expect, it } from 'vitest';
import { FlyoverPath } from '../src/domain/map/FlyoverPath';
import { LiveStats } from '../src/domain/map/LiveStats';
import { MapStyles } from '../src/domain/map/MapStyles';
import { Color } from '../src/domain/poster/Color';
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
  it('starts above the whole route, flies closer, and ends with the route complete', () => {
    const intro = path.shotAt(0);
    const follow = path.shotAt(0.5);
    const end = path.shotAt(1);
    expect(intro.progress).toBe(0);
    expect(intro.distance).toBeGreaterThan(follow.distance * 1.2);
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

  it('keeps the view calm while following: no swinging, no bobbing', () => {
    let maxTurn = 0;
    let maxRise = 0;
    for (let i = 1; i <= 600; i++) {
      const a = path.shotAt((i - 1) / 600);
      const b = path.shotAt(i / 600);
      if (i / 600 <= FlyoverPath.INTRO_END || i / 600 >= FlyoverPath.OUTRO_START) continue;
      maxTurn = Math.max(maxTurn, Math.abs(((b.bearing - a.bearing + 540) % 360) - 180));
      maxRise = Math.max(maxRise, Math.abs(b.targetElevation - a.targetElevation));
    }
    // A 20 s video at 30 fps: under 6°/s of turning, under 1 m of height change per frame
    expect(maxTurn).toBeLessThan(0.2);
    expect(maxRise).toBeLessThan(1);
  });

  it('ends by showing the finished route for a while', () => {
    const hold = [FlyoverPath.HOLD_START, 0.95, 1].map((t) => path.shotAt(t));
    for (const shot of hold) {
      expect(shot.progress).toBe(1);
      expect(shot.distance).toBeGreaterThan(path.shotAt(0.5).distance);
    }
    // Still moving slowly, not frozen
    expect(hold[2]!.bearing).not.toBeCloseTo(hold[0]!.bearing, 1);
  });

  it('loads the flight ahead with few shots, each view close to the previous one', () => {
    const shots = path.warmUpShots();
    expect(shots.length).toBeLessThan(60);
    expect(shots[0]).toEqual(path.shotAt(0));
    expect(shots.at(-1)).toEqual(path.shotAt(1));
    for (let i = 1; i < shots.length; i++) {
      const [a, b] = [shots[i - 1]!, shots[i]!];
      const moved =
        haversine(a.target[1], a.target[0], b.target[1], b.target[0]) /
        Math.min(a.distance, b.distance);
      // Each step is just over the threshold at most (one of 600 checks later)
      expect(moved).toBeLessThan(0.4);
      expect(Math.abs(Math.log2(b.distance / a.distance))).toBeLessThan(0.45);
    }
  });

  it('follows from a bit closer than the still image shows the whole route', () => {
    const still = path.overview(FlyoverPath.STILL_PITCH, 0).distance;
    expect(path.shotAt(0.5).distance / still).toBeCloseTo(1 / 1.18, 2);
  });

  it('draws the route up to the current point, with coloring values alongside', () => {
    const partial = path.partialRoute(0.4);
    expect(partial.coordinates.at(-1)).toEqual(path.pointAt(0.4));
    expect(partial.values).toHaveLength(partial.coordinates.length);
  });
});

describe('LiveStats', () => {
  const stats = new StatsCalculator().calculate(ride);
  const live = new LiveStats(route.geo, path);

  it('counts distance and time up along the route, never past the final value', () => {
    let previous = 0;
    for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
      const now = live.snapshot(progress, stats);
      expect(now.distance!).toBeGreaterThanOrEqual(previous);
      expect(now.distance!).toBeLessThanOrEqual(stats.distance!);
      expect(now.elapsedTime!).toBeLessThanOrEqual(stats.elapsedTime!);
      previous = now.distance!;
    }
    // Counters start from zero even though a privacy zone hides the first 200 m
    const start = live.snapshot(0, stats);
    expect([start.distance, start.elapsedTime, start.movingTime, start.elevationGain]).toEqual([
      0, 0, 0, 0,
    ]);
    const end = live.snapshot(1, stats);
    expect(end.distance).toBeCloseTo(stats.distance!, 6);
    expect(end.elapsedTime).toBeCloseTo(stats.elapsedTime!, 6);
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
      { id: 'place_city', type: 'symbol', source: 'x', layout: { 'text-size': 10 } },
    ],
  };
  const look = MapStyles.look(route.geo);
  const streets = MapStyles.palette('streets', 'dark');

  it('keeps the street map for images, with terrain and shading, and drops label clutter', () => {
    const style = MapStyles.build('streets', base, look, streets);
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
    // Images keep the base style's own street colors
    const road = style.layers.find((l) => l.id === 'highway_minor');
    expect(road?.type === 'line' && road.paint?.['line-color']).toBe('#181818');
  });

  it('enlarges town names, also on zoom curves', () => {
    const curve: LayerSpecification = {
      id: 'label_city',
      type: 'symbol',
      source: 'x',
      layout: { 'text-size': ['interpolate', ['linear'], ['zoom'], 8, 10, 14, 20] },
    };
    const style = MapStyles.build(
      'streets',
      { ...base, layers: [...base.layers, curve] },
      look,
      streets,
    );
    const size = (id: string) => {
      const layer = style.layers.find((l) => l.id === id);
      return layer?.type === 'symbol' ? layer.layout?.['text-size'] : undefined;
    };
    expect(size('place_city')).toBeCloseTo(12);
    expect(size('label_city')).toEqual(['interpolate', ['linear'], ['zoom'], 8, 12, 14, 24]);
  });

  it('gives videos streets and 3D buildings in the palette colors', () => {
    const palette = MapStyles.palette('flyover', 'dark');
    const style = MapStyles.build('flyover', base, look, palette);
    const ids = style.layers.map((l) => l.id);
    expect(ids).toEqual([
      'background',
      'water',
      'building-3d',
      'shading',
      'highway_minor',
      'place_city',
    ]);
    const building = style.layers.find((l) => l.id === 'building-3d');
    expect(building?.type === 'fill-extrusion' && building.paint?.['fill-extrusion-color']).toBe(
      palette.building,
    );
    const road = style.layers.find((l) => l.id === 'highway_minor');
    expect(road?.type === 'line' && road.paint?.['line-color']).toBe(palette.road);
  });

  it('follows the background: a dark map for dark colors, a light one for light colors', () => {
    expect(MapStyles.tone('#0e0f12')).toBe('dark');
    expect(MapStyles.tone('#f5f5f0')).toBe('light');
    const dark = Color.parse(MapStyles.palette('flyover', 'dark').land);
    const light = Color.parse(MapStyles.palette('flyover', 'light').land);
    expect(light.luminance).toBeGreaterThan(dark.luminance);
  });

  it('tints the plain look slightly with the accent color', () => {
    const plain = MapStyles.palette('flyover', 'dark', 'neutral', '#ff0000');
    const tinted = MapStyles.palette('flyover', 'dark', 'tinted', '#ff0000');
    expect(plain).toEqual(MapStyles.palette('flyover', 'dark', 'neutral', '#00ff00'));
    const red = (hex: string) => parseInt(hex.slice(1, 3), 16);
    expect(red(tinted.road)).toBeGreaterThan(red(plain.road));
    // Still a dark map
    expect(Color.parse(tinted.building).isDark).toBe(true);
  });

  it('names the most contrasting map color for text: brightest when dark, darkest when light', () => {
    const dark = MapStyles.contrast('dark', MapStyles.palette('flyover', 'dark'));
    const light = MapStyles.contrast('light', MapStyles.palette('flyover', 'light'));
    expect(Color.parse(dark.extreme).luminance).toBeGreaterThan(Color.parse(dark.land).luminance);
    expect(Color.parse(light.extreme).luminance).toBeLessThan(Color.parse(light.land).luminance);
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
