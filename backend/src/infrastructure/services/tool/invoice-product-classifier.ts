import { CompanyKind } from '@prisma/client';
import { InvoiceEntry } from '../../../domain/dtos/invoice-entry.dto';
import { InvoiceProductCategory } from '../../../domain/dtos/invoice-product-category.dto';
import { ProductRegistrationLookupService } from '../utils/ProductRegistrationLookup';

const FERTILIZER_KEYWORDS_REGEX =
  /\b(NPK|UREA|AZOTO|NITRATO|AMMONIO|FOSFORO|POTASSIO|CONCIME|CONC|FERTIL|BIOSTIMOL|MICROELEMENT|CHELATO|BORO|ZINCO|MANGANESE|RAME|FERRO|CALCIO|MAGNESIO|SOLFATO|SOLFUR|UMICO|FULVICO|STALL\w*|LETAME|AMMENDANTE|ORGANICO|COMPOST|HUMUS|SO3|S03)\b/i;

/**
 * Classifies and enriches invoice extracted items by looking up phytosanitary products in the official dataset.
 * If the product is found in the dataset, it is considered PHYTOSANITARY and its registration number is set.
 * Otherwise it is classified as FERTILIZER or OTHER using a heuristic.
 */
export class InvoiceProductClassifier {
  private readonly registrationLookupService: ProductRegistrationLookupService;

  constructor(dependencies?: { registrationLookupService?: ProductRegistrationLookupService }) {
    this.registrationLookupService =
      dependencies?.registrationLookupService ?? new ProductRegistrationLookupService();
  }

  /**
   * Enriches and classifies entries by looking up registration numbers and administrative status.
   */
  public execute(params: {
    entries: ReadonlyArray<Omit<InvoiceEntry, 'productCategory' | 'administrativeStatus'>>;
    companyKind?: CompanyKind;
  }): ReadonlyArray<InvoiceEntry> {
    if (params.companyKind === CompanyKind.MANUFACTURING) {
      return params.entries.map((entry) => ({
        ...entry,
        administrativeStatus: null,
        productCategory: 'OTHER',
      }));
    }
    return params.entries.map((entry) => this.enrichAndClassifyEntry(entry));
  }

  private enrichAndClassifyEntry(
    entry: Omit<InvoiceEntry, 'productCategory' | 'administrativeStatus'>,
  ): InvoiceEntry {
    const lookupByRegistration = this.registrationLookupService.findProductByRegistration({
      registrationNumber: entry.registrationNumber,
      productName: entry.productName,
    });
    if (lookupByRegistration) {
      return {
        ...entry,
        registrationNumber: lookupByRegistration.registrationNumber,
        administrativeStatus: lookupByRegistration.administrativeStatus,
        productCategory: 'PHYTOSANITARY',
      };
    }
    const lookupByRegistrationText = this.registrationLookupService.findProductByRegistrationText({
      text: entry.productName,
      productName: entry.productName,
    });
    if (lookupByRegistrationText) {
      return {
        ...entry,
        registrationNumber: lookupByRegistrationText.registrationNumber,
        administrativeStatus: lookupByRegistrationText.administrativeStatus,
        productCategory: 'PHYTOSANITARY',
      };
    }
    const lookupByName = this.registrationLookupService.findProduct(entry.productName);
    if (lookupByName) {
      return {
        ...entry,
        registrationNumber: lookupByName.registrationNumber,
        administrativeStatus: lookupByName.administrativeStatus,
        productCategory: 'PHYTOSANITARY',
      };
    }
    const productCategory = this.detectNonPhytosanitaryCategory(entry.productName);
    return {
      ...entry,
      administrativeStatus: null,
      productCategory,
    };
  }

  private detectNonPhytosanitaryCategory(productName: string): InvoiceProductCategory {
    if (FERTILIZER_KEYWORDS_REGEX.test(productName)) {
      return 'FERTILIZER';
    }
    return 'OTHER';
  }
}
