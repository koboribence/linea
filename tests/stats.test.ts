import { describe, expect, it } from 'vitest';
import { StatsCalculator } from '../src/domain/stats/StatsCalculator';
import { syntheticActivity } from './helpers';

const calculator = new StatsCalculator();

describe('StatsCalculator', () => {
  it('counts only moving seconds as moving time', () => {
    // 60 s at 3 m/s, then 30 s standing still
    const points = [
      ...Array.from({ length: 61 }, (_, i) => ({ distance: i * 3 })),
      ...Array.from({ length: 30 }, () => ({ distance: 180 })),
    ];
    const stats = calculator.calculate(syntheticActivity('run', points));
    expect(stats.elapsedTime).toBe(90);
    expect(stats.movingTime).toBe(60);
    expect(stats.avgSpeed).toBeCloseTo(3);
  });

  it('ignores elevation noise below the hysteresis threshold', () => {
    const noisy = Array.from({ length: 100 }, (_, i) => ({ ele: 100 + (i % 2 ? 1 : -1) }));
    expect(calculator.calculate(syntheticActivity('run', noisy)).elevationGain).toBe(0);

    const climb = Array.from({ length: 51 }, (_, i) => ({ ele: 100 + i }));
    expect(calculator.calculate(syntheticActivity('ride', climb)).elevationGain).toBe(50);
  });

  it('leaves out implausible speeds from max speed', () => {
    // Steady 3 m/s with one 200 m teleport
    const points = Array.from({ length: 40 }, (_, i) => ({
      distance: i * 3 + (i >= 20 ? 200 : 0),
    }));
    expect(calculator.calculate(syntheticActivity('run', points)).maxSpeed).toBeCloseTo(3);
  });

  it('averages heart rate and cadence without zero samples', () => {
    const points = [{ heartRate: 0 }, { heartRate: 140 }, { heartRate: 160 }];
    expect(calculator.calculate(syntheticActivity('run', points)).avgHeartRate).toBe(150);
  });

  it('lets device values override computed ones only where present', () => {
    const merged = StatsCalculator.merge(
      { distance: 1000, elevationGain: 10 },
      { distance: 1010, elevationGain: undefined },
    );
    expect(merged).toEqual({ distance: 1010, elevationGain: 10 });
  });
});
