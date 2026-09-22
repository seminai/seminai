import { useMutation } from '@tanstack/react-query';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

interface UpdateRulePayload {
  readonly name?: string;
  readonly slug?: string;
  readonly description?: string;
  readonly category?: string;
  readonly status?: string;
  readonly content?: string;
  readonly sourceUrl?: string;
  readonly sourceDocument?: string;
  readonly region?: string;
  readonly validFrom?: string;
  readonly validUntil?: string;
  readonly version?: string;
  readonly isPublic?: boolean;
  readonly isTemplate?: boolean;
  readonly pdfFile?: File;
}

interface UpdateRuleVars {
  readonly id: string;
  readonly data: UpdateRulePayload;
}

async function updateRule({ id, data }: UpdateRuleVars) {
  const formData = new FormData();

  const stringFields = [
    'name', 'slug', 'description', 'category', 'status', 'content',
    'sourceUrl', 'sourceDocument', 'region', 'validFrom', 'validUntil', 'version',
  ] as const;

  for (const key of stringFields) {
    const value = data[key];
    if (value !== undefined) formData.append(key, value);
  }

  if (data.isPublic !== undefined) formData.append('isPublic', String(data.isPublic));
  if (data.isTemplate !== undefined) formData.append('isTemplate', String(data.isTemplate));
  if (data.pdfFile) formData.append('pdfFile', data.pdfFile);

  const url = new URL(`${BASE_URL}/rules/${id}`, window.location.origin);
  const response = await fetch(url.toString(), {
    method: 'PUT',
    body: formData,
    credentials: 'include',
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message ?? `API error ${response.status}`);
  }

  return response.json();
}

export function useUpdateRule() {
  return useMutation({ mutationFn: updateRule });
}
