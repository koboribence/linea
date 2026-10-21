import type { StatItem } from '../domain/format/StatPresenter';
import { useLocale } from '../i18n/LocaleContext';

export function StatCard({ item, highlight = false }: { item: StatItem; highlight?: boolean }) {
  const { i18n } = useLocale();

  return (
    <div className={highlight ? 'stat stat--highlight' : 'stat'}>
      <dt className="stat__label">{i18n.t(`stat.${item.id}`)}</dt>
      <dd className="stat__value">
        {item.value}
        {item.unit && <span className="stat__unit">{item.unit}</span>}
      </dd>
    </div>
  );
}
