import { PosterRenderer } from '../../domain/poster/PosterRenderer';
import type { PosterScene } from '../../domain/poster/PosterScene';
import type { MapView } from './MapView';

export interface VideoFile {
  blob: Blob;
  extension: 'mp4' | 'webm';
}

export interface ExportOptions {
  seconds: number;
  fps?: number;
  /** Puts the camera where it is at moment t (0…1) */
  moveTo: (t: number) => void;
  /** Route, text and stats drawn over the loaded map at moment t */
  overlayAt: (t: number) => PosterScene;
  onProgress?: (share: number) => void;
  /** Each finished frame (map + text), e.g. to show what is being made */
  onFrame?: (frame: HTMLCanvasElement) => void;
  signal?: AbortSignal;
}

/**
 * Renders the flyover frame by frame (not in real time, so every frame is complete even on a
 * slow device) and encodes it in the browser. MP4/H.264 first, as Instagram expects; WebM/VP9
 * where H.264 encoding isn't available.
 */
export class FlyoverExporter {
  constructor(private readonly view: MapView) {}

  /** True when this browser can encode video at all (WebCodecs). */
  static isSupported(): boolean {
    return typeof VideoEncoder !== 'undefined';
  }

  async export({
    seconds,
    fps = 30,
    moveTo,
    overlayAt,
    onProgress,
    onFrame,
    signal,
  }: ExportOptions): Promise<VideoFile> {
    const mb = await import('mediabunny');
    const first = overlayAt(0);
    const { width, height } = first;

    const codec = await mb.getFirstEncodableVideoCodec(['avc', 'vp9'], { width, height });
    if (!codec) throw new Error('No video encoder available');
    const mp4 = codec === 'avc';

    const output = new mb.Output({
      format: mp4 ? new mb.Mp4OutputFormat({ fastStart: 'in-memory' }) : new mb.WebMOutputFormat(),
      target: new mb.BufferTarget(),
    });

    // The frame = live map underneath + text overlay on top
    const frame = document.createElement('canvas');
    frame.width = width;
    frame.height = height;
    const ctx = frame.getContext('2d')!;
    const overlay = document.createElement('canvas');

    const source = new mb.CanvasSource(frame, { codec, bitrate: mb.QUALITY_HIGH });
    output.addVideoTrack(source, { frameRate: fps });
    await output.start();

    const total = Math.round(seconds * fps);
    try {
      for (let i = 0; i < total; i++) {
        if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
        const t = total > 1 ? i / (total - 1) : 1;
        moveTo(t);
        // The overlay comes after loading: the route is projected onto the finished terrain
        await this.view.settle();

        ctx.drawImage(this.view.canvas, 0, 0, width, height);
        PosterRenderer.render(overlay, overlayAt(t));
        ctx.drawImage(overlay, 0, 0);
        onFrame?.(frame);

        await source.add(i / fps, 1 / fps);
        onProgress?.((i + 1) / total);
      }
      await output.finalize();
    } catch (error) {
      await output.cancel();
      throw error;
    }

    const buffer = (output.target as InstanceType<typeof mb.BufferTarget>).buffer!;
    return {
      blob: new Blob([buffer], { type: mp4 ? 'video/mp4' : 'video/webm' }),
      extension: mp4 ? 'mp4' : 'webm',
    };
  }
}
