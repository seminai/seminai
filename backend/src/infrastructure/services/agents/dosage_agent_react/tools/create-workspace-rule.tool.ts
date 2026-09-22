import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { prisma } from '../../../../repositories/Prisma';
import { PrismaRuleRepository } from '../../../../repositories/PrismaRuleRepository';
import { PrismaWorkspaceRepository } from '../../../../repositories/PrismaWorkspaceRepository';
import { PrismaWorkspaceMemberRepository } from '../../../../repositories/PrismaWorkspaceMemberRepository';
import { CreateRuleUseCase } from '../../../../../application/use-cases/rule/CreateRuleUseCase';
import { FileService } from '../../../FileService';
import { getWorkingMemory, hasWorkingMemoryData } from '../working-memory';
import { assertWorkspaceAccess } from '../../shared/authorization';

/**
 * Tool: create_workspace_rule
 * Creates a new rule in a workspace. REQUIRES USER APPROVAL.
 * For DISCIPLINARE rules, reads the uploaded PDF from working memory and stores it,
 * then triggers automatic vectorization.
 */
export function createCreateWorkspaceRuleTool(
  threadId: string,
  userId: string,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'create_workspace_rule',
    description: `Crea una nuova regola in un workspace.
⚠️ QUESTO TOOL RICHIEDE APPROVAZIONE ESPLICITA DELL'UTENTE.
Prima di chiamare questo tool, DEVI presentare un riepilogo con:
- Nome, categoria, descrizione, regione (se applicabile)
- Se è DISCIPLINARE: indica se verrà vettorializzato il PDF allegato

Per le regole DISCIPLINARE: se l'utente ha allegato un PDF in chat, questo viene caricato
automaticamente e avviata la vettorializzazione per la ricerca RAG.

Categorie disponibili: DISCIPLINARE, STANDARD, BEST_PRACTICE, METHODOLOGY, CUSTOM.
La regola viene creata in stato DRAFT. Per attivarla usa update_workspace_rule con status ACTIVE.`,
    schema: z.object({
      workspaceId: z.string().describe('ID del workspace in cui creare la regola'),
      name: z.string().describe('Nome della regola'),
      category: z
        .enum(['DISCIPLINARE', 'STANDARD', 'BEST_PRACTICE', 'METHODOLOGY', 'CUSTOM'])
        .describe('Categoria della regola'),
      description: z.string().optional().nullable().describe('Descrizione della regola'),
      region: z.string().optional().nullable().describe('Regione/zona geografica di applicazione'),
      sourceDocument: z
        .string()
        .optional()
        .nullable()
        .describe('Riferimento al documento sorgente (es. "DM 22/01/2014")'),
      sourceUrl: z.string().optional().nullable().describe('URL del documento sorgente ufficiale'),
      validFrom: z
        .string()
        .optional()
        .nullable()
        .describe('Data di inizio validità (ISO 8601, es. "2024-01-01")'),
      validUntil: z
        .string()
        .optional()
        .nullable()
        .describe('Data di fine validità (ISO 8601, es. "2025-12-31")'),
      content: z
        .record(z.string(), z.unknown())
        .optional()
        .default({})
        .describe('Contenuto strutturato della regola (JSON opzionale)'),
      uploadPdfFromChat: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          'Se true, tenta di leggere il PDF allegato in chat e caricarlo per la vettorializzazione. Usare solo per DISCIPLINARE.',
        ),
    }),
    func: async ({
      workspaceId,
      name,
      category,
      description,
      region,
      sourceDocument,
      sourceUrl,
      validFrom,
      validUntil,
      content,
      uploadPdfFromChat,
    }) => {
      try {
        await assertWorkspaceAccess(userId, workspaceId);

        let pdfFileUrl: string | null = null;
        let pdfFileName: string | null = null;
        let pdfFileHash: string | null = null;

        // Handle PDF upload from working memory (for DISCIPLINARE)
        if (uploadPdfFromChat && hasWorkingMemoryData(threadId, 'uploadedFileBuffer')) {
          const wm = getWorkingMemory(threadId);
          const fileBuffer = wm.uploadedFileBuffer as Buffer;
          const mimeType = (wm.uploadedFileMimeType as string) || 'application/pdf';
          const fileName = (wm.uploadedFileName as string) || 'disciplinare.pdf';

          if (!fileName.toLowerCase().endsWith('.pdf') && mimeType !== 'application/pdf') {
            return JSON.stringify({
              error: 'Il file allegato non è un PDF. Per la vettorializzazione è richiesto un PDF.',
              hint: 'Allega un file PDF del disciplinare e riprova.',
            });
          }

          const fileService = new FileService(userId);
          pdfFileUrl = await fileService.uploadFile(
            {
              fieldname: 'file',
              originalname: fileName,
              encoding: '7bit',
              mimetype: mimeType,
              size: fileBuffer.length,
              buffer: fileBuffer,
            },
            userId,
            'rules/disciplinari',
            'disciplinare_pdf',
          );
          pdfFileName = fileName;

          // Compute a simple hash for deduplication
          const { createHash } = await import('node:crypto');
          pdfFileHash = createHash('sha256').update(new Uint8Array(fileBuffer)).digest('hex');
        }

        const ruleRepo = new PrismaRuleRepository(prisma);
        const workspaceRepo = new PrismaWorkspaceRepository(prisma);
        const memberRepo = new PrismaWorkspaceMemberRepository(prisma);
        if (pdfFileHash) {
          const existingRule = await prisma.rule.findFirst({
            where: {
              workspaceId,
              pdfFileHash,
            },
          });
          if (existingRule) {
            return JSON.stringify({
              ruleId: existingRule.id,
              name: existingRule.name,
              category: existingRule.category,
              status: existingRule.status,
              slug: existingRule.slug,
              region: existingRule.region,
              hasPdf: !!existingRule.pdfFileUrl,
              isVectorized: existingRule.isVectorized,
              reusedExistingRule: true,
              message: `Regola "${existingRule.name}" già presente per lo stesso PDF. Operazione non ripetuta.`,
            });
          }
        }
        const useCase = new CreateRuleUseCase(ruleRepo, workspaceRepo, memberRepo);
        const rule = await useCase.execute({
          data: {
            workspaceId,
            name,
            category: category as Parameters<typeof useCase.execute>[0]['data']['category'],
            description: description ?? null,
            content: content ?? {},
            region: region ?? null,
            sourceDocument: sourceDocument ?? null,
            sourceUrl: sourceUrl ?? null,
            validFrom: validFrom ? new Date(validFrom) : null,
            validUntil: validUntil ? new Date(validUntil) : null,
            createdById: userId,
            pdfFileUrl,
            pdfFileName,
            pdfFileHash,
          },
        });

        const pdfMessage = pdfFileUrl
          ? ` Il PDF è stato caricato${rule.isVectorized ? ' e vettorializzato' : ' — la vettorializzazione è in corso'}.`
          : '';

        return JSON.stringify({
          ruleId: rule.id,
          name: rule.name,
          category: rule.category,
          status: rule.status,
          slug: rule.slug,
          region: rule.region,
          hasPdf: !!rule.pdfFileUrl,
          isVectorized: rule.isVectorized,
          message: `Regola "${rule.name}" creata con successo in stato DRAFT.${pdfMessage} Per attivarla usa update_workspace_rule con status ACTIVE.`,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        return JSON.stringify({ error: msg });
      }
    },
  });
}
