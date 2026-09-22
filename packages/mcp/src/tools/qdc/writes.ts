import { z } from 'zod';
import type { ToolRegistrar } from '../types.js';
import { confirmShape, DESTRUCTIVE_ANNOTATIONS, idAziendaShape, qdcMutate } from './shared.js';

const agroUdm = z.enum(['KG', 'L', 'N']);
const fertUdm = z.enum(['KG', 'L', 'MC', 'N']);
const tipoScarico = z.enum(['reso', 'contoterzi', 'altro']).optional();

export const QDC_SET_LICENSE_ASSOCIATION_TOOL_NAME = 'qdc_set_license_association';
export const QDC_DEL_LICENSE_ASSOCIATION_TOOL_NAME = 'qdc_del_license_association';
export const QDC_SET_CARICO_AGROFARMACO_TOOL_NAME = 'qdc_set_carico_agrofarmaco';
export const QDC_DEL_CARICO_AGROFARMACO_TOOL_NAME = 'qdc_del_carico_agrofarmaco';
export const QDC_SET_RESO_AGROFARMACO_TOOL_NAME = 'qdc_set_reso_agrofarmaco';
export const QDC_DEL_RESO_AGROFARMACO_TOOL_NAME = 'qdc_del_reso_agrofarmaco';
export const QDC_SET_CARICO_FERTILIZZANTE_TOOL_NAME = 'qdc_set_carico_fertilizzante';
export const QDC_DEL_CARICO_FERTILIZZANTE_TOOL_NAME = 'qdc_del_carico_fertilizzante';
export const QDC_SET_RESO_FERTILIZZANTE_TOOL_NAME = 'qdc_set_reso_fertilizzante';
export const QDC_DEL_RESO_FERTILIZZANTE_TOOL_NAME = 'qdc_del_reso_fertilizzante';
export const QDC_ENABLE_FERTILIZER_TOOL_NAME = 'qdc_enable_fertilizer';
export const QDC_ASSIGN_FERTILIZER_CODE_TOOL_NAME = 'qdc_assign_fertilizer_code';
export const QDC_CREATE_FERTILIZER_TOOL_NAME = 'qdc_create_fertilizer';

export const registerQdcWriteTools: ToolRegistrar = (server, { http }) => {
  server.tool(
    QDC_SET_LICENSE_ASSOCIATION_TOOL_NAME,
    'Create a technician/company association on the QDC license. Writes the official logbook.',
    {
      idAzienda: idAziendaShape,
      idTecnico: z.number().int().positive(),
      confirm: confirmShape,
    },
    DESTRUCTIVE_ANNOTATIONS,
    async (args) =>
      qdcMutate(
        http,
        'post',
        '/qdc/licenza/associazioni',
        { body: { idAzienda: args.idAzienda, idTecnico: args.idTecnico } },
        args.confirm,
        'qdc_set_license_association',
      ),
  );
  server.tool(
    QDC_DEL_LICENSE_ASSOCIATION_TOOL_NAME,
    'Delete a technician/company association on the QDC license.',
    { idAzienda: idAziendaShape, idTecnico: z.number().int().positive(), confirm: confirmShape },
    DESTRUCTIVE_ANNOTATIONS,
    async (args) =>
      qdcMutate(
        http,
        'delete',
        '/qdc/licenza/associazioni',
        { query: { idAzienda: args.idAzienda, idTecnico: args.idTecnico } },
        args.confirm,
        'qdc_del_license_association',
      ),
  );
  server.tool(
    QDC_SET_CARICO_AGROFARMACO_TOOL_NAME,
    'Register a pesticide stock load (purchase) on the official QDC warehouse.',
    {
      idAzienda: idAziendaShape,
      dataCarico: z.string(),
      numreg: z.number().int().positive().describe('Ministry registration number of the product.'),
      qta: z.number(),
      udm: agroUdm,
      numeroFattura: z.string().optional(),
      dataFattura: z.string().optional(),
      note: z.string().optional(),
      fornitoreNome: z.string().optional(),
      fornitoreQualifica: z.string().optional(),
      confirm: confirmShape,
    },
    DESTRUCTIVE_ANNOTATIONS,
    async (args) =>
      qdcMutate(
        http,
        'post',
        '/qdc/magazzino/agrofarmaci/carichi',
        { body: args },
        args.confirm,
        'qdc_set_carico_agrofarmaco',
      ),
  );
  server.tool(
    QDC_DEL_CARICO_AGROFARMACO_TOOL_NAME,
    'Delete a pesticide stock-load record from the official QDC warehouse.',
    {
      idAzienda: idAziendaShape,
      idCarico: z.number().int().positive(),
      confirm: confirmShape,
    },
    DESTRUCTIVE_ANNOTATIONS,
    async (args) =>
      qdcMutate(
        http,
        'delete',
        `/qdc/magazzino/agrofarmaci/carichi/${args.idCarico}`,
        { query: { idAzienda: args.idAzienda } },
        args.confirm,
        'qdc_del_carico_agrofarmaco',
      ),
  );
  server.tool(
    QDC_SET_RESO_AGROFARMACO_TOOL_NAME,
    'Register a pesticide return/discharge on the official QDC warehouse.',
    {
      idAzienda: idAziendaShape,
      dataReso: z.string(),
      numreg: z.number().int().positive(),
      qta: z.number(),
      udm: agroUdm,
      tipoScarico,
      note: z.string().optional(),
      confirm: confirmShape,
    },
    DESTRUCTIVE_ANNOTATIONS,
    async (args) =>
      qdcMutate(
        http,
        'post',
        '/qdc/magazzino/agrofarmaci/resi',
        { body: args },
        args.confirm,
        'qdc_set_reso_agrofarmaco',
      ),
  );
  server.tool(
    QDC_DEL_RESO_AGROFARMACO_TOOL_NAME,
    'Delete a pesticide return/discharge record from the official QDC warehouse.',
    { idAzienda: idAziendaShape, idReso: z.number().int().positive(), confirm: confirmShape },
    DESTRUCTIVE_ANNOTATIONS,
    async (args) =>
      qdcMutate(
        http,
        'delete',
        `/qdc/magazzino/agrofarmaci/resi/${args.idReso}`,
        { query: { idAzienda: args.idAzienda } },
        args.confirm,
        'qdc_del_reso_agrofarmaco',
      ),
  );
  registerFertilizerWrites(server, http);
};

