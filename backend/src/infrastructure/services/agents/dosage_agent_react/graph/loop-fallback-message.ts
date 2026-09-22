import { HumanMessage, type BaseMessage } from '@langchain/core/messages';
import { isFitoLabel, type Label } from '../../../../../domain/dtos/label.dto';
import { getWorkingMemory } from '../working-memory';
import { extractLabelFacts, formatLabelFactsForUser, type LabelFacts } from '../tools/label-facts';

export interface LoopFallbackInput {
  readonly threadId?: string;
  readonly repeatedTool: string;
  readonly messages: readonly BaseMessage[];
}

interface LabelCacheEntry {
  readonly productName: string;
  readonly registrationNumber: string | null;
  readonly label: Label;
  readonly lastRefreshedAt: Date | string | null;
}

interface ScoredFacts {
  readonly score: number;
  readonly facts: LabelFacts;
}

export function buildLoopFallbackMessage(input: LoopFallbackInput): string | null {
  if (input.repeatedTool !== 'calculate_dosage' || !input.threadId) return null;
  const userText = getLatestUserText(input.messages);
  const labelMessage = buildLabelFallback(input.threadId, userText);
  if (labelMessage) return labelMessage;
  return buildDosageFallback(input.threadId);
}

export function buildGenericLoopStopMessage(
  toolName: string,
  loopStatus: 'critical' | 'pattern',
): string {
  const reason =
    loopStatus === 'pattern'
      ? `stava ripetendo ${toolName} senza aggiungere nuove informazioni`
      : `ha raggiunto il limite di sicurezza delle chiamate tool`;
  return [
    `Mi sono fermato per evitare un ciclo tecnico: il flusso ${reason}.`,
    'I dati già raccolti restano disponibili in questa conversazione.',
    'Per questa richiesta posso procedere in modo più stabile con una verifica mirata prodotto-coltura o con il job asincrono completo, evitando di ripetere la stessa ricerca.',
  ].join('\n');
}

function buildLabelFallback(threadId: string, userText: string): string | null {
  const labelEntries = getLabelCacheEntries(threadId);
  const scored = labelEntries
    .map((entry) => scoreLabelEntry(entry, userText))
    .filter((item): item is ScoredFacts => item !== null)
    .sort((left, right) => right.score - left.score);
  const best = scored[0];
  if (!best) return null;
  return [
    formatLabelFactsForUser(best.facts),
    'Per creare o salvare operazioni serve comunque il workflow di pianificazione completo.',
  ].join('\n');
}

function getLabelCacheEntries(threadId: string): readonly LabelCacheEntry[] {
  const cache = getWorkingMemory(threadId).labelCache;
  if (!cache) return [];
  return Object.values(cache).flatMap((raw) => {
    if (!isRecord(raw)) return [];
    const label = raw.label;
    if (!isFitoLabel(label)) return [];
    const productName =
      typeof raw.productName === 'string' ? raw.productName : label.prodotto ?? 'Prodotto';
    const registrationNumber =
      typeof raw.registrationNumber === 'string' ? raw.registrationNumber : null;
    const lastRefreshedAt =
      raw.lastRefreshedAt instanceof Date || typeof raw.lastRefreshedAt === 'string'
        ? raw.lastRefreshedAt
        : null;
    return [{ productName, registrationNumber, label, lastRefreshedAt }];
  });
}

function scoreLabelEntry(entry: LabelCacheEntry, userText: string): ScoredFacts | null {
  const cropName = findCropMention(entry.label, userText);
  const productScore = textIncludes(userText, entry.productName) ? 4 : 0;
  const labelNameScore =
    entry.label.prodotto && textIncludes(userText, entry.label.prodotto) ? 3 : 0;
  const cropScore = cropName ? 5 : 0;
  const score = productScore + labelNameScore + cropScore;
  const facts = extractLabelFacts({
    label: entry.label,
    productName: entry.productName,
    registrationNumber: entry.registrationNumber ?? undefined,
    cropName,
    lastRefreshedAt: entry.lastRefreshedAt,
  });
  if (score === 0 && facts.doseFacts.length === 0 && facts.warnings.length === 0) return null;
  return { score, facts };
}

function buildDosageFallback(threadId: string): string | null {
  const dosageResults = getWorkingMemory(threadId).dosageResults;
  if (!Array.isArray(dosageResults) || dosageResults.length === 0) return null;
  const rows = dosageResults.flatMap(extractDosageRows).slice(0, 5);
  if (rows.length === 0) return null;
  return [
    'Uso i risultati di dosaggio già calcolati in questa conversazione:',
    ...rows.map((row) => `- ${row}`),
    'Per creare o salvare operazioni serve una conferma nel workflow di pianificazione.',
  ].join('\n');
}

function extractDosageRows(unit: unknown): readonly string[] {
  if (!isRecord(unit)) return [];
  const cropName = stringValue(unit.cropName) ?? 'coltura';
  const products = Array.isArray(unit.products) ? unit.products : [];
  return products.flatMap((product) => {
    if (!isRecord(product)) return [];
    const productName = stringValue(product.name) ?? stringValue(product.productName) ?? 'prodotto';
    const treatments = Array.isArray(product.trattamenti) ? product.trattamenti : [];
    return treatments.slice(0, 2).flatMap((treatment) => {
      if (!isRecord(treatment)) return [];
      const dose = numberValue(treatment.dose) ?? numberValue(treatment.dose_ha);
      const unitOfMeasure = stringValue(treatment.dosaggio_um) ?? stringValue(treatment.doseUnit);
      const date = stringValue(treatment.data_distribuzione);
      if (dose === null) return [];
      return `${productName} su ${cropName}: ${dose}${unitOfMeasure ? ` ${unitOfMeasure}` : ''}${date ? ` (${date})` : ''}`;
    });
  });
}

function findCropMention(label: Label, userText: string): string | null {
  const candidates = [
    ...label.colture_target,
    ...label.dosaggi_dettagliati.map((detail) => detail.coltura),
  ];
  const unique = [...new Set(candidates)];
  return unique.find((crop) => textIncludes(userText, crop)) ?? null;
}

function getLatestUserText(messages: readonly BaseMessage[]): string {
  const human = messages
    .slice()
    .reverse()
    .find((message): message is HumanMessage => message instanceof HumanMessage);
  return human ? messageContentToText(human.content) : '';
}

function messageContentToText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (isRecord(part) && typeof part.text === 'string') return part.text;
      return '';
    })
    .join(' ');
}

function textIncludes(text: string, fragment: string): boolean {
  const normalizedText = normalize(text);
  const normalizedFragment = normalize(fragment);
  return normalizedFragment.length > 0 && normalizedText.includes(normalizedFragment);
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
