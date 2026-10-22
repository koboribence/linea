import type { Activity } from '../activity/Activity';
import type { StatItem } from '../format/StatPresenter';
import { UnitFormatter } from '../format/UnitFormatter';
import type { ElevationProfile } from '../route/ElevationProfile';
import type { RouteShape } from '../route/RouteShape';
import type { MessageKey } from '../../i18n/messages/hu';
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
  brandName: string;
}

/** Turns activity + design into a PosterScene in the current language. */
export class PosterSceneBuilder {
  constructor(
    private readonly t: Translate,
    private readonly format: UnitFormatter,
  ) {}

  build(input: SceneInput): PosterScene {
    const { activity, design, statItems, route, elevation, photo, brandName } = input;
    const size = POSTER_FORMATS[design.format];
    const byId = new Map(statItems.map((item) => [item.id, item]));

    return {
      ...size,
      colors: PosterTheme.resolve(design.themeId, {
        background: design.customBackground,
        accent: design.customAccent,
      }),
      font: PosterFonts.PRESETS[design.fontId],
      // A photo fills the background, so the image can't be a transparent sticker at the same time
      transparent: design.transparent && !photo,
      photo: photo && { image: photo, settings: design.photo },
      eyebrow: design.showDate ? this.eyebrow(activity) : undefined,
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

  private eyebrow(activity: Activity): string {
    const sport = this.t(`sport.${activity.sport}`);
    const start = activity.startTime;
    return start ? `${this.format.date(start, activity.meta.timeZone)} · ${sport}` : sport;
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
