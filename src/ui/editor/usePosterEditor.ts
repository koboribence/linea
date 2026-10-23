import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Activity } from '../../domain/activity/Activity';
import type { SportType } from '../../domain/activity/SportType';
import { Graphemes } from '../../domain/format/Graphemes';
import { StatPresenter } from '../../domain/format/StatPresenter';
import { MapStyles } from '../../domain/map/MapStyles';
import { PosterDefaults, type PosterDesign } from '../../domain/poster/PosterDesign';
import { PhotoPlacement } from '../../domain/poster/PhotoPlacement';
import { POSTER_FORMATS } from '../../domain/poster/PosterFormat';
import { PosterSceneBuilder, type PhotoImage } from '../../domain/poster/PosterScene';
import { ElevationProfile } from '../../domain/route/ElevationProfile';
import { RouteHighlights } from '../../domain/route/RouteHighlights';
import { PrivacyZone } from '../../domain/route/PrivacyZone';
import { RouteShape } from '../../domain/route/RouteShape';
import { StatsCalculator } from '../../domain/stats/StatsCalculator';
import { useLocale } from '../../i18n/LocaleContext';
import { DesignStorage } from './DesignStorage';
import { toScreenRoute } from '../map/toScreenRoute';
import { useMapSnapshot } from '../map/useMapSnapshot';
import { PhotoLoader } from './PhotoLoader';

const calculator = new StatsCalculator();

/** Frees the decoded image's memory as soon as it's replaced or the editor closes. */
function closePhoto(photo: PhotoImage | undefined): void {
  if (photo?.source instanceof ImageBitmap) photo.source.close();
}

/**
 * Editor state for one loaded activity: the design, the sport override and the derived scene.
 * Expensive parts (stats, route geometry) are recomputed only when their inputs change.
 */
