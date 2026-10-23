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
import { HighlightPicker, type HighlightItem } from './HighlightPicker';
import { BackgroundPicker } from './BackgroundPicker';
import { MapStylePicker } from './MapStylePicker';
import { StatPicker } from './StatPicker';
import { ThemePicker } from './ThemePicker';

interface EditorPanelProps {
  design: PosterDesign;
  update: (changes: Partial<PosterDesign>) => void;
  sport: SportType;
  setSport: (sport: SportType) => void;
  statItems: StatItem[];
  /** Peaks of the activity a 30 s video can point out */
  highlightItems: HighlightItem[];
  coloringOptions: RouteColoring[];
  hasGps: boolean;
  hasRoute: boolean;
  hasElevation: boolean;
  autoTitle: string;
  hasPhoto: boolean;
  onPickPhoto: (file: File) => Promise<boolean>;
  onRemovePhoto: () => void;
  mode: EditorMode;
  /** False when the file has no start time, so there's no date to show */
  hasDate: boolean;
  mapLoading: boolean;
  mapFailed: boolean;
}

export type EditorMode = 'image' | 'video';

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
        <ThemePicker
          design={design}
          update={update}
          // A transparent sticker only makes sense on a plain image without map or photo
          allowTransparent={props.mode === 'image' && design.background === 'theme'}
        />
      </Section>

      {props.mode === 'image' ? (
        <Section title={t('background.section')}>
          <BackgroundPicker
            design={design}
            update={update}
            hasRoute={hasRoute}
            mapLoading={props.mapLoading}
            mapFailed={props.mapFailed}
            hasPhoto={props.hasPhoto}
            onPickPhoto={props.onPickPhoto}
            onRemovePhoto={props.onRemovePhoto}
          />
        </Section>
      ) : (
        <Section title={t('video.section')}>
          <div className="field">
            <span className="field__label">{t('video.length')}</span>
            <Segmented
              label={t('video.length')}
              options={PosterDefaults.VIDEO_LENGTHS.map((seconds) => ({
                value: seconds,
                label: i18n.t('video.seconds', { count: seconds }),
              }))}
              value={design.videoSeconds}
              onChange={(videoSeconds) => update({ videoSeconds })}
            />
          </div>
          <MapStylePicker design={design} update={update} />
          <Toggle
            label={t('map.places')}
            checked={design.showPlaces}
            onChange={(showPlaces) => update({ showPlaces })}
          />
          <p className="privacy-note">{t('map.privacy')}</p>
        </Section>
      )}

      {/* Long videos have time to stop at the peaks along the way */}
      {props.mode === 'video' &&
        design.videoSeconds >= PosterDefaults.HIGHLIGHT_MIN_SECONDS &&
        props.highlightItems.length > 0 && (
          <Section title={t('highlights.section')}>
            <p className="field__hint">{t('highlights.hint')}</p>
            <HighlightPicker
              items={props.highlightItems}
              selected={design.highlights}
              onChange={(highlights) => update({ highlights })}
            />
          </Section>
        )}

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
        {/* Files without a start time: the date can be typed in, but doesn't have to be */}
        {!props.hasDate && (
          <label className="field">
            <span className="field__label">{t('editor.manualDate')}</span>
            <input
              id="manual-date"
              className="text-input"
              type="date"
              value={design.manualDate ?? ''}
              onChange={(event) => update({ manualDate: event.target.value || undefined })}
            />
            <span className="field__hint">{t('editor.noDate')}</span>
          </label>
        )}
        <Toggle
          label={t('editor.showDate')}
          checked={design.showDate}
          disabled={!props.hasDate && !design.manualDate}
          onChange={(showDate) => update({ showDate })}
        />
        <Toggle
          label={t('editor.showSport')}
          checked={design.showSport}
          onChange={(showSport) => update({ showSport })}
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
