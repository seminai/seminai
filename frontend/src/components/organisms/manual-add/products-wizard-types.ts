import { ProductCategory } from '@/generated/schemas/productCategory';

export type WizardStep = 'target' | 'products' | 'stock';

export interface ProductRow {
  category: ProductCategory;
  name: string;
  type: string;
  sku?: string;
  barcode?: string;
  description?: string;
  registrationNumber?: string;
  ministryId?: string;
  activeIngredient?: string;
}

export interface StockRow {
  enabled: boolean;
  quantity: number;
  unitOfMeasureQuantity: string;
  price?: number;
  unitOfMeasurePrice?: string;
  ddtCode: string;
  ddtDate: string;
  invoiceCode?: string;
  invoiceDate: string;
}

export const EMPTY_PRODUCT: ProductRow = {
  category: ProductCategory.FERTILIZER,
  name: '',
  type: 'Generico',
  sku: '',
  barcode: '',
  description: '',
  registrationNumber: '',
};

export const EMPTY_STOCK: StockRow = {
  enabled: false,
  quantity: 0,
  unitOfMeasureQuantity: 'KG',
  price: undefined,
  unitOfMeasurePrice: 'EUR',
  ddtCode: '',
  ddtDate: '',
  invoiceCode: '',
  invoiceDate: '',
};

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  FERTILIZER: 'Fertilizzante',
  PESTICIDE: 'Fitofarmaco',
  SEED: 'Sementi',
  HARVEST: 'Raccolto',
  EQUIPMENT: 'Attrezzatura',
  PACKAGING: 'Imballaggio',
  OTHER: 'Altro',
};