export function usePosterEditor(loaded: Activity, mode: 'image' | 'video' = 'image') {
  const { i18n, format } = useLocale();
  const [sport, setSportState] = useState<SportType>(loaded.sport);

  // Changing the sport changes units, moving-time threshold and which stats make sense
  const activity = useMemo(
    () => (sport === loaded.sport ? loaded : loaded.withMeta({ sport })),
    [loaded, sport],
  );
  const stats = useMemo(() => calculator.calculate(activity), [activity]);
  const statItems = useMemo(
    () => new StatPresenter(format).groups(activity, stats).flatMap((group) => group.items),
    [format, activity, stats],
  );

  const [design, setDesign] = useState<PosterDesign>(() => {
    const created = PosterDefaults.create(
      activity,
      statItems.map((item) => item.id),
      DesignStorage.load(),
    );
    if (created.title) return created;
    // Files without a name (most FIT files) start with the automatic title, ready to edit
    const auto = new PosterSceneBuilder((k, p) => i18n.t(k, p), format).autoTitle(activity);
    return { ...created, title: Graphemes.truncate(auto, PosterDefaults.MAX_TITLE) };
  });
  useEffect(() => DesignStorage.save(design), [design]);

  const route = useMemo(
    () =>
      activity.hasGps
        ? RouteShape.fromActivity(
            activity,
            new PrivacyZone(design.privacyMeters),
            design.routeColoring,
          )
        : undefined,
    [activity, design.privacyMeters, design.routeColoring],
  );
  const elevation = useMemo(() => ElevationProfile.fromActivity(activity), [activity]);

  const builder = useMemo(
    () => new PosterSceneBuilder((k, p) => i18n.t(k, p), format),
    [i18n, format],
  );
  // The decoded photo lives only in memory: never stored, never part of the shareable design
  const [photo, setPhotoImage] = useState<PhotoImage>();
  useEffect(() => () => closePhoto(photo), [photo]);

  // Only the chosen background reaches the image: a loaded photo stays ready but unused otherwise
  const usePhoto = design.background === 'photo' && photo !== undefined;
  // The still map is only needed for images; video mode runs its own live map
  const useMap = mode === 'image' && design.background === 'map' && route !== undefined;
  const baseScene = useMemo(
    () =>
      builder.build({
        activity,
        design,
        statItems,
        route,
        elevation,
        photo: usePhoto ? photo : undefined,
        map: useMap ? { kind: 'streets' } : undefined,
      }),
    [builder, activity, design, statItems, route, elevation, photo, usePhoto, useMap],
  );
  const mapSnapshot = useMapSnapshot(
    useMap,
    route,
    baseScene,
    MapStyles.tone(baseScene.colors.background[0]),
  );
  const scene = useMemo(() => {
    const still = mapSnapshot.result;
    const geo = route?.geo;
    // A previous map stays on screen while the next renders, if the route still lines up with it
    const fits =
      still &&
      geo &&
      still.image.width === baseScene.width &&
      still.image.height === baseScene.height &&
      still.points.length === geo.coordinates.length;
    if (!baseScene.map || !fits) return baseScene;
    const points = toScreenRoute(still.points, geo.values);
    return {
      ...baseScene,
      map: {
        ...baseScene.map,
        image: still.image,
        route: points,
        places: design.showPlaces ? still.places : undefined,
        placeLevel: still.placeLevel,
      },
    };
  }, [baseScene, mapSnapshot.result, route, design.showPlaces]);

  /** Resolves to false when the file isn't a readable image. */
  const setPhoto = useCallback(async (file: File): Promise<boolean> => {
    try {
      const image = await PhotoLoader.load(file);
      setPhotoImage(image);
      setDesign((current) => ({ ...current, photo: PhotoPlacement.DEFAULTS, background: 'photo' }));
      return true;
    } catch {
      return false;
    }
  }, []);

  const removePhoto = useCallback(() => {
    setPhotoImage(undefined);
    setDesign((current) =>
      current.background === 'photo' ? { ...current, background: 'theme' } : current,
    );
  }, []);

  /** Drag on the preview: (dx, dy) in poster pixels. */
  const panPhoto = useCallback(
    (dx: number, dy: number) => {
      if (!photo) return;
      setDesign((current) => {
        const poster = POSTER_FORMATS[current.format];
        const position = PhotoPlacement.pan(photo, poster, current.photo, dx, dy);
        return { ...current, photo: { ...current.photo, ...position } };
      });
    },
    [photo],
  );

  const update = useCallback((changes: Partial<PosterDesign>) => {
    setDesign((current) => ({ ...current, ...changes }));
  }, []);

  const setSport = useCallback((next: SportType) => {
    setSportState(next);
    setDesign((current) => ({
      ...current,
      stats: PosterDefaults.adaptStats(current.stats, next),
      statsSport: next,
    }));
  }, []);

  // Where the peaks happened, for videos that point them out; each with its stat's value
  const highlights = useMemo(
    () => (route ? RouteHighlights.find(activity, route.geo) : []),
    [activity, route],
  );
  const highlightItems = useMemo(
    () =>
      highlights.flatMap(({ id }) => {
        const stat = statItems.find((s) => s.id === RouteHighlights.statFor(id, activity.sport));
        return stat ? [{ ...stat, id }] : [];
      }),
    [highlights, statItems, activity.sport],
  );

  return {
    activity,
    stats,
    design,
    update,
    setSport,
    scene,
    builder,
    route,
    elevation,
    mapLoading: useMap && mapSnapshot.loading,
    mapFailed: useMap && mapSnapshot.failed,
    /** The date line needs a start time; some files (e.g. planned routes) have none */
    hasDate: activity.startTime !== undefined,
    hasPhoto: photo !== undefined,
    setPhoto,
    removePhoto,
    panPhoto,
    statItems,
    highlights,
    highlightItems,
    hasRoute: route !== undefined,
    hasElevation: elevation !== undefined,
    coloringOptions: PosterDefaults.coloringOptions(activity),
    autoTitle: builder.autoTitle(activity),
  };
}
