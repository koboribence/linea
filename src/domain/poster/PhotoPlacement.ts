import type { Box } from '../route/RouteShape';

/** How the background photo sits on the poster. Plain data, part of the design. */
export interface PhotoSettings {
  /** 0 = photo only, 1 = fully covered by the theme background */
  overlay: number;
  /** 1 = just covers the poster; below 1 shows more of the photo, above 1 zooms in */
  zoom: number;
  /** Photo center relative to the poster center, in poster widths / heights (0 = centered) */
  offsetX: number;
  offsetY: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Placement math for the background photo: scale to cover, zoom, and move freely in both directions. */
export class PhotoPlacement {
  static readonly DEFAULTS: PhotoSettings = { overlay: 0.55, zoom: 1, offsetX: 0, offsetY: 0 };
  static readonly MIN_ZOOM = 0.5;
  static readonly MAX_ZOOM = 3;

  /** Where to draw the photo. Parts of the poster it doesn't cover show the theme background. */
  static rect(photo: Size, poster: Size, settings: PhotoSettings): Box {
    const cover = Math.max(poster.width / photo.width, poster.height / photo.height);
    const width = photo.width * cover * settings.zoom;
    const height = photo.height * cover * settings.zoom;
    return {
      x: (poster.width - width) / 2 + settings.offsetX * poster.width,
      y: (poster.height - height) / 2 + settings.offsetY * poster.height,
      width,
      height,
    };
  }

  /** New offset after dragging the photo by (dx, dy) poster pixels. */
  static pan(
    photo: Size,
    poster: Size,
    settings: PhotoSettings,
    dx: number,
    dy: number,
  ): Pick<PhotoSettings, 'offsetX' | 'offsetY'> {
    const { width, height } = PhotoPlacement.rect(photo, poster, settings);
    // Free movement in both directions, as far as the photo's overflow or half the poster,
    // whichever is more; the photo can never be dragged completely out of view
    const limitX = Math.max(width - poster.width, poster.width) / 2 / poster.width;
    const limitY = Math.max(height - poster.height, poster.height) / 2 / poster.height;
    const clamp = (v: number, limit: number) => Math.max(-limit, Math.min(limit, v));
    return {
      offsetX: clamp(settings.offsetX + dx / poster.width, limitX),
      offsetY: clamp(settings.offsetY + dy / poster.height, limitY),
    };
  }
}
