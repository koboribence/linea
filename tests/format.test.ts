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

  it('shows running cadence in steps/min (two legs), cycling cadence as is', () => {
    expect(hu.cadence(86, 'run')).toEqual({ value: '172', unit: 'spm' });
    expect(hu.cadence(90, 'ride')).toEqual({ value: '90', unit: 'rpm' });
  });

  it('shows the date in the activity time zone', () => {
    const date = new Date('2013-08-16T18:05:10Z');
    expect(hu.date(date, 'America/St_Johns')).toContain('15:35');
    expect(hu.date(date, '+02:00')).toContain('20:05');
    expect(UnitFormatter.hour(date, 'Europe/Budapest')).toBe(20);
  });

  it('formats the day without the time', () => {
    const date = new Date('2013-08-16T18:05:10Z');
    expect(hu.day(date, 'America/St_Johns')).toBe('2013. augusztus 16.');
    // Late evening in Newfoundland is already the next day in UTC
    expect(hu.day(new Date('2013-08-17T01:00:00Z'), 'America/St_Johns')).toBe(
      '2013. augusztus 16.',
    );
  });
});

describe('StatPresenter', () => {
  const presenter = new StatPresenter(new UnitFormatter('hu-HU'));

  it('offers pace (min/km) to runners, km/h to cyclists', () => {
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
