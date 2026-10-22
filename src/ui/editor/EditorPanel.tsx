import type { SportType } from '../../domain/activity/SportType';
import { Graphemes } from '../../domain/format/Graphemes';
import type { StatItem } from '../../domain/format/StatPresenter';
import { PosterDefaults, type PosterDesign } from '../../domain/poster/PosterDesign';
import { POSTER_FORMAT_IDS } from '../../domain/poster/PosterFormat';
import { PrivacyZone } from '../../domain/route/PrivacyZone';
import type { RouteColoring } from '../../domain/route/RouteShape';
import { useLocale } from '../../i18n/LocaleContext';
import type { MessageKey } from '../../i18n/messages/hu';
import { Section } from '../controls/Section';
import { Segmented } from '../controls/Segmented';
import { Toggle } from '../controls/Toggle';
import { FontPicker } from './FontPicker';
import { PhotoPicker } from './PhotoPicker';
import { StatPicker } from './StatPicker';
import { ThemePicker } from './ThemePicker';

interface EditorPanelProps {
  design: PosterDesign;
  update: (changes: Partial<PosterDesign>) => void;
  sport: SportType;
  setSport: (sport: SportType) => void;
  statItems: StatItem[];
  coloringOptions: RouteColoring[];
  hasGps: boolean;
  hasRoute: boolean;
  hasElevation: boolean;
  autoTitle: string;
  hasPhoto: boolean;
  onPickPhoto: (file: File) => Promise<boolean>;
  onRemovePhoto: () => void;
}

const SPORTS: SportType[] = ['run', 'ride', 'other'];

export function EditorPanel(props: EditorPanelProps) {
  const { design, update, sport, setSport, statItems, coloringOptions } = props;
  const { hasGps, hasRoute, hasElevation } = props;
  const { i18n } = useLocale();
  const t = (key: MessageKey) => i18n.t(key);

  // With GPS but no route, the privacy zone has hidden all of it (very short activity)
  const routeHint = hasRoute
    ? undefined
    : hasGps
      ? t('editor.privacyHidesRoute')
      : t('editor.noRoute');

  // Runners think in pace, cyclists in speed; the same coloring gets the matching name
  const coloringLabel = (c: RouteColoring) =>
    c === 'speed' && sport === 'run' ? t('coloring.pace') : t(`coloring.${c}`);

  return (
    <div className="panel">
      <Section title={t('editor.format')}>
        <Segmented
          label={t('editor.format')}
          options={POSTER_FORMAT_IDS.map((id) => ({ value: id, label: t(`format.${id}`) }))}
          value={design.format}
          onChange={(format) => update({ format })}
        />
      </Section>

      <Section title={t('editor.colors')}>
        <ThemePicker design={design} update={update} hasPhoto={props.hasPhoto} />
      </Section>

      <Section title={t('photo.section')} hint={props.hasPhoto ? undefined : t('photo.hint')}>
        <PhotoPicker
          hasPhoto={props.hasPhoto}
          settings={design.photo}
          onChange={(photo) => update({ photo })}
          onPick={props.onPickPhoto}
          onRemove={props.onRemovePhoto}
        />
      </Section>

      <Section title={t('editor.text')}>
        <label className="field">
          <span className="field__label field__label--split">
            {t('editor.title')}
            <span className="field__counter">
              {i18n.t('editor.titleCount', {
                count: Graphemes.count(design.title ?? ''),
                max: PosterDefaults.MAX_TITLE,
              })}
            </span>
          </span>
          <input
            id="poster-title"
            className="text-input"
            type="text"
            value={design.title ?? ''}
            placeholder={props.autoTitle}
            // Limit by visible characters, not UTF-16 units, so emojis aren't cut in half
            onChange={(event) =>
              update({
                title:
                  Graphemes.truncate(event.target.value, PosterDefaults.MAX_TITLE) || undefined,
              })
            }
          />
        </label>
        <div className="field">
          <span className="field__label">{t('editor.font')}</span>
          <FontPicker value={design.fontId} onChange={(fontId) => update({ fontId })} />
        </div>
        <Toggle
          label={t('editor.showDate')}
          checked={design.showDate}
          onChange={(showDate) => update({ showDate })}
        />
      </Section>

      <Section
        title={t('editor.stats')}
        hint={i18n.t('editor.statsHint', { max: PosterDefaults.MAX_STATS })}
      >
        <StatPicker
          items={statItems}
          selected={design.stats}
          onChange={(stats) => update({ stats })}
        />
      </Section>

      <Section title={t('editor.route')} hint={routeHint}>
        {hasRoute && (
          <>
            <Segmented
              label={t('editor.coloring')}
              options={coloringOptions.map((c) => ({ value: c, label: coloringLabel(c) }))}
              value={design.routeColoring}
              onChange={(routeColoring) => update({ routeColoring })}
            />
            <label className="field">
              <span className="field__label">{t('editor.lineWidth')}</span>
              <input
                id="route-width"
                className="range"
                type="range"
                min={4}
                max={22}
                step={1}
                value={design.routeWidth}
                onChange={(event) => update({ routeWidth: Number(event.target.value) })}
              />
            </label>
          </>
        )}
        {hasGps && (
          <div className="field">
            <span className="field__label">{t('editor.privacy')}</span>
            <Segmented
              label={t('editor.privacy')}
              options={PrivacyZone.OPTIONS.map((m) => ({
                value: m,
                label: m === 0 ? t('privacy.off') : m >= 1000 ? `${m / 1000} km` : `${m} m`,
              }))}
              value={design.privacyMeters}
              onChange={(privacyMeters) => update({ privacyMeters })}
            />
            <p className="field__hint">{t('editor.privacyHint')}</p>
          </div>
        )}
        {hasElevation && (
          <Toggle
            label={t('editor.elevation')}
            checked={design.showElevation}
            onChange={(showElevation) => update({ showElevation })}
          />
        )}
      </Section>

      <Section title={t('editor.more')}>
        <div className="field">
          <span className="field__label">{t('editor.sport')}</span>
          <Segmented
            label={t('editor.sport')}
            options={SPORTS.map((s) => ({ value: s, label: t(`sport.${s}`) }))}
            value={sport}
            onChange={setSport}
          />
        </div>
        <Toggle
          label={t('editor.logo')}
          checked={design.showLogo}
          onChange={(showLogo) => update({ showLogo })}
        />
      </Section>
    </div>
  );
}
