const RAD = Math.PI / 180;
/** 2000-01-01 12:00 UTC (the J2000 epoch), in days since 1970 */
const J2000_DAYS = 10957.5;

export interface SunAngles {
  /** Compass direction of the sun, degrees (0 = north, 90 = east) */
  azimuth: number;
  /** Height above the horizon, degrees (negative = below) */
  altitude: number;
}

/**
 * Where the sun stood at a time and place. A compact astronomical approximation
 * (accurate to about a degree), plenty for lighting a map like the moment of the activity.
 */
export class SunPosition {
  static at(date: Date, lat: number, lon: number): SunAngles {
    const d = date.getTime() / 86_400_000 - J2000_DAYS;
    const meanAnomaly = (357.529 + 0.98560028 * d) * RAD;
    const meanLongitude = 280.459 + 0.98564736 * d;
    const eclipticLongitude =
      (meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly)) * RAD;
    const obliquity = (23.439 - 0.00000036 * d) * RAD;

    const rightAscension = Math.atan2(
      Math.cos(obliquity) * Math.sin(eclipticLongitude),
      Math.cos(eclipticLongitude),
    );
    const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude));

    const siderealHours = (18.697374558 + 24.06570982441908 * d) % 24;
    const hourAngle = (siderealHours * 15 + lon) * RAD - rightAscension;
    const φ = lat * RAD;

    const altitude = Math.asin(
      Math.sin(φ) * Math.sin(declination) +
        Math.cos(φ) * Math.cos(declination) * Math.cos(hourAngle),
    );
    const azimuth = Math.atan2(
      -Math.sin(hourAngle),
      Math.tan(declination) * Math.cos(φ) - Math.sin(φ) * Math.cos(hourAngle),
    );
    return { azimuth: (((azimuth / RAD) % 360) + 360) % 360, altitude: altitude / RAD };
  }
}
