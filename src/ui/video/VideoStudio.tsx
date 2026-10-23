import { useEffect, useMemo, useRef, useState } from 'react';
import { POSTER_FORMATS } from '../../domain/poster/PosterFormat';
import { useLocale } from '../../i18n/LocaleContext';
import { useLockWhile } from '../BusyContext';
import { Modal } from '../controls/Modal';
import { PosterExporter } from '../editor/PosterExporter';
import { canNotify, isTouchDevice, useExportAttention } from './useExportAttention';
import { useFlyover, type FlyoverInput, type PreviewState } from './useFlyover';

/**
 * Video mode preview: the live 3D map with the text drawn over it, playback controls and export.
 * The stage is laid out at the real output size; CSS only scales it down to fit. While the map
 * loads, the opening view stays in the back with the progress in front.
 */
export function VideoStudio({ input }: { input: FlyoverInput }) {
  const { i18n } = useLocale();
  const host = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const backdrop = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const width = POSTER_FORMATS[input.design.format].width;
  const scale = useStageScale(frameRef, width);
  const refs = useMemo(() => ({ host, overlay, backdrop }), []);
  const video = useFlyover(input, refs, scale);

  const { exportState, preview } = video;
  const rendering = exportState.status === 'rendering';
  // Nothing else may change while the video is being made
  useLockWhile(rendering);
  // Asked for a notification when it's done (only matters on another tab)
  const [notify, setNotify] = useState(
    () => typeof Notification !== 'undefined' && Notification.permission === 'granted',
  );
  useExportAttention(exportState, notify);
  const fileName =
    exportState.status === 'done'
      ? PosterExporter.fileName(input.activity, exportState.file.extension)
      : '';
  const canShare =
    exportState.status === 'done' && PosterExporter.canShare(exportState.file.blob.type);

  return (
    <>
      <div
        ref={frameRef}
        className="poster-frame video-frame"
        style={{
          aspectRatio: `${video.width} / ${video.height}`,
          ['--ratio' as string]: video.width / video.height,
        }}
      >
        <div
          className="video-stage"
          style={{ width: video.width, height: video.height, transform: `scale(${scale})` }}
        >
          {/* The opening view while the map loads, finished frames while a video is made */}
          <canvas
            ref={backdrop}
            className="video-stage__layer"
            hidden={(video.ready && !rendering) || video.flat}
          />
          {/* Hidden while the camera flies around loading the map ahead of playback */}
          <div
            ref={host}
            className="video-stage__layer"
            style={{ opacity: video.ready && !rendering && !video.flat ? 1 : 0 }}
          />
          <canvas ref={overlay} className="video-stage__layer" hidden={rendering} />
        </div>
        {!video.flat && <FrameStatus preview={preview} rendering={rendering} />}
        {exportState.status === 'rendering' && (
          <RenderOverlay
            share={exportState.share}
            remaining={exportState.remaining}
            onCancel={video.cancelExport}
            notify={notify}
            onNotify={setNotify}
          />
        )}
      </div>

      {/* The 3D map couldn't load: offer the flat video, but keep 3D the first choice */}
      {preview.status === 'failed' && !video.flat && !rendering && (
        <Modal
          title={i18n.t('flat.title')}
          actions={
            <>
              <button type="button" className="button button--primary" onClick={video.retry3d}>
                {i18n.t('flat.retry')}
              </button>
              <button type="button" className="button button--secondary" onClick={video.chooseFlat}>
                {i18n.t('flat.use')}
              </button>
            </>
          }
        >
          <p>{i18n.t('flat.body')}</p>
          <p className="field__hint">{i18n.t('flat.prefer')}</p>
        </Modal>
      )}
      {video.flat && (
        <div className="flat-notice" role="status">
          <span>{i18n.t('flat.notice')}</span>
          <button type="button" className="link-button" onClick={video.retry3d}>
            {i18n.t('flat.retryShort')}
          </button>
        </div>
      )}

      <div className="video-controls">
        <button
          type="button"
          className="button button--secondary play-button"
          onClick={video.togglePlay}
          disabled={!video.ready || exportState.status === 'rendering'}
          aria-label={video.playing ? i18n.t('video.pause') : i18n.t('video.play')}
        >
          {video.playing ? '❚❚' : '▶'}
        </button>
        <input
          id="video-timeline"
          className="range video-controls__timeline"
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={video.time}
          aria-label={i18n.t('video.timeline')}
          disabled={!video.ready || exportState.status === 'rendering'}
          onChange={(event) => video.seek(Number(event.target.value))}
        />
      </div>

      <div className="editor__actions">
        {!video.canExport && <p className="field__error">{i18n.t('video.unsupported')}</p>}

        {video.canExport && exportState.status === 'idle' && (
          <button
            type="button"
            className="button button--primary"
            disabled={!video.ready}
            onClick={video.startExport}
          >
            {i18n.t('video.export')}
          </button>
        )}

        {exportState.status === 'done' && (
          <div className="render-done">
            <span className="render-done__info">
              {i18n.t('video.ready', {
                size: (exportState.file.blob.size / 1_000_000).toFixed(1),
                format: exportState.file.extension.toUpperCase(),
              })}
            </span>
            <button
              type="button"
              className="button button--primary"
              onClick={() => PosterExporter.downloadBlob(exportState.file.blob, fileName)}
            >
              {i18n.t('video.download')}
            </button>
            {canShare && (
              <button
                type="button"
                className="button button--secondary"
                onClick={() => PosterExporter.shareBlob(exportState.file.blob, fileName)}
              >
                {i18n.t('video.share')}
              </button>
            )}
          </div>
        )}

        {exportState.status === 'failed' && (
          <p className="field__error" role="alert">
            {i18n.t('video.failed')}
          </p>
        )}
      </div>
    </>
  );
}

