import { useMutation } from '@tanstack/react-query';
import { multipartFetch } from '@/lib/api-client';
import type { ExtractBrogliacciResponse } from '@/types/brogliaccio';

export function useBrogliaccioExtraction() {
  return useMutation({
    mutationFn: (files: File[]) => {
      const formData = new FormData();
      for (const file of files) {
        formData.append('files', file);
      }
      return multipartFetch<ExtractBrogliacciResponse>(
        '/extract-brogliacci',
        formData,
      );
    },
  });
}
