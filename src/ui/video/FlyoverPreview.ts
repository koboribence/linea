import { FlyoverPath } from '../../domain/map/FlyoverPath';
import { MapFraming } from '../../domain/map/MapFraming';
import type { Place } from '../../domain/map/PlaceLabels';
import { MapStyles, type MapLook, type MapPalette, type MapTone } from '../../domain/map/MapStyles';
import type { PosterDesign } from '../../domain/poster/PosterDesign';
import { POSTER_FORMATS } from '../../domain/poster/PosterFormat';
import { PosterTheme } from '../../domain/poster/PosterTheme';
import type { RouteShape } from '../../domain/route/RouteShape';
import { MapView } from '../map/MapView';

/** Everything the video's map depends on, derived from the design and the route. */
export interface FlyoverSetup {
  route: RouteShape;
  width: number;
  height: number;
  tone: MapTone;
  look: MapLook;
  palette: MapPalette;
  path: FlyoverPath;
}

export type PreviewStatus = 'loading' | 'preparing' | 'ready' | 'failed';

/** The opening view with the whole route, shown dimmed while the rest loads. */
export interface PreviewBackdrop {
  image: ImageBitmap;
  /** The whole route projected onto that view, aligned with route.geo.coordinates */
  route: ({ x: number; y: number } | undefined)[];
}

/** Starting drawing resolution until the preview reports its size on screen. */
const DEFAULT_PIXEL_RATIO = 0.5;

/**
 * The video preview's map, prepared ahead: it can be created off screen (e.g. while the
 * pointer is over the "Video" switch), flies the whole path once to load every tile, and is
 * then moved into the preview. One is kept per page, so switching modes back is instant.
 */
export class FlyoverPreview {
  private static prepared?: FlyoverPreview;
  private static holder?: HTMLElement;
  /** Changes whenever the prepared preview or its progress changes (for React) */
  private static version = 0;
  private static readonly watchers = new Set<() => void>();
  /** Places found by the last prepared preview, kept for the export after it is released */
  private static lastPlaces?: { key: string; places: Place[] };
  private static readonly routeIds = new WeakMap<RouteShape, number>();
  private static nextRouteId = 1;

  status: PreviewStatus = 'loading';
  /** Share of the flight loaded ahead, 0…1 */
  share = 0;
  backdrop?: PreviewBackdrop;
  view?: MapView;
  private readonly abort = new AbortController();
  private mountedIn?: HTMLElement;
  private palette: MapPalette;
  private pixelRatio = DEFAULT_PIXEL_RATIO;

  private constructor(
    readonly key: string,
    readonly setup: FlyoverSetup,
  ) {
    this.palette = setup.palette;
    void this.start();
  }

  /** The prepared preview, if any (it may belong to other settings; compare `key`). */
  static get current(): FlyoverPreview | undefined {
    return FlyoverPreview.prepared;
  }

  /** For useSyncExternalStore: notified on any change of the prepared preview. */
  static subscribe = (watcher: () => void): (() => void) => {
    FlyoverPreview.watchers.add(watcher);
    return () => FlyoverPreview.watchers.delete(watcher);
  };

  static getVersion = (): number => FlyoverPreview.version;

  /** Named places in the area of these settings, once a preview has loaded them. */
  static placesFor(key: string): Place[] | undefined {
    const last = FlyoverPreview.lastPlaces;
    return last?.key === key ? last.places : undefined;
  }

  private static changed(): void {
    FlyoverPreview.version++;
    for (const watcher of FlyoverPreview.watchers) watcher();
  }

  /** The camera path of a route for an output size. */
  static pathFor(route: RouteShape, width: number, height: number): FlyoverPath {
    return new FlyoverPath(route.geo, width / height, undefined, MapFraming.share(width, height));
  }

  /** The map settings for a design and route (same for the preview and the export). */
  static setupFor(design: PosterDesign, route: RouteShape, path?: FlyoverPath): FlyoverSetup {
    const { width, height } = POSTER_FORMATS[design.format];
    const colors = PosterTheme.resolve(design.themeId, {
      background: design.customBackground,
      accent: design.customAccent,
    });
    const tone = MapStyles.tone(colors.background[0]);
    return {
      route,
      width,
      height,
      tone,
      look: MapStyles.look(route.geo),
      palette: MapStyles.palette('flyover', tone, design.mapStyle, colors.accent),
      path: path ?? FlyoverPreview.pathFor(route, width, height),
    };
  }

