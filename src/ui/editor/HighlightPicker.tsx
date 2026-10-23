import type { FormattedValue } from '../../domain/format/UnitFormatter';
import type { HighlightId } from '../../domain/route/RouteHighlights';
import { useLocale } from '../../i18n/LocaleContext';

export interface HighlightItem extends FormattedValue {
  id: HighlightId;
}

interface HighlightPickerProps {
  items: HighlightItem[];
  selected: HighlightId[];
  onChange: (selected: HighlightId[]) => void;
}

/** The peaks this activity has, as chips: the picked ones are pointed out in the video. */
export function HighlightPicker({ items, selected, onChange }: HighlightPickerProps) {
  const { i18n } = useLocale();
  const toggle = (id: HighlightId) =>
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);

  return (
    <div className="stat-picker">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={selected.includes(item.id)}
          className="stat-chip"
          onClick={() => toggle(item.id)}
        >
          <span className="stat-chip__label">{i18n.t(`highlight.${item.id}`)}</span>
          <span className="stat-chip__value">
            {item.value}
            {item.unit && <span className="stat-chip__unit"> {item.unit}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}
