import { useRef, useState, type DragEvent } from 'react';
import { ActivityLoader } from '../domain/parsing/ActivityLoader';
import { useLocale } from '../i18n/LocaleContext';

interface DropZoneProps {
  onFile: (file: File) => void;
  /** Called on first drag or hover, to start downloading parser code early. */
  onIntent?: () => void;
  busy?: boolean;
  error?: string;
}

export function DropZone({ onFile, onIntent, busy = false, error }: DropZoneProps) {
  const { i18n } = useLocale();
  const input = useRef<HTMLInputElement>(null);
  // Counts nested dragenter/dragleave pairs, so child elements don't cause flicker
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);

  const handleDragEnter = (event: DragEvent) => {
    event.preventDefault();
    dragDepth.current++;
    setDragging(true);
    onIntent?.();
  };

  const handleDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  };

  const className = ['dropzone', dragging && 'dropzone--active'].filter(Boolean).join(' ');

  return (
    <div
      className={className}
      onDragEnter={handleDragEnter}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onPointerEnter={onIntent}
      aria-busy={busy}
    >
      <div className="dropzone__text">
        <p className="dropzone__title">
          {busy ? i18n.t('drop.loading') : dragging ? i18n.t('drop.release') : i18n.t('drop.title')}
        </p>
        <p className="dropzone__hint">{i18n.t('drop.hint')}</p>
      </div>

      <button
        type="button"
        className="button button--primary"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {i18n.t('drop.browse')}
      </button>

      <input
        ref={input}
        type="file"
        accept={ActivityLoader.ACCEPT}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = ''; // allow choosing the same file again
        }}
      />

      {error && (
        <p className="dropzone__error" role="alert">
          {error}
        </p>
      )}
      <p className="dropzone__privacy">{i18n.t('drop.privacy')}</p>
    </div>
  );
}
