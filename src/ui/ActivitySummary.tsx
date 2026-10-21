import { useMemo } from 'react';
import type { Activity } from '../domain/activity/Activity';
import { StatPresenter } from '../domain/format/StatPresenter';
import type { ActivityStats } from '../domain/stats/ActivityStats';
import { useLocale } from '../i18n/LocaleContext';
import type { MessageKey } from '../i18n/messages/hu';
import { StatCard } from './StatCard';

interface ActivitySummaryProps {
  activity: Activity;
  stats: ActivityStats;
}

export function ActivitySummary({ activity, stats }: ActivitySummaryProps) {
  const { i18n, format } = useLocale();
  const groups = useMemo(
    () => new StatPresenter(format).groups(activity, stats),
    [format, activity, stats],
  );

  const sportLabel = i18n.t(`sport.${activity.sport}`);
  const name = activity.meta.name;
  const start = activity.startTime;
  const channels: [MessageKey, boolean][] = [
    ['channel.gps', activity.hasGps],
    ['channel.elevation', activity.hasElevation],
    ['channel.heartRate', activity.hasHeartRate],
    ['channel.cadence', activity.hasCadence],
    ['channel.power', activity.hasPower],
  ];

  return (
    <article className="summary">
      <header className="summary__header">
        <p className="summary__eyebrow">
          {start && <time dateTime={start.toISOString()}>{format.date(start)}</time>}
          {/* Without a name the sport becomes the title, so don't repeat it here */}
          {name && (start ? ` · ${sportLabel}` : sportLabel)}
        </p>
        <h1 className="summary__title">{name ?? sportLabel}</h1>
        <p className="summary__meta">
          {activity.meta.device && `${i18n.t('meta.device')}: ${activity.meta.device} · `}
          {activity.meta.sourceFormat.toUpperCase()} ·{' '}
          {i18n.t('meta.points', { count: activity.points.length })}
        </p>
        <ul className="channels">
          {channels.map(([key, present]) => (
            <li key={key} className={present ? 'channel channel--on' : 'channel'}>
              {i18n.t(key)}
            </li>
          ))}
        </ul>
        {!activity.hasGps && <p className="summary__notice">{i18n.t('meta.noGps')}</p>}
      </header>

      {groups.map((group) => (
        <section key={group.id} className="stat-group" aria-labelledby={`group-${group.id}`}>
          <h2 id={`group-${group.id}`} className="stat-group__title">
            {i18n.t(`group.${group.id}`)}
          </h2>
          <dl className="stat-group__grid">
            {group.items.map((item) => (
              <StatCard key={item.id} item={item} highlight={item.id === 'distance'} />
            ))}
          </dl>
        </section>
      ))}
    </article>
  );
}