function registerFertilizerWrites(
  server: Parameters<ToolRegistrar>[0],
  http: Parameters<ToolRegistrar>[1]['http'],
): void {
  server.tool(
    QDC_SET_CARICO_FERTILIZZANTE_TOOL_NAME,
    'Register a fertilizer stock load on the official QDC warehouse.',
    {
      idAzienda: idAziendaShape,
      dataCarico: z.string(),
      idAbilitato: z.number().int().positive(),
      qta: z.number(),
      udm: fertUdm,
      numeroFattura: z.string().optional(),
      note: z.string().optional(),
      confirm: confirmShape,
    },
    DESTRUCTIVE_ANNOTATIONS,
    async (args) =>
      qdcMutate(
        http,
        'post',
        '/qdc/magazzino/fertilizzanti/carichi',
        { body: args },
        args.confirm,
        'qdc_set_carico_fertilizzante',
      ),
  );
  server.tool(
    QDC_DEL_CARICO_FERTILIZZANTE_TOOL_NAME,
    'Delete a fertilizer stock-load record from the official QDC warehouse.',
    { idAzienda: idAziendaShape, idCarico: z.number().int().positive(), confirm: confirmShape },
    DESTRUCTIVE_ANNOTATIONS,
    async (args) =>
      qdcMutate(
        http,
        'delete',
        `/qdc/magazzino/fertilizzanti/carichi/${args.idCarico}`,
        { query: { idAzienda: args.idAzienda } },
        args.confirm,
        'qdc_del_carico_fertilizzante',
      ),
  );
  server.tool(
    QDC_SET_RESO_FERTILIZZANTE_TOOL_NAME,
    'Register a fertilizer return/discharge on the official QDC warehouse.',
    {
      idAzienda: idAziendaShape,
      dataReso: z.string(),
      idAbilitato: z.number().int().positive(),
      qta: z.number(),
      udm: fertUdm,
      tipoScarico,
      note: z.string().optional(),
      confirm: confirmShape,
    },
    DESTRUCTIVE_ANNOTATIONS,
    async (args) =>
      qdcMutate(
        http,
        'post',
        '/qdc/magazzino/fertilizzanti/resi',
        { body: args },
        args.confirm,
        'qdc_set_reso_fertilizzante',
      ),
  );
  server.tool(
    QDC_DEL_RESO_FERTILIZZANTE_TOOL_NAME,
    'Delete a fertilizer return/discharge record from the official QDC warehouse.',
    { idAzienda: idAziendaShape, idReso: z.number().int().positive(), confirm: confirmShape },
    DESTRUCTIVE_ANNOTATIONS,
    async (args) =>
      qdcMutate(
        http,
        'delete',
        `/qdc/magazzino/fertilizzanti/resi/${args.idReso}`,
        { query: { idAzienda: args.idAzienda } },
        args.confirm,
        'qdc_del_reso_fertilizzante',
      ),
  );
  server.tool(
    QDC_ENABLE_FERTILIZER_TOOL_NAME,
    'Enable a fertilizer catalog product on QDC and obtain id_abilitato.',
    { prodKey: z.string().min(1), confirm: confirmShape },
    DESTRUCTIVE_ANNOTATIONS,
    async (args) =>
      qdcMutate(
        http,
        'post',
        '/qdc/prodotti/fertilizzanti/abilita',
        { body: { prodKey: args.prodKey } },
        args.confirm,
        'qdc_enable_fertilizer',
      ),
  );
  server.tool(
    QDC_ASSIGN_FERTILIZER_CODE_TOOL_NAME,
    'Attach an external ERP code to an enabled QDC fertilizer product.',
    {
      idAbilitato: z.number().int().positive(),
      codiceEsterno: z.string().min(1),
      confirm: confirmShape,
    },
    DESTRUCTIVE_ANNOTATIONS,
    async (args) =>
      qdcMutate(
        http,
        'post',
        '/qdc/prodotti/fertilizzanti/codice',
        { body: { idAbilitato: args.idAbilitato, codiceEsterno: args.codiceEsterno } },
        args.confirm,
        'qdc_assign_fertilizer_code',
      ),
  );
  server.tool(
    QDC_CREATE_FERTILIZER_TOOL_NAME,
    'Create a custom fertilizer product on QDC (max 10 per day per license).',
    {
      nome: z.string().min(1),
      bio: z.boolean().optional().default(false),
      tipo: z.string().min(1).describe('QDC fertilizer type, e.g. "Concime chimico".'),
      confirm: confirmShape,
    },
    DESTRUCTIVE_ANNOTATIONS,
    async (args) =>
      qdcMutate(
        http,
        'post',
        '/qdc/prodotti/fertilizzanti',
        { body: { nome: args.nome, bio: args.bio, tipo: args.tipo } },
        args.confirm,
        'qdc_create_fertilizer',
      ),
  );
}
