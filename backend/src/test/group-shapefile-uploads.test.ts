import { groupShapefileUploads } from '../infrastructure/services/extraction/group-shapefile-uploads';

function makeFile(
  name: string,
  content = 'x',
): {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
} {
  return {
    buffer: Buffer.from(content),
    originalname: name,
    mimetype: 'application/octet-stream',
  };
}

describe('groupShapefileUploads', () => {
  it('merges .shp and .dbf with the same basename into one zip upload', () => {
    const files = [
      makeFile('PARTICELLE_CONDOTTE.shp', 'shp'),
      makeFile('PARTICELLE_CONDOTTE.dbf', 'dbf'),
    ];
    const grouped = groupShapefileUploads(files, ['auto', 'auto']);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].file.originalname).toBe('particelle_condotte.zip');
    expect(grouped[0].file.mimetype).toBe('application/zip');
  });

  it('keeps non-shapefile files separate', () => {
    const files = [makeFile('campi.csv'), makeFile('PARTICELLE.shp')];
    const grouped = groupShapefileUploads(files, ['auto', 'auto']);

    expect(grouped).toHaveLength(2);
    expect(grouped[0].file.originalname).toBe('campi.csv');
    expect(grouped[1].file.originalname).toBe('PARTICELLE.shp');
  });

  it('passes zip archives through unchanged', () => {
    const files = [makeFile('appezzamenti.zip')];
    files[0].mimetype = 'application/zip';
    const grouped = groupShapefileUploads(files, ['auto']);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].file.originalname).toBe('appezzamenti.zip');
  });
});
