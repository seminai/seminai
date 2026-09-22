import type { RulesRagServiceContext } from './rules-rag-service.context';

export function rulesRagServiceExtractGroupLimitsFromText(this: RulesRagServiceContext, text: string): Array<{ substances: string[]; maxInterventions: number; scope: 'anno' | 'ciclo' | null }> {
    const limits: Array<{
      substances: string[];
      maxInterventions: number;
      scope: 'anno' | 'ciclo' | null;
    }> = [];

    // Pattern 1: "X interventi tra Sostanza1, Sostanza2 e Sostanza3"
    const pattern1 = /(\d+)\s+interventi?\s+tra\s+([^.|\n]{5,100})/gi;
    let match;
    while ((match = pattern1.exec(text)) !== null) {
      const maxInterventions = parseInt(match[1], 10);
      const substances = this.parseSubstancesFromText(match[2]);
      if (substances.length >= 2 && maxInterventions > 0) {
        limits.push({ substances, maxInterventions, scope: 'anno' });
      }
    }

    // Pattern 2: "massimo X trattamenti/anno" or "max X interventi"
    // Negative lookahead: skip if followed by "tra" (already captured by pattern 1)
    const pattern2 =
      /(?:massimo|max)\s+(\d+)\s+(?:trattament[io]|interventi?)(?:\/anno)?(?!\s+tra\s)/gi;
    while ((match = pattern2.exec(text)) !== null) {
      const maxInterventions = parseInt(match[1], 10);
      if (maxInterventions > 0) {
        limits.push({ substances: [], maxInterventions, scope: 'anno' });
      }
    }

    // Pattern 3: "N° max interventi: X" or "N. max interventi X" (table format)
    const pattern3 = /n[°.]?\s*max\s+interventi[:\s]*(\d+)/gi;
    while ((match = pattern3.exec(text)) !== null) {
      const maxInterventions = parseInt(match[1], 10);
      if (maxInterventions > 0) {
        limits.push({ substances: [], maxInterventions, scope: 'anno' });
      }
    }

    // Pattern 4: "Indipendentemente dall'avversità max X interventi"
    const pattern4 = /indipendentemente\s+dall['']avversit[aà]\s+max\s+(\d+)\s+interventi/gi;
    while ((match = pattern4.exec(text)) !== null) {
      const maxInterventions = parseInt(match[1], 10);
      if (maxInterventions > 0) {
        limits.push({ substances: [], maxInterventions, scope: 'anno' });
      }
    }

    // Deduplicate: remove generic limits (no substances) when a specific limit
    // with the same count exists. This prevents false positives from regex backtracking.
    const specificCounts = new Set(
      limits.filter((l) => l.substances.length >= 2).map((l) => l.maxInterventions),
    );
    return limits.filter(
      (l) => l.substances.length >= 2 || !specificCounts.has(l.maxInterventions),
    );
  }
