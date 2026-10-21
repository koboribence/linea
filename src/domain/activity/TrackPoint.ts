/** One recorded sample. Every field is optional because devices record different channels. */
export interface TrackPoint {
  /** Epoch milliseconds */
  time?: number;
  lat?: number;
  lon?: number;
  /** Meters above sea level */
  ele?: number;
  /** Cumulative distance from the device, meters */
  distance?: number;
  /** m/s */
  speed?: number;
  heartRate?: number;
  /** Steps/min for running, rpm for cycling */
  cadence?: number;
  /** Watts */
  power?: number;
  /** °C */
  temperature?: number;
}
