import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import { BRAND } from '../../brand';
import type { Activity } from '../../domain/activity/Activity';
import { StatPresenter } from '../../domain/format/StatPresenter';
import { FlyoverPath } from '../../domain/map/FlyoverPath';
import { LiveStats } from '../../domain/map/LiveStats';
import { MapFraming } from '../../domain/map/MapFraming';
import { PlaceLabels } from '../../domain/map/PlaceLabels';
import { PosterDefaults, type PosterDesign } from '../../domain/poster/PosterDesign';
import { POSTER_FORMATS } from '../../domain/poster/PosterFormat';
import { PosterFonts } from '../../domain/poster/PosterFont';
import { PosterRenderer } from '../../domain/poster/PosterRenderer';
import type { PosterScene, PosterSceneBuilder } from '../../domain/poster/PosterScene';
import type { ElevationProfile } from '../../domain/route/ElevationProfile';
import { RouteHighlights, type Highlight } from '../../domain/route/RouteHighlights';
import type { RouteShape } from '../../domain/route/RouteShape';
import type { ActivityStats } from '../../domain/stats/ActivityStats';
import { useLocale } from '../../i18n/LocaleContext';
import { FlyoverExporter, type VideoFile } from '../map/FlyoverExporter';
import { MapView } from '../map/MapView';
import { toScreenRoute } from '../map/toScreenRoute';
import { FlyoverPreview } from './FlyoverPreview';

export interface FlyoverInput {
  activity: Activity;
  stats: ActivityStats;
  design: PosterDesign;
  route: RouteShape;
  elevation?: ElevationProfile;
  builder: PosterSceneBuilder;
  /** Where the activity's peaks happened (pointed out in long videos) */
  highlights: Highlight[];
}

export interface FlyoverRefs {
  /** Where the live preview map goes */
  host: RefObject<HTMLDivElement | null>;
  /** Text, stats and route over the map */
  overlay: RefObject<HTMLCanvasElement | null>;
  /** A still picture behind everything: the opening view while loading, frames while exporting */
  backdrop: RefObject<HTMLCanvasElement | null>;
}

/** Route is drawn up to this many camera distances away. */
const HAZE_FACTOR = 1.6;
/** A peak's mark fades in over this much of the route after the head passes it. */
const HIGHLIGHT_FADE = 0.02;
/** The flat video draws the route until this moment, then holds on the finished one. */
const FLAT_DRAWN_AT = 0.85;
/** While exporting, every n-th finished frame is shown in the preview. */
const SHOW_EVERY_FRAME = 3;
/** Preview drawing resolution relative to the output: never below this, never above 1. */
const MIN_PIXEL_RATIO = 0.5;

export type ExportState =
  | { status: 'idle' }
  /** `remaining`: estimated seconds left, once there is enough progress to tell */
  | { status: 'rendering'; share: number; remaining?: number }
  | { status: 'done'; file: VideoFile }
  | { status: 'failed' };

/** What the preview shows: loading progress, the playable map, or an error. */
export type PreviewState =
  | { status: 'loading' }
  | { status: 'preparing'; share: number }
  | { status: 'ready' }
  | { status: 'failed' };

/**
 * The video mode: a live 3D map (prepared ahead by FlyoverPreview), text drawn over it,
 * play/scrub controls, and export. The preview map is lighter (less tile detail, fewer pixels);
 * videos are made on a separate full-detail map, so they are the same on every device.
 * `displayScale` is how large the output appears on screen (for the preview's resolution).
 */
