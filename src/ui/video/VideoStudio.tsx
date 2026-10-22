import { useEffect, useRef, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { PosterExporter } from '../editor/PosterExporter';
import { useFlyover, type FlyoverInput } from './useFlyover';

/**
 * Video mode preview: the live 3D map with the text drawn over it, playback controls and export.
 * The map runs at the real output size; CSS only scales the stage down to fit.
 */
export function VideoStudio({ input }: { input: FlyoverInput }) {
  const { i18n } = useLocale();
  const hostRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const video = useFlyover(input, hostRef, overlayRef);
  const scale = useStageScale(frameRef, video.width);

  const { exportState } = video;
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
          <div ref={hostRef} className="video-stage__map" />
          <canvas ref={overlayRef} className="video-stage__overlay" />
        </div>
        {!video.ready && !video.mapFailed && (
          <p className="frame-status" role="status">
            {i18n.t('map.loading')}
          </p>
        )}
        {video.mapFailed && (
          <p className="frame-status frame-status--error" role="alert">
            {i18n.t('map.failed')}
          </p>
        )}
      </div>

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

        {exportState.status === 'rendering' && (
          <div className="render-progress" role="status">
            <div className="render-progress__bar">
              <span style={{ width: `${Math.round(exportState.share * 100)}%` }} />
            </div>
            <span>
              {i18n.t('video.rendering', { percent: Math.round(exportState.share * 100) })}
            </span>
            <button type="button" className="link-button" onClick={video.cancelExport}>
              {i18n.t('video.cancel')}
            </button>
          </div>
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
      {exportState.status === 'rendering' && <p className="field__hint">{i18n.t('video.hint')}</p>}
    </>
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
