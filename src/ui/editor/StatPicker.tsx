import type { StatId, StatItem } from '../../domain/format/StatPresenter';
import { PosterDefaults } from '../../domain/poster/PosterDesign';
import { useLocale } from '../../i18n/LocaleContext';

interface StatPickerProps {
  items: StatItem[];
  selected: StatId[];
  onChange: (selected: StatId[]) => void;
}

/** All stats of the activity as chips; picking order is the order on the image. */
export function StatPicker({ items, selected, onChange }: StatPickerProps) {
  const { i18n } = useLocale();
  const full = selected.length >= PosterDefaults.MAX_STATS;

  const toggle = (id: StatId) => {
    if (selected.includes(id)) onChange(selected.filter((s) => s !== id));
    else if (!full) onChange([...selected, id]);
  };

  return (
    <div className="stat-picker">
      {items.map((item) => {
        const position = selected.indexOf(item.id);
        const isSelected = position !== -1;
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={isSelected}
            disabled={!isSelected && full}
            className="stat-chip"
            onClick={() => toggle(item.id)}
          >
            <span className="stat-chip__label">{i18n.t(`stat.${item.id}`)}</span>
            <span className="stat-chip__value">
              {item.value}
              {item.unit && <span className="stat-chip__unit"> {item.unit}</span>}
            </span>
            {isSelected && <span className="stat-chip__order">{position + 1}</span>}
          </button>
        );
      })}
    </div>
  );
}
