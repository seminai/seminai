import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { searchRules } from './helpers/company-rules-search.service';
import { RulesSearchToolOptions } from './tools.part-01-create-tavily-scientific-search-tool';

/**
 * Creates a tool to search vectorized rules across all categories.
 * Supports company-assigned search and explicit workspace exploratory search.
 */
export const createRulesSearchTool = (options: RulesSearchToolOptions) => {
  return new DynamicStructuredTool({
    name: 'search_rules',
    description:
      'Searches vectorized rules (disciplinari, standards, best practices, methodologies, custom rules) ' +
      'available in the workspace.\n' +
      "Quando conosci il companyId dell'azienda su cui stai lavorando, passalo SEMPRE: " +
      "di default cerca SOLO regole ACTIVE assegnate all'azienda. " +
      'Le regole workspace non assegnate sono solo esplorative e vanno incluse solo se richiesto esplicitamente.\n' +
      'Use this tool FIRST for compliance, disciplinary, methodology, standard, and best practice questions.',
    schema: z.object({
      query: z
        .string()
        .describe(
          'Specific question about compliance, disciplinare constraints, dosage limits, ' +
            'methodologies, standards, or best practices.',
        ),
      companyId: z
        .string()
        .optional()
        .describe(
          "ID dell'azienda su cui stai lavorando. Se fornito, le regole assegnate a questa azienda " +
            "sono l'unica fonte vincolante di default.",
        ),
      includeWorkspaceExploratory: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          'Se true include anche regole workspace non assegnate come risultati esplorativi non vincolanti.',
        ),
      categories: z
        .array(z.enum(['DISCIPLINARE', 'STANDARD', 'METHODOLOGY', 'BEST_PRACTICE', 'CUSTOM']))
        .optional()
        .describe('Optional categories filter. Defaults to all vectorizable categories.'),
      limit: z
        .number()
        .optional()
        .default(5)
        .describe('Maximum number of rule results to return (default: 5, max: 10).'),
    }),
    func: async ({ query, companyId, includeWorkspaceExploratory, categories, limit = 5 }) => {
      try {
        const results = await searchRules({
          jobId: options.jobId,
          workspaceId: options.workspaceId,
          userId: options.userId,
          companyId,
          includeWorkspaceExploratory,
          query,
          categories,
          k: Math.min(limit, 10),
        });
        if (results.length === 0) {
          return `No matching rules found for query "${query}" in the workspace. Consider using search_disciplinari_database for broader disciplinari extraction data.`;
        }
        const formatted = results
          .map((result, index) => {
            const sourceLabel =
              result.source === 'company'
                ? result.isPublic
                  ? 'COMPANY_ASSIGNED_PUBLIC'
                  : 'COMPANY_ASSIGNED_PRIVATE'
                : 'WORKSPACE_EXPLORATORY_NOT_APPLICABLE';
            const scorePercent = Math.round(result.score * 100);
            const chunks = result.chunks
              .map(
                (chunk, chunkIndex) =>
                  `  [CHUNK_${chunkIndex + 1}] (score: ${Math.round(chunk.score * 100)}%)\n  ${chunk.content}`,
              )
              .join('\n');
            return `[RULE_${index + 1}] [${sourceLabel}]
Name: ${result.ruleName}
Category: ${result.ruleCategory}
Rule ID: ${result.ruleId}
Relevance: ${scorePercent}%
Excerpts:
${chunks}
---`;
          })
          .join('\n\n');
        return `RULE SEARCH RESULTS FOR "${query}":

${formatted}

IMPORTANT: Treat [COMPANY_ASSIGNED_PUBLIC] and [COMPANY_ASSIGNED_PRIVATE] rules as applicable to the company. Treat [WORKSPACE_EXPLORATORY_NOT_APPLICABLE] only as non-binding background unless the rule is assigned to the company.`;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return `Error searching rules: ${errorMessage}.`;
      }
    },
  });
};
