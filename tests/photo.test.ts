import { describe, expect, it } from 'vitest';
import { Activity } from '../src/domain/activity/Activity';
import { PhotoPlacement } from '../src/domain/poster/PhotoPlacement';
import { PosterDefaults } from '../src/domain/poster/PosterDesign';

describe('PhotoPlacement', () => {
  const poster = { width: 1080, height: 1920 };
  const landscape = { width: 4000, height: 3000 };
  const centered = PhotoPlacement.DEFAULTS;

  it('covers the whole poster, centered', () => {
    const rect = PhotoPlacement.rect(landscape, poster, centered);
    expect(rect.height).toBeCloseTo(1920);
    expect(rect.width).toBeGreaterThan(1080);
    expect(rect.x).toBeCloseTo(-(rect.width - 1080) / 2);
  });

  it('moves with the pointer in both directions', () => {
    const before = PhotoPlacement.rect(landscape, poster, centered);
    const moved = PhotoPlacement.pan(landscape, poster, centered, 100, -150);
    const after = PhotoPlacement.rect(landscape, poster, { ...centered, ...moved });
    expect(after.x - before.x).toBeCloseTo(100);
    expect(after.y - before.y).toBeCloseTo(-150);
  });

  it('can never be dragged completely out of view', () => {
    for (const [dx, dy] of [
      [99999, 0],
      [-99999, 0],
      [0, 99999],
      [0, -99999],
    ] as const) {
      const offset = PhotoPlacement.pan(landscape, poster, centered, dx, dy);
      const rect = PhotoPlacement.rect(landscape, poster, { ...centered, ...offset });
      // Some of the photo still overlaps the poster
      expect(Math.min(rect.x + rect.width, 1080) - Math.max(rect.x, 0)).toBeGreaterThan(0);
      expect(Math.min(rect.y + rect.height, 1920) - Math.max(rect.y, 0)).toBeGreaterThan(0);
    }
  });

  it('zooms out to show more of the photo', () => {
    const rect = PhotoPlacement.rect(landscape, poster, { ...centered, zoom: 0.5 });
    expect(rect.height).toBeCloseTo(960);
  });
});

describe('stats carried over to the next file', () => {
  const ride = new Activity({ sport: 'ride', sourceFormat: 'gpx' }, [{ lat: 47, lon: 19 }]);

  it('keeps available stats, swaps pace for speed, and fills up to the same count', () => {
    const previous = ['avgPace', 'avgHeartRate', 'distance'] as const;
    const available = ['distance', 'avgSpeed', 'movingTime', 'elevationGain'] as const;
    expect(PosterDefaults.carryOverStats([...previous], ride, [...available])).toEqual([
      'avgSpeed',
      'distance',
      'movingTime',
    ]);
  });

  it('ignores unknown ids from old storage', () => {
    const stored = ['notAStat', 'distance'] as unknown as Parameters<
      typeof PosterDefaults.carryOverStats
    >[0];
    expect(PosterDefaults.carryOverStats(stored, ride, ['distance', 'avgSpeed'])).toEqual([
      'distance',
      'avgSpeed',
    ]);
  });
});
