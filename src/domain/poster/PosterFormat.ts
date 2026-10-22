export type PosterFormatId = 'story' | 'feed' | 'square';

/** Output sizes in pixels; Instagram's recommended resolutions. */
export const POSTER_FORMATS: Record<PosterFormatId, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  feed: { width: 1080, height: 1350 },
  square: { width: 1080, height: 1080 },
};

export const POSTER_FORMAT_IDS = Object.keys(POSTER_FORMATS) as PosterFormatId[];
