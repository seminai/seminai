export interface ClassifiedFile {
  readonly raw: File;
  readonly companyId: string;
  readonly category: string;
}

export interface ExtractionBatch {
  readonly companyId: string;
  readonly formData: FormData;
  readonly fileCount: number;
  readonly totalBytes: number;
}

/**
 * Builds one FormData batch per company. Shapefile sidecars (.dbf, .shx, .prj)
 * must share the same companyId and category as the primary .shp; the backend
 * groups them into a single extraction job.
 */
export function buildExtractionBatches(
  files: readonly ClassifiedFile[],
): readonly ExtractionBatch[] {
  const groups = new Map<string, ClassifiedFile[]>();
  for (const file of files) {
    if (!file.companyId) continue;
    const existing = groups.get(file.companyId);
    if (existing) {
      existing.push(file);
    } else {
      groups.set(file.companyId, [file]);
    }
  }
  return Array.from(groups.entries()).map(([companyId, groupFiles]) => {
    const formData = new FormData();
    formData.append('companyId', companyId);
    formData.append('categories', JSON.stringify(groupFiles.map((f) => f.category)));
    for (const f of groupFiles) {
      formData.append('files', f.raw);
    }
    const totalBytes = groupFiles.reduce((acc, f) => acc + f.raw.size, 0);
    return { companyId, formData, fileCount: groupFiles.length, totalBytes };
  });
}
