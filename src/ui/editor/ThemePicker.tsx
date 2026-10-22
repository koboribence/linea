import { useState } from 'react';
import type { PosterDesign } from '../../domain/poster/PosterDesign';
import { PosterTheme } from '../../domain/poster/PosterTheme';
import { ThemeCode, type CustomTheme } from '../../domain/poster/ThemeCode';
import { useLocale } from '../../i18n/LocaleContext';
import { Toggle } from '../controls/Toggle';
import { ShareThemeDialog } from '../themes/ShareThemeDialog';
import { ThemeLibrary } from '../themes/ThemeLibrary';

interface ThemePickerProps {
  design: PosterDesign;
  update: (changes: Partial<PosterDesign>) => void;
}

/** Preset and saved swatches, two custom colors, saving/sharing them, and the sticker switch. */
export function ThemePicker({ design, update }: ThemePickerProps) {
  const { i18n } = useLocale();
  const [saved, setSaved] = useState(ThemeLibrary.load);
  const [sharing, setSharing] = useState<CustomTheme>();

  const colors = PosterTheme.resolve(design.themeId, {
    background: design.customBackground,
    accent: design.customAccent,
  });
  const customized = design.customBackground !== undefined || design.customAccent !== undefined;
  const current: CustomTheme = { background: colors.background[0], accent: colors.accent };
  const currentSaved = customized ? saved.find((t) => ThemeCode.equals(t, current)) : undefined;

  const applySaved = (theme: CustomTheme) =>
    update({ customBackground: theme.background, customAccent: theme.accent });

  return (
    <>
      <div className="swatches" role="radiogroup" aria-label={i18n.t('editor.colors')}>
        {PosterTheme.IDS.map((id) => {
          const preset = PosterTheme.PRESETS[id];
          return (
            <Swatch
              key={id}
              name={i18n.t(`theme.${id}`)}
              background={`linear-gradient(135deg, ${preset.background[0]}, ${preset.background[1]})`}
              accent={preset.accent}
              checked={design.themeId === id && !customized}
              onSelect={() =>
                update({ themeId: id, customBackground: undefined, customAccent: undefined })
              }
            />
          );
        })}
        {saved.map((theme) => (
          <Swatch
            key={ThemeCode.encode(theme)}
            name={i18n.t('theme.custom')}
            background={theme.background}
            accent={theme.accent}
            checked={currentSaved !== undefined && ThemeCode.equals(currentSaved, theme)}
            onSelect={() => applySaved(theme)}
          />
        ))}
      </div>

      <div className="color-row">
        <label className="color-input">
          <input
            id="custom-background"
            type="color"
            value={current.background}
            onChange={(event) => update({ customBackground: event.target.value })}
          />
          {i18n.t('editor.background')}
        </label>
        <label className="color-input">
          <input
            id="custom-accent"
            type="color"
            value={current.accent}
            onChange={(event) => update({ customAccent: event.target.value })}
          />
          {i18n.t('editor.accent')}
        </label>
      </div>

      {customized && !currentSaved && (
        <button
          type="button"
          className="button button--secondary button--small"
          onClick={() => setSaved(ThemeLibrary.add(current))}
        >
          {i18n.t('editor.saveTheme')}
        </button>
      )}
      {currentSaved && (
        <div className="theme-actions">
          <span className="theme-actions__hint">{i18n.t('editor.savedHint')}</span>
          <button
            type="button"
            className="button button--secondary button--small"
            onClick={() => setSharing(currentSaved)}
          >
            {i18n.t('editor.shareTheme')}
          </button>
          <button
            type="button"
            className="link-button"
            onClick={() => setSaved(ThemeLibrary.remove(currentSaved))}
          >
            {i18n.t('editor.deleteTheme')}
          </button>
        </div>
      )}

      <Toggle
        label={i18n.t('editor.transparent')}
        hint={i18n.t('editor.transparentHint')}
        checked={design.transparent}
        onChange={(transparent) => update({ transparent })}
      />

      {sharing && <ShareThemeDialog theme={sharing} onClose={() => setSharing(undefined)} />}
    </>
  );
}

interface SwatchProps {
  name: string;
  background: string;
  accent: string;
  checked: boolean;
  onSelect: () => void;
}

function Swatch({ name, background, accent, checked, onSelect }: SwatchProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      className="swatch"
      title={name}
      onClick={onSelect}
    >
      <span className="swatch__chip" style={{ background }}>
        <span className="swatch__accent" style={{ background: accent }} />
      </span>
      <span className="swatch__name">{name}</span>
    </button>
  );
}
