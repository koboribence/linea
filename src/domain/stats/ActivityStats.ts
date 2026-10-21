/**
 * Activity summary in SI units (m, s, m/s, bpm, W, °C, kcal).
 * A missing field means the data is not available, not zero.
 */
export interface ActivityStats {
  distance?: number;
  elapsedTime?: number;
  movingTime?: number;
  avgSpeed?: number;
  maxSpeed?: number;
  elevationGain?: number;
  elevationLoss?: number;
  minElevation?: number;
  maxElevation?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  avgCadence?: number;
  maxCadence?: number;
  avgPower?: number;
  maxPower?: number;
  avgTemperature?: number;
  calories?: number;
}

/** Totals reported by the recording device. They win over our own calculations. */
export type DeviceSummary = Partial<ActivityStats>;
