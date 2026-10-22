import type { Activity } from '../../domain/activity/Activity';
import { BRAND } from '../../brand';

/** Saves or shares the rendered canvas as a PNG file. */
export class PosterExporter {
  /** "linea-2026-10-19.png" */
  static fileName(activity: Activity): string {
    const date = activity.startTime?.toISOString().slice(0, 10) ?? 'activity';
    return `${BRAND.name.toLowerCase()}-${date}.png`;
  }

  static async download(canvas: HTMLCanvasElement, fileName: string): Promise<void> {
    const url = URL.createObjectURL(await PosterExporter.toBlob(canvas));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    // Give the browser a moment to start the download before freeing the memory
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** True on devices with a system share sheet that accepts images (mostly phones). */
  static canShare(): boolean {
    const probe = new File([], 'probe.png', { type: 'image/png' });
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [probe] });
  }

  static async share(canvas: HTMLCanvasElement, fileName: string): Promise<void> {
    const file = new File([await PosterExporter.toBlob(canvas)], fileName, { type: 'image/png' });
    try {
      await navigator.share({ files: [file] });
    } catch (error) {
      // Closing the share sheet is not an error worth reporting
      if (!(error instanceof DOMException && error.name === 'AbortError')) throw error;
    }
  }

  private static toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Export failed'))),
        'image/png',
      ),
    );
  }
}
