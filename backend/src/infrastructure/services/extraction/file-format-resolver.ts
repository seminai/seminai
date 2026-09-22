export type FileFormat = 'csv_excel' | 'pdf' | 'xml' | 'image' | 'shapefile' | 'geojson';

const CSV_EXCEL_MIMES = new Set([
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/jpg']);

const SHAPEFILE_EXTENSIONS = /\.(shp|dbf|shx|prj|cpg)$/i;

function isShapefileExtension(fileName: string): boolean {
  return SHAPEFILE_EXTENSIONS.test(fileName.toLowerCase());
}

export function resolveFileFormat(mimeType: string, fileName: string): FileFormat {
  const lowerName = fileName.toLowerCase();
  if (mimeType === 'application/pdf' || lowerName.endsWith('.pdf')) return 'pdf';
  if (
    mimeType === 'application/geo+json' ||
    lowerName.endsWith('.geojson') ||
    (lowerName.startsWith('pcg_') && lowerName.endsWith('.json'))
  ) {
    return 'geojson';
  }
  if (CSV_EXCEL_MIMES.has(mimeType) || /\.(csv|xlsx?)$/i.test(fileName)) return 'csv_excel';
  if (
    mimeType === 'application/zip' ||
    mimeType === 'application/x-zip-compressed' ||
    lowerName.endsWith('.zip')
  ) {
    return 'shapefile';
  }
  if (isShapefileExtension(fileName)) return 'shapefile';
  if (mimeType === 'application/xml' || mimeType === 'text/xml' || lowerName.endsWith('.xml')) {
    return 'xml';
  }
  if (IMAGE_MIMES.has(mimeType)) return 'image';
  if (mimeType === 'application/octet-stream') {
    if (/\.(csv|xlsx?)$/i.test(fileName)) return 'csv_excel';
    if (lowerName.endsWith('.pdf')) return 'pdf';
    if (lowerName.endsWith('.geojson')) return 'geojson';
    if (lowerName.endsWith('.zip')) return 'shapefile';
    if (isShapefileExtension(fileName)) return 'shapefile';
    if (lowerName.endsWith('.xml')) return 'xml';
    if (/\.(png|jpg|jpeg)$/i.test(fileName)) return 'image';
  }
  return 'csv_excel';
}
