import type { LngLat, Map as MapLibreMap, StyleSpecification } from 'maplibre-gl';
import type { CameraShot } from '../../domain/map/FlyoverPath';
import { PlaceLabels, type Place } from '../../domain/map/PlaceLabels';
import {
  BASE_STYLE_URLS,
  MapStyles,
  type MapDetail,
  type MapKind,
  type MapLook,
  type MapPalette,
  type MapTone,
} from '../../domain/map/MapStyles';
import { offset } from '../../domain/stats/geo';

export interface MapViewOptions {
  /** Output size in pixels; the map is laid out at exactly this size */
  width: number;
  height: number;
  /** Drawing resolution relative to the output size: 1 for exports, less for previews */
  pixelRatio?: number;
  /** Tile detail: lighter for previews, full for exports */
  detail?: MapDetail;
  kind: MapKind;
  /** Dark or light base map */
  tone: MapTone;
  /** Terrain relief of the route's area */
  look: MapLook;
  /** Starting colors; recolor() changes them later */
  palette: MapPalette;
  /** Where the camera starts, [lon, lat] */
  center: [number, number];
}

const RAD = Math.PI / 180;
/** The camera stays at least this high above the ground below it, meters. */
const MIN_CLEARANCE = 80;
/** Route points closer than this in front of the camera (or behind it) aren't drawn, meters. */
const MIN_FORWARD = 30;
const METERS_PER_DEGREE = 111_320;
/**
 * Tiles kept in memory per source for flyovers: enough for the whole flight, so playback after
 * warmUp() never waits for the network. (MapLibre's default only covers about one view.)
 */
const FLYOVER_TILE_CACHE = 1200;

/** Base styles, downloaded once per page; every map after that starts from memory. */
const bases = new Map<MapTone, Promise<StyleSpecification>>();
function loadBase(tone: MapTone): Promise<StyleSpecification> {
  let base = bases.get(tone);
  if (!base) {
    base = fetch(BASE_STYLE_URLS[tone]).then((r) => {
      if (!r.ok) throw new Error(`Map style: HTTP ${r.status}`);
      return r.json() as Promise<StyleSpecification>;
    });
    // A failed download may be retried by the next map
    base.catch(() => bases.delete(tone));
    bases.set(tone, base);
  }
  return base;
}

/**
 * The 3D map (terrain, relief shading, sky and vector streets), wrapped so the rest of the app only
 * talks in CameraShots and coordinates. MapLibre is loaded on first use, so it costs nothing
 * until a map is shown. The route is not part of the map: project() tells where to draw it.
 */
export class MapView {
  /** Where the camera stands and looks, to leave out route points behind it */
  private camera?: { lon: number; lat: number; bearing: number };
  /** Counts recolors, to name the marker layer that makes MapLibre redraw the terrain */
  private colorRevision = 0;

  private constructor(
    private readonly map: MapLibreMap,
    private readonly container: HTMLElement,
    private readonly toLngLat: (coordinate: [number, number]) => LngLat,
    /** Terrain height multiplier, so the camera aims at the raised ground */
    private readonly exaggeration: number,
    /** Layout size, for telling which projected points are on screen */
    private readonly size: { width: number; height: number },
    /** What the style was built from, for switching between dark and light in place */
    private readonly options: MapViewOptions,
  ) {
    this.tone = options.tone;
  }

  /** The base map in use: dark or light */
  private tone: MapTone;

  /** Starts downloading the map code and base style early, e.g. when a map option is hovered. */
  static preload(): void {
    // Both base styles are small; the poster's colors decide later which one is used
    for (const tone of ['dark', 'light'] as const) void loadBase(tone).catch(() => undefined);
    void import('maplibre-gl');
  }

