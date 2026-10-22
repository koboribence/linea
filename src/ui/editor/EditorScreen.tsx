import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import type { Activity } from '../../domain/activity/Activity';
import { useLocale } from '../../i18n/LocaleContext';
import { Segmented } from '../controls/Segmented';
import { MapView } from '../map/MapView';
import { FlyoverPreview } from '../video/FlyoverPreview';
import { VideoStudio } from '../video/VideoStudio';
import { EditorPanel, type EditorMode } from './EditorPanel';
import { PosterCanvas } from './PosterCanvas';
import { PosterExporter } from './PosterExporter';
import { usePosterEditor } from './usePosterEditor';

/** Preview on one side, controls on the other: everything visible in one place. */
export function EditorScreen({ activity: loaded }: { activity: Activity }) {
  const { i18n, format } = useLocale();
  const [mode, setMode] = useState<EditorMode>('image');
  const editor = usePosterEditor(loaded, mode);
  const { activity, design, route } = editor;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canShare] = useState(() => PosterExporter.canShare());

  const fileName = PosterExporter.fileName(activity);
  const start = activity.startTime;
  const info = [
    start && format.date(start, activity.meta.timeZone),
    activity.meta.device,
    i18n.t('meta.points', { count: activity.points.length }),
  ].filter(Boolean);
  const panPhoto = design.background === 'photo' && editor.hasPhoto ? editor.panPhoto : undefined;

  // Pointing at the mode switch hints at the video: start loading its map right away
  // (not on touch, where the tap itself opens it; not when the browser asks to save data)
  const prepareVideo = useCallback(
    (event: PointerEvent) => {
      MapView.preload();
      const saveData = (navigator as { connection?: { saveData?: boolean } }).connection?.saveData;
      if (mode !== 'image' || !route || event.pointerType !== 'mouse' || saveData) return;
      FlyoverPreview.prepare(FlyoverPreview.setupFor(design, route));
    },
    [mode, route, design],
  );
  // The prepared video map belongs to this file
  useEffect(() => () => FlyoverPreview.release(), []);

  return (
    <div className="editor">
      <div className="editor__preview">
        {/* The flyover video needs a route to fly along */}
        {route && (
          <div className="mode-switch" onPointerEnter={prepareVideo}>
            <Segmented
              label={i18n.t('mode.label')}
              options={[
                { value: 'image', label: i18n.t('mode.image') },
                { value: 'video', label: i18n.t('mode.video') },
              ]}
              value={mode}
              onChange={setMode}
            />
          </div>
        )}

        {mode === 'video' && route ? (
          <VideoStudio
            input={{
              activity,
              stats: editor.stats,
              design,
              route,
              elevation: editor.elevation,
              builder: editor.builder,
            }}
          />
        ) : (
          <>
            <PosterCanvas
              scene={editor.scene}
              canvasRef={canvasRef}
              onPan={panPhoto}
              panLabel={i18n.t('photo.panLabel')}
              status={editor.mapLoading ? i18n.t('map.loading') : undefined}
            />
            <div className="editor__actions">
              <button
                type="button"
                className="button button--primary"
                onClick={() =>
                  canvasRef.current && PosterExporter.download(canvasRef.current, fileName)
                }
              >
                {i18n.t('export.download')}
              </button>
              {canShare && (
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() =>
                    canvasRef.current && PosterExporter.share(canvasRef.current, fileName)
                  }
                >
                  {i18n.t('export.share')}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="editor__side">
        <p className="editor__info">{info.join(' · ')}</p>
        <EditorPanel
          design={design}
          update={editor.update}
          sport={activity.sport}
          setSport={editor.setSport}
          statItems={editor.statItems}
          coloringOptions={editor.coloringOptions}
          hasGps={activity.hasGps}
          hasRoute={editor.hasRoute}
          hasElevation={editor.hasElevation}
          autoTitle={editor.autoTitle}
          hasPhoto={editor.hasPhoto}
          onPickPhoto={editor.setPhoto}
          onRemovePhoto={editor.removePhoto}
          mode={mode}
          hasDate={editor.hasDate}
          mapLoading={editor.mapLoading}
          mapFailed={editor.mapFailed}
        />
      </div>
    </div>
  );
}
