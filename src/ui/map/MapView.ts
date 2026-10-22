import type { LngLat, Map as MapLibreMap, StyleSpecification } from 'maplibre-gl';
import type { CameraShot } from '../../domain/map/FlyoverPath';
import {
  DARK_STYLE_URL,
  MapStyles,
  type MapLook,
  type MapStyleId,
} from '../../domain/map/MapStyles';
import { offset } from '../../domain/stats/geo';

export interface MapViewOptions {
  /** Output size in pixels; the map renders at exactly this resolution */
  width: number;
  height: number;
  style: MapStyleId;
  /** Light, relief and elevation range of the route's area */
  look: MapLook;
  /** Where the camera starts, [lon, lat] */
  center: [number, number];
}

const RAD = Math.PI / 180;
/** The camera stays at least this high above the ground below it, meters. */
const MIN_CLEARANCE = 80;
/** Route points closer than this in front of the camera (or behind it) aren't drawn, meters. */
const MIN_FORWARD = 30;
const METERS_PER_DEGREE = 111_320;

/** Downloaded once per page; every map after that starts from memory. */
let darkBase: Promise<StyleSpecification> | undefined;
function loadBase(): Promise<StyleSpecification> {
  darkBase ??= fetch(DARK_STYLE_URL).then((r) => {
    if (!r.ok) throw new Error(`Map style: HTTP ${r.status}`);
    return r.json() as Promise<StyleSpecification>;
  });
  // A failed download may be retried by the next map
  darkBase.catch(() => (darkBase = undefined));
  return darkBase;
}

/**
 * The 3D map (terrain, relief shading, sky and vector streets), wrapped so the rest of the app only
 * talks in CameraShots and coordinates. MapLibre is loaded on first use, so it costs nothing
 * until a map is shown. The route is not part of the map: project() tells where to draw it.
 */
export class MapView {
  /** Where the camera stands and looks, to leave out route points behind it */
  private camera?: { lon: number; lat: number; bearing: number };

  private constructor(
    private readonly map: MapLibreMap,
    private readonly container: HTMLElement,
    private readonly toLngLat: (coordinate: [number, number]) => LngLat,
    /** Terrain height multiplier, so the camera aims at the raised ground */
    private readonly exaggeration: number,
  ) {}

  /** Starts downloading the map code and base style early, e.g. when a map option is hovered. */
  static preload(): void {
    void loadBase().catch(() => undefined);
    void import('maplibre-gl');
  }

  static async create(parent: HTMLElement, options: MapViewOptions): Promise<MapView> {
    const [{ Map, LngLat, setWorkerUrl }, worker, base] = await Promise.all([
      import('maplibre-gl'),
      // Bundlers move MapLibre around, so tell it where its background worker file ended up
      import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'),
      loadBase(),
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
      style: MapStyles.build(options.style, base, options.look),
      center: options.center,
      zoom: 12,
      interactive: false,
      attributionControl: false, // the credits are drawn onto the image itself
      pixelRatio: 1, // the container already has the output size
      maxPitch: 85,
      fadeDuration: 0,
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
    );
  }

  get canvas(): HTMLCanvasElement {
    return this.map.getCanvas();
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
    const { width, height } = this.canvas;
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

  /** Resolves when everything in view has loaded and rendered (or after a timeout). */
  settle(timeoutMs = 5000): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(done, timeoutMs);
      this.map.once('idle', done);
      this.map.triggerRepaint();
    });
  }

  destroy(): void {
    this.map.remove();
    this.container.remove();
  }
}
