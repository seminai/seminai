export const CONTACT_EMAIL_MAX_FILES = 5;
export const CONTACT_EMAIL_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const CONTACT_EMAIL_MAX_TOTAL_BYTES = 20 * 1024 * 1024;
export const CONTACT_EMAIL_PDF_MIME = 'application/pdf';

export type ContactEmailFileValidationCode =
  | 'INVALID_TYPE'
  | 'FILE_TOO_LARGE'
  | 'TOTAL_TOO_LARGE'
  | 'TOO_MANY_FILES';

export function validateContactEmailFiles(
  files: readonly File[],
): ContactEmailFileValidationCode | null {
  if (files.length > CONTACT_EMAIL_MAX_FILES) {
    return 'TOO_MANY_FILES';
  }
  let totalBytes = 0;
  for (const file of files) {
    if (file.type !== CONTACT_EMAIL_PDF_MIME) {
      return 'INVALID_TYPE';
    }
    if (file.size > CONTACT_EMAIL_MAX_FILE_BYTES) {
      return 'FILE_TOO_LARGE';
    }
    totalBytes += file.size;
  }
  if (totalBytes > CONTACT_EMAIL_MAX_TOTAL_BYTES) {
    return 'TOTAL_TOO_LARGE';
  }
  return null;
}

export function buildContactEmailFormData(params: {
  readonly name: string;
  readonly email: string;
  readonly body: string;
  readonly files?: readonly File[];
}): FormData {
  const formData = new FormData();
  formData.append('name', params.name);
  formData.append('email', params.email);
  formData.append('body', params.body);
  for (const file of params.files ?? []) {
    formData.append('files', file);
  }
  return formData;
}