export function useFlyover(input: FlyoverInput, refs: FlyoverRefs, displayScale: number) {
  const { activity, stats, design, route, elevation, builder } = input;
  const { format, i18n } = useLocale();
  const { width, height } = POSTER_FORMATS[design.format];

  const path = useMemo(() => FlyoverPreview.pathFor(route, width, height), [route, width, height]);
  const setup = useMemo(() => FlyoverPreview.setupFor(design, route, path), [design, route, path]);
  const live = useMemo(() => new LiveStats(route.geo, path), [route, path]);
  const presenter = useMemo(() => new StatPresenter(format), [format]);

  const [exportState, setExportState] = useState<ExportState>({ status: 'idle' });
  const exporting = exportState.status === 'rendering';

  // The prepared preview map: created here, or already on hover over the mode switch
  useSyncExternalStore(FlyoverPreview.subscribe, FlyoverPreview.getVersion);
  const setupRef = useRef(setup);
  setupRef.current = setup;
  const key = FlyoverPreview.keyOf(setup);
  // Each new attempt (the retry button, or the connection coming back) prepares the map again
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const host = refs.host.current;
    if (exporting || !host) return;
    const preview = FlyoverPreview.prepare(setupRef.current);
    preview.mountIn(host);
    return () => preview.unmount();
  }, [refs.host, key, exporting, attempt]);
  const current = FlyoverPreview.current;
  const preview = !exporting && current?.key === key ? current : undefined;

  // Color and style changes only repaint the running map
  useEffect(() => preview?.recolor(setup.palette), [preview, setup.palette]);

  // Draw only as many pixels as the preview shows on screen
  useEffect(() => {
    const ratio = displayScale * window.devicePixelRatio;
    preview?.setPixelRatio(Math.min(1, Math.max(MIN_PIXEL_RATIO, ratio)));
  }, [preview, displayScale]);

  const view = preview?.status === 'ready' ? preview.view : undefined;

  // Without the 3D map (no connection, no WebGL) the person may pick a flat, top-down video.
  // The 3D map always wins: once it loads (e.g. the connection is back), it takes over again.
  const [flatChosen, setFlatChosen] = useState(false);
  const flat = flatChosen && view === undefined;
  const retry3d = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    if (!flat) return;
    window.addEventListener('online', retry3d);
    return () => window.removeEventListener('online', retry3d);
  }, [flat, retry3d]);
  const previewState: PreviewState = !preview
    ? { status: 'loading' }
    : preview.status === 'preparing'
      ? { status: 'preparing', share: preview.share }
      : { status: preview.status };

  // Town names: the places the preview found, the start one marked
  const places = FlyoverPreview.placesFor(key);
  const level = setup.look.places;
  const named = useMemo(() => {
    if (!places) return [];
    const start = PlaceLabels.startPlace(places, route.geo.coordinates[0]!);
    return PlaceLabels.relevant(places, level, start).map((place) => ({
      place,
      start: place === start,
    }));
  }, [places, level, route]);

  // The stats at their final values: the layout is measured on them, so counters never move it
  const finalStats = useMemo(() => {
    const statItems = presenter.groups(activity, stats).flatMap((g) => g.items);
    return builder.build({ activity, design, statItems, route, elevation, brandName: BRAND.name })
      .stats;
  }, [presenter, activity, stats, builder, design, route, elevation]);

  // The peaks the user picked, with their label and value (long videos only)
  const marks = useMemo(() => {
    if (design.videoSeconds < PosterDefaults.HIGHLIGHT_MIN_SECONDS) return [];
    const items = presenter.groups(activity, stats).flatMap((g) => g.items);
    return input.highlights.flatMap((highlight) => {
      const stat = items.find(
        (s) => s.id === RouteHighlights.statFor(highlight.id, activity.sport),
      );
      if (!design.highlights.includes(highlight.id) || !stat) return [];
      const label = i18n.t(`highlight.${highlight.id}`);
      return [{ highlight, label, value: stat.value, unit: stat.unit }];
    });
  }, [design, presenter, activity, stats, input.highlights, i18n]);

  // Route, text and stats over a map at moment t: same layout as the image,
  // with the route drawing itself and counters ticking up
  const sceneAt = useCallback(
    (map: MapView, t: number): PosterScene => {
      const shot = path.shotAt(t);
      const partial = path.partialRoute(shot.progress);
      // Far ahead the map fades into haze; a crisp line there would only clutter the sky
      const projected = map.project(partial.coordinates, shot.distance * HAZE_FACTOR);
      const routePoints = toScreenRoute(projected, partial.values);
      // Where the whole route will go: names keep clear of it, so they don't hop as it grows
      const fullRoute = design.showPlaces
        ? toScreenRoute(map.project(route.geo.coordinates, shot.distance * HAZE_FACTOR))
        : undefined;
      const placePoints = map.project(
        named.map(({ place }) => place.lngLat),
        shot.distance * HAZE_FACTOR,
      );
      const screenPlaces = named.flatMap(({ place, start }, i) => {
        const point = placePoints[i];
        return point ? [{ ...place, ...point, start }] : [];
      });
      // A peak appears when the route's head passes it, and stays
      const reached = marks.filter(({ highlight }) => shot.progress >= highlight.progress);
      const markPoints = map.project(reached.map(({ highlight }) => highlight.lngLat));
      const highlights = reached.flatMap(({ highlight, label, value, unit }, i) => {
        const point = markPoints[i];
        const opacity = Math.min(1, (shot.progress - highlight.progress) / HIGHLIGHT_FADE);
        return point ? [{ label, value, unit, ...point, opacity }] : [];
      });
      const finished = t >= FlyoverPath.OUTRO_START;
      const current = finished ? stats : live.snapshot(shot.progress, stats);
      const statItems = presenter.groups(activity, current).flatMap((g) => g.items);
      const scene = builder.build({
        activity,
        design,
        statItems,
        route,
        elevation,
        map: {
          kind: 'flyover',
          route: routePoints,
          showStart: projected[0] !== undefined,
          places: screenPlaces,
          placeLevel: level,
          fullRoute,
          highlights,
        },
        brandName: BRAND.name,
      });
      return {
        ...scene,
        statsOpacity: Math.min(1, t / FlyoverPath.INTRO_END),
        elevationMarker: shot.progress,
        statsSizing: finalStats,
      };
    },
    [
      path,
      live,
      stats,
      presenter,
      activity,
      builder,
      design,
      route,
      elevation,
      finalStats,
      named,
      level,
      marks,
    ],
  );

  // Text needs its fonts before the first frame; fallback letters would flash otherwise
  const font = PosterFonts.PRESETS[design.fontId];
  const [fontsReady, setFontsReady] = useState<string>();
  useEffect(() => {
    let cancelled = false;
    void PosterRenderer.loadFonts(font)
      .catch(() => undefined)
      .then(() => !cancelled && setFontsReady(design.fontId));
    return () => {
      cancelled = true;
    };
  }, [font, design.fontId]);
  const fontsLoaded = fontsReady === design.fontId;

  // While loading: the opening view with the whole route and the final stats, in the back
  const backdrop = preview?.backdrop;
  useEffect(() => {
    const canvas = refs.backdrop.current;
    const overlay = refs.overlay.current;
    if (view || flat || exporting || !canvas || !overlay || !backdrop || !fontsLoaded) return;
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')?.drawImage(backdrop.image, 0, 0, width, height);
    const statItems = presenter.groups(activity, stats).flatMap((g) => g.items);
    PosterRenderer.render(
      overlay,
      builder.build({
        activity,
        design,
        statItems,
        route,
        elevation,
        map: { kind: 'flyover', route: toScreenRoute(backdrop.route, route.geo.values) },
        brandName: BRAND.name,
      }),
    );
  }, [
    view,
    flat,
    exporting,
    backdrop,
    fontsLoaded,
    refs,
    width,
    height,
    presenter,
    activity,
    stats,
    builder,
    design,
    route,
    elevation,
  ]);

  // The flat video: the image's 2D route drawing itself on the theme background, counters
  // ticking up, then a moment on the finished route
  const flatSceneAt = useCallback(
    (t: number): PosterScene => {
      const progress = easeSine(Math.min(1, t / FLAT_DRAWN_AT));
      const current = progress >= 1 ? stats : live.snapshot(progress, stats);
      const statItems = presenter.groups(activity, current).flatMap((g) => g.items);
      const scene = builder.build({
        activity,
        design,
        statItems,
        route,
        elevation,
        brandName: BRAND.name,
      });
      return {
        ...scene,
        transparent: false,
        routeProgress: progress,
        elevationMarker: progress,
        statsSizing: finalStats,
      };
    },
    [live, stats, presenter, activity, builder, design, route, elevation, finalStats],
  );

  // Playback position 0…1, and whether it's running
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timeRef = useRef(0);

  const drawAt = useCallback(
    (t: number) => {
      if (!fontsLoaded || !refs.overlay.current) return;
      if (flat) return PosterRenderer.render(refs.overlay.current, flatSceneAt(t));
      if (!view) return;
      view.setCamera(path.shotAt(t));
      // Map and overlay in the same frame: otherwise the route seems to slide on the map
      view.renderNow();
      PosterRenderer.render(refs.overlay.current, sceneAt(view, t));
    },
    [view, flat, fontsLoaded, path, sceneAt, flatSceneAt, refs],
  );

  // Paused: show the chosen moment (also redraws when the design changes)
  useEffect(() => {
    if (!playing) drawAt(time);
  }, [playing, time, drawAt]);

  // Playing: real-time preview over the tiles loaded ahead
  useEffect(() => {
    if (!playing) return;
    const seconds = design.videoSeconds;
    const startedAt = performance.now() - timeRef.current * seconds * 1000;
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - startedAt) / (seconds * 1000));
      timeRef.current = t;
      drawAt(t);
      setTime(t);
      if (t < 1) frame = requestAnimationFrame(tick);
      else setPlaying(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, design.videoSeconds, drawAt]);

  const togglePlay = useCallback(() => {
    setPlaying((now) => {
      // Play from the start again after reaching the end
      if (!now && timeRef.current >= 1) timeRef.current = 0;
      return !now;
    });
  }, []);

  const seek = useCallback((t: number) => {
    setPlaying(false);
    timeRef.current = t;
    setTime(t);
  }, []);

  // Export: on its own full-detail map, off screen; the preview shows the finished frames
  const abort = useRef<AbortController>(undefined);
  const startExport = useCallback(async () => {
    if (!view && !flat) return;
    setPlaying(false);
    abort.current = new AbortController();
    setExportState({ status: 'rendering', share: 0 });
    const started = performance.now();
    let map: MapView | undefined;
    try {
      await PosterRenderer.loadFonts(font);
      if (!flat) {
        // The preview map goes away meanwhile: phones may not have memory for two maps
        FlyoverPreview.release();
        const { tone, look, palette } = setupRef.current;
        map = await MapView.create(FlyoverPreview.offscreen(), {
          width,
          height,
          kind: 'flyover',
          tone,
          look,
          palette,
          detail: 'full',
          center: route.geo.coordinates[0]!,
        });
        const band = MapFraming.band(width, height);
        map.setPadding(band.top, height - band.bottom);
      }
      const exportMap = map;
      let frames = 0;
      const file = await new FlyoverExporter(exportMap).export({
        seconds: design.videoSeconds,
        moveTo: (t) => exportMap?.setCamera(path.shotAt(t)),
        overlayAt: (t) => (exportMap ? sceneAt(exportMap, t) : flatSceneAt(t)),
        signal: abort.current.signal,
        onProgress: (share) => {
          const elapsed = (performance.now() - started) / 1000;
          const remaining = share > 0.03 ? (elapsed * (1 - share)) / share : undefined;
          setExportState({ status: 'rendering', share, remaining });
        },
        onFrame: (frame) => {
          const canvas = refs.backdrop.current;
          if (frames++ % SHOW_EVERY_FRAME !== 0 || !canvas) return;
          canvas.width = width;
          canvas.height = height;
          canvas.getContext('2d')?.drawImage(frame, 0, 0);
        },
      });
      setExportState({ status: 'done', file });
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === 'AbortError';
      setExportState(cancelled ? { status: 'idle' } : { status: 'failed' });
      if (!cancelled) console.error(error);
    } finally {
      map?.destroy();
    }
  }, [
    view,
    flat,
    font,
    width,
    height,
    route,
    design.videoSeconds,
    path,
    sceneAt,
    flatSceneAt,
    refs,
  ]);

  const cancelExport = useCallback(() => abort.current?.abort(), []);

  // A finished video belongs to the settings it was made with
  useEffect(() => setExportState({ status: 'idle' }), [design, route]);

  return {
    ready: view !== undefined || (flat && fontsLoaded),
    preview: previewState,
    /** Making the flat video, because the 3D map isn't available */
    flat,
    chooseFlat: () => setFlatChosen(true),
    retry3d,
    width,
    height,
    time,
    playing,
    togglePlay,
    seek,
    exportState,
    startExport,
    cancelExport,
    canExport: FlyoverExporter.isSupported(),
  };
}

/** Gentle start and end, nearly constant speed in the middle. */
function easeSine(x: number): number {
  return -(Math.cos(Math.PI * Math.max(0, Math.min(1, x))) - 1) / 2;
}
