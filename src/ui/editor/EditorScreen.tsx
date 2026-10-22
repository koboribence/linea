import { useRef, useState } from 'react';
import type { Activity } from '../../domain/activity/Activity';
import { useLocale } from '../../i18n/LocaleContext';
import { EditorPanel } from './EditorPanel';
import { PosterCanvas } from './PosterCanvas';
import { PosterExporter } from './PosterExporter';
import { usePosterEditor } from './usePosterEditor';

/** Preview on one side, controls on the other: everything visible in one place. */
export function EditorScreen({ activity: loaded }: { activity: Activity }) {
  const { i18n, format } = useLocale();
  const editor = usePosterEditor(loaded);
  const { activity } = editor;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canShare] = useState(PosterExporter.canShare);

  const fileName = PosterExporter.fileName(activity);
  const start = activity.startTime;
  const info = [
    start && format.date(start, activity.meta.timeZone),
    activity.meta.device,
    i18n.t('meta.points', { count: activity.points.length }),
  ].filter(Boolean);

  return (
    <div className="editor">
      <div className="editor__preview">
        <PosterCanvas
          scene={editor.scene}
          canvasRef={canvasRef}
          onPan={editor.hasPhoto ? editor.panPhoto : undefined}
          panLabel={i18n.t('photo.panLabel')}
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
              onClick={() => canvasRef.current && PosterExporter.share(canvasRef.current, fileName)}
            >
              {i18n.t('export.share')}
            </button>
          )}
        </div>
      </div>

      <div className="editor__side">
        <p className="editor__info">{info.join(' · ')}</p>
        <EditorPanel
          design={editor.design}
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
        />
      </div>
    </div>
  );
}
