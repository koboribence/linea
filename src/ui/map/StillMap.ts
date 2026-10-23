import { FlyoverPath } from '../../domain/map/FlyoverPath';
import { MapFraming } from '../../domain/map/MapFraming';
import {
  MapStyles,
  type MapKind,
  type MapLook,
  type MapTone,
  type PlaceLevel,
} from '../../domain/map/MapStyles';
import { PlaceLabels, type ScreenPlace } from '../../domain/map/PlaceLabels';
import type { PhotoImage } from '../../domain/poster/PosterScene';
import type { GeoRoute } from '../../domain/route/RouteShape';
import { MapView } from './MapView';

export interface StillRequest {
  width: number;
  height: number;
  kind: MapKind;
  tone: MapTone;
  look: MapLook;
  route: GeoRoute;
}

export interface StillResult {
  image: PhotoImage;
  /** The route's points on the image, aligned with route.coordinates */
  points: ({ x: number; y: number } | undefined)[];
  /** Places on the image for town names, and the smallest kind to name */
  places: ScreenPlace[];
  placeLevel: PlaceLevel;
}

/** Results kept, so switching formats back and forth is instant. */
const CACHE_SIZE = 4;

/**
 * The 3D map behind images. One off-screen map is kept alive: its tile cache makes the next
 * render fast, and finished results are cached. The route is framed into a fixed band of each
 * format, so text and style changes never need a new map.
 */
export class StillMap {
  private view?: MapView;
  private viewKey?: string;
  private host?: HTMLElement;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly cache = new Map<string, StillResult>();

  /** Identifies what a render depends on: size, style, look and the route's geometry. */
  static key({ width, height, kind, tone, look, route }: StillRequest): string {
    const first = route.coordinates[0];
    const last = route.coordinates.at(-1);
    const shape = [route.coordinates.length, first, last];
    return [width, height, kind, tone, MapStyles.lookKey(look), ...shape].join('|');
  }

  render(request: StillRequest): Promise<StillResult> {
    const key = StillMap.key(request);
    const cached = this.cache.get(key);
    if (cached) return Promise.resolve(cached);
    // One render at a time: they share the same map
    const result = this.queue.then(() => this.renderNow(request, key));
    this.queue = result.catch(() => undefined);
    return result;
  }

  destroy(): void {
    this.view?.destroy();
    this.host?.remove();
    for (const { image } of this.cache.values()) {
      if (image.source instanceof ImageBitmap) image.source.close();
    }
    this.cache.clear();
  }

  private async renderNow(request: StillRequest, key: string): Promise<StillResult> {
    const { width, height, route } = request;
    const view = await this.viewFor(request);
    const band = MapFraming.band(width, height);

    const path = new FlyoverPath(route, width / height);
    // The map's focal point moves into the band, the camera distance fits the route into it
    view.setPadding(band.top, height - band.bottom);
    view.setCamera(path.overview(FlyoverPath.STILL_PITCH, 0, (band.bottom - band.top) / height));
    await view.ready(20000);

    const bitmap = await createImageBitmap(view.canvas);
    const places = view.places();
    const start = PlaceLabels.startPlace(places, route.coordinates[0]!);
    const named = PlaceLabels.relevant(places, request.look.places, start);
    const result = {
      image: { source: bitmap, width, height },
      points: view.project(route.coordinates),
      places: PlaceLabels.onScreen(named, view.project(named.map((place) => place.lngLat)), start),
      placeLevel: request.look.places,
    };
    this.remember(key, result);
    return result;
  }

  private async viewFor({
    width,
    height,
    kind,
    tone,
    look,
    route,
  }: StillRequest): Promise<MapView> {
    // Dark ↔ light reuses the map (same tiles, new layers); anything else needs a new one
    const viewKey = `${width}|${height}|${kind}|${MapStyles.lookKey(look)}`;
    if (this.view && this.viewKey === viewKey) {
      await this.view.restyle(tone, MapStyles.palette(kind, tone));
      return this.view;
    }
    this.view?.destroy();
    this.view = undefined;
    if (!this.host) {
      // Off screen but still rendered: invisible, behind everything, not clickable
      this.host = document.createElement('div');
      this.host.style.cssText =
        'position:fixed;left:0;top:0;opacity:0;pointer-events:none;z-index:-1;overflow:hidden;';
      document.body.appendChild(this.host);
    }
    const center = route.coordinates[0]!;
    this.view = await MapView.create(this.host, {
      width,
      height,
      kind,
      tone,
      look,
      palette: MapStyles.palette(kind, tone),
      center,
    });
    this.viewKey = viewKey;
    return this.view;
  }

  private remember(key: string, result: StillResult): void {
    this.cache.set(key, result);
    if (this.cache.size <= CACHE_SIZE) return;
    const oldest = this.cache.keys().next().value!;
    const dropped = this.cache.get(oldest)!;
    if (dropped.image.source instanceof ImageBitmap) dropped.image.source.close();
    this.cache.delete(oldest);
  }
}
