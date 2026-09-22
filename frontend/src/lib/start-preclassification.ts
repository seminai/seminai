import { multipartFetch } from '@/lib/api-client';
import type { StartPreclassificationResponse } from '@/types/preclassification';

/**
 * Starts an async pre-classification run for the given files. The `itemIds`
 * (the FE's stable file ids) are echoed so results map back deterministically
 * to the classify-step state. Returns a `preclassId` to subscribe to.
 */
export async function startPreclassification(
  files: readonly File[],
  itemIds: readonly string[],
): Promise<StartPreclassificationResponse> {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));
  formData.append('itemIds', JSON.stringify(itemIds));
  return multipartFetch<StartPreclassificationResponse>('/extractions/preclassify', formData);
}
