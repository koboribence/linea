import type { Activity } from '../activity/Activity';
import type { SportType } from '../activity/SportType';
import { Graphemes } from '../format/Graphemes';
import type { StatId } from '../format/StatPresenter';
import type { RouteColoring } from '../route/RouteShape';
import type { PosterFormatId } from './PosterFormat';
import type { ThemeId } from './PosterTheme';

/** Everything the user can change in the editor. Plain data, so it can be stored or shared. */
export interface PosterDesign {
  format: PosterFormatId;
  themeId: ThemeId;
  customBackground?: string;
  customAccent?: string;
  /** No background: a PNG sticker for the user's own photo */
  transparent: boolean;
  /** Starts as the activity's own name; undefined = automatic title ("Morning Run") */
  title?: string;
  showDate: boolean;
  /** Shown stats in order, at most PosterDefaults.MAX_STATS */
  stats: StatId[];
  routeColoring: RouteColoring;
  /** Line width in pixels on a 1080 px wide image */
  routeWidth: number;
  privacyMeters: number;
  showElevation: boolean;
  showLogo: boolean;
}

/** The look-and-feel part of a design: remembered between files. */
export type PosterStyle = Omit<PosterDesign, 'title' | 'stats'>;

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
    transparent: false,
    showDate: true,
    routeColoring: 'speed',
    routeWidth: 10,
    privacyMeters: 200,
    showElevation: true,
    showLogo: true,
  };

  /** A good-looking first design: the activity's name, sport-specific stats, remembered style. */
  static create(
    activity: Activity,
    available: StatId[],
    style?: Partial<PosterStyle>,
  ): PosterDesign {
    const merged = { ...PosterDefaults.STYLE, ...style };
    const coloring = PosterDefaults.coloringOptions(activity);
    const name = activity.meta.name?.trim();
    return {
      ...merged,
      title: name ? Graphemes.truncate(name, PosterDefaults.MAX_TITLE) : undefined,
      routeColoring: coloring.includes(merged.routeColoring) ? merged.routeColoring : 'solid',
      stats: PosterDefaults.defaultStats(activity.sport, available, activity.hasGps),
    };
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
