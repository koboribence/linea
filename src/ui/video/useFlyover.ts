import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { BRAND } from '../../brand';
import type { Activity } from '../../domain/activity/Activity';
import { StatPresenter } from '../../domain/format/StatPresenter';
import { FlyoverPath } from '../../domain/map/FlyoverPath';
import { LiveStats } from '../../domain/map/LiveStats';
import { MapFraming } from '../../domain/map/MapFraming';
import { MapStyles } from '../../domain/map/MapStyles';
import type { PosterDesign } from '../../domain/poster/PosterDesign';
import { POSTER_FORMATS } from '../../domain/poster/PosterFormat';
import { PosterFonts } from '../../domain/poster/PosterFont';
import { PosterRenderer } from '../../domain/poster/PosterRenderer';
import type { PosterScene, PosterSceneBuilder } from '../../domain/poster/PosterScene';
import type { ElevationProfile } from '../../domain/route/ElevationProfile';
import type { RouteShape } from '../../domain/route/RouteShape';
import type { ActivityStats } from '../../domain/stats/ActivityStats';
import { useLocale } from '../../i18n/LocaleContext';
import { FlyoverExporter, type VideoFile } from '../map/FlyoverExporter';
import { MapView } from '../map/MapView';
import { toScreenRoute } from '../map/toScreenRoute';

export interface FlyoverInput {
  activity: Activity;
  stats: ActivityStats;
  design: PosterDesign;
  route: RouteShape;
  elevation?: ElevationProfile;
  builder: PosterSceneBuilder;
}

/** Route is drawn up to this many camera distances away. */
const HAZE_FACTOR = 1.6;

export type ExportState =
  | { status: 'idle' }
  | { status: 'rendering'; share: number }
  | { status: 'done'; file: VideoFile }
  | { status: 'failed' };

/**
 * The video mode: a live 3D map in `hostRef`, text drawn on `overlayRef`, play/scrub controls,
 * and export to a video file. Map, camera and overlay are the same for preview and export.
 */
export function useFlyover(
  input: FlyoverInput,
  hostRef: RefObject<HTMLDivElement | null>,
  overlayRef: RefObject<HTMLCanvasElement | null>,
) {
  const { activity, stats, design, route, elevation, builder } = input;
  const { format } = useLocale();
  const { width, height } = POSTER_FORMATS[design.format];
  const style = design.mapStyle;

  const path = useMemo(
    () =>
      new FlyoverPath(
        route.geo,
        width / height,
        MapStyles.closestCamera(style),
        MapFraming.share(width, height),
      ),
    [route, width, height, style],
  );
  const live = useMemo(
    () => new LiveStats(route.geo, path, activity.startTime?.getTime()),
    [route, path, activity],
  );
  const presenter = useMemo(() => new StatPresenter(format), [format]);

  // The live map; rebuilt only when its size or style changes. Colors, text and the route are
  // drawn on top by our renderer, so changing them never reloads the map.
  const [view, setView] = useState<MapView>();
  const [mapFailed, setMapFailed] = useState(false);
  const start = route.geo.coordinates[0]!;
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let created: MapView | undefined;
    MapView.create(host, { width, height, style, center: start })
      .then((mapView) => {
        if (cancelled) return mapView.destroy();
        created = mapView;
        // The camera's focal point sits between title and stats, like the route on images
        const band = MapFraming.band(width, height);
        mapView.setPadding(band.top, height - band.bottom);
        setMapFailed(false);
        setView(mapView);
      })
      .catch(() => !cancelled && setMapFailed(true));
    return () => {
      cancelled = true;
      created?.destroy();
      setView(undefined);
    };
    // The start point only matters for the very first camera position
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostRef, width, height, style]);

  const moveTo = useCallback((t: number) => view?.setCamera(path.shotAt(t)), [view, path]);

  // Route, text and stats over the map at moment t: same layout as the image,
  // with the route drawing itself and counters ticking up
  const overlayAt = useCallback(
    (t: number): PosterScene => {
      const shot = path.shotAt(t);
      const partial = path.partialRoute(shot.progress);
      // Far ahead the map fades into haze; a crisp line there would only clutter the sky
      const projected = view?.project(partial.coordinates, shot.distance * HAZE_FACTOR) ?? [];
      const routePoints = toScreenRoute(projected, partial.values);
      const finished = t >= FlyoverPath.OUTRO_START;
      const current = finished ? stats : live.snapshot(shot.progress, stats);
      const statItems = presenter.groups(activity, current).flatMap((g) => g.items);
      const scene = builder.build({
        activity,
        design,
        statItems,
        route,
        elevation,
        map: { route: routePoints, showStart: projected[0] !== undefined },
        brandName: BRAND.name,
      });
      return {
        ...scene,
        statsOpacity: Math.min(1, t / FlyoverPath.INTRO_END),
        elevationMarker: shot.progress,
      };
    },
    [view, path, live, stats, presenter, activity, builder, design, route, elevation],
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

  // Playback position 0…1, and whether it's running
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timeRef = useRef(0);

  const drawAt = useCallback(
    (t: number) => {
      if (!view || fontsReady !== design.fontId) return;
      moveTo(t);
      if (overlayRef.current) PosterRenderer.render(overlayRef.current, overlayAt(t));
    },
    [view, fontsReady, design.fontId, moveTo, overlayAt, overlayRef],
  );

  // Paused: show the chosen moment (also redraws when the design changes)
  useEffect(() => {
    if (!playing) drawAt(time);
  }, [playing, time, drawAt]);

  // Playing: real-time preview; tiles may still be loading, the export waits for them
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

  // Export
  const [exportState, setExportState] = useState<ExportState>({ status: 'idle' });
  const abort = useRef<AbortController>(undefined);

  const startExport = useCallback(async () => {
    if (!view) return;
    setPlaying(false);
    abort.current = new AbortController();
    setExportState({ status: 'rendering', share: 0 });
    try {
      await PosterRenderer.loadFonts(font);
      const file = await new FlyoverExporter(view).export({
        seconds: design.videoSeconds,
        moveTo,
        overlayAt,
        signal: abort.current.signal,
        onProgress: (share) => setExportState({ status: 'rendering', share }),
      });
      setExportState({ status: 'done', file });
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === 'AbortError';
      setExportState(cancelled ? { status: 'idle' } : { status: 'failed' });
      if (!cancelled) console.error(error);
    } finally {
      drawAt(timeRef.current);
    }
  }, [view, font, design.videoSeconds, moveTo, overlayAt, drawAt]);

  const cancelExport = useCallback(() => abort.current?.abort(), []);

  // A finished video belongs to the settings it was made with
  useEffect(() => setExportState({ status: 'idle' }), [design, route]);

  return {
    ready: view !== undefined,
    mapFailed,
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
