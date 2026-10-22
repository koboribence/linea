import { Activity } from '../src/domain/activity/Activity';
import { describe, expect, it } from 'vitest';
import { StatPresenter } from '../src/domain/format/StatPresenter';
import { UnitFormatter } from '../src/domain/format/UnitFormatter';
import { Color } from '../src/domain/poster/Color';
import { PosterDefaults, type PosterDesign } from '../src/domain/poster/PosterDesign';
import { PosterSceneBuilder } from '../src/domain/poster/PosterScene';
import { PosterTheme } from '../src/domain/poster/PosterTheme';
import { I18n } from '../src/i18n/I18n';
import { loadFixture } from './helpers';

const hu = new I18n('hu');
const builder = new PosterSceneBuilder((k, p) => hu.t(k, p), new UnitFormatter(hu.locale));

describe('PosterDefaults', () => {
  it('picks sport-specific stats', () => {
    const all = ['distance', 'movingTime', 'avgPace', 'avgSpeed', 'elevationGain'] as const;
    expect(PosterDefaults.defaultStats('run', [...all])).toEqual([
      'distance',
      'avgPace',
      'movingTime',
      'elevationGain',
    ]);
    expect(PosterDefaults.defaultStats('ride', [...all])).toEqual([
      'distance',
      'avgSpeed',
      'movingTime',
      'elevationGain',
    ]);
  });

  it('picks effort stats for indoor activities, not elevation', () => {
    const available = [
      'elevationGain',
      'elapsedTime',
      'avgPower',
      'avgHeartRate',
      'calories',
    ] as const;
    expect(PosterDefaults.defaultStats('ride', [...available], false)).toEqual([
      'elapsedTime',
      'avgPower',
      'avgHeartRate',
      'calories',
    ]);
  });

  it('swaps pace and speed when the sport changes', () => {
    expect(PosterDefaults.adaptStats(['distance', 'avgPace'], 'ride')).toEqual([
      'distance',
      'avgSpeed',
    ]);
    expect(PosterDefaults.adaptStats(['maxSpeed'], 'run')).toEqual(['bestPace']);
    // A runner who picked both pace and km/h doesn't get a duplicate after switching
    expect(PosterDefaults.adaptStats(['avgPace', 'avgSpeed'], 'ride')).toEqual(['avgSpeed']);
  });
});

describe('stat picks per sport', () => {
  const runner = (stats?: Parameters<typeof PosterDefaults.create>[2]) =>
    PosterDefaults.create(
      new Activity({ sport: 'run', sourceFormat: 'gpx' }, [{ lat: 47, lon: 19 }]),
      ['distance', 'avgPace', 'avgSpeed', 'movingTime', 'elevationGain', 'avgPower'],
      stats,
    ).stats;

  it('shows pace (min/km) to runners by default, not km/h', () => {
    expect(runner()).toEqual(['distance', 'avgPace', 'movingTime', 'elevationGain']);
  });

  it('falls back from retired map styles and video lengths', () => {
    const design = PosterDefaults.create(
      new Activity({ sport: 'run', sourceFormat: 'gpx' }, [{ lat: 47, lon: 19 }]),
      ['distance'],
      { mapStyle: 'satellite' as never, videoSeconds: 15 },
    );
    expect(design.mapStyle).toBe(PosterDefaults.STYLE.mapStyle);
    expect(design.videoSeconds).toBe(20);
  });

  it('carries picks over only from the same sport', () => {
    expect(runner({ stats: ['avgPower'], statsSport: 'ride' })).not.toContain('avgPower');
    expect(runner({ stats: ['distance'], statsSport: 'run' })).toEqual(['distance']);
    // Stored before sports were tracked: treated as another sport
    expect(runner({ stats: ['avgPower'] })).not.toContain('avgPower');
  });
});

describe('PosterTheme', () => {
  it('keeps text readable on a custom background', () => {
    expect(PosterTheme.resolve('volt', { background: '#ffffff' }).text).toBe('#0e0f12');
    expect(PosterTheme.resolve('chalk', { background: '#101010' }).text).toBe('#f5f5f0');
  });

  it('mixes colors', () => {
    expect(Color.parse('#000').mix(Color.parse('#ffffff'), 0.5).toHex()).toBe('#808080');
  });
});

describe('PosterSceneBuilder', () => {
  it('builds a localized automatic title from the local start time', async () => {
    // Starts 15:35 local time in Newfoundland
    const ride = await loadFixture('Edge810-Vector-2013-08-16-15-35-10.fit');
    expect(builder.autoTitle(ride)).toBe('Délutáni kerékpározás');
  });

  it('uses a typed-in date when the file has none', () => {
    const undated = new Activity({ sport: 'run', sourceFormat: 'gpx' }, [{ lat: 47, lon: 19 }]);
    const design = { ...PosterDefaults.create(undated, []), manualDate: '2026-10-19' };
    const scene = builder.build({ activity: undated, design, statItems: [], brandName: 'Linea' });
    expect(scene.eyebrow).toBe('2026. október 19. · Futás');
  });

  it('shows the date and the sport independently above the title', async () => {
    const ride = await loadFixture('Edge810-Vector-2013-08-16-15-35-10.fit');
    const base = PosterDefaults.create(ride, []);
    const eyebrow = (showDate: boolean, showSport: boolean) =>
      builder.build({
        activity: ride,
        design: { ...base, showDate, showSport },
        statItems: [],
        brandName: 'Linea',
      }).eyebrow;

    expect(eyebrow(true, true)).toBe('2013. augusztus 16. · Kerékpár');
    expect(eyebrow(true, false)).toBe('2013. augusztus 16.');
    expect(eyebrow(false, true)).toBe('Kerékpár');
    expect(eyebrow(false, false)).toBeUndefined();
  });

  it('uses the chosen stats in order, formatted', async () => {
    const run = await loadFixture('test.tcx');
    const items = new StatPresenter(new UnitFormatter('hu-HU'))
      .groups(run, { distance: 4689, avgSpeed: 2.36 })
      .flatMap((g) => g.items);
    const design: PosterDesign = {
      ...PosterDefaults.create(
        run,
        items.map((i) => i.id),
      ),
      stats: ['avgPace', 'distance'],
    };

    const scene = builder.build({ activity: run, design, statItems: items, brandName: 'Linea' });
    expect(scene.stats.map((s) => s.label)).toEqual(['Átlagsebesség', 'Táv']);
    expect(scene.stats[1]).toMatchObject({ value: '4,69', unit: 'km' });
    expect(scene.width).toBe(1080);
  });
});
