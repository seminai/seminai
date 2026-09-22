import { ProductCategory } from '@prisma/client';

/**
 * DTO representing the minimal product data required to search or create a Product.
 */
export interface UpsertProductBaseDTO {
  name: string;
  sku?: string | null;
  barcode?: string | null;
  category: ProductCategory;
  type: string;
  description?: string | null;
  registrationNumber?: string | null;
  labelUrl?: string | null;
  labelMetadata?: unknown | null;
}

/**
 * Body for POST /products/sync-labels.
 * At least one of companyId | warehouseId | productIds must be provided.
 */
export interface SyncProductLabelsRequest {
  readonly companyId?: string;
  readonly warehouseId?: string;
  readonly productIds?: readonly string[];
  readonly forceRefresh?: boolean;
}

export interface SyncProductLabelsResponse {
  readonly jobId: string | null;
  readonly queued: number;
}
