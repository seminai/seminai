import {
  AUDIO_ALLOWED_MIMETYPES,
  DEFAULT_ALLOWED_MIMETYPES,
  isAllowedMimetype,
} from '../infrastructure/services/Multer';

describe('Multer MIME type configuration', () => {
  it('should allow webm audio for audio transcription uploads', () => {
    const actualIsAllowed = isAllowedMimetype({
      mimetype: 'audio/webm',
      allowedMimetypes: AUDIO_ALLOWED_MIMETYPES,
    });

    expect(actualIsAllowed).toBe(true);
  });

  it('should reject webm audio from the default uploader', () => {
    const actualIsAllowed = isAllowedMimetype({
      mimetype: 'audio/webm',
      allowedMimetypes: DEFAULT_ALLOWED_MIMETYPES,
    });

    expect(actualIsAllowed).toBe(false);
  });

  it('should normalize MIME type casing before validation', () => {
    const actualIsAllowed = isAllowedMimetype({
      mimetype: 'Audio/WEBM',
      allowedMimetypes: AUDIO_ALLOWED_MIMETYPES,
    });

    expect(actualIsAllowed).toBe(true);
  });
});