  static async create(parent: HTMLElement, options: MapViewOptions): Promise<MapView> {
    const [{ Map, LngLat, setWorkerUrl }, worker, base] = await Promise.all([
      import('maplibre-gl'),
      // Bundlers move MapLibre around, so tell it where its background worker file ended up
      import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'),
      loadBase(options.tone),
      import('maplibre-gl/dist/maplibre-gl.css'),
    ]);
    setWorkerUrl(worker.default);

    const container = document.createElement('div');
    container.className = 'map-view';
    container.style.width = `${options.width}px`;
    container.style.height = `${options.height}px`;
    parent.appendChild(container);

    const map = new Map({
      container,
      style: MapStyles.build(options.kind, base, options.look, options.palette, options.detail),
      center: options.center,
      zoom: 12,
      interactive: false,
      attributionControl: false, // the credits are drawn onto the image itself
      // The container has the output size; previews draw fewer pixels and are scaled up
      pixelRatio: options.pixelRatio ?? 1,
      maxPitch: 85,
      fadeDuration: 0,
      // We place the camera exactly (height included). Otherwise MapLibre moves the view's
      // center onto the terrain whenever a terrain tile arrives, so the map jumps and slides
      // under the route we draw on top
      centerClampedToGround: false,
      // MapLibre caps its cache at (tiles in one view × zoom levels); room for many views
      ...(options.kind === 'flyover' && {
        maxTileCacheSize: FLYOVER_TILE_CACHE,
        maxTileCacheZoomLevels: 40,
      }),
      // Needed to copy the map into the exported image after it rendered
      canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
    });
    try {
      await new Promise<void>((resolve, reject) => {
        map.once('load', () => resolve());
        map.once('error', (event) => reject(event.error));
      });
    } catch (error) {
      map.remove();
      container.remove();
      throw error;
    }
    return new MapView(
      map,
      container,
      ([lng, lat]) => new LngLat(lng, lat),
      options.look.exaggeration,
      { width: options.width, height: options.height },
      options,
    );
  }

  get canvas(): HTMLCanvasElement {
    return this.map.getCanvas();
  }

  /** Moves the map into another element (e.g. from off screen into the preview). */
  mountIn(parent: HTMLElement): void {
    if (this.container.parentElement !== parent) parent.appendChild(this.container);
  }

  /** Changes the drawing resolution, e.g. to match how large the preview is on screen. */
  setPixelRatio(ratio: number): void {
    if (Math.abs(this.map.getPixelRatio() - ratio) > 0.01) this.map.setPixelRatio(ratio);
  }

  /** Puts the camera where the shot says, never below the terrain. */
  setCamera(shot: CameraShot): void {
    const { target, distance, pitch, bearing } = shot;
    const ground = shot.targetElevation * this.exaggeration;
    const camera = offset(target[1], target[0], bearing + 180, distance * Math.sin(pitch * RAD));
    let altitude = ground + distance * Math.cos(pitch * RAD);

    // A hill between camera and route would otherwise swallow the camera
    const below = this.map.queryTerrainElevation(camera);
    if (below !== null && altitude < below + MIN_CLEARANCE) altitude = below + MIN_CLEARANCE;
    this.camera = { lon: camera[0], lat: camera[1], bearing };

    this.map.jumpTo(
      this.map.calculateCameraOptionsFromTo(
        this.toLngLat(camera),
        altitude,
        this.toLngLat(target),
        ground,
      ),
    );
  }

  /**
   * Draws the current view right away instead of on the next animation frame, so the map and
   * the text and route drawn over it show the same moment.
   */
  renderNow(): void {
    this.map.redraw();
  }

  /**
   * Dark ↔ light (and new colors) on the running map. Both base styles use the same tiles,
   * so only the layers change: nothing is downloaded again and the loaded flight stays.
   */
  async restyle(tone: MapTone, palette: MapPalette): Promise<void> {
    if (tone === this.tone) return this.recolor(palette);
    this.tone = tone;
    const base = await loadBase(tone);
    const { kind, look, detail } = this.options;
    this.map.setStyle(MapStyles.build(kind, base, look, palette, detail), { diff: true });
    // Usually applied at once as a diff; a change the diff can't express means a full style
    // reload, which says it's done with 'style.load' (a diff never fires that, so don't wait
    // for it then). isStyleLoaded() won't do: it also waits for tiles.
    const style = (this.map as unknown as { style?: { _loaded?: boolean } }).style;
    if (style?._loaded === false) await new Promise((r) => this.map.once('style.load', r));
  }

