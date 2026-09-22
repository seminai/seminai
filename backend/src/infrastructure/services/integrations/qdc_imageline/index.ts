/**
 * ImageLine QuadernoDiCampagna (QDC) API Integration
 *
 * Integration with ImageLine's QuadernoDiCampagna REST API: license/company
 * registry, warehouse management (agrofarmaci and fertilizzanti), field
 * operations (treatments, fertilizations, irrigations, harvests, ...),
 * production units and treatment-register prints.
 *
 * Base URL: https://servizi.imagelinenetwork.com/rest/qdc/v2/integrazioni
 * Documentation: https://servizi.imagelinenetwork.com/rest/qdc/v2/integrazioni/help
 *
 * @example
 * ```typescript
 * import { getQdcApiFromClientId, getCompanyIdByVatNumber } from '@infrastructure/services/integrations/qdc_imageline';
 *
 * // Get configured API instance (server-side auth-code flow, all scopes, cached token)
 * const api = await getQdcApiFromClientId(clientId);
 *
 * // Find company by VAT number
 * const companyId = await getCompanyIdByVatNumber(api, '01234567890');
 *
 * // Read stock levels and recent treatments
 * const giacenze = await api.magazzinoAgrofarmaci.getGiacenzeAgrofarmaci({
 *   idAzienda: companyId,
 *   data: '28/01/2026',
 * });
 * const trattamenti = await api.operazioniCampo.getTrattamenti({ idAzienda: companyId });
 * ```
 */

// Main API Client (composition facade)
export { QdcImageLineRestApi } from './rest_api';
export type { QdcImageLineRestApiOptions } from './rest_api';

// Sub-API classes
export { QdcHttpClient } from './http-client';
export { QdcLicenzaApi } from './licenza-api';
export { QdcMagazzinoAgrofarmaciApi } from './magazzino-agrofarmaci-api';
export { QdcMagazzinoFertilizzantiApi } from './magazzino-fertilizzanti-api';
export { QdcProdottiFertilizzantiApi } from './prodotti-fertilizzanti-api';
export { QdcColtureApi } from './colture-api';
export { QdcOperazioniCampoApi } from './operazioni-campo-api';
export { QdcOperazioniRegistroApi } from './operazioni-registro-api';
export { QdcStampeApi } from './stampe-api';

// Errors
export { QdcApiError } from './errors';

// Authentication helpers
export {
  getTokenFromClientId,
  getQdcApiFromClientId,
  clearTokenCache,
  clearAllTokenCache,
  QdcOAuthFlow,
} from './auth';
export type { QdcAuthOptions } from './auth';

// Utility functions
export {
  formatDateIT,
  getTodayIT,
  parseDateIT,
  getCompanyIdByVatNumber,
  getCompanyIdByName,
  getAllCompanies,
  parseGiacenzeAgrofarmaci,
  parseGiacenzeFertilizzanti,
  padNumreg,
  isValidAgrofamacoUdm,
  isValidFertilizzanteUdm,
  getHistoryDateRange,
  withRetry,
} from './utils';

// Recordset parsers (column-name based)
export { buildColumnIndexMap, parseTableToRecords } from './operazioni-parsers';
export type { QdcCellValue, QdcRecord } from './operazioni-parsers';

// Types
export { QDC_ALL_SCOPES } from './types';
export type {
  QdcScope,
  QdcParams,
  QdcParamValue,
  QdcOAuthTokenResponse,
  QdcAuthResult,
  QdcApiResponse,
  QdcTableResult,
  QdcLicenzaInfo,
  QdcAziendaRow,
  QdcAzienda,
  QdcTecnico,
  QdcGiacenzaAgrofarmaco,
  QdcGiacenzaFertilizzante,
  QdcUnitaMisuraAgrofarmaco,
  QdcUnitaMisuraFertilizzante,
  QdcTipoScarico,
  QdcCaricoAgrofarmaco,
  QdcResoAgrofarmaco,
  QdcCaricoFertilizzante,
  QdcResoFertilizzante,
  QdcFertilizzanteRicerca,
  QdcNuovoFertilizzanteParams,
  QdcTipoFertilizzante,
  QdcErrorCode,
  QdcError,
  QdcRicercaFertilizzantiParams,
  QdcSetCaricoAgrofarmacoParams,
  QdcSetResoAgrofarmacoParams,
  QdcSetCaricoFertilizzanteParams,
  QdcSetResoFertilizzanteParams,
} from './types';
export type {
  QdcPeriodoParams,
  QdcGetOperazioniParams,
  QdcGetAltreOperazioniParams,
  QdcGetUnitaParams,
  QdcGetRegistroTrattamentiParams,
  QdcScadenzeResult,
} from './operazioni-types';
