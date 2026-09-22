import { mapUnitsToJobInput, type JobUnitSource } from './map-units-to-job-input';
import { prisma } from '../../../../repositories/Prisma';
import type { InputDosageAgent, OrchestratorConfig } from '../../dosage_agent/types';
import type { DosageStrategy } from '../../dosage_agent/flowMatchProductionUnitTreatmentDosage';

export const VALID_STRATEGIES: readonly string[] = ['min', 'max', 'avg', 'current'];

export const VALID_OBJECTIVES: readonly string[] = [
  'minimize_interventions',
  'maximize_coverage',
  'balanced',
  'cost_effective',
];

export const VALID_INTENSITIES: readonly string[] = ['low', 'medium', 'high'];

export interface ProductInput {
  productName: string;
  registrationNumber?: string;
  quantity?: number;
  quantityUnitOfMeasure?: string;
}

export interface SelectedProductInput {
  productName: string;
  registrationNumber?: string;
  quantity?: number;
  quantityUnitOfMeasure?: string;
}

export interface UnitInput extends JobUnitSource {
  id: string;
}

export function normalizeProductName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[®™]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

export function normalizeTextForQuantity(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[®™]/g, '')
    .replace(/[^a-zA-Z0-9.,]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function containsProductPhrase(text: string, productName: string): boolean {
  if (!productName) return false;
  return new RegExp(`(?:^|\\s)${escapeRegExp(productName)}(?:\\s|$)`).test(text);
}

export function parseRequestedQuantity(
  normalizedText: string,
  normalizedProductName: string,
): { quantity?: number; quantityUnitOfMeasure?: string } {
  if (!normalizedProductName) return {};
  const match = normalizedText.match(
    new RegExp(
      `(?:^|\\s)${escapeRegExp(normalizedProductName)}(?:\\s|$)(?:.{0,24}?)(\\d+(?:[,.]\\d+)?)\\s*([A-Z]+)?`,
    ),
  );
  if (!match) return {};
  const parsed = Number.parseFloat(match[1].replace(',', '.'));
  if (!Number.isFinite(parsed)) return {};
  const rawUnit = match[2]?.toLowerCase();
  const unit =
    rawUnit === 'lt'
      ? 'L'
      : rawUnit === 'l'
        ? 'L'
        : rawUnit === 'kg' || rawUnit === 'g' || rawUnit === 'ml'
          ? rawUnit
          : rawUnit;
  return {
    quantity: parsed,
    ...(unit ? { quantityUnitOfMeasure: unit } : {}),
  };
}

export function matchProduct(
  availableProducts: readonly ProductInput[],
  requested: SelectedProductInput,
): ProductInput | null {
  const requestedName = normalizeProductName(requested.productName);
  const requestedRegistration = requested.registrationNumber?.trim();
  const byRegistration = requestedRegistration
    ? availableProducts.find((product) => product.registrationNumber === requestedRegistration)
    : undefined;
  if (byRegistration) return byRegistration;

  const exact = availableProducts.find(
    (product) => normalizeProductName(product.productName) === requestedName,
  );
  if (exact) return exact;

  const partialMatches = availableProducts.filter((product) => {
    const productName = normalizeProductName(product.productName);
    return productName.includes(requestedName) || requestedName.includes(productName);
  });
  return partialMatches.length === 1 ? partialMatches[0] : null;
}

export function selectProductsFromRequests(params: {
  availableProducts: readonly ProductInput[];
  requestedProducts: readonly SelectedProductInput[];
}): { products: ProductInput[]; unmatched: string[] } {
  const selectedByKey = new Map<string, ProductInput>();
  const unmatched: string[] = [];
  for (const request of params.requestedProducts) {
    const matched = matchProduct(params.availableProducts, request);
    if (!matched) {
      unmatched.push(request.productName);
      continue;
    }
    const key = matched.registrationNumber ?? normalizeProductName(matched.productName);
    selectedByKey.set(key, {
      ...matched,
      ...(request.quantity !== undefined ? { quantity: request.quantity } : {}),
      ...(request.quantityUnitOfMeasure
        ? { quantityUnitOfMeasure: request.quantityUnitOfMeasure }
        : {}),
    });
  }
  return { products: Array.from(selectedByKey.values()), unmatched };
}

export function inferRequestedProductsFromText(
  availableProducts: readonly ProductInput[],
  text: string | null,
): SelectedProductInput[] {
  if (!text) return [];
  const normalizedText = normalizeTextForQuantity(text);
  const requests: SelectedProductInput[] = [];
  for (const product of availableProducts) {
    const normalizedProductName = normalizeProductName(product.productName);
    if (!containsProductPhrase(normalizedText, normalizedProductName)) continue;
    requests.push({
      productName: product.productName,
      registrationNumber: product.registrationNumber,
      ...parseRequestedQuantity(normalizedText, normalizedProductName),
    });
  }
  return requests;
}

export function isApprovalSyntheticMessage(content: string): boolean {
  const normalized = content.trim().toLowerCase();
  return (
    normalized === 'user approved the pending tool execution.' ||
    normalized === 'user rejected the pending tool execution.'
  );
}

export async function loadLatestUserPlanningMessage(threadId: string): Promise<string | null> {
  try {
    const client = prisma as unknown as {
      chat?: {
        findUnique?: (args: unknown) => Promise<{
          messages?: ReadonlyArray<{ content: string }>;
        } | null>;
      };
    };
    if (!client.chat?.findUnique) return null;
    const chat = await client.chat.findUnique({
      where: { threadId },
      select: {
        messages: {
          where: { role: 'USER' },
          orderBy: { createdAt: 'desc' },
          take: 6,
          select: { content: true },
        },
      },
    });
    const message = chat?.messages?.find((item) => !isApprovalSyntheticMessage(item.content));
    return message?.content ?? null;
  } catch (error) {
    console.warn(
      `[start_dosage_agent_job] Could not infer requested products from chat ${threadId}:`,
      error,
    );
    return null;
  }
}

export function buildInputDosageAgent(params: {
  products: ProductInput[];
  units: UnitInput[];
  strategy?: string;
  startAt?: string;
  endAt?: string;
  outStockLimiter?: boolean;
  orchestrator?: Partial<OrchestratorConfig>;
}): InputDosageAgent {
  const mappedProducts = params.products.map((p) => ({
    productName: p.productName,
    registrationNumber: p.registrationNumber ?? '',
    quantity: p.quantity ?? 0,
    quantityUnitOfMeasure: p.quantityUnitOfMeasure ?? 'kg',
  }));

  const mappedUnits = mapUnitsToJobInput(params.units);

  return {
    products: mappedProducts as InputDosageAgent['products'],
    unitOfProduction: mappedUnits as InputDosageAgent['unitOfProduction'],
    strategy: (params.strategy as DosageStrategy) ?? 'avg',
    startAt: params.startAt,
    endAt: params.endAt,
    outStockLimiter: params.outStockLimiter ?? false,
    orchestrator: params.orchestrator ? (params.orchestrator as OrchestratorConfig) : undefined,
  };
}
