import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { prisma } from '../../../../repositories/Prisma';
import { PrismaRuleRepository } from '../../../../repositories/PrismaRuleRepository';
import { PrismaWorkspaceMemberRepository } from '../../../../repositories/PrismaWorkspaceMemberRepository';
import { UpdateRuleUseCase } from '../../../../../application/use-cases/rule/UpdateRuleUseCase';
import { FileService } from '../../../FileService';
import { getWorkingMemory, hasWorkingMemoryData } from '../working-memory';
import { assertWorkspaceAccess } from '../../shared/authorization';

/**
 * Tool: update_workspace_rule
 * Updates an existing rule in a workspace. REQUIRES USER APPROVAL.
 * Can update name, description, status, content, region, validity dates.
 * Can also replace the PDF for DISCIPLINARE rules.
 */
export function createUpdateWorkspaceRuleTool(
  threadId: string,
  userId: string,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'update_workspace_rule',
    description: `Modifica una regola esistente nel workspace.
⚠️ QUESTO TOOL RICHIEDE APPROVAZIONE ESPLICITA DELL'UTENTE.
Prima di chiamare questo tool, DEVI presentare un riepilogo delle modifiche da apportare.

Permette di modificare: nome, descrizione, stato, categoria, regione, date di validità, contenuto.
Per attivare una regola: imposta status = ACTIVE.
Per disattivarla temporaneamente: imposta status = ARCHIVED o DEPRECATED.
Per la sostituzione del PDF di un DISCIPLINARE: imposta replacePdfFromChat = true con un PDF allegato in chat.`,
    schema: z.object({
      ruleId: z.string().describe('ID della regola da modificare'),
      name: z.string().optional().describe('Nuovo nome della regola'),
      description: z.string().optional().nullable().describe('Nuova descrizione'),
      status: z
        .enum(['DRAFT', 'ACTIVE', 'ARCHIVED', 'DEPRECATED'])
        .optional()
        .describe('Nuovo stato della regola'),
      category: z
        .enum(['DISCIPLINARE', 'STANDARD', 'BEST_PRACTICE', 'METHODOLOGY', 'CUSTOM'])
        .optional()
        .describe('Nuova categoria'),
      region: z.string().optional().nullable().describe('Regione/zona geografica'),
      sourceDocument: z
        .string()
        .optional()
        .nullable()
        .describe('Riferimento al documento sorgente'),
      sourceUrl: z.string().optional().nullable().describe('URL del documento sorgente'),
      validFrom: z.string().optional().nullable().describe('Data di inizio validità (ISO 8601)'),
      validUntil: z.string().optional().nullable().describe('Data di fine validità (ISO 8601)'),
      content: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Nuovo contenuto strutturato della regola (JSON)'),
      replacePdfFromChat: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          'Se true, sostituisce il PDF corrente con quello allegato in chat e avvia la ri-vettorializzazione.',
        ),
    }),
    func: async ({
      ruleId,
      name,
      description,
      status,
      category,
      region,
      sourceDocument,
      sourceUrl,
      validFrom,
      validUntil,
      content,
      replacePdfFromChat,
    }) => {
      try {
        // Defense-in-depth: resolve workspaceId from ruleId and gate the caller
        // BEFORE any PDF upload or DB write, even though the use case will
        // re-check membership later.
        const ruleForAuth = await prisma.rule.findUnique({
          where: { id: ruleId },
          select: { workspaceId: true },
        });
        if (!ruleForAuth) {
          return JSON.stringify({ error: 'Regola non trovata.' });
        }
        await assertWorkspaceAccess(userId, ruleForAuth.workspaceId);

        let pdfFileUrl: string | undefined = undefined;
        let pdfFileName: string | undefined = undefined;
        let pdfFileHash: string | undefined = undefined;

        // Handle PDF replacement from working memory
        if (replacePdfFromChat && hasWorkingMemoryData(threadId, 'uploadedFileBuffer')) {
          const wm = getWorkingMemory(threadId);
          const fileBuffer = wm.uploadedFileBuffer as Buffer;
          const mimeType = (wm.uploadedFileMimeType as string) || 'application/pdf';
          const fileName = (wm.uploadedFileName as string) || 'disciplinare.pdf';

          if (!fileName.toLowerCase().endsWith('.pdf') && mimeType !== 'application/pdf') {
            return JSON.stringify({
              error: 'Il file allegato non è un PDF.',
              hint: 'Allega un file PDF e riprova.',
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

          const { createHash } = await import('node:crypto');
          pdfFileHash = createHash('sha256').update(new Uint8Array(fileBuffer)).digest('hex');
        }

        const ruleRepo = new PrismaRuleRepository(prisma);
        const memberRepo = new PrismaWorkspaceMemberRepository(prisma);
        const useCase = new UpdateRuleUseCase(ruleRepo, memberRepo);

        const updateData: Parameters<typeof useCase.execute>[0]['data'] = {};
        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (status !== undefined)
          updateData.status = status as Parameters<typeof useCase.execute>[0]['data']['status'];
        if (category !== undefined)
          updateData.category = category as Parameters<
            typeof useCase.execute
          >[0]['data']['category'];
        if (region !== undefined) updateData.region = region;
        if (sourceDocument !== undefined) updateData.sourceDocument = sourceDocument;
        if (sourceUrl !== undefined) updateData.sourceUrl = sourceUrl;
        if (validFrom !== undefined) updateData.validFrom = validFrom ? new Date(validFrom) : null;
        if (validUntil !== undefined)
          updateData.validUntil = validUntil ? new Date(validUntil) : null;
        if (content !== undefined) updateData.content = content;
        if (pdfFileUrl !== undefined) {
          updateData.pdfFileUrl = pdfFileUrl;
          updateData.pdfFileName = pdfFileName;
          updateData.pdfFileHash = pdfFileHash;
          updateData.isVectorized = false;
          updateData.vectorizedAt = null;
          updateData.vectorizationError = null;
        }

        const updated = await useCase.execute({ ruleId, userId, data: updateData });

        const pdfMsg = pdfFileUrl
          ? ' Il nuovo PDF è stato caricato e la vettorializzazione è in corso.'
          : '';

        return JSON.stringify({
          ruleId: updated.id,
          name: updated.name,
          status: updated.status,
          category: updated.category,
          region: updated.region,
          isVectorized: updated.isVectorized,
          message: `Regola "${updated.name}" aggiornata con successo.${pdfMsg}`,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        return JSON.stringify({ error: msg });
      }
    },
  });
}
