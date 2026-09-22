const PREVIEWABLE_FILE_PATTERN =
  /\.(pdf|png|jpe?g|gif|bmp|webp|svg|tiff?|csv|xlsx?|xlsm|xlsb|ods)$/i;

export function isPreviewableFile(fileName: string): boolean {
  return PREVIEWABLE_FILE_PATTERN.test(fileName);
}
