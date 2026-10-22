import type {
  DataDrivenPropertyValueSpecification,
  LayerSpecification,
  SkySpecification,
  SourceSpecification,
  StyleSpecification,
} from 'maplibre-gl';
import { Color } from '../poster/Color';
import type { GeoRoute } from '../route/RouteShape';

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

const ATTRIBUTION = [
  '© OpenStreetMap contributors · OpenFreeMap · OpenMapTiles · Terrain: © Mapterhorn',
];

/** What a route's map needs apart from its style. */
export interface MapLook {
  /** Vertical exaggeration of the 3D terrain */
  exaggeration: number;
}

/** Colors of a map. */
export interface MapPalette {
  /** Bare land, the color most of the map has */
  land: string;
  road: string;
  building: string;
  /** Town names */
  label: string;
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
    label: '#8a93a6',
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
    label: '#4a4f57',
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
    label: '#8a93a6',
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
    label: '#4a4f57',
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
  label: 0.3,
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
/** Town and city names (both styles), drawn larger than the base styles' tiny labels. */
const PLACE_NAMES = [
  'place_village',
  'place_town',
  'place_city',
  'place_city_large',
  'label_village',
  'label_town',
  'label_city',
  'label_city_capital',
];
const PLACE_NAME_SCALE = 1.4;
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
  | 'text-color';
export type PalettePaint = [layer: string, property: PaintKey, color: string];

const dem = (): SourceSpecification => ({
  type: 'raster-dem',
  tiles: [TERRAIN_TILES],
  encoding: 'terrarium',
  tileSize: TERRAIN_TILE_SIZE,
  maxzoom: TERRAIN_MAXZOOM,
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

  /** The look of a route's map: relief scaled to its hills. */
  static look(route: GeoRoute): MapLook {
    let min = Infinity;
    let max = -Infinity;
    for (const ele of route.elevations) {
      if (ele === undefined) continue;
      if (ele < min) min = ele;
      if (ele > max) max = ele;
    }
    return { exaggeration: MapStyles.exaggeration(min <= max ? max - min : 0) };
  }

  /** Identifies a look, for caching rendered maps. */
  static lookKey({ exaggeration }: MapLook): string {
    return exaggeration.toFixed(1);
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
  ): StyleSpecification {
    let layers = base.layers
      .filter((layer) => !DROPPED_LAYERS.some((pattern) => pattern.test(layer.id)))
      .map(MapStyles.enlargePlaceName);
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
        ...base.sources,
        terrain: dem(),
        // Shading from its own source looks better than sharing the 3D terrain's
        shading: dem(),
      },
      layers,
      terrain: { source: 'terrain', exaggeration: look.exaggeration },
      sky: MapStyles.sky(palette),
      // Color changes apply at once (a fade would also leave stale colors on the 3D terrain)
      transition: { duration: 0, delay: 0 },
    };
  }

  private static enlargePlaceName(layer: LayerSpecification): LayerSpecification {
    if (layer.type !== 'symbol' || !PLACE_NAMES.includes(layer.id)) return layer;
    const size = MapStyles.scaleSize(layer.layout?.['text-size'], PLACE_NAME_SCALE);
    if (size === undefined) return layer;
    return { ...layer, layout: { ...layer.layout, 'text-size': size } };
  }

  /** A number, or a zoom curve whose output sizes are all scaled. */
  private static scaleSize(
    size: DataDrivenPropertyValueSpecification<number> | undefined,
    scale: number,
  ): DataDrivenPropertyValueSpecification<number> | undefined {
    if (typeof size === 'number') return size * scale;
    if (!Array.isArray(size) || size[0] !== 'interpolate') return undefined;
    // ["interpolate", curve, ["zoom"], zoom1, size1, zoom2, size2, …]
    const scaled = (size as unknown[]).map((value, i) =>
      i >= 4 && i % 2 === 0 && typeof value === 'number' ? value * scale : value,
    );
    return scaled as DataDrivenPropertyValueSpecification<number>;
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
