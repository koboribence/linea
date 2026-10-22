import type {
  ExpressionSpecification,
  LayerSpecification,
  SkySpecification,
  SourceSpecification,
  StyleSpecification,
} from 'maplibre-gl';
import type { GeoRoute } from '../route/RouteShape';
import { SunPosition, type SunAngles } from './SunPosition';

/** 'streets' is the image background; the others are the video looks. */
export type MapStyleId = 'streets' | VideoStyleId;
export type VideoStyleId = 'night' | 'dawn' | 'neon';

/** Base style of the vector map (OpenFreeMap: free, no key, OpenStreetMap data). */
export const DARK_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';

/** Open terrain data (Mapterhorn), more detailed than older global sets where available. */
const TERRAIN_TILES = 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp';
const TERRAIN_TILE_SIZE = 512;
/** 512 px tiles at z13 carry about as much detail as 256 px tiles at z14 */
const TERRAIN_MAXZOOM = 13;

const ATTRIBUTION = [
  '© OpenStreetMap contributors · OpenFreeMap · OpenMapTiles · Terrain: © Mapterhorn',
];

/** Light on the terrain: compass direction it comes from and its height, degrees. */
export interface Lighting {
  direction: number;
  altitude: number;
}

/** What a route's map looks like apart from its style: light, relief, elevation range. */
export interface MapLook {
  lighting: Lighting;
  /** Vertical exaggeration of the 3D terrain */
  exaggeration: number;
  /** Elevation range of the route, meters, for the neon colors */
  elevation: { min: number; max: number };
}

/** Labels and details that only add clutter (and font downloads) to a poster. */
const DROPPED_LAYERS = [/^highway_name/, /^road_oneway/, /^water_name/, /^place_(other|suburb)/];
/** Road centre lines that get a lighter color in videos, so streets stay visible up close. */
const ROAD_LINES = /^highway_(path|minor|major_inner|motorway_inner)$/;

/** Colors of streets and 3D buildings in the video looks. */
const VIDEO_PALETTE: Record<VideoStyleId, { road: string; building: string }> = {
  night: { road: '#4b5873', building: '#252d3d' },
  dawn: { road: '#c9a184', building: '#4a3236' },
  neon: { road: '#c084fc', building: '#2e1450' },
};

const dem = (): SourceSpecification => ({
  type: 'raster-dem',
  tiles: [TERRAIN_TILES],
  encoding: 'terrarium',
  tileSize: TERRAIN_TILE_SIZE,
  maxzoom: TERRAIN_MAXZOOM,
});

/**
 * 3D map looks, all generated from elevation and vector data, so they stay sharp at any
 * distance (unlike free satellite imagery). Images get the dark street map; videos one of three
 * stylized looks with lit streets and 3D buildings. The route is drawn by our renderer on top,
 * so theme colors never require a new map.
 */
export class MapStyles {
  /** The look of image backgrounds */
  static readonly IMAGE: MapStyleId = 'streets';
  /** The selectable video looks */
  static readonly VIDEO_IDS: VideoStyleId[] = ['night', 'dawn', 'neon'];

  static attribution(): string[] {
    return ATTRIBUTION;
  }

  /** The look of a route's map: lit like the sun at the start, relief scaled to its hills. */
  static look(route: GeoRoute, start?: Date): MapLook {
    let min = Infinity;
    let max = -Infinity;
    for (const ele of route.elevations) {
      if (ele === undefined) continue;
      if (ele < min) min = ele;
      if (ele > max) max = ele;
    }
    const elevation = min <= max ? { min, max } : { min: 0, max: 0 };
    const [lon, lat] = route.coordinates[0] ?? [0, 0];
    return {
      lighting: MapStyles.lighting(start && SunPosition.at(start, lat, lon)),
      exaggeration: MapStyles.exaggeration(elevation.max - elevation.min),
      elevation,
    };
  }

  /** Identifies a look, for caching rendered maps. */
  static lookKey({ lighting, exaggeration, elevation }: MapLook): string {
    const values = [
      lighting.direction,
      lighting.altitude,
      exaggeration,
      elevation.min,
      elevation.max,
    ];
    return values.map((value) => value.toFixed(1)).join(',');
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

  /** Light like the sun at the activity; at night a cool, low moonlight from the north-west. */
  static lighting(sun: SunAngles | undefined): Lighting {
    if (!sun || sun.altitude < 3) return { direction: 315, altitude: 30 };
    // Very low sun makes everything black; very high sun makes everything flat
    return { direction: sun.azimuth, altitude: Math.min(55, Math.max(20, sun.altitude)) };
  }

  static build(id: MapStyleId, base: StyleSpecification, look: MapLook): StyleSpecification {
    const layers = base.layers
      .filter((layer) => !DROPPED_LAYERS.some((pattern) => pattern.test(layer.id)))
      .map((layer) => (id === 'streets' ? layer : MapStyles.forVideo(id, layer)));
    // Terrain layers go under roads and labels, right above land and water fills
    const firstLine = layers.findIndex((layer) => layer.type === 'line' || layer.type === 'symbol');
    layers.splice(
      firstLine === -1 ? layers.length : firstLine,
      0,
      ...MapStyles.terrainLayers(id, look),
    );

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
      sky: MapStyles.sky(id),
    };
  }

