import { describe, expect, it } from 'vitest';
import { StatPresenter } from '../src/domain/format/StatPresenter';
import { UnitFormatter } from '../src/domain/format/UnitFormatter';
import { I18n } from '../src/i18n/I18n';
import { syntheticActivity } from './helpers';

describe('UnitFormatter', () => {
  const hu = new UnitFormatter('hu-HU');
  const en = new UnitFormatter('en-GB');

  it('uses the locale decimal separator', () => {
    expect(hu.distance(5350)).toEqual({ value: '5,35', unit: 'km' });
    expect(en.distance(5350)).toEqual({ value: '5.35', unit: 'km' });
  });

  it('formats pace, speed and durations', () => {
    expect(hu.pace(1000 / 292)).toEqual({ value: '4:52', unit: '/km' });
    expect(hu.speed(28.4 / 3.6)).toEqual({ value: '28,4', unit: 'km/h' });
    expect(hu.duration(3725).value).toBe('1:02:05');
    expect(hu.duration(292).value).toBe('4:52');
  });

  it('labels cadence by sport', () => {
    expect(hu.cadence(172, 'run').unit).toBe('spm');
    expect(hu.cadence(90, 'ride').unit).toBe('rpm');
  });
});

describe('StatPresenter', () => {
  const presenter = new StatPresenter(new UnitFormatter('hu-HU'));

  it('shows pace for runs and speed for rides', () => {
    const ids = (sport: 'run' | 'ride') =>
      presenter
        .groups(syntheticActivity(sport, [{}]), { avgSpeed: 3, maxSpeed: 4 })
        .flatMap((g) => g.items.map((i) => i.id));
    expect(ids('run')).toEqual(['avgPace', 'bestPace']);
    expect(ids('ride')).toEqual(['avgSpeed', 'maxSpeed']);
  });

  it('drops groups without data', () => {
    const groups = presenter.groups(syntheticActivity('run', [{}]), { distance: 5000 });
    expect(groups.map((g) => g.id)).toEqual(['overview']);
  });
});

describe('I18n', () => {
  it('fills in parameters', () => {
    expect(new I18n('hu').t('meta.points', { count: 12 })).toBe('12 mérési pont');
    expect(new I18n('en').t('meta.points', { count: 12 })).toBe('12 data points');
  });
});
