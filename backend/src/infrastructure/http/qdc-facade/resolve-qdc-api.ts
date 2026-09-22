import { AppError } from '../../../domain/errors/AppError';
import {
  getQdcApiFromClientId,
  type QdcImageLineRestApi,
} from '../../services/integrations/qdc_imageline';
import {
  QDC_DISABLED_MESSAGE,
  getQdcClientIdForUser,
} from '../../services/agents/dosage_agent_react/tools/qdc/require-qdc';

/**
 * Resolves an authenticated QDC Image Line client for the given Seminai user.
 * Throws 400 QDC_NOT_CONFIGURED when no client id is stored.
 */
export async function resolveQdcApiForUser(userId: string): Promise<QdcImageLineRestApi> {
  const clientId = await getQdcClientIdForUser(userId);
  if (!clientId) {
    throw AppError.badRequest(QDC_DISABLED_MESSAGE, 'QDC_NOT_CONFIGURED');
  }
  return getQdcApiFromClientId(clientId);
}
