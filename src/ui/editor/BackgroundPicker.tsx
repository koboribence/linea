import type { BackgroundKind, PosterDesign } from '../../domain/poster/PosterDesign';
import { useLocale } from '../../i18n/LocaleContext';
import { Segmented } from '../controls/Segmented';
import { MapView } from '../map/MapView';
import { MapStylePicker } from './MapStylePicker';
import { PhotoPicker } from './PhotoPicker';

interface BackgroundPickerProps {
  design: PosterDesign;
  update: (changes: Partial<PosterDesign>) => void;
  hasRoute: boolean;
  mapLoading: boolean;
  mapFailed: boolean;
  hasPhoto: boolean;
  onPickPhoto: (file: File) => Promise<boolean>;
  onRemovePhoto: () => void;
}

const KINDS: BackgroundKind[] = ['theme', 'map', 'photo'];

/** What sits behind the text: theme color, the 3D satellite map, or the user's photo. */
export function BackgroundPicker(props: BackgroundPickerProps) {
  const { design, update, hasRoute } = props;
  const { i18n } = useLocale();

  return (
    <>
      <div onPointerEnter={hasRoute ? MapView.preload : undefined}>
        <Segmented
          label={i18n.t('background.section')}
          // The map is offered only with a route to show on it
          options={KINDS.filter((kind) => kind !== 'map' || hasRoute).map((kind) => ({
            value: kind,
            label: i18n.t(`background.${kind}`),
          }))}
          value={design.background}
          onChange={(background) => update({ background })}
        />
      </div>
      {!hasRoute && <p className="field__hint">{i18n.t('map.needsRoute')}</p>}

      {design.background === 'map' && (
        <>
          <MapStylePicker design={design} update={update} />
          {props.mapLoading && (
            <p className="field__hint" role="status">
              {i18n.t('map.loading')}
            </p>
          )}
          {props.mapFailed && (
            <p className="field__error" role="alert">
              {i18n.t('map.failed')}
            </p>
          )}
          <p className="privacy-note">{i18n.t('map.privacy')}</p>
        </>
      )}

      {design.background === 'photo' && (
        <PhotoPicker
          hasPhoto={props.hasPhoto}
          settings={design.photo}
          onChange={(photo) => update({ photo })}
          onPick={props.onPickPhoto}
          onRemove={props.onRemovePhoto}
        />
      )}
    </>
  );
}
