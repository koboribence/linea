import type { PosterDesign } from '../../domain/poster/PosterDesign';
import { PosterTheme } from '../../domain/poster/PosterTheme';
import { useLocale } from '../../i18n/LocaleContext';
import { Toggle } from '../controls/Toggle';

interface ThemePickerProps {
  design: PosterDesign;
  update: (changes: Partial<PosterDesign>) => void;
}

/** Preset swatches, two custom colors and the transparent-sticker switch. */
export function ThemePicker({ design, update }: ThemePickerProps) {
  const { i18n } = useLocale();
  const colors = PosterTheme.resolve(design.themeId, {
    background: design.customBackground,
    accent: design.customAccent,
  });
  const customized = design.customBackground !== undefined || design.customAccent !== undefined;

  return (
    <>
      <div className="swatches" role="radiogroup" aria-label={i18n.t('editor.colors')}>
        {PosterTheme.IDS.map((id) => {
          const preset = PosterTheme.PRESETS[id];
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={design.themeId === id && !customized}
              className="swatch"
              title={i18n.t(`theme.${id}`)}
              onClick={() =>
                update({ themeId: id, customBackground: undefined, customAccent: undefined })
              }
            >
              <span
                className="swatch__chip"
                style={{
                  background: `linear-gradient(135deg, ${preset.background[0]}, ${preset.background[1]})`,
                }}
              >
                <span className="swatch__accent" style={{ background: preset.accent }} />
              </span>
              <span className="swatch__name">{i18n.t(`theme.${id}`)}</span>
            </button>
          );
        })}
      </div>

      <div className="color-row">
        <label className="color-input">
          <input
            id="custom-background"
            type="color"
            value={colors.background[0]}
            onChange={(event) => update({ customBackground: event.target.value })}
          />
          {i18n.t('editor.background')}
        </label>
        <label className="color-input">
          <input
            id="custom-accent"
            type="color"
            value={colors.accent}
            onChange={(event) => update({ customAccent: event.target.value })}
          />
          {i18n.t('editor.accent')}
        </label>
        {customized && (
          <button
            type="button"
            className="link-button"
            onClick={() => update({ customBackground: undefined, customAccent: undefined })}
          >
            {i18n.t('editor.resetColors')}
          </button>
        )}
      </div>

      <Toggle
        label={i18n.t('editor.transparent')}
        hint={i18n.t('editor.transparentHint')}
        checked={design.transparent}
        onChange={(transparent) => update({ transparent })}
      />
    </>
  );
}
