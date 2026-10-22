import type {
  LayerSpecification,
  SkySpecification,
  SourceSpecification,
  StyleSpecification,
} from 'maplibre-gl';
import { Color } from '../poster/Color';
import type { GeoRoute } from '../route/RouteShape';
import { haversine } from '../stats/geo';

/** Which map: the street map behind images, or the flyover map of videos. */
export type MapKind = 'streets' | 'flyover';
/** Dark or light map, following the brightness of the poster's background color. */
export type MapTone = 'dark' | 'light';
/** The look the user picks for videos. */
export type VideoStyleId = 'neutral' | 'tinted';

/** Base styles of the vector map (OpenFreeMap: free, no key, OpenStreetMap data). */
export const BASE_STYLE_URLS: Record<MapTone, string> = {
  dark: 'https://tiles.openfreemap.org/styles/dark',
  light: 'https://tiles.openfreemap.org/styles/positron',
};

/** Open terrain data (Mapterhorn), more detailed than older global sets where available. */
const TERRAIN_TILES = 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp';
const TERRAIN_TILE_SIZE = 512;
/** 512 px tiles at z13 carry about as much detail as 256 px tiles at z14 */
const TERRAIN_MAXZOOM = 13;

/**
 * Only the credits the licenses require on images and videos: OpenStreetMap (ODbL; the OSMF
 * guideline accepts "© OpenStreetMap"), OpenMapTiles (CC-BY, its schema shapes the tiles) and
 * Mapterhorn (the terrain tiles name it as their attribution). OpenFreeMap asks for nothing.
 */
const ATTRIBUTION = ['© OpenStreetMap · © OpenMapTiles · © Mapterhorn'];

/**
 * Tile detail: `preview` stops one zoom level earlier (about a quarter of the tiles, drawn
 * a little simpler) for the live preview; `full` is used for exported videos and images.
 */
export type MapDetail = 'preview' | 'full';
/** Highest zoom level loaded for previews, per source type */
const PREVIEW_MAXZOOM = { vector: 13, terrain: TERRAIN_MAXZOOM - 1 };

/** The smallest kind of place still named on the map. */
export type PlaceLevel = 'village' | 'town' | 'city';

/** What a route's map needs apart from its style. */
export interface MapLook {
  /** Vertical exaggeration of the 3D terrain */
  exaggeration: number;
  /** Which places are named: a wide area shows only the bigger ones */
  places: PlaceLevel;
}

/** Colors of a map. */
export interface MapPalette {
  /** Bare land, the color most of the map has */
  land: string;
  road: string;
  building: string;
  /** Town names */
  label: string;
  /** Outline around town names, so they stand out on any terrain */
  labelHalo: string;
  /** Lit slopes of the terrain */
  highlight: string;
  /** Slopes facing away from the light */
  shadow: string;
  /** Soft shade in the folds of the terrain */
  shade: string;
  sky: string;
  horizon: string;
}

/** For text and graphics over the map: its main color, and the one text stands out least on. */
export interface MapContrast {
  land: string;
  extreme: string;
}

/** The plain looks of the flyover map: cool blue-grey at night, soft grey by day. */
const FLYOVER: Record<MapTone, MapPalette> = {
  dark: {
    land: '#0c0c0c',
    road: '#4b5873',
    building: '#252d3d',
    label: '#dde3ec',
    labelHalo: '#07090d',
    highlight: '#7486ab',
    shadow: '#000000',
    shade: '#1b2233',
    sky: '#0b0f1a',
    horizon: '#24324a',
  },
  light: {
    land: '#f2f3f0',
    road: '#9aa2ad',
    building: '#e1e4e8',
    label: '#1f2329',
    labelHalo: '#ffffff',
    highlight: '#ffffff',
    shadow: '#6b7480',
    shade: '#d5dae0',
    sky: '#dfe6ee',
    horizon: '#f4f5f2',
  },
};

/** The street map of images: the base style's own streets with soft relief shading. */
const STREETS: Record<MapTone, MapPalette> = {
  dark: {
    land: '#0c0c0c',
    road: '#3c3c3c',
    building: '#0a0a0a',
    label: '#dde3ec',
    labelHalo: '#07090d',
    highlight: '#3a4152',
    shadow: '#000000',
    shade: '#141821',
    sky: '#0b0f1a',
    horizon: '#24324a',
  },
  light: {
    land: '#f2f3f0',
    road: '#d5d5d5',
    building: '#eaeae5',
    label: '#1f2329',
    labelHalo: '#ffffff',
    highlight: '#ffffff',
    shadow: '#9aa1ab',
    shade: '#e4e6e9',
    sky: '#dfe6ee',
    horizon: '#f4f5f2',
  },
};

