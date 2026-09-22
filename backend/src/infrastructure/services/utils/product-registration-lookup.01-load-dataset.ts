import fs from 'fs';
import { FitosanitarioProduct } from './product-registration-lookup.support';
import type { ProductRegistrationLookupServiceContext } from './product-registration-lookup.context';

export function productRegistrationLookupServiceLoadDataset(this: ProductRegistrationLookupServiceContext): void {
    if (this.isLoaded) {
      return;
    }
    try {
      const fileContent = fs.readFileSync(this.datasetPath, 'utf-8');
      this.products = JSON.parse(fileContent) as FitosanitarioProduct[];
      this.isLoaded = true;
      console.log(`Loaded ${this.products.length} products from fitosanitari dataset`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to load fitosanitari dataset: ${message}`);
      this.products = [];
      this.isLoaded = true;
    }
  }
