import { useRef, useState } from 'react';
import { PhotoPlacement, type PhotoSettings } from '../../domain/poster/PhotoPlacement';
import { useLocale } from '../../i18n/LocaleContext';
import { PhotoLoader } from './PhotoLoader';

interface PhotoPickerProps {
  hasPhoto: boolean;
  settings: PhotoSettings;
  onChange: (settings: PhotoSettings) => void;
  onPick: (file: File) => Promise<boolean>;
  onRemove: () => void;
}

/** Background photo: pick, overlay strength, zoom; position is set by dragging the preview. */
export function PhotoPicker({ hasPhoto, settings, onChange, onPick, onRemove }: PhotoPickerProps) {
  const { i18n } = useLocale();
  const input = useRef<HTMLInputElement>(null);
  const [failed, setFailed] = useState(false);
  const percent = (value: number) => `${Math.round(value * 100)}%`;

  const pick = async (file: File) => setFailed(!(await onPick(file)));

  return (
    <>
      <input
        ref={input}
        id="photo-file"
        type="file"
        accept={PhotoLoader.ACCEPT}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void pick(file);
          event.target.value = ''; // allow choosing the same photo again
        }}
      />

      {!hasPhoto ? (
        <button
          type="button"
          className="button button--secondary button--small"
          onClick={() => input.current?.click()}
        >
          {i18n.t('photo.add')}
        </button>
      ) : (
        <>
          <label className="field">
            <span className="field__label field__label--split">
              {i18n.t('photo.overlay')}
              <span className="field__counter">{percent(settings.overlay)}</span>
            </span>
            <input
              id="photo-overlay"
              className="range"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={settings.overlay}
              onChange={(event) => onChange({ ...settings, overlay: Number(event.target.value) })}
            />
          </label>
          <label className="field">
            <span className="field__label field__label--split">
              {i18n.t('photo.zoom')}
              <span className="field__counter">{percent(settings.zoom)}</span>
            </span>
            <input
              id="photo-zoom"
              className="range"
              type="range"
              min={1}
              max={PhotoPlacement.MAX_ZOOM}
              step={0.01}
              value={settings.zoom}
              onChange={(event) => onChange({ ...settings, zoom: Number(event.target.value) })}
            />
          </label>
          <p className="field__hint">{i18n.t('photo.dragHint')}</p>
          <div className="theme-actions">
            <button
              type="button"
              className="button button--secondary button--small"
              onClick={() => onChange({ ...settings, zoom: 1, posX: 0.5, posY: 0.5 })}
            >
              {i18n.t('photo.center')}
            </button>
            <button
              type="button"
              className="button button--secondary button--small"
              onClick={() => input.current?.click()}
            >
              {i18n.t('photo.replace')}
            </button>
            <button type="button" className="link-button" onClick={onRemove}>
              {i18n.t('photo.remove')}
            </button>
          </div>
        </>
      )}

      {failed && (
        <p className="field__error" role="alert">
          {i18n.t('photo.error')}
        </p>
      )}
    </>
  );
}
