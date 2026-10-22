/** Hides the start and end of a route, so the image doesn't reveal where the athlete lives. */
export class PrivacyZone {
  static readonly OPTIONS = [0, 200, 500, 1000] as const;

  constructor(readonly meters: number) {}

  /**
   * Index range [first, last] of the points to keep, given cumulative distances along the route.
   * Returns undefined when nothing would be left.
   */
  keepRange(distances: readonly number[]): [number, number] | undefined {
    if (distances.length < 2) return undefined;
    const total = distances.at(-1)!;
    let first = 0;
    let last = distances.length - 1;
    while (first < distances.length && distances[first]! < this.meters) first++;
    while (last >= 0 && distances[last]! > total - this.meters) last--;
    return last - first >= 1 ? [first, last] : undefined;
  }
}
