import { useEffect, useState, type RefObject } from 'react';
import { PosterRenderer } from '../../domain/poster/PosterRenderer';
import type { PosterScene } from '../../domain/poster/PosterScene';

interface PosterCanvasProps {
  scene: PosterScene;
  canvasRef: RefObject<HTMLCanvasElement | null>;
}

/**
 * Live preview. The canvas always has the full export resolution (e.g. 1080×1920);
 * CSS only scales it down, so what you see is exactly what gets downloaded.
 */
export function PosterCanvas({ scene, canvasRef }: PosterCanvasProps) {
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    PosterRenderer.loadFonts().finally(() => setFontsReady(true));
  }, []);

  useEffect(() => {
    if (!fontsReady || !canvasRef.current) return;
    // Coalesce rapid changes (typing, sliders) into one draw per frame
    const frame = requestAnimationFrame(() => {
      if (canvasRef.current) PosterRenderer.render(canvasRef.current, scene);
    });
    return () => cancelAnimationFrame(frame);
  }, [scene, fontsReady, canvasRef]);

  const ratio = scene.width / scene.height;
  return (
    <div
      className={scene.transparent ? 'poster-frame poster-frame--transparent' : 'poster-frame'}
      style={{ aspectRatio: `${scene.width} / ${scene.height}`, ['--ratio' as string]: ratio }}
    >
      <canvas ref={canvasRef} className="poster-frame__canvas" />
    </div>
  );
}
