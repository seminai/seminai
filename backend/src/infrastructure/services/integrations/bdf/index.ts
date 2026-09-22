/**
 * BDF (Banca Dati Fitofarmaci) WS API Integration
 *
 * This module provides integration with the BDF REST API for querying
 * Italian pesticide database: products, active substances, crops, doses, etc.
 *
 * Base URL: https://m.bdfup.it/
 * Auth: Basic Auth → JWT Bearer Token
 *
 * @example
 * ```typescript
 * import { createBdfClient } from '@infrastructure/services/integrations/bdf';
 *
 * const client = createBdfClient();
 * const products = await client.getProdotti({ ricalfa: 'epik' });
 * const doses = await client.getDosi({ codprod: '3872', coltura: 74, avversita: '00266' });
 * ```
 */

// Client
export { BdfClient, createBdfClient } from './client';
export { CachedBdfClient } from './cachedClient';
export { createCachedBdfClient } from './createCachedBdfClient';

// Tools
export { createBdfSearchProductDosesTool, createBdfSearchProductsByAdversityTool } from './tools';

// Reusable orchestration core (crop + adversity → authorized products)
export { searchBdfProductsByAdversity } from './tools';
export type { BdfProductCandidate, BdfAdversityProductsResult } from './tools';

// Utilities for name matching (reusable)
export { findBestDirectMatch, resolveNameWithLlm } from './tools';

// Types
export type {
  BdfAuthResponse,
  BdfAvversita,
  BdfClientConfig,
  BdfColtura,
  BdfComposizione,
  BdfDistributore,
  BdfDose,
  BdfDosiParams,
  BdfImpiego,
  BdfProdListParams,
  BdfProdotto,
  BdfProdottoDati,
  BdfSostanzaAttiva,
  BdfSostanzaAttivaDati,
  BdfSostListParams,
  BdfTipologia,
} from './types';