  /** Lighter streets and 3D buildings: the chase camera flies low enough to see them. */
  private static forVideo(id: VideoStyleId, layer: LayerSpecification) {
    const palette = VIDEO_PALETTE[id];
    if (layer.id === 'building' && layer.type === 'fill') {
      return {
        id: 'building-3d',
        type: 'fill-extrusion',
        source: layer.source,
        'source-layer': layer['source-layer'],
        minzoom: 13,
        paint: {
          'fill-extrusion-color': palette.building,
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.9,
        },
      } satisfies LayerSpecification;
    }
    if (layer.type === 'line' && ROAD_LINES.test(layer.id)) {
      return { ...layer, paint: { ...layer.paint, 'line-color': palette.road } };
    }
    return layer;
  }

  private static terrainLayers(
    id: MapStyleId,
    { lighting, elevation }: MapLook,
  ): LayerSpecification[] {
    if (id === 'streets') {
      // Subtle relief under the street lines, as in the first map version
      return [
        {
          id: 'shading',
          type: 'hillshade',
          source: 'shading',
          paint: {
            'hillshade-exaggeration': 0.45,
            'hillshade-shadow-color': '#000000',
            'hillshade-highlight-color': '#3a4152',
          },
        },
      ];
    }
    if (id === 'night') {
      return [
        {
          id: 'shading',
          type: 'hillshade',
          source: 'shading',
          paint: {
            'hillshade-method': 'multidirectional',
            'hillshade-exaggeration': 0.9,
            'hillshade-shadow-color': '#000000',
            'hillshade-highlight-color': '#7486ab',
            'hillshade-accent-color': '#1b2233',
          },
        },
      ];
    }
    if (id === 'dawn') {
      return [
        {
          id: 'shading',
          type: 'hillshade',
          source: 'shading',
          paint: {
            'hillshade-method': 'basic',
            'hillshade-illumination-anchor': 'map',
            'hillshade-illumination-direction': lighting.direction,
            'hillshade-illumination-altitude': lighting.altitude,
            'hillshade-exaggeration': 0.7,
            'hillshade-shadow-color': '#2b1636',
            'hillshade-highlight-color': '#ffc58f',
            'hillshade-accent-color': '#5a2f3c',
          },
        },
      ];
    }
    return [
      {
        id: 'relief',
        type: 'color-relief',
        source: 'shading',
        paint: { 'color-relief-color': MapStyles.neonRamp(elevation), 'color-relief-opacity': 0.8 },
      },
      {
        id: 'shading',
        type: 'hillshade',
        source: 'shading',
        paint: {
          'hillshade-method': 'igor',
          'hillshade-exaggeration': 0.6,
          'hillshade-shadow-color': '#05030c',
          'hillshade-highlight-color': '#ffffff',
        },
      },
    ];
  }

  /**
   * Synthwave colors from the valleys to the peaks. The ramp reaches past the route's own
   * highest point, so the hills around it glow without flooding the image in bright colors.
   */
  private static neonRamp({ min, max }: { min: number; max: number }): ExpressionSpecification {
    const span = Math.max(max - min, 50);
    const at = (share: number) => min + span * share;
    return [
      'interpolate',
      ['linear'],
      ['elevation'],
      at(-0.2),
      '#05051a',
      at(0.2),
      '#1a1650',
      at(0.6),
      '#4c1d95',
      at(1),
      '#a21caf',
      at(1.6),
      '#ec4899',
      at(2.4),
      '#fb923c',
    ];
  }

  private static sky(id: MapStyleId): SkySpecification {
    const [skyColor, horizonColor] =
      id === 'dawn'
        ? ['#2a1f3d', '#ff9e6b']
        : id === 'neon'
          ? ['#0b0620', '#7c3aed']
          : ['#0b0f1a', '#24324a'];
    return {
      'sky-color': skyColor,
      'horizon-color': horizonColor,
      'fog-color': horizonColor,
      'sky-horizon-blend': 0.6,
      'horizon-fog-blend': 0.5,
      'fog-ground-blend': 0.55,
      'atmosphere-blend': 0.8,
    };
  }
}
