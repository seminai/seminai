declare module 'shapefile' {
  interface GeoJsonFeature {
    type: 'Feature';
    properties: Record<string, unknown> | null;
    geometry: {
      type: string;
      coordinates: number[][][] | number[][][][] | number[][] | number[];
    } | null;
  }

  interface GeoJsonFeatureCollection {
    type: 'FeatureCollection';
    features: GeoJsonFeature[];
    bbox?: [number, number, number, number];
  }

  interface ReadOptions {
    encoding?: string;
  }

  function read(
    shp: string | ArrayBuffer,
    dbf?: string | ArrayBuffer | null,
    options?: ReadOptions,
  ): Promise<GeoJsonFeatureCollection>;

  function open(
    shp: string | ArrayBuffer,
    dbf?: string | ArrayBuffer | null,
    options?: ReadOptions,
  ): Promise<{
    read(): Promise<{ done: boolean; value: GeoJsonFeature }>;
    bbox: [number, number, number, number];
  }>;
}
