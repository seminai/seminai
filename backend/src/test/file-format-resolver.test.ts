import { resolveFileFormat } from '../infrastructure/services/extraction/file-format-resolver';

describe('resolveFileFormat', () => {
  it('detects shapefile extensions', () => {
    expect(resolveFileFormat('application/octet-stream', 'PARTICELLE_CONDOTTE.shp')).toBe(
      'shapefile',
    );
    expect(resolveFileFormat('application/octet-stream', 'PARTICELLE_CONDOTTE.dbf')).toBe(
      'shapefile',
    );
    expect(resolveFileFormat('application/zip', 'fields.zip')).toBe('shapefile');
  });

  it('detects csv and geojson formats', () => {
    expect(resolveFileFormat('text/csv', 'campi.csv')).toBe('csv_excel');
    expect(resolveFileFormat('application/geo+json', 'pcg_test.geojson')).toBe('geojson');
  });

  it('does not classify shp as csv_excel', () => {
    expect(resolveFileFormat('application/octet-stream', 'data.shp')).not.toBe('csv_excel');
  });
});
