interface BuildExportFilenameParams {
  readonly section: string;
  readonly companyName?: string | null;
  readonly date?: Date;
}

/**
 * Builds the canonical export filename used across the app:
 * `<gg-mm-aa>_<sezione>_<nome-azienda>` (slugified).
 */
export function buildExportFilename({
  section,
  companyName,
  date = new Date(),
}: BuildExportFilenameParams): string {
  const datePart = formatDdMmYy(date);
  const sectionPart = slugify(section) || 'app';
  const companyPart = slugify(companyName ?? '') || 'azienda';
  return `${datePart}_${sectionPart}_${companyPart}`;
}

function formatDdMmYy(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear() % 100).padStart(2, '0');
  return `${dd}-${mm}-${yy}`;
}

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
