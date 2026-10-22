/**
 * Douglas–Peucker line simplification: drops points that don't change the shape by more than
 * the tolerance. A 20 000-point ride becomes a few hundred points that look identical.
 */
export class RouteSimplifier {
  /** Indices of the points to keep, in order. Coordinates and tolerance share one unit. */
  static simplify(xs: readonly number[], ys: readonly number[], tolerance: number): number[] {
    const n = xs.length;
    if (n <= 2) return Array.from({ length: n }, (_, i) => i);

    const keep = new Uint8Array(n);
    keep[0] = keep[n - 1] = 1;
    const stack: [number, number][] = [[0, n - 1]];
    const toleranceSq = tolerance * tolerance;

    // Iterative instead of recursive, so very long routes can't overflow the call stack
    while (stack.length > 0) {
      const [start, end] = stack.pop()!;
      let maxDist = 0;
      let index = -1;
      for (let i = start + 1; i < end; i++) {
        const d = RouteSimplifier.segmentDistanceSq(xs, ys, i, start, end);
        if (d > maxDist) {
          maxDist = d;
          index = i;
        }
      }
      if (index !== -1 && maxDist > toleranceSq) {
        keep[index] = 1;
        stack.push([start, index], [index, end]);
      }
    }

    const result: number[] = [];
    for (let i = 0; i < n; i++) if (keep[i]) result.push(i);
    return result;
  }

  /** Squared distance of point p from segment a–b. */
  private static segmentDistanceSq(
    xs: readonly number[],
    ys: readonly number[],
    p: number,
    a: number,
    b: number,
  ): number {
    const ax = xs[a]!;
    const ay = ys[a]!;
    const dx = xs[b]! - ax;
    const dy = ys[b]! - ay;
    const lengthSq = dx * dx + dy * dy;
    let t = lengthSq === 0 ? 0 : ((xs[p]! - ax) * dx + (ys[p]! - ay) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));
    const ex = xs[p]! - (ax + t * dx);
    const ey = ys[p]! - (ay + t * dy);
    return ex * ex + ey * ey;
  }
}
