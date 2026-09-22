/**
 * Shared crop name resolver for disciplinare matching.
 *
 * Resolves short production unit crop names (e.g., "vite") to full disciplinare
 * crop names (e.g., "Vite da uva da vino") via RAG + LLM.
 *
 * Used by both dosage_agent and conformity_checker_agent.
 */

import { JsonOutputParser } from '@langchain/core/output_parsers';
import { RulesRagService } from '../../rag/RulesRagService';
import { createChatModel } from '../../llm-model-factory';

/**
 * Resolves production unit crop names to full disciplinare crop names via LLM.
 * E.g., "vite" → "Vite da uva da vino"
 * Returns a Map from unit crop name → disciplinare crop name.
 */
export async function resolveCropNamesForDisciplinare(params: {
  cropNames: ReadonlyArray<string>;
  ragService: RulesRagService;
  companyId: string;
  workspaceId: string;
}): Promise<Map<string, string>> {
  const { cropNames, ragService, companyId, workspaceId } = params;
  const resolved = new Map<string, string>();

  if (cropNames.length === 0) return resolved;

  // Query RAG to find crop sections in the disciplinare
  const cropQuery = `elenco colture ${cropNames.join(' ')} tabella difesa integrata sezioni`;
  let results;
  try {
    results = await ragService.queryRulesForCompliance({
      companyId,
      workspaceId,
      query: cropQuery,
      categories: ['DISCIPLINARE'],
      k: 10,
    });
  } catch {
    console.warn('[CROP-RESOLVER] Crop name resolution RAG query failed, using original names');
    for (const cn of cropNames) resolved.set(cn, cn);
    return resolved;
  }

  if (results.length === 0) {
    console.log('[CROP-RESOLVER] No RAG results for crop name resolution, using original names');
    for (const cn of cropNames) resolved.set(cn, cn);
    return resolved;
  }

  const chunkTexts = results
    .flatMap((r) => r.relevantChunks)
    .map((c) => c.content)
    .join('\n---\n')
    .substring(0, 4000);

  try {
    const { model: llm } = createChatModel({
      modelName: 'gpt-4o-mini',
      temperature: 0,
      maxTokens: 500,
    });
    const parser = new JsonOutputParser<Record<string, string>>();
    const prompt = `Sei un esperto di disciplinari di produzione integrata italiani.
Dati i seguenti frammenti di un disciplinare, per ciascuna coltura indicata trova il nome ESATTO e COMPLETO della coltura come appare nel disciplinare.

Colture da risolvere: ${cropNames.map((cn) => `"${cn}"`).join(', ')}

Frammenti dal disciplinare:
---
${chunkTexts}
---

Rispondi con un JSON dove le chiavi sono i nomi corti (esattamente come indicati) e i valori i nomi completi dal disciplinare.
Esempio: {{"vite": "Vite da uva da vino", "melo": "Melo"}}
Se non trovi una corrispondenza chiara, usa il nome originale.
Rispondi SOLO con il JSON.`;

    const chain = llm.pipe(parser);
    const mapping = await chain.invoke(prompt);

    for (const cn of cropNames) {
      const resolvedName = mapping[cn] || mapping[cn.toLowerCase()] || cn;
      resolved.set(cn, resolvedName);
    }
  } catch (err) {
    console.warn(
      '[CROP-RESOLVER] Crop name LLM resolution failed:',
      err instanceof Error ? err.message : String(err),
    );
    for (const cn of cropNames) {
      if (!resolved.has(cn)) resolved.set(cn, cn);
    }
  }

  // Fill any unresolved names
  for (const cn of cropNames) {
    if (!resolved.has(cn)) resolved.set(cn, cn);
  }

  return resolved;
}
