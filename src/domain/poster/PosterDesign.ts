import type { Activity } from '../activity/Activity';
import type { SportType } from '../activity/SportType';
import { Graphemes } from '../format/Graphemes';
import type { StatId } from '../format/StatPresenter';
import type { RouteColoring } from '../route/RouteShape';
import { PhotoPlacement, type PhotoSettings } from './PhotoPlacement';
import { PosterFonts, type FontId } from './PosterFont';
import type { PosterFormatId } from './PosterFormat';
import type { ThemeId } from './PosterTheme';

/** Everything the user can change in the editor. Plain data, so it can be stored or shared. */
export interface PosterDesign {
  format: PosterFormatId;
  themeId: ThemeId;
  fontId: FontId;
  customBackground?: string;
  customAccent?: string;
  /** No background: a PNG sticker for the user's own photo */
  transparent: boolean;
  /** Starts as the activity's own name; undefined = automatic title ("Morning Run") */
  title?: string;
  /** Date (no time) above the title */
  showDate: boolean;
  /** Sport name above the title */
  showSport: boolean;
  /** Shown stats in order, at most PosterDefaults.MAX_STATS */
  stats: StatId[];
  routeColoring: RouteColoring;
  /** Line width in pixels on a 1080 px wide image */
  routeWidth: number;
  privacyMeters: number;
  showElevation: boolean;
  showLogo: boolean;
  /** Placement of the background photo; only used while a photo is loaded */
  photo: PhotoSettings;
}

/** The look-and-feel part of a design. Photo placement belongs to one photo, so it's left out. */
export type PosterStyle = Omit<PosterDesign, 'title' | 'stats' | 'photo'>;

/** What carries over to the next file: the look and the picked stats, never the title. */
export type RememberedDesign = Partial<PosterStyle> & { stats?: StatId[] };

const PREFERRED_STATS: Record<SportType, StatId[]> = {
  run: ['distance', 'avgPace', 'movingTime', 'elevationGain'],
  ride: ['distance', 'avgSpeed', 'movingTime', 'elevationGain'],
  other: ['distance', 'movingTime', 'avgSpeed', 'elevationGain'],
};
// Indoor (no GPS): elevation is meaningless, effort is what matters
const INDOOR_STATS: StatId[] = [
  'distance',
  'movingTime',
  'elapsedTime',
  'avgPower',
  'avgHeartRate',
];
// Fills up the list when preferred stats are missing
const FALLBACK_STATS: StatId[] = ['elapsedTime', 'avgPower', 'avgHeartRate', 'calories'];

/** Pace for runners, speed for everyone else: these pairs swap when the sport changes. */
const PACE_SPEED_PAIRS: [StatId, StatId][] = [
  ['avgPace', 'avgSpeed'],
  ['bestPace', 'maxSpeed'],
];

export class PosterDefaults {
  /** The user may pick this many; the layout shrinks the numbers to keep them apart. */
  static readonly MAX_STATS = 6;
  /** A fresh design starts with this many: the most airy layout. */
  static readonly DEFAULT_STAT_COUNT = 4;
  /** Title length in visible characters (an emoji counts as one). */
  static readonly MAX_TITLE = 50;

  static readonly STYLE: PosterStyle = {
    format: 'story',
    themeId: 'volt',
    fontId: 'sport',
    transparent: false,
    showDate: true,
    showSport: true,
    routeColoring: 'speed',
    routeWidth: 10,
    privacyMeters: 200,
    showElevation: true,
    showLogo: true,
  };

  /**
   * A design for a newly loaded activity: its own name as title, the remembered look,
   * and the remembered stats where this activity has them (sport-specific defaults otherwise).
   */
  static create(
    activity: Activity,
    available: StatId[],
    remembered: RememberedDesign = {},
  ): PosterDesign {
    const { stats: rememberedStats, ...style } = remembered;
    const merged = { ...PosterDefaults.STYLE, ...style, photo: PhotoPlacement.DEFAULTS };
    const coloring = PosterDefaults.coloringOptions(activity);
    const name = activity.meta.name?.trim();
    return {
      ...merged,
      title: name ? Graphemes.truncate(name, PosterDefaults.MAX_TITLE) : undefined,
      routeColoring: coloring.includes(merged.routeColoring) ? merged.routeColoring : 'solid',
      // A font set removed in a later version falls back to the default
      fontId: PosterFonts.IDS.includes(merged.fontId) ? merged.fontId : PosterDefaults.STYLE.fontId,
      stats: rememberedStats?.length
        ? PosterDefaults.carryOverStats(rememberedStats, activity, available)
        : PosterDefaults.defaultStats(activity.sport, available, activity.hasGps),
    };
  }

  /**
   * Keeps the previous file's stats that this activity also has (pace ↔ speed swapped
   * for the sport), then tops up with defaults to the same count.
   */
  static carryOverStats(previous: StatId[], activity: Activity, available: StatId[]): StatId[] {
    const target = Math.min(previous.length, PosterDefaults.MAX_STATS);
    const kept = PosterDefaults.adaptStats(previous, activity.sport)
      .filter((id, i, all) => available.includes(id) && all.indexOf(id) === i)
      .slice(0, target);
    for (const id of PosterDefaults.defaultStats(activity.sport, available, activity.hasGps)) {
      if (kept.length >= target) break;
      if (!kept.includes(id)) kept.push(id);
    }
    return kept;
  }

  static defaultStats(sport: SportType, available: StatId[], hasGps = true): StatId[] {
    const has = (id: StatId) => available.includes(id);
    const chosen = (hasGps ? PREFERRED_STATS[sport] : INDOOR_STATS).filter(has);
    for (const id of FALLBACK_STATS) {
      if (chosen.length >= PosterDefaults.DEFAULT_STAT_COUNT) break;
      if (has(id) && !chosen.includes(id)) chosen.push(id);
    }
    return chosen.slice(0, PosterDefaults.DEFAULT_STAT_COUNT);
  }

  /** Swaps pace ↔ speed stats in place, so a sport change keeps the user's layout. */
  static adaptStats(stats: StatId[], sport: SportType): StatId[] {
    return stats.map((id) => {
      for (const [pace, speed] of PACE_SPEED_PAIRS) {
        if (sport === 'run' && id === speed) return pace;
        if (sport !== 'run' && id === pace) return speed;
      }
      return id;
    });
  }

  /** Route colorings that have data behind them. */
  static coloringOptions(activity: Activity): RouteColoring[] {
    const options: RouteColoring[] = ['solid'];
    if (activity.hasTime) options.push('speed');
    if (activity.hasElevation) options.push('elevation');
    if (activity.hasHeartRate) options.push('heartRate');
    return options;
  }
}
