import { z } from 'zod';
import type { DocumentCategory } from '@prisma/client';

export type FieldType = 'text' | 'number' | 'date' | 'textarea' | 'lines';

export interface FieldDescriptor {
  readonly key: string;
  readonly labelIt: string;
  readonly type: FieldType;
  readonly required: boolean;
  readonly placeholder?: string;
  readonly helpIt?: string;
  /**
   * Only meaningful when type === 'lines': descriptors for the columns of each row
   * in the editable table (e.g. for invoice/DDT product lines).
   */
  readonly lineFields?: readonly FieldDescriptor[];
}

export interface ExtractionSchema<T = unknown> {
  readonly category: DocumentCategory;
  readonly zodSchema: z.ZodType<T>;
  readonly fields: readonly FieldDescriptor[];
}
