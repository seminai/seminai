import { CompanyKind } from '@prisma/client';
import { DdtEntry } from '../../../domain/dtos/ddt-entry.dto';
import { DdtProductCategory } from '../../../domain/dtos/ddt-product-category.dto';
import { ProductRegistrationLookupService } from '../utils/ProductRegistrationLookup';

const FERTILIZER_KEYWORDS_REGEX =
  /\b(NPK|UREA|AZOTO|NITRATO|AMMONIO|FOSFORO|POTASSIO|CONCIME|CONC|FERTIL|BIOSTIMOL|MICROELEMENT|CHELATO|BORO|ZINCO|MANGANESE|RAME|FERRO|CALCIO|MAGNESIO|SOLFATO|SOLFUR|UMICO|FULVICO|STALL\w*|LETAME|AMMENDANTE|ORGANICO|COMPOST|HUMUS|SO3|S03)\b/i;

// Pattern for NPK formulations like "40+12", "5/10/15", "7-15-20"
const NPK_FORMULATION_REGEX = /\d+[+\/\-]\d+[+\/\-]?\d*/;

/**
 * Classifies and enriches DDT extracted items by looking up phytosanitary products in the official dataset.
 * If the product is found in the dataset, it is considered PHYTOSANITARY and its registration number is set.
 * Otherwise it is classified as FERTILIZER or OTHER using a heuristic.
 */
export class DdtProductClassifier {
  private readonly registrationLookupService: ProductRegistrationLookupService;

  constructor(dependencies?: { registrationLookupService?: ProductRegistrationLookupService }) {
    this.registrationLookupService =
      dependencies?.registrationLookupService ?? new ProductRegistrationLookupService();
  }

  /**
   * Enriches and classifies entries.
   */
  public execute(params: {
    entries: ReadonlyArray<Omit<DdtEntry, 'productCategory'>>;
    companyKind?: CompanyKind;
  }): ReadonlyArray<DdtEntry> {
    if (params.companyKind === CompanyKind.MANUFACTURING) {
      return params.entries.map((entry) => ({
        ...entry,
        productCategory: 'OTHER',
      }));
    }
    return params.entries.map((entry) => this.enrichAndClassifyEntry(entry));
  }

  private enrichAndClassifyEntry(entry: Omit<DdtEntry, 'productCategory'>): DdtEntry {
    const lookupByRegistration = this.registrationLookupService.findProductByRegistration({
      registrationNumber: entry.registrationNumber,
      productName: entry.productName,
    });
    if (lookupByRegistration) {
      return {
        ...entry,
        registrationNumber: lookupByRegistration.registrationNumber,
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
        productCategory: 'PHYTOSANITARY',
      };
    }
    const lookupByName = this.registrationLookupService.findProduct(entry.productName);
    if (lookupByName) {
      return {
        ...entry,
        registrationNumber: lookupByName.registrationNumber,
        productCategory: 'PHYTOSANITARY',
      };
    }
    const productCategory = this.detectNonPhytosanitaryCategory(entry.productName);
    return {
      ...entry,
      productCategory,
    };
  }

  private detectNonPhytosanitaryCategory(productName: string): DdtProductCategory {
    if (FERTILIZER_KEYWORDS_REGEX.test(productName) || NPK_FORMULATION_REGEX.test(productName)) {
      return 'FERTILIZER';
    }
    return 'OTHER';
  }
}
