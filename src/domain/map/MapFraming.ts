/**
 * Where the route sits on a map image or video: the band between the title and the stats.
 * Fixed per format, so text changes never move (and re-render) the map.
 */
export class MapFraming {
  /** Top and bottom of the band, in pixels. Ends above the elevation profile. */
  static band(width: number, height: number): { top: number; bottom: number } {
    const ratio = height / width;
    const [top, bottom] = ratio > 1.5 ? [0.27, 0.52] : ratio > 1.1 ? [0.25, 0.56] : [0.25, 0.58];
    return { top: top * height, bottom: bottom * height };
  }

  /** The band's share of the image height (0…1). */
  static share(width: number, height: number): number {
    const { top, bottom } = MapFraming.band(width, height);
    return (bottom - top) / height;
  }
}
