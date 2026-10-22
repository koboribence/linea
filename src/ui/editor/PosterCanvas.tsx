import { useEffect, useRef, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { PosterRenderer } from '../../domain/poster/PosterRenderer';
import type { PosterScene } from '../../domain/poster/PosterScene';

interface PosterCanvasProps {
  scene: PosterScene;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** When set, dragging the preview moves the background photo by (dx, dy) poster pixels. */
  onPan?: (dx: number, dy: number) => void;
  panLabel?: string;
}

/** Arrow keys move the photo by this many poster pixels. */
const KEY_STEP = 24;

/**
 * Live preview. The canvas always has the full export resolution (e.g. 1080×1920);
 * CSS only scales it down, so what you see is exactly what gets downloaded.
 */
export function PosterCanvas({ scene, canvasRef, onPan, panLabel }: PosterCanvasProps) {
  const lastPointer = useRef<{ x: number; y: number }>(undefined);

  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    // Fonts of a newly picked set download first (instant once loaded); then coalesce
    // rapid changes (typing, sliders, dragging) into one draw per frame
    void PosterRenderer.loadFonts(scene.font)
      .catch(() => undefined) // draw with fallback fonts rather than not at all
      .then(() => {
        if (cancelled) return;
        frame = requestAnimationFrame(() => {
          if (canvasRef.current) PosterRenderer.render(canvasRef.current, scene);
        });
      });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [scene, canvasRef]);

  // Screen pixels → poster pixels (the preview is scaled down)
  const toPoster = () => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return rect && rect.width > 0 ? scene.width / rect.width : 1;
  };

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!onPan) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    lastPointer.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const last = lastPointer.current;
    if (!onPan || !last) return;
    const scale = toPoster();
    onPan((event.clientX - last.x) * scale, (event.clientY - last.y) * scale);
    lastPointer.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = () => {
    lastPointer.current = undefined;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (!onPan) return;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-KEY_STEP, 0],
      ArrowRight: [KEY_STEP, 0],
      ArrowUp: [0, -KEY_STEP],
      ArrowDown: [0, KEY_STEP],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    onPan(...move);
  };

  const ratio = scene.width / scene.height;
  const classes = ['poster-frame', scene.transparent && 'poster-frame--transparent'];
  return (
    <div
      className={classes.filter(Boolean).join(' ')}
      style={{ aspectRatio: `${scene.width} / ${scene.height}`, ['--ratio' as string]: ratio }}
    >
      <canvas
        ref={canvasRef}
        className={
          onPan ? 'poster-frame__canvas poster-frame__canvas--pannable' : 'poster-frame__canvas'
        }
        tabIndex={onPan ? 0 : undefined}
        aria-label={onPan ? panLabel : undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