  /** New colors for streets, buildings, relief and sky, without reloading anything. */
  recolor(palette: MapPalette): void {
    for (const [layer, property, value] of MapStyles.paints(palette)) {
      if (this.map.getLayer(layer)) this.map.setPaintProperty(layer, property, value);
    }
    this.map.setSky(MapStyles.sky(palette));

    // Layers draped on 3D terrain are cached per tile and only redrawn when the tiles or the
    // list of layers change, not the colors: swapping an empty marker layer forces the redraw
    const previous = `palette-${this.colorRevision}`;
    if (this.map.getLayer(previous)) this.map.removeLayer(previous);
    this.colorRevision++;
    this.map.addLayer(
      {
        id: `palette-${this.colorRevision}`,
        type: 'background',
        paint: { 'background-opacity': 0 },
      },
      this.map.getLayer('background') ? 'background' : undefined,
    );
  }

  /**
   * Flies through the given shots and waits at each until its tiles are in, so a later
   * playback finds the whole flight in the tile cache instead of loading on the way.
   */
  async warmUp(
    shots: CameraShot[],
    onProgress: (share: number) => void,
    signal: AbortSignal,
  ): Promise<void> {
    for (const [i, shot] of shots.entries()) {
      signal.throwIfAborted();
      this.setCamera(shot);
      await this.ready(8000);
      onProgress((i + 1) / shots.length);
    }
  }

  /**
   * Named places in the loaded tiles (whether the style shows them or not), for the
   * renderer's own town names.
   */
  places(): Place[] {
    const features = this.map.querySourceFeatures('openmaptiles', { sourceLayer: 'place' });
    return PlaceLabels.fromFeatures(
      features.flatMap((feature) =>
        feature.geometry.type === 'Point'
          ? [{ ...feature.properties, lngLat: feature.geometry.coordinates as [number, number] }]
          : [],
      ),
    );
  }

  /** Moves the map's focal point into the given band of the image (top/bottom insets, pixels). */
  setPadding(top: number, bottom: number): void {
    this.map.setPadding({ top, bottom, left: 0, right: 0 });
  }

  /**
   * Screen positions of route points on the current view, terrain height included.
   * Same length as the input; points behind the camera, further than `maxDistance` meters
   * (lost in the haze anyway) or far off screen are undefined.
   */
  project(
    coordinates: [number, number][],
    maxDistance = Infinity,
  ): ({ x: number; y: number } | undefined)[] {
    const { width, height } = this.size;
    return coordinates.map((coordinate) => {
      // Behind the camera a projection lands in nonsense places, so those are skipped first
      if (!this.inFront(coordinate, maxDistance)) return undefined;
      const p = this.map.project(coordinate);
      const visible =
        Number.isFinite(p.x) && Math.abs(p.x) < width * 4 && Math.abs(p.y) < height * 4;
      return visible ? { x: p.x, y: p.y } : undefined;
    });
  }

  /** Cheap flat-ground test: is the point ahead of the camera, and not too far away? */
  private inFront([lon, lat]: [number, number], maxDistance: number): boolean {
    const camera = this.camera;
    if (!camera) return true;
    const dx = (lon - camera.lon) * METERS_PER_DEGREE * Math.cos(camera.lat * RAD);
    const dy = (lat - camera.lat) * METERS_PER_DEGREE;
    const b = camera.bearing * RAD;
    const forward = dx * Math.sin(b) + dy * Math.cos(b);
    return forward > MIN_FORWARD && Math.hypot(dx, dy) < maxDistance;
  }

  /**
   * Draws the current view right away and resolves once every tile in it is loaded and drawn
   * (or after a timeout). Faster than waiting for 'idle', which costs extra animation frames,
   * and it keeps working in a background tab, where the browser stops animation frames.
   */
  async ready(timeoutMs = 5000): Promise<void> {
    const deadline = performance.now() + timeoutMs;
    for (;;) {
      // Drawing also asks for the tiles this view still needs
      this.map.redraw();
      if (this.map.areTilesLoaded() || performance.now() >= deadline) return;
      await this.nextData(deadline - performance.now());
    }
  }

  /** Resolves when the next tile (or other map data) arrives, or after `timeoutMs`. */
  private nextData(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.map.off('data', done);
        resolve();
      };
      const timer = setTimeout(done, Math.max(0, timeoutMs));
      this.map.on('data', done);
    });
  }

  destroy(): void {
    this.map.remove();
    this.container.remove();
  }
}