/** How much of the user's accent color each part of the tinted look takes. */
const TINT: Record<keyof MapPalette, number> = {
  land: 0.05,
  road: 0.5,
  building: 0.2,
  label: 0.15,
  labelHalo: 0,
  highlight: 0.3,
  shadow: 0.1,
  shade: 0.15,
  sky: 0.08,
  horizon: 0.35,
};

/** Labels and details that only add clutter (and font downloads) to a poster. */
const DROPPED_LAYERS = [
  // Dark style
  /^highway_name/,
  /^road_oneway/,
  /^water_name/,
  /^place_(other|suburb|state|country)/,
  // Light style
  /^highway-name/,
  /^highway-shield/,
  /^road_shield/,
  /^waterway_line_label/,
  /^label_(other|state|country)/,
  /^airport/,
];
/** Town and city name layers of both base styles, by the kind of place they name. */
const PLACE_LAYERS: Record<string, PlaceLevel> = {
  place_village: 'village',
  place_town: 'town',
  place_city: 'city',
  place_city_large: 'city',
  label_village: 'village',
  label_town: 'town',
  label_city: 'city',
  label_city_capital: 'city',
};
const PLACE_NAMES = Object.keys(PLACE_LAYERS);
const PLACE_RANK: Record<PlaceLevel, number> = { village: 0, town: 1, city: 2 };
/**
 * Name sizes in pixels of the 1080 px wide output, bold, with a dark or light outline:
 * readable on a phone screen, where the video shows at about a third of that.
 */
const PLACE_SIZE: Record<PlaceLevel, number> = { village: 28, town: 34, city: 40 };
/** Route areas (longer side, meters) up to which villages, then towns are still named. */
const PLACE_AREA = { village: 5_000, town: 15_000 };
/** Road centre lines that get the palette color in videos, so streets stay visible. */
const ROAD_LINES = [
  'highway_path',
  'highway_minor',
  'highway_major_inner',
  'highway_motorway_inner',
];

/** Paint properties that carry the palette: [layer, property, color]. */
type PaintKey =
  | 'fill-extrusion-color'
  | 'hillshade-highlight-color'
  | 'hillshade-shadow-color'
  | 'hillshade-accent-color'
  | 'line-color'
  | 'text-color'
  | 'text-halo-color';
export type PalettePaint = [layer: string, property: PaintKey, color: string];

const dem = (detail: MapDetail): SourceSpecification => ({
  type: 'raster-dem',
  tiles: [TERRAIN_TILES],
  encoding: 'terrarium',
  tileSize: TERRAIN_TILE_SIZE,
  maxzoom: detail === 'preview' ? PREVIEW_MAXZOOM.terrain : TERRAIN_MAXZOOM,
});

/**
 * The 3D map looks, generated from elevation and vector data, so they stay sharp at any
 * distance (unlike free satellite imagery). Dark or light by the poster's background; images
 * get the street map, videos lit streets, 3D buildings and a palette (plain, or tinted with
 * the theme's accent). The route is drawn by our renderer on top.
 */
export class MapStyles {
  /** The selectable video looks */
  static readonly VIDEO_IDS: VideoStyleId[] = ['neutral', 'tinted'];

  static attribution(): string[] {
    return ATTRIBUTION;
  }

  /** A dark map behind dark backgrounds, a light one behind light backgrounds. */
  static tone(background: string): MapTone {
    return Color.parse(background).isDark ? 'dark' : 'light';
  }

  /** The look of a route's map: relief scaled to its hills, names to its area. */
  static look(route: GeoRoute): MapLook {
    let min = Infinity;
    let max = -Infinity;
    for (const ele of route.elevations) {
      if (ele === undefined) continue;
      if (ele < min) min = ele;
      if (ele > max) max = ele;
    }
    return {
      exaggeration: MapStyles.exaggeration(min <= max ? max - min : 0),
      places: MapStyles.placeLevel(MapStyles.areaSize(route)),
    };
  }

