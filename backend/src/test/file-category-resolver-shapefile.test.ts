import { resolveFileCategory } from '../infrastructure/services/extraction/file-category-resolver';

describe('resolveFileCategory explicit shapefile categories', () => {
  it('keeps explicit agricultural uploads as agricultural extraction', async () => {
    const resolved = await resolveFileCategory({
      userCategory: 'agricultural',
      fileBuffer: Buffer.from('PK'),
      mimeType: 'application/zip',
      fileName: 'piano-colturale.zip',
    });

    expect(resolved.category).toBe('agricultural');
    expect(resolved.fileFormat).toBe('shapefile');
  });

  it('maps production_units + shapefile to agricultural extraction', async () => {
    const resolved = await resolveFileCategory({
      userCategory: 'production_units',
      fileBuffer: Buffer.from('PK'),
      mimeType: 'application/zip',
      fileName: 'appezzamenti.zip',
    });

    expect(resolved.category).toBe('agricultural');
    expect(resolved.fileFormat).toBe('shapefile');
  });

  it('keeps fields + shapefile on fields extraction', async () => {
    const resolved = await resolveFileCategory({
      userCategory: 'fields',
      fileBuffer: Buffer.from('PK'),
      mimeType: 'application/zip',
      fileName: 'appezzamenti.zip',
    });

    expect(resolved.category).toBe('fields');
    expect(resolved.fileFormat).toBe('shapefile');
  });
});
