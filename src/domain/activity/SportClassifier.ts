import { StatsCalculator } from '../stats/StatsCalculator';
import type { Activity } from './Activity';
import type { SportType } from './SportType';

/**
 * Guesses run vs. ride when the file doesn't say (e.g. a GPX without <type>).
 * The user can still override the result in the editor.
 */
export class SportClassifier {
  /** Average moving speed (m/s) at or above which we assume cycling (~16 km/h). */
  static readonly RIDE_SPEED = 4.5;
  /** Average moving speed (m/s) at or above which we assume running (~6.8 km/h). */
  static readonly RUN_SPEED = 1.9;

  private readonly calculator = new StatsCalculator();

  classify(activity: Activity): SportType {
    if (activity.sport !== 'other') return activity.sport;
    if (activity.hasPower) return 'ride'; // power meters are almost always on bikes

    const speed = this.calculator.calculate(activity).avgSpeed;
    if (speed === undefined) return 'other';
    if (speed >= SportClassifier.RIDE_SPEED) return 'ride';
    if (speed >= SportClassifier.RUN_SPEED) return 'run';
    return 'other';
  }
}
