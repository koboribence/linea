import { MapStyles } from '../../domain/map/MapStyles';
import type { PosterDesign } from '../../domain/poster/PosterDesign';
import { useLocale } from '../../i18n/LocaleContext';
import { Segmented } from '../controls/Segmented';

interface MapStylePickerProps {
  design: PosterDesign;
  update: (changes: Partial<PosterDesign>) => void;
}

/** Dark vector map (sharp at any distance) or satellite imagery (soft up close). */
export function MapStylePicker({ design, update }: MapStylePickerProps) {
  const { i18n } = useLocale();
  return (
    <div className="field">
      <span className="field__label">{i18n.t('map.style')}</span>
      <Segmented
        label={i18n.t('map.style')}
        options={MapStyles.IDS.map((id) => ({ value: id, label: i18n.t(`mapStyle.${id}`) }))}
        value={design.mapStyle}
        onChange={(mapStyle) => update({ mapStyle })}
      />
      {design.mapStyle === 'satellite' && (
        <p className="field__hint">{i18n.t('mapStyle.satelliteHint')}</p>
      )}
    </div>
  );
}
