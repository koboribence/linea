import type { Activity } from '../activity/Activity';
import type { StatItem } from '../format/StatPresenter';
import { UnitFormatter } from '../format/UnitFormatter';
import type { ElevationProfile } from '../route/ElevationProfile';
import type { RouteShape, ScreenPoint } from '../route/RouteShape';
import type { MessageKey } from '../../i18n/messages/hu';
import { MapStyles, type MapContrast, type MapKind } from '../map/MapStyles';
import type { PhotoSettings } from './PhotoPlacement';
import { PosterFonts, type PosterFont } from './PosterFont';
import type { PosterDesign } from './PosterDesign';
import { POSTER_FORMATS } from './PosterFormat';
import { PosterTheme, type ThemeColors } from './PosterTheme';

export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

export interface PosterStat {
  label: string;
  value: string;
  unit: string;
}

/** A decoded image ready to draw (e.g. an ImageBitmap). */
export interface PhotoImage {
  source: CanvasImageSource;
  width: number;
  height: number;
}

/** Everything the renderer draws, already translated and formatted. */
export interface PosterScene {
  width: number;
  height: number;
  colors: ThemeColors;
  font: PosterFont;
  transparent: boolean;
  photo?: { image: PhotoImage; settings: PhotoSettings };
  eyebrow?: string;
  title: string;
  stats: PosterStat[];
  route?: RouteShape;
  routeWidth: number;
  elevation?: ElevationProfile;
  logo?: string;
  /**
   * 3D map background. `route` holds the route already projected onto the map (screen pixels);
   * without `image` the map is composited underneath afterwards (video frames).
   */
  map?: {
    image?: PhotoImage;
    route?: ScreenPoint[];
    /** False when the route's start is out of view (no start ring then) */
    showStart?: boolean;
    attribution: string[];
    /** Map colors that text and the route must stand out from */
    contrast: MapContrast;
  };
  /** Stats block opacity, for fading it in on video (default 1) */
  statsOpacity?: number;
  /** Position marker on the elevation profile, 0…1 (video) */
  elevationMarker?: number;
}

export interface SceneInput {
  activity: Activity;
  design: PosterDesign;
  /** All formatted stats of the activity; the design picks from these */
  statItems: StatItem[];
  route?: RouteShape;
  elevation?: ElevationProfile;
  /** The user's background photo, if any */
  photo?: PhotoImage;
  /** Use the 3D map as background: the rendered still (none for video) and the projected route */
  map?: { kind: MapKind; image?: PhotoImage; route?: ScreenPoint[]; showStart?: boolean };
  brandName: string;
}

/** Turns activity + design into a PosterScene in the current language. */
export class PosterSceneBuilder {
  constructor(
    private readonly t: Translate,
    private readonly format: UnitFormatter,
  ) {}

  build(input: SceneInput): PosterScene {
    const { activity, design, statItems, route, elevation, photo, map, brandName } = input;
    const size = POSTER_FORMATS[design.format];
    const byId = new Map(statItems.map((item) => [item.id, item]));

    const colors = PosterTheme.resolve(design.themeId, {
      background: design.customBackground,
      accent: design.customAccent,
    });
    return {
      ...size,
      colors,
      font: PosterFonts.PRESETS[design.fontId],
      // A photo fills the background, so the image can't be a transparent sticker at the same time
      transparent: design.transparent && design.background === 'theme' && !photo && !map,
      map: map && {
        ...map,
        attribution: MapStyles.attribution(),
        contrast: this.mapContrast(map.kind, design, colors),
      },
      photo: photo && { image: photo, settings: design.photo },
      eyebrow: this.eyebrow(activity, design),
      title: design.title?.trim() || this.autoTitle(activity),
      stats: design.stats.flatMap((id) => {
        const item = byId.get(id);
        return item ? [{ label: this.t(`stat.${id}`), value: item.value, unit: item.unit }] : [];
      }),
      route,
      routeWidth: design.routeWidth,
      elevation: design.showElevation ? elevation : undefined,
      logo: design.showLogo ? brandName : undefined,
    };
  }

  /** "Morning Run", "Esti kerékpározás": from the local start hour and the sport. */
  autoTitle(activity: Activity): string {
    const start = activity.startTime;
    const noun = this.t(`activity.${activity.sport}`);
    if (!start) return this.t(`sport.${activity.sport}`);
    const hour = UnitFormatter.hour(start, activity.meta.timeZone);
    return this.t('title.auto', {
      daypart: this.t(PosterSceneBuilder.daypart(hour)),
      activity: noun,
    });
  }

  /** The small line above the title: date and/or sport, each switchable. Undefined when empty. */
  /** The colors of the map behind the poster, dark or light like its background. */
  private mapContrast(kind: MapKind, design: PosterDesign, colors: ThemeColors): MapContrast {
    const tone = MapStyles.tone(colors.background[0]);
    return MapStyles.contrast(tone, MapStyles.palette(kind, tone, design.mapStyle, colors.accent));
  }

  private eyebrow(activity: Activity, design: PosterDesign): string | undefined {
    const parts = [
      design.showDate ? this.date(activity, design.manualDate) : undefined,
      design.showSport ? this.t(`sport.${activity.sport}`) : undefined,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(' · ') : undefined;
  }

  /** The activity's own date, or the one the user typed in when the file has none. */
  private date(activity: Activity, manualDate: string | undefined): string | undefined {
    const start = activity.startTime;
    if (start) return this.format.day(start, activity.meta.timeZone);
    if (!manualDate || !/^\d{4}-\d{2}-\d{2}$/.test(manualDate)) return undefined;
    // Noon, so no time zone can push it to the neighboring day
    return this.format.day(new Date(`${manualDate}T12:00:00`));
  }

  private static daypart(hour: number): MessageKey {
    if (hour < 5) return 'daypart.night';
    if (hour < 11) return 'daypart.morning';
    if (hour < 14) return 'daypart.lunch';
    if (hour < 18) return 'daypart.afternoon';
    if (hour < 22) return 'daypart.evening';
    return 'daypart.night';
  }
}
