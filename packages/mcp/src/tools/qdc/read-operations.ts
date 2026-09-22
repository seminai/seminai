import { z } from 'zod';
import type { ToolRegistrar } from '../types.js';
import { compactShape, idAziendaShape, periodShape, qdcGet, READ_ANNOTATIONS } from './shared.js';

export const QDC_GET_UNITS_TOOL_NAME = 'qdc_get_units';
export const QDC_GET_CONFERIMENTI_TOOL_NAME = 'qdc_get_conferimenti';
export const QDC_GET_OPERATIONS_TOOL_NAME = 'qdc_get_operations';
export const QDC_GET_REGISTER_OPERATIONS_TOOL_NAME = 'qdc_get_register_operations';
export const QDC_GET_TREATMENT_REGISTER_TOOL_NAME = 'qdc_get_treatment_register';

const CAMPO_TIPI = [
  'trattamenti',
  'fertilizzazioni',
  'lanciausiliari',
  'irrigazioni',
  'raccolte',
  'semine',
  'trapianti',
  'sovesci',
  'ispezionicampo',
] as const;

const REGISTRO_TIPI = ['altre', 'conce-sementi', 'smaltimenti-rifiuti', 'eliminate'] as const;

export const registerQdcOperationsReadTools: ToolRegistrar = (server, { http }) => {
  server.tool(
    QDC_GET_UNITS_TOOL_NAME,
    'List QDC production units for a company. Provide anno or listaIdUnita (QDC requires one of them).',
    {
      idAzienda: idAziendaShape,
      anno: z.number().int().optional().describe('Campaign year (or agricultural year).'),
      listaIdUnita: z.array(z.number().int().positive()).optional(),
      idColtura: z.number().int().optional(),
      daConfermare: z.boolean().optional(),
      compact: compactShape,
    },
    READ_ANNOTATIONS,
    async (args) =>
      qdcGet(
        http,
        '/qdc/colture/unita',
        {
          idAzienda: args.idAzienda,
          anno: args.anno,
          listaIdUnita: args.listaIdUnita,
          idColtura: args.idColtura,
          daConfermare: args.daConfermare,
        },
        args.compact,
        'qdc_get_units',
      ),
  );
  server.tool(
    QDC_GET_CONFERIMENTI_TOOL_NAME,
    'List outgoing production batches (conferimenti) for a QDC company in a period.',
    { idAzienda: idAziendaShape, ...periodShape, compact: compactShape },
    READ_ANNOTATIONS,
    async (args) =>
      qdcGet(
        http,
        '/qdc/colture/conferimenti',
        {
          idAzienda: args.idAzienda,
          dataPeriodoDa: args.dataPeriodoDa,
          dataPeriodoA: args.dataPeriodoA,
        },
        args.compact,
        'qdc_get_conferimenti',
      ),
  );
  server.tool(
    QDC_GET_OPERATIONS_TOOL_NAME,
    'Read field operations from the official QDC logbook (treatments, fertilizations, irrigations, harvests, sowings, transplants, cover crops, inspections, beneficial releases).',
    {
      idAzienda: idAziendaShape,
      tipo: z.enum(CAMPO_TIPI).describe('Field-operation family to read.'),
      ...periodShape,
      listaIdUnita: z.array(z.number().int().positive()).optional(),
      idColtura: z.number().int().optional(),
      compact: compactShape,
    },
    READ_ANNOTATIONS,
    async (args) =>
      qdcGet(
        http,
        `/qdc/operazioni/campo/${args.tipo}`,
        {
          idAzienda: args.idAzienda,
          dataPeriodoDa: args.dataPeriodoDa,
          dataPeriodoA: args.dataPeriodoA,
          listaIdUnita: args.listaIdUnita,
          idColtura: args.idColtura,
        },
        args.compact,
        'qdc_get_operations',
      ),
  );
  server.tool(
    QDC_GET_REGISTER_OPERATIONS_TOOL_NAME,
    'Read registry-side QDC operations: other cultural operations, seed treatments, waste disposal, or deleted operations.',
    {
      idAzienda: idAziendaShape,
      tipo: z.enum(REGISTRO_TIPI),
      ...periodShape,
      listaIdUnita: z.array(z.number().int().positive()).optional(),
      idColtura: z.number().int().optional(),
      tipoOperazioneId: z.number().int().optional(),
      compact: compactShape,
    },
    READ_ANNOTATIONS,
    async (args) =>
      qdcGet(
        http,
        `/qdc/operazioni/registro/${args.tipo}`,
        {
          idAzienda: args.idAzienda,
          dataPeriodoDa: args.dataPeriodoDa,
          dataPeriodoA: args.dataPeriodoA,
          listaIdUnita: args.listaIdUnita,
          idColtura: args.idColtura,
          tipoOperazioneId: args.tipoOperazioneId,
        },
        args.compact,
        'qdc_get_register_operations',
      ),
  );
  server.tool(
    QDC_GET_TREATMENT_REGISTER_TOOL_NAME,
    'List the latest Registro dei Trattamenti PDF generations (D.Lgs. 150/2012) for a QDC company.',
    {
      idAzienda: idAziendaShape,
      elementi: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('How many latest prints to return.'),
      compact: compactShape,
    },
    READ_ANNOTATIONS,
    async (args) =>
      qdcGet(
        http,
        '/qdc/stampe/registro-trattamenti',
        { idAzienda: args.idAzienda, elementi: args.elementi },
        args.compact,
        'qdc_get_treatment_register',
      ),
  );
};
