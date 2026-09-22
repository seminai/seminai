import { ProductCategory } from '@prisma/client';
import {
  IProductRepository,
  ProductWithRelations,
} from '../../../domain/repositories/IProductRepository';
import fs from 'fs';
import path from 'path';

interface FitosanitarioRecord {
  num_registrazione: string;
  denominazione_prodotto: string;
  stato_amministrativo: string;
}

interface ListVerifiedPhytosanitaryProductsInput {
  userId: string;
  companyId?: string;
}

interface ListVerifiedPhytosanitaryProductsOutput {
  products: ProductWithRelations[];
  totalProducts: number;
  verifiedProducts: number;
  revokedProducts: number;
}

/**
 * Use case to list phytosanitary products (PESTICIDE category) that are verified
 * against the official fitosanitari database and are not revoked.
 */
export class ListVerifiedPhytosanitaryProductsUseCase {
  private fitosanitariData: FitosanitarioRecord[] | null = null;

  constructor(private readonly productRepository: IProductRepository) {}

  async execute(
    input: ListVerifiedPhytosanitaryProductsInput,
  ): Promise<ListVerifiedPhytosanitaryProductsOutput> {
    const allProducts = await this.productRepository.findManyByUserId(input.userId);

    let filteredByCompany = allProducts;
    if (input.companyId) {
      filteredByCompany = allProducts.filter(
        (product) => product.warehouse?.company?.id === input.companyId,
      );
    }

    const pesticideProducts = filteredByCompany.filter(
      (product) => product.category === ProductCategory.PESTICIDE,
    );

    if (pesticideProducts.length === 0) {
      return {
        products: [],
        totalProducts: 0,
        verifiedProducts: 0,
        revokedProducts: 0,
      };
    }

    const fitosanitariData = this.loadFitosanitariData();

    const fitosanitariMap = new Map<string, FitosanitarioRecord>();
    fitosanitariData.forEach((record) => {
      const normalizedName = this.normalizeProductName(record.denominazione_prodotto);
      if (!fitosanitariMap.has(normalizedName) || record.stato_amministrativo !== 'Revocato') {
        fitosanitariMap.set(normalizedName, record);
      }
    });

    const verifiedProducts: ProductWithRelations[] = [];
    let revokedCount = 0;

    for (const product of pesticideProducts) {
      const normalizedProductName = this.normalizeProductName(product.name);
      const fitosanitarioRecord = fitosanitariMap.get(normalizedProductName);

      if (fitosanitarioRecord) {
        if (fitosanitarioRecord.stato_amministrativo !== 'Revocato') {
          verifiedProducts.push(product);
        } else {
          revokedCount++;
        }
      }
    }

    return {
      products: verifiedProducts,
      totalProducts: pesticideProducts.length,
      verifiedProducts: verifiedProducts.length,
      revokedProducts: revokedCount,
    };
  }

  private loadFitosanitariData(): FitosanitarioRecord[] {
    if (this.fitosanitariData) {
      return this.fitosanitariData;
    }

    const fitosanitariPath = path.join(
      process.cwd(),
      'dataset',
      'fitosanitari',
      'fts_06062025.json',
    );

    if (!fs.existsSync(fitosanitariPath)) {
      throw new Error(`Fitosanitari file not found at ${fitosanitariPath}`);
    }

    const fileContent = fs.readFileSync(fitosanitariPath, 'utf-8');
    this.fitosanitariData = JSON.parse(fileContent) as FitosanitarioRecord[];

    return this.fitosanitariData;
  }

  private normalizeProductName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^a-z0-9\s]/g, '');
  }
}