  /** The preview for these settings: the prepared one if it matches, else a new one. */
  static prepare(setup: FlyoverSetup): FlyoverPreview {
    const key = FlyoverPreview.keyOf(setup);
    const prepared = FlyoverPreview.prepared;
    if (prepared?.key === key && prepared.status !== 'failed') {
      prepared.recolor(setup.palette);
      return prepared;
    }
    prepared?.destroy();
    FlyoverPreview.prepared = new FlyoverPreview(key, setup);
    FlyoverPreview.changed();
    return FlyoverPreview.prepared;
  }

  /** Frees the prepared map (new file, or memory needed for an export). */
  static release(): void {
    FlyoverPreview.prepared?.destroy();
    FlyoverPreview.prepared = undefined;
    FlyoverPreview.changed();
  }

  /** Only what changes the tiles counts; colors are repainted on the running map. */
  static keyOf({ route, width, height, tone, look }: FlyoverSetup): string {
    let id = FlyoverPreview.routeIds.get(route);
    if (id === undefined) {
      id = FlyoverPreview.nextRouteId++;
      FlyoverPreview.routeIds.set(route, id);
    }
    return [id, width, height, tone, MapStyles.lookKey(look)].join('|');
  }

  /** Hidden but rendering: maps prepare (or render a video) here. */
  static offscreen(): HTMLElement {
    if (!FlyoverPreview.holder) {
      FlyoverPreview.holder = document.createElement('div');
      FlyoverPreview.holder.style.cssText =
        'position:fixed;left:0;top:0;opacity:0;pointer-events:none;z-index:-1;overflow:hidden;';
      document.body.appendChild(FlyoverPreview.holder);
    }
    return FlyoverPreview.holder;
  }

  /** Shows the map in `host` (it keeps loading there if it isn't ready yet). */
  mountIn(host: HTMLElement): void {
    this.mountedIn = host;
    this.view?.mountIn(host);
  }

  /** Moves the map back off screen, keeping it ready for the next time. */
  unmount(): void {
    this.mountedIn = undefined;
    this.view?.mountIn(FlyoverPreview.offscreen());
  }

  recolor(palette: MapPalette): void {
    this.palette = palette;
    this.view?.recolor(palette);
  }

  setPixelRatio(ratio: number): void {
    this.pixelRatio = ratio;
    this.view?.setPixelRatio(ratio);
  }

  private async start(): Promise<void> {
    const { width, height, tone, look, path, route } = this.setup;
    try {
      const view = await MapView.create(this.mountedIn ?? FlyoverPreview.offscreen(), {
        width,
        height,
        kind: 'flyover',
        tone,
        look,
        palette: this.palette,
        pixelRatio: this.pixelRatio,
        detail: 'preview',
        center: route.geo.coordinates[0]!,
      });
      if (this.abort.signal.aborted) return view.destroy();
      this.view = view;
      if (this.mountedIn) view.mountIn(this.mountedIn);
      // Colors may have changed while the map was loading
      view.recolor(this.palette);
      const band = MapFraming.band(width, height);
      view.setPadding(band.top, height - band.bottom);

      // The opening view with the whole route, to show while the rest loads
      view.setCamera(path.shotAt(0));
      await view.settle(10_000);
      this.abort.signal.throwIfAborted();
      this.backdrop = {
        image: await createImageBitmap(view.canvas),
        route: view.project(route.geo.coordinates),
      };
      this.update('preparing', 0);

      await view.warmUp(
        path.warmUpShots(),
        (share) => this.update('preparing', share),
        this.abort.signal,
      );
      // Every tile of the flight is loaded now: all the places it will pass are known
      FlyoverPreview.lastPlaces = { key: this.key, places: view.places() };
      this.update('ready', 1);
    } catch (error) {
      if (this.abort.signal.aborted) return;
      console.error(error);
      this.update('failed', 0);
    }
  }

  private update(status: PreviewStatus, share: number): void {
    this.status = status;
    this.share = share;
    if (FlyoverPreview.prepared === this) FlyoverPreview.changed();
  }

  private destroy(): void {
    this.abort.abort();
    this.view?.destroy();
    this.view = undefined;
    this.backdrop?.image.close();
    this.backdrop = undefined;
  }
}
