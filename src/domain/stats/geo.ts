const EARTH_RADIUS = 6_371_008.8; // meters
const RAD = Math.PI / 180;

/** Great-circle distance between two coordinates in meters (haversine formula). */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * RAD;
  const dLon = (lon2 - lon1) * RAD;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(a));
}

/** Compass direction from point 1 to point 2, in degrees (0 = north, 90 = east). */
export function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = lat1 * RAD;
  const φ2 = lat2 * RAD;
  const Δλ = (lon2 - lon1) * RAD;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (((Math.atan2(y, x) / RAD) % 360) + 360) % 360;
}

/** The point reached from (lat, lon) going `meters` in direction `bearingDeg`. Returns [lon, lat]. */
export function offset(
  lat: number,
  lon: number,
  bearingDeg: number,
  meters: number,
): [number, number] {
  const δ = meters / EARTH_RADIUS;
  const θ = bearingDeg * RAD;
  const φ1 = lat * RAD;
  const λ1 = lon * RAD;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 =
    λ1 +
    Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [λ2 / RAD, φ2 / RAD];
}
