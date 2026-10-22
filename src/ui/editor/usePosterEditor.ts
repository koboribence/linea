import { useCallback, useEffect, useMemo, useState } from 'react';
import { BRAND } from '../../brand';
import type { Activity } from '../../domain/activity/Activity';
import type { SportType } from '../../domain/activity/SportType';
import { StatPresenter } from '../../domain/format/StatPresenter';
import { PosterDefaults, type PosterDesign } from '../../domain/poster/PosterDesign';
import { PhotoPlacement } from '../../domain/poster/PhotoPlacement';
import { POSTER_FORMATS } from '../../domain/poster/PosterFormat';
import { PosterSceneBuilder, type PhotoImage } from '../../domain/poster/PosterScene';
import { ElevationProfile } from '../../domain/route/ElevationProfile';
import { PrivacyZone } from '../../domain/route/PrivacyZone';
import { RouteShape } from '../../domain/route/RouteShape';
import { StatsCalculator } from '../../domain/stats/StatsCalculator';
import { useLocale } from '../../i18n/LocaleContext';
import { DesignStorage } from './DesignStorage';
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
export function usePosterEditor(loaded: Activity) {
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

  const [design, setDesign] = useState<PosterDesign>(() =>
    PosterDefaults.create(
      activity,
      statItems.map((item) => item.id),
      DesignStorage.load(),
    ),
  );
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

  const scene = useMemo(
    () =>
      builder.build({
        activity,
        design,
        statItems,
        route,
        elevation,
        photo,
        brandName: BRAND.name,
      }),
    [builder, activity, design, statItems, route, elevation, photo],
  );

  /** Resolves to false when the file isn't a readable image. */
  const setPhoto = useCallback(async (file: File): Promise<boolean> => {
    try {
      const image = await PhotoLoader.load(file);
      setPhotoImage(image);
      setDesign((current) => ({ ...current, photo: PhotoPlacement.DEFAULTS }));
      return true;
    } catch {
      return false;
    }
  }, []);

  const removePhoto = useCallback(() => setPhotoImage(undefined), []);

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
    setDesign((current) => ({ ...current, stats: PosterDefaults.adaptStats(current.stats, next) }));
  }, []);

  return {
    activity,
    design,
    update,
    setSport,
    scene,
    hasPhoto: photo !== undefined,
    setPhoto,
    removePhoto,
    panPhoto,
    statItems,
    hasRoute: route !== undefined,
    hasElevation: elevation !== undefined,
    coloringOptions: PosterDefaults.coloringOptions(activity),
    autoTitle: builder.autoTitle(activity),
  };
}
