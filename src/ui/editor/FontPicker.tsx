import { PosterFonts, type FontId } from '../../domain/poster/PosterFont';
import { useLocale } from '../../i18n/LocaleContext';

interface FontPickerProps {
  value: FontId;
  onChange: (fontId: FontId) => void;
}

/** Font sets as cards, each showing a sample written in its own title and number fonts. */
export function FontPicker({ value, onChange }: FontPickerProps) {
  const { i18n } = useLocale();

  return (
    <div className="font-picker" role="radiogroup" aria-label={i18n.t('editor.font')}>
      {PosterFonts.IDS.map((id) => {
        const font = PosterFonts.PRESETS[id];
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={value === id}
            aria-label={
              font.seasonal ? `${i18n.t(`font.${id}`)} (${i18n.t('font.seasonal')})` : undefined
            }
            className="font-card"
            onClick={() => onChange(id)}
          >
            <span
              className="font-card__sample"
              style={{
                fontFamily: font.title.family,
                fontWeight: font.title.weight,
                fontStyle: font.title.italic ? 'italic' : 'normal',
                textTransform: font.uppercase ? 'uppercase' : 'none',
              }}
            >
              Aa
            </span>
            <span
              className="font-card__digits"
              style={{ fontFamily: font.value.family, fontWeight: font.value.weight }}
            >
              4:52
            </span>
            <span className="font-card__name">{i18n.t(`font.${id}`)}</span>
            {font.seasonal && (
              <span className="font-card__badge" title={i18n.t('font.seasonal')}>
                🎃
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
