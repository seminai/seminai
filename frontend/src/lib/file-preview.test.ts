import { describe, expect, it } from 'vitest';
import { isPreviewableFile } from '@/lib/file-preview';

describe('isPreviewableFile', () => {
  it('does not preview ZIP archives', () => {
    expect(isPreviewableFile('AZIENDA 2.zip')).toBe(false);
  });

  it('keeps supported document previews enabled', () => {
    expect(isPreviewableFile('piano.pdf')).toBe(true);
    expect(isPreviewableFile('campi.xlsx')).toBe(true);
  });
});
