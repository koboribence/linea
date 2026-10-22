import { useCallback, useEffect, useMemo, useState } from 'react';
import { BRAND } from '../../brand';
import type { Activity } from '../../domain/activity/Activity';
import type { SportType } from '../../domain/activity/SportType';
import { StatPresenter } from '../../domain/format/StatPresenter';
import { PosterDefaults, type PosterDesign } from '../../domain/poster/PosterDesign';
import { PosterSceneBuilder } from '../../domain/poster/PosterScene';
import { ElevationProfile } from '../../domain/route/ElevationProfile';
import { PrivacyZone } from '../../domain/route/PrivacyZone';
import { RouteShape } from '../../domain/route/RouteShape';
import { StatsCalculator } from '../../domain/stats/StatsCalculator';
import { useLocale } from '../../i18n/LocaleContext';
import { DesignStorage } from './DesignStorage';

const calculator = new StatsCalculator();

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
  const scene = useMemo(
    () => builder.build({ activity, design, statItems, route, elevation, brandName: BRAND.name }),
    [builder, activity, design, statItems, route, elevation],
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
    statItems,
    hasRoute: route !== undefined,
    hasElevation: elevation !== undefined,
    coloringOptions: PosterDefaults.coloringOptions(activity),
    autoTitle: builder.autoTitle(activity),
  };
}