  /** Identifies a look, for caching rendered maps. */
  static lookKey({ exaggeration, places }: MapLook): string {
    return `${exaggeration.toFixed(1)}|${places}`;
  }

  /**
   * Which places get named for an area of this size (meters): seen from far, village names
   * would only crowd the picture, so a wide area shows towns, a very wide one only cities.
   */
  static placeLevel(areaSize: number): PlaceLevel {
    if (areaSize <= PLACE_AREA.village) return 'village';
    if (areaSize <= PLACE_AREA.town) return 'town';
    return 'city';
  }

  /** The longer side of the route's bounding box, meters. */
  private static areaSize({ coordinates }: GeoRoute): number {
    if (coordinates.length === 0) return 0;
    let [minLon, minLat] = coordinates[0]!;
    let [maxLon, maxLat] = coordinates[0]!;
    for (const [lon, lat] of coordinates) {
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
    const midLat = (minLat + maxLat) / 2;
    return Math.max(haversine(midLat, minLon, midLat, maxLon), haversine(minLat, 0, maxLat, 0));
  }

  /**
   * Terrain exaggeration by how hilly the area is: flat routes get a stronger lift so their
   * gentle hills still show, mountains a lighter one so they don't look like spikes.
   */
  static exaggeration(elevationRange: number): number {
    if (elevationRange < 60) return 3;
    if (elevationRange < 150) return 2.5;
    if (elevationRange < 400) return 2;
    if (elevationRange < 1000) return 1.6;
    return 1.3;
  }

  /** Colors of a map; the tinted video look mixes in a little of the accent color. */
  static palette(
    kind: MapKind,
    tone: MapTone,
    id: VideoStyleId = 'neutral',
    accent = '#000000',
  ): MapPalette {
    if (kind === 'streets') return STREETS[tone];
    const plain = FLYOVER[tone];
    if (id === 'neutral') return plain;
    const tint = Color.parse(accent);
    const mixed = Object.entries(plain).map(([part, color]) => [
      part,
      Color.parse(color)
        .mix(tint, TINT[part as keyof MapPalette])
        .toHex(),
    ]);
    return Object.fromEntries(mixed) as unknown as MapPalette;
  }

  /**
   * The map colors text has to stand out from: its land, and its most contrasting part
   * (brightest on a dark map, darkest on a light one), sky and town names included.
   */
  static contrast(tone: MapTone, palette: MapPalette): MapContrast {
    const parts = [
      palette.land,
      palette.road,
      palette.building,
      palette.label,
      palette.highlight,
      palette.shadow,
      palette.sky,
      palette.horizon,
    ].map((hex) => Color.parse(hex));
    const byLuminance = parts.sort((a, b) => a.luminance - b.luminance);
    const extreme = tone === 'dark' ? byLuminance.at(-1)! : byLuminance[0]!;
    return { land: palette.land, extreme: extreme.toHex() };
  }

  /**
   * The paint values that carry a palette, as [layer, property, value]. A running map can
   * apply them directly, so a color change never reloads the map.
   */
  static paints(palette: MapPalette): PalettePaint[] {
    return [
      ['building-3d', 'fill-extrusion-color', palette.building],
      ['shading', 'hillshade-highlight-color', palette.highlight],
      ['shading', 'hillshade-shadow-color', palette.shadow],
      ['shading', 'hillshade-accent-color', palette.shade],
      ...ROAD_LINES.map((id): PalettePaint => [id, 'line-color', palette.road]),
      ...PLACE_NAMES.map((id): PalettePaint => [id, 'text-color', palette.label]),
      ...PLACE_NAMES.map((id): PalettePaint => [id, 'text-halo-color', palette.labelHalo]),
    ];
  }

  static sky(palette: Pick<MapPalette, 'sky' | 'horizon'>): SkySpecification {
    return {
      'sky-color': palette.sky,
      'horizon-color': palette.horizon,
      'fog-color': palette.horizon,
      'sky-horizon-blend': 0.6,
      'horizon-fog-blend': 0.5,
      'fog-ground-blend': 0.55,
      'atmosphere-blend': 0.8,
    };
  }

  static build(
    kind: MapKind,
    base: StyleSpecification,
    look: MapLook,
    palette: MapPalette,
    detail: MapDetail = 'full',
  ): StyleSpecification {
    let layers = base.layers
      .filter((layer) => !DROPPED_LAYERS.some((pattern) => pattern.test(layer.id)))
      .filter((layer) => MapStyles.namesPlace(layer.id, look.places))
      .map(MapStyles.stylePlaceName);
    if (kind === 'flyover') layers = layers.map(MapStyles.extrudeBuildings);
    // Terrain shading goes under roads and labels, right above land and water fills
    const firstLine = layers.findIndex((layer) => layer.type === 'line' || layer.type === 'symbol');
    layers.splice(firstLine === -1 ? layers.length : firstLine, 0, MapStyles.shading(kind));
    // Image maps keep the base style's streets; only the relief and names follow the palette
    const paints = MapStyles.paints(palette).filter(
      ([id]) => kind === 'flyover' || !ROAD_LINES.includes(id),
    );
    layers = MapStyles.applyPaints(layers, paints);

    return {
      ...base,
      sources: {
        ...MapStyles.limitDetail(base.sources, detail),
        terrain: dem(detail),
        // Shading from its own source looks better than sharing the 3D terrain's
        shading: dem(detail),
      },
      layers,
      terrain: { source: 'terrain', exaggeration: look.exaggeration },
      sky: MapStyles.sky(palette),
      // Color changes apply at once (a fade would also leave stale colors on the 3D terrain)
      transition: { duration: 0, delay: 0 },
    };
  }

  /** Vector sources stop a zoom level earlier for previews (the style overrides the server's). */
  private static limitDetail(
    sources: StyleSpecification['sources'],
    detail: MapDetail,
  ): StyleSpecification['sources'] {
    if (detail === 'full') return sources;
    const limited = Object.entries(sources).map(([id, source]) => [
      id,
      source.type === 'vector' ? { ...source, maxzoom: PREVIEW_MAXZOOM.vector } : source,
    ]);
    return Object.fromEntries(limited) as StyleSpecification['sources'];
  }

  /** False for name layers of places smaller than the level (e.g. villages on a wide area). */
  private static namesPlace(id: string, level: PlaceLevel): boolean {
    const kind = PLACE_LAYERS[id];
    return kind === undefined || PLACE_RANK[kind] >= PLACE_RANK[level];
  }

  /**
   * Town names readable on a poster: a fixed size by kind of place, bold, with an outline,
   * and at every zoom (the base styles hide them from zoom 14–15 on, but the video camera
   * sees a whole area from that close).
   */
  private static stylePlaceName(layer: LayerSpecification): LayerSpecification {
    const kind = PLACE_LAYERS[layer.id];
    if (layer.type !== 'symbol' || kind === undefined) return layer;
    const named = { ...layer };
    delete named.maxzoom;
    return {
      ...named,
      layout: {
        ...layer.layout,
        'text-size': PLACE_SIZE[kind],
        'text-font': ['Noto Sans Bold'],
      },
      paint: { ...layer.paint, 'text-halo-width': 2.5, 'text-halo-blur': 0.5 },
    };
  }

  /** Flat building outlines become 3D blocks with their real height. */
  private static extrudeBuildings(layer: LayerSpecification): LayerSpecification {
    if (layer.id !== 'building' || layer.type !== 'fill') return layer;
    return {
      id: 'building-3d',
      type: 'fill-extrusion',
      source: layer.source,
      'source-layer': layer['source-layer'],
      minzoom: 13,
      paint: {
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.9,
      },
    };
  }

  private static shading(kind: MapKind): LayerSpecification {
    const paint =
      kind === 'streets'
        ? // Subtle relief under the street lines
          { 'hillshade-exaggeration': 0.45 }
        : { 'hillshade-method': 'multidirectional' as const, 'hillshade-exaggeration': 0.9 };
    return { id: 'shading', type: 'hillshade', source: 'shading', paint };
  }

  private static applyPaints(
    layers: LayerSpecification[],
    paints: PalettePaint[],
  ): LayerSpecification[] {
    return layers.map((layer) => {
      const own = paints.filter(([id]) => id === layer.id);
      if (own.length === 0 || layer.type === 'background') return layer;
      const values = Object.fromEntries(own.map(([, key, value]) => [key, value]));
      return { ...layer, paint: { ...layer.paint, ...values } } as LayerSpecification;
    });
  }
}
