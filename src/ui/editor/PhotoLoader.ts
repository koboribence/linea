import type { PhotoImage } from '../../domain/poster/PosterScene';

/** Longest side kept from the photo: enough for a zoomed 1080×1920 poster, small enough to redraw fast. */
const MAX_SIDE = 2400;

/** Decodes a photo file into a drawable image. The photo never leaves the browser. */
export class PhotoLoader {
  static readonly ACCEPT = 'image/*';

  /** Throws when the browser can't decode the file (e.g. HEIC on some systems). */
  static async load(file: File): Promise<PhotoImage> {
    // 'from-image' applies the camera's EXIF rotation, so phone photos aren't sideways
    let bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const longest = Math.max(bitmap.width, bitmap.height);
    if (longest > MAX_SIDE) {
      const scale = MAX_SIDE / longest;
      const resized = await createImageBitmap(bitmap, {
        resizeWidth: Math.round(bitmap.width * scale),
        resizeHeight: Math.round(bitmap.height * scale),
        resizeQuality: 'high',
      });
      bitmap.close();
      bitmap = resized;
    }
    return { source: bitmap, width: bitmap.width, height: bitmap.height };
  }
}
