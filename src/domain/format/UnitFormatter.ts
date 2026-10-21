import type { SportType } from '../activity/SportType';

/** A display-ready number and its unit, kept apart so the UI can style them differently. */
export interface FormattedValue {
  value: string;
  unit: string;
}

/** Turns SI values into locale-aware display strings (metric units). */
export class UnitFormatter {
  private readonly decimals0: Intl.NumberFormat;
  private readonly decimals1: Intl.NumberFormat;
  private readonly decimals2: Intl.NumberFormat;
  private readonly dateTime: Intl.DateTimeFormat;

  constructor(readonly locale: string) {
    const number = (digits: number) =>
      new Intl.NumberFormat(locale, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
    this.decimals0 = number(0);
    this.decimals1 = number(1);
    this.decimals2 = number(2);
    this.dateTime = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeStyle: 'short' });
  }

  distance(meters: number): FormattedValue {
    const km = meters / 1000;
    // 2 decimals for typical runs, 1 for long rides where the extra digit is noise
    return { value: (km < 100 ? this.decimals2 : this.decimals1).format(km), unit: 'km' };
  }

  duration(seconds: number): FormattedValue {
    return { value: UnitFormatter.clock(seconds), unit: '' };
  }

  /** Minutes per kilometer, the way runners read speed. */
  pace(metersPerSecond: number): FormattedValue {
    if (metersPerSecond < 0.3) return { value: '–', unit: '/km' };
    return { value: UnitFormatter.clock(1000 / metersPerSecond), unit: '/km' };
  }

  speed(metersPerSecond: number): FormattedValue {
    return { value: this.decimals1.format(metersPerSecond * 3.6), unit: 'km/h' };
  }

  elevation(meters: number): FormattedValue {
    return { value: this.decimals0.format(meters), unit: 'm' };
  }

  heartRate(bpm: number): FormattedValue {
    return { value: this.decimals0.format(bpm), unit: 'bpm' };
  }

  power(watts: number): FormattedValue {
    return { value: this.decimals0.format(watts), unit: 'W' };
  }

  cadence(value: number, sport: SportType): FormattedValue {
    return { value: this.decimals0.format(value), unit: sport === 'run' ? 'spm' : 'rpm' };
  }

  temperature(celsius: number): FormattedValue {
    return { value: this.decimals0.format(celsius), unit: '°C' };
  }

  calories(kcal: number): FormattedValue {
    return { value: this.decimals0.format(kcal), unit: 'kcal' };
  }

  date(date: Date): string {
    return this.dateTime.format(date);
  }

  /** 3725 → "1:02:05", 292 → "4:52" */
  private static clock(totalSeconds: number): string {
    const rounded = Math.round(totalSeconds);
    const h = Math.floor(rounded / 3600);
    const m = Math.floor((rounded % 3600) / 60);
    const s = rounded % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }
}
