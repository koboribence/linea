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

  it('never leaves a gap, however far it is dragged', () => {
    const farLeft = PhotoPlacement.pan(landscape, poster, centered, 99999, 0);
    const rect = PhotoPlacement.rect(landscape, poster, { ...centered, ...farLeft });
    expect(rect.x).toBeCloseTo(0);
    expect(rect.x + rect.width).toBeGreaterThanOrEqual(1080);
  });

  it('moves the photo with the pointer', () => {
    const before = PhotoPlacement.rect(landscape, poster, centered);
    const moved = PhotoPlacement.pan(landscape, poster, centered, 100, 0);
    const after = PhotoPlacement.rect(landscape, poster, { ...centered, ...moved });
    expect(after.x - before.x).toBeCloseTo(100);
  });

  it('can pan vertically only after zooming in, when the photo is taller than the poster', () => {
    expect(PhotoPlacement.pan(landscape, poster, centered, 0, 100).posY).toBe(0.5);
    const zoomed = { ...centered, zoom: 2 };
    expect(PhotoPlacement.pan(landscape, poster, zoomed, 0, 100).posY).toBeLessThan(0.5);
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
