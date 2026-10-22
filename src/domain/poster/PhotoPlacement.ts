import type { Box } from '../route/RouteShape';

/** How the background photo sits on the poster. Plain data, part of the design. */
export interface PhotoSettings {
  /** 0 = photo only, 1 = fully covered by the theme background */
  overlay: number;
  /** 1 = just covers the poster; larger values zoom in */
  zoom: number;
  /** Which part of the photo is visible, 0…1 per axis (0.5 = centered), like CSS object-position */
  posX: number;
  posY: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Cover-fit math for the background photo: it always fills the poster, never leaves a gap. */
export class PhotoPlacement {
  static readonly DEFAULTS: PhotoSettings = { overlay: 0.55, zoom: 1, posX: 0.5, posY: 0.5 };
  static readonly MAX_ZOOM = 3;

  /** Where to draw the photo so it covers the poster at the given zoom and position. */
  static rect(photo: Size, poster: Size, settings: PhotoSettings): Box {
    const scale =
      Math.max(poster.width / photo.width, poster.height / photo.height) * settings.zoom;
    const width = photo.width * scale;
    const height = photo.height * scale;
    return {
      x: -(width - poster.width) * settings.posX,
      y: -(height - poster.height) * settings.posY,
      width,
      height,
    };
  }

  /** New position after dragging the photo by (dx, dy) poster pixels. */
  static pan(
    photo: Size,
    poster: Size,
    settings: PhotoSettings,
    dx: number,
    dy: number,
  ): Pick<PhotoSettings, 'posX' | 'posY'> {
    const { width, height } = PhotoPlacement.rect(photo, poster, settings);
    const overflowX = width - poster.width;
    const overflowY = height - poster.height;
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    // Dragging right reveals more of the left side, so the position moves the other way
    return {
      posX: overflowX > 0 ? clamp(settings.posX - dx / overflowX) : 0.5,
      posY: overflowY > 0 ? clamp(settings.posY - dy / overflowY) : 0.5,
    };
  }
}
