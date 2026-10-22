import type {
  LayerSpecification,
  SkySpecification,
  SourceSpecification,
  StyleSpecification,
} from 'maplibre-gl';

export type MapStyleId = 'dark' | 'satellite';

/** Mountains look flat from a drone's height; a little exaggeration brings back the drama. */
export const TERRAIN_EXAGGERATION = 1.4;

/** Base style of the dark map (OpenFreeMap: free, no key, OpenStreetMap data). */
export const DARK_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';

const SATELLITE_TILES =
  'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg';
const TERRAIN_TILES = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png';

const TERRAIN_CREDIT = 'Terrain: Mapzen, AWS Open Data';

/** Credits each map's licenses require on every image and video that shows it. */
const ATTRIBUTION: Record<MapStyleId, string[]> = {
  dark: [`© OpenStreetMap contributors · OpenFreeMap · OpenMapTiles · ${TERRAIN_CREDIT}`],
  satellite: [
    'Imagery: EOxCloudless 2016, cloudless.eox.at by EOX IT Services GmbH',
    `(contains modified Copernicus Sentinel data 2016 & 2017) · ${TERRAIN_CREDIT}`,
  ],
};

/** Labels and details that only add clutter (and font downloads) to a poster. */
const DARK_LAYERS_DROPPED = [
  /^highway_name/,
  /^road_oneway/,
  /^water_name/,
  /^place_(other|suburb)/,
];

const terrain: SourceSpecification = {
  type: 'raster-dem',
  tiles: [TERRAIN_TILES],
  encoding: 'terrarium',
  tileSize: 256,
  maxzoom: 12, // ~30 m elevation detail is plenty for the 3D shape, at a fraction of the tiles
};

/**
 * The two map looks. Both have 3D terrain and sky; the route itself is drawn by our renderer
 * on top, so the map never re-renders when colors, line width or text change.
 */
export class MapStyles {
  static readonly IDS: MapStyleId[] = ['dark', 'satellite'];

  static attribution(id: MapStyleId): string[] {
    return ATTRIBUTION[id];
  }

  /**
   * Closest the flyover camera may come, meters. Satellite imagery is ~10 m per pixel,
   * so it has to stay higher to look sharp; vector maps stay crisp at any distance.
   */
  static closestCamera(id: MapStyleId): number {
    return id === 'satellite' ? 1800 : 450;
  }

  /** The finished style. The dark map needs its downloaded base style. */
  static build(id: MapStyleId, darkBase?: StyleSpecification): StyleSpecification {
    if (id === 'dark' && darkBase) return MapStyles.dark(darkBase);
    return MapStyles.satellite();
  }

  private static dark(base: StyleSpecification): StyleSpecification {
    const layers = base.layers.filter(
      (layer) => !DARK_LAYERS_DROPPED.some((pattern) => pattern.test(layer.id)),
    );
    // Relief shading goes under roads and labels, right above land and water fills
    const firstLine = layers.findIndex((layer) => layer.type === 'line');
    const shading: LayerSpecification = {
      id: 'shading',
      type: 'hillshade',
      source: 'terrain',
      paint: {
        'hillshade-exaggeration': 0.45,
        'hillshade-shadow-color': '#000000',
        'hillshade-highlight-color': '#3a4152',
      },
    };
    layers.splice(firstLine === -1 ? layers.length : firstLine, 0, shading);
    return {
      ...base,
      sources: { ...base.sources, terrain },
      layers,
      terrain: { source: 'terrain', exaggeration: TERRAIN_EXAGGERATION },
      sky: MapStyles.sky('#0e0f12', '#2a2f3a'),
    };
  }

  private static satellite(): StyleSpecification {
    return {
      version: 8,
      sources: {
        satellite: { type: 'raster', tiles: [SATELLITE_TILES], tileSize: 256, maxzoom: 14 },
        terrain,
      },
      terrain: { source: 'terrain', exaggeration: TERRAIN_EXAGGERATION },
      sky: MapStyles.sky('#16233a', '#9fb6cf'),
      layers: [
        { id: 'background', type: 'background', paint: { 'background-color': '#0b1220' } },
        {
          id: 'satellite',
          type: 'raster',
          source: 'satellite',
          paint: { 'raster-saturation': 0.15, 'raster-contrast': 0.1, 'raster-fade-duration': 0 },
        },
      ],
    };
  }

  private static sky(skyColor: string, horizonColor: string): SkySpecification {
    return {
      'sky-color': skyColor,
      'horizon-color': horizonColor,
      'fog-color': horizonColor,
      'sky-horizon-blend': 0.6,
      'horizon-fog-blend': 0.5,
      'fog-ground-blend': 0.6,
      'atmosphere-blend': 0.8,
    };
  }
}
