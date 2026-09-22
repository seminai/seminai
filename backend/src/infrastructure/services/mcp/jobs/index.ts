import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import axios from 'axios';

const API_BASE = process.env.API_BASE ?? 'http://localhost:3000';
const API_TOKEN = process.env.API_TOKEN ?? '';

const server = new McpServer({
  name: 'seminai-jobs',
  version: '1.0.0',
});

const ProductSchema = z.object({
  name: z.string(),
  sku: z.string(),
  category: z.string(),
  type: z.string(),
  barcode: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  registrationNumber: z.string().nullable().optional(),
  labelUrl: z.string().nullable().optional(),
  labelMetadata: z.unknown().nullable().optional(),
});

const StockItemSchema = z.object({
  product: ProductSchema,
  quantity: z.number(),
  unitOfMeasureQuantity: z.string(),
  price: z.number(),
  unitOfMeasurePrice: z.string(),
  type: z.string(),
  ddtCode: z.string().nullable().optional(),
  ddtUrlFile: z.string().nullable().optional(),
  invoiceCode: z.string().nullable().optional(),
  invoiceUrlFile: z.string().nullable().optional(),
  companySupplierName: z.string().nullable().optional(),
  addressSupplier: z.string().nullable().optional(),
  vatNumberSupplier: z.string().nullable().optional(),
});

const BulkItemSchema = z.object({
  productionUnitId: z.string(),
  dateOfOpeation: z.string(),
  category: z.string(),
  quantity: z.number(),
  unitOfMeasureQuantity: z.string(),
  productQuantityTreated: z.number().nullable().optional(),
  unitOfMeasureProductQuantityTreated: z.string().nullable().optional(),
  modeOfApplication: z.string().nullable().optional(),
  avversity: z.string().nullable().optional(),
  giustification: z.string().nullable().optional(),
  treatedSurface: z.number().nullable().optional(),
  isLocalizedTreatment: z.boolean().nullable().optional(),
  userId: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  totalDistributedWaterL: z.number().nullable().optional(),
  machineId: z.string().nullable().optional(),
  stocks: z.array(StockItemSchema).optional(),
});

server.tool(
  'create_product_and_job',
  'Bulk create Jobs and upsert Products with Stocks',
  { items: z.array(BulkItemSchema) },
  async ({ items }) => {
    if (!API_TOKEN) {
      return { content: [{ type: 'text', text: 'Missing API_TOKEN' }] };
    }
    try {
      const res = await axios.post(`${API_BASE}/jobs/create-product-and-job`, items, {
        headers: { Authorization: `Bearer ${API_TOKEN}` },
      });
      return {
        content: [
          { type: 'text', text: 'Jobs created successfully' },
          { type: 'text', text: JSON.stringify(res.data) },
        ],
      };
    } catch (err) {
      const msg = err?.response?.data ?? err?.message ?? 'Unknown error';
      return { content: [{ type: 'text', text: `Error: ${JSON.stringify(msg)}` }] };
    }
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Seminai Jobs MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
