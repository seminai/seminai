import { ProductRegistrationLookupService } from './ProductRegistrationLookup';

/**
 * Module-level singleton for ProductRegistrationLookupService.
 * Avoids reloading the fitosanitari JSON dataset on every HTTP request.
 */
export const productRegistrationLookupServiceSingleton = new ProductRegistrationLookupService();
