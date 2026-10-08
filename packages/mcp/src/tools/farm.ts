import { z } from 'zod';
import { jsonContent, errorContent, type ToolRegistrar } from './types.js';

/** These tools can only read and prepare proposals. Approval is never exposed to an agent. */
export const registerFarmTools: ToolRegistrar = (server, { http }) => {
  server.registerTool(
    'seminai_get_connection',
    {
      description:
        'Read the farm authorized for this connection before working. No AI provider in Seminai is required.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        return jsonContent(await http.get('/mcp-api/identity'));
      } catch (error) {
        return errorContent(error instanceof Error ? error.message : 'Connection unavailable');
      }
    },
  );
  server.registerTool(
    'seminai_read_farm',
    {
      description:
        'Read products and their stock, warehouses, fields, production units, journal activities or stock movements in the authorized farm. Results are limited to 100; narrow products by search.',
      inputSchema: {
        kind: z.enum(['products', 'warehouses', 'fields', 'production-units', 'jobs', 'movements']),
        search: z.string().max(200).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ kind, search }) => {
      try {
        return jsonContent(await http.get('/mcp-api/catalog', { query: { kind, search } }));
      } catch (error) {
        return errorContent(error instanceof Error ? error.message : 'Read failed');
      }
    },
  );
  server.registerTool(
    'seminai_propose_operation',
    {
      description:
        'Prepare stock IN/OUT or a journal activity with optional stock consumption. This creates a PENDING proposal; tell the user to review and confirm it in Seminai /quaderno. Never claim it was recorded before status is approved. Resolve exact product and production-unit IDs using seminai_read_farm. Reuse the same idempotencyKey when retrying the same request.',
      inputSchema: {
        idempotencyKey: z.string().min(1).max(200),
        operation: z.object({
          date: z.string().describe('ISO date of the operation'),
          reason: z.string().min(1).max(2000),
          movements: z
            .array(
              z.object({
                productId: z.string(),
                type: z.enum(['IN', 'OUT']),
                quantity: z.number().positive(),
                unit: z.string().min(1),
                price: z.number().nonnegative().optional(),
                documentReference: z.string().optional(),
              }),
            )
            .max(100),
          job: z
            .object({
              productionUnitId: z.string(),
              category: z.string(),
              quantity: z.number().positive(),
              unit: z.string(),
              note: z.string().optional(),
            })
            .optional(),
        }),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        return jsonContent(await http.post('/mcp-api/proposals', { body: input }));
      } catch (error) {
        return errorContent(error instanceof Error ? error.message : 'Proposal failed');
      }
    },
  );
  server.registerTool(
    'seminai_get_operation_status',
    {
      description:
        'Check whether the user approved or rejected a proposal in Seminai. Approved results contain the persisted stock/job identifiers.',
      inputSchema: { id: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      try {
        return jsonContent(await http.get(`/mcp-api/proposals/${encodeURIComponent(id)}`));
      } catch (error) {
        return errorContent(error instanceof Error ? error.message : 'Proposal unavailable');
      }
    },
  );
};
