import { z } from 'zod';
import type { ToolRegistrar } from '../types.js';
import {
  compactShape,
  idAziendaShape,
  qdcGet,
  READ_ANNOTATIONS,
  toQdcError,
  unwrapEnvelope,
} from './shared.js';
import { jsonContent } from '../types.js';

export const QDC_LIST_COMPANIES_TOOL_NAME = 'qdc_list_companies';
export const QDC_GET_AZIENDA_TOOL_NAME = 'qdc_get_azienda';
export const QDC_GET_LICENSE_TOOL_NAME = 'qdc_get_license';
export const QDC_GET_TECHNICIANS_TOOL_NAME = 'qdc_get_technicians';
export const QDC_GET_ASSOCIATIONS_TOOL_NAME = 'qdc_get_associations';
export const QDC_GET_SCADENZE_TOOL_NAME = 'qdc_get_scadenze';

export const registerQdcLicenseReadTools: ToolRegistrar = (server, { http }) => {
  server.tool(
    QDC_LIST_COMPANIES_TOOL_NAME,
    'List companies on the user Image Line QDC license (id, name, VAT, tax code, validity). Use this id_azienda for every other qdc_* tool. Distinct from seminai_list_companies.',
    {
      mostraDisabilitate: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include disabled companies.'),
    },
    READ_ANNOTATIONS,
    async ({ mostraDisabilitate }) => {
      try {
        const data = await http.get<unknown>('/qdc/licenza/aziende', {
          query: { mostraDisabilitate },
        });
        return jsonContent(unwrapEnvelope(data));
      } catch (err) {
        return toQdcError(err, 'qdc_list_companies');
      }
    },
  );
  server.tool(
    QDC_GET_AZIENDA_TOOL_NAME,
    'Read the QDC registry record for one company (ragione sociale, address, contacts).',
    { idAzienda: idAziendaShape },
    READ_ANNOTATIONS,
    async ({ idAzienda }) =>
      qdcGet(http, `/qdc/licenza/aziende/${idAzienda}`, {}, true, 'qdc_get_azienda'),
  );
  server.tool(
    QDC_GET_LICENSE_TOOL_NAME,
    'Read QDC license metadata (name, expiry, status) for the authenticated user.',
    {},
    READ_ANNOTATIONS,
    async () => qdcGet(http, '/qdc/licenza/info', {}, true, 'qdc_get_license'),
  );
  server.tool(
    QDC_GET_TECHNICIANS_TOOL_NAME,
    'List technicians enabled on the QDC license.',
    { compact: compactShape },
    READ_ANNOTATIONS,
    async ({ compact }) => qdcGet(http, '/qdc/licenza/tecnici', {}, compact, 'qdc_get_technicians'),
  );
  server.tool(
    QDC_GET_ASSOCIATIONS_TOOL_NAME,
    'List technician/company associations on the QDC license.',
    { compact: compactShape },
    READ_ANNOTATIONS,
    async ({ compact }) =>
      qdcGet(http, '/qdc/licenza/associazioni', {}, compact, 'qdc_get_associations'),
  );
  server.tool(
    QDC_GET_SCADENZE_TOOL_NAME,
    'Read operator certificates (patentini) and sprayer inspection deadlines (tarature) for a QDC company.',
    { idAzienda: idAziendaShape },
    READ_ANNOTATIONS,
    async ({ idAzienda }) =>
      qdcGet(http, `/qdc/licenza/aziende/${idAzienda}/scadenze`, {}, true, 'qdc_get_scadenze'),
  );
};