/** While the video is made: big progress over the frames being made, time left, cancel. */
function RenderOverlay(props: {
  share: number;
  remaining?: number;
  onCancel: () => void;
  notify: boolean;
  onNotify: (notify: boolean) => void;
}) {
  const { i18n } = useLocale();
  const touch = isTouchDevice();
  const askToNotify = async () => {
    const permission = await Notification.requestPermission().catch(() => 'denied');
    props.onNotify(permission === 'granted');
  };
  const percent = Math.round(props.share * 100);
  const left = props.remaining;
  const time =
    left === undefined
      ? i18n.t('video.estimating')
      : left < 60
        ? i18n.t('video.secondsLeft', { count: Math.max(1, Math.round(left)) })
        : i18n.t('video.minutesLeft', {
            minutes: Math.floor(left / 60),
            seconds: Math.round(left % 60),
          });
  return (
    <div className="render-overlay" role="status" aria-live="polite">
      <div className="render-overlay__head">
        <strong>{i18n.t('video.renderingTitle')}</strong>
        <span className="render-overlay__percent">{percent}%</span>
      </div>
      <div className="render-overlay__bar">
        <span style={{ width: `${percent}%` }} />
      </div>
      <span className="render-overlay__time">{time}</span>
      <span className="render-overlay__hint">
        {i18n.t(touch ? 'video.hintPhone' : 'video.hintDesktop')}
      </span>
      <div className="render-overlay__actions">
        {/* On a computer one can switch tabs meanwhile; a notification says when it's done */}
        {!touch &&
          (props.notify ? (
            <span className="render-overlay__notice">{i18n.t('video.willNotify')}</span>
          ) : (
            canNotify() && (
              <button type="button" className="link-button" onClick={() => void askToNotify()}>
                {i18n.t('video.notifyMe')}
              </button>
            )
          ))}
        <button type="button" className="button button--secondary" onClick={props.onCancel}>
          {i18n.t('video.cancel')}
        </button>
      </div>
    </div>
  );
}

/** Over the preview: what is loading and how far it got, or what is being made. */
function FrameStatus({ preview, rendering }: { preview: PreviewState; rendering: boolean }) {
  const { i18n } = useLocale();
  if (rendering) return null;
  if (preview.status === 'failed') {
    return (
      <p className="frame-status frame-status--error" role="alert">
        {i18n.t('map.failed')}
      </p>
    );
  }
  if (preview.status === 'ready') return null;
  const share = preview.status === 'preparing' ? preview.share : 0;
  return (
    <div className="frame-loading" role="status">
      <div className="frame-loading__card">
        <strong>{i18n.t('video.preparingTitle')}</strong>
        <div className="render-progress__bar">
          <span style={{ width: `${Math.round(share * 100)}%` }} />
        </div>
        <span className="frame-loading__detail">
          {preview.status === 'loading'
            ? i18n.t('map.loading')
            : i18n.t('video.preparing', { percent: Math.round(share * 100) })}
        </span>
        <span className="frame-loading__hint">{i18n.t('video.preparingHint')}</span>
      </div>
    </div>
  );
}

/** How much the full-size stage must shrink to fit the preview frame. */
function useStageScale(frameRef: React.RefObject<HTMLDivElement | null>, width: number): number {
  const [scale, setScale] = useState(0.3);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(() => setScale(frame.clientWidth / width));
    observer.observe(frame);
    return () => observer.disconnect();
  }, [frameRef, width]);
  return scale;
}
