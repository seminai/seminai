import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getWorkingMemory, hasWorkingMemoryData, updateWorkingMemory } from '../working-memory';
import { assertCompanyAccess } from './authorization';
import { PrismaCompanyRepository } from '../../../../repositories/PrismaCompanyRepository';
import { prisma } from '../../../../repositories/Prisma';
import { PrismaFieldRepository } from '../../../../repositories/PrismaFieldRepository';
import { PrismaProductionUnitRepository } from '../../../../repositories/PrismaProductionUnitRepository';
import { PrismaUserOnCompanyRepository } from '../../../../repositories/PrismaUserOnCompanyRepository';
import { UserOnCompany } from '../../../../../domain/entities/UserOnCompany';
import { CompanyRole } from '@prisma/client';
import { PrismaWorkspaceRepository } from '../../../../repositories/PrismaWorkspaceRepository';
import { PrismaWorkspaceMemberRepository } from '../../../../repositories/PrismaWorkspaceMemberRepository';
import { PrismaCompanyOnWorkspaceRepository } from '../../../../repositories/PrismaCompanyOnWorkspaceRepository';
import { CreateCompanyUseCase } from '../../../../../application/use-cases/company/CreateCompanyUseCase';
import { ExtractedCompany, ExtractedField, ExtractedPU, buildFieldEntities, buildProductionUnitEntries } from './import-from-file.tool.part-01-extracted-company';

/**
 * Tool: import_from_file
 * Persists extracted file data to the database. REQUIRES USER APPROVAL.
 */
export function createImportFromFileTool(threadId: string, userId: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'import_from_file',
    description: `Importa nel database i dati estratti da un file (da extract_from_file).
⚠️ QUESTO TOOL RICHIEDE APPROVAZIONE ESPLICITA DELL'UTENTE.
Prima di chiamare, DEVI aver eseguito extract_from_file e aver presentato l'anteprima all'utente.
L'utente deve confermare esplicitamente prima dell'importazione.
Richiede extractedFileData dalla working memory.
Crea azienda (opzionale), campi (upsert per riferimento catastale), e unità produttive.`,
    schema: z.object({
      companyId: z
        .string()
        .optional()
        .describe(
          "ID azienda a cui associare campi e UP. Se omesso e createCompany=true, crea una nuova azienda. Se omesso e createCompany=false, usa la prima azienda dell'utente.",
        ),
      createCompany: z
        .boolean()
        .optional()
        .default(false)
        .describe('Se true, crea una nuova azienda dai dati estratti dal file.'),
      importFields: z.boolean().optional().default(true).describe('Se true, importa i campi.'),
      importProductionUnits: z
        .boolean()
        .optional()
        .default(true)
        .describe('Se true, importa le unità produttive.'),
    }),
    func: async ({ companyId, createCompany, importFields, importProductionUnits }) => {
      try {
        if (!hasWorkingMemoryData(threadId, 'extractedFileData')) {
          return JSON.stringify({
            error: 'Prerequisito mancante: extractedFileData',
            hint: 'Eseguire prima extract_from_file per estrarre i dati dal file.',
          });
        }

        const wm = getWorkingMemory(threadId);
        const { companies, fields, productionUnits } = wm.extractedFileData as {
          companies: ExtractedCompany[];
          fields: ExtractedField[];
          productionUnits: ExtractedPU[];
        };

        const occupationDecisions = wm.fieldOccupationDecisions ?? {};
        const normalized = wm.normalizedExtraction;
        const skippedOrigIdxs = new Set<number>();
        const reuseExistingIdByOrigIdx = new Map<number, string>();
        if (normalized) {
          const nfByCadastral = new Map<string, (typeof normalized.fields)[number]>();
          for (const nf of normalized.fields) {
            if (nf.foglio && nf.particella) {
              nfByCadastral.set(
                `${String(nf.foglio).trim().toLowerCase()}|${String(nf.particella).trim().toLowerCase()}`,
                nf,
              );
            }
          }
          fields.forEach((rawField, idx) => {
            if (!rawField.foglio || !rawField.particella) {
              return;
            }
            const key = `${String(rawField.foglio).trim().toLowerCase()}|${String(rawField.particella).trim().toLowerCase()}`;
            const nf = nfByCadastral.get(key);
            if (!nf) {
              return;
            }
            const decision = occupationDecisions[nf.tempId];
            if (decision === 'skip') {
              skippedOrigIdxs.add(idx);
              return;
            }
            if (decision === 'force_new') {
              return;
            }
            // Default for 'existing' (and 'occupied' with explicit 'reuse'): reuse the existing field
            if (
              nf.existingFieldId &&
              (decision === 'reuse' || (!decision && nf.status === 'existing'))
            ) {
              reuseExistingIdByOrigIdx.set(idx, nf.existingFieldId);
            }
          });
        }

        let resolvedCompanyId = companyId || null;
        if (resolvedCompanyId) {
          await assertCompanyAccess(userId, resolvedCompanyId);
        }

        // Step 1: Create company if requested
        if (createCompany && companies.length > 0) {
          const primaryCompany = companies[0];
          if (!primaryCompany.vatNumber || !primaryCompany.fiscalCode) {
            return JSON.stringify({
              error: 'Dati azienda insufficienti per la creazione.',
              hint: 'P.IVA e codice fiscale sono obbligatori. Usa create_company per crearla manualmente.',
            });
          }
        }

        // If no companyId, try to find the user's first company
        if (!resolvedCompanyId && (!createCompany || companies.length === 0)) {
          const companyRepo = new PrismaCompanyRepository(prisma);
          const userCompanies = await companyRepo.findManyByUserId(userId);
          if (userCompanies.length === 0) {
            return JSON.stringify({
              error:
                "Nessuna azienda disponibile. Crea prima un'azienda con create_company o usa createCompany=true.",
            });
          }
          if (userCompanies.length === 1) {
            resolvedCompanyId = userCompanies[0].id;
          } else {
            return JSON.stringify({
              error:
                'Più aziende trovate. Specifica companyId per scegliere a quale associare i dati.',
              companies: userCompanies.map((c) => ({ id: c.id, name: c.name })),
            });
          }
        }

        const result = await prisma.$transaction(async (tx) => {
          const fieldRepo = new PrismaFieldRepository(tx as unknown as typeof prisma);
          const puRepo = new PrismaProductionUnitRepository(tx as unknown as typeof prisma);
          let createdFieldCount = 0;
          let createdPUCount = 0;
          const errors: Array<{ entity: string; error: string }> = [];
          const fieldMap = new Map<string, string>();

          if (createCompany && companies.length > 0 && !companyId) {
            const primaryCompany = companies[0];
            const companyRepo = new PrismaCompanyRepository(tx as unknown as typeof prisma);
            const userOnCompanyRepo = new PrismaUserOnCompanyRepository(
              tx as unknown as typeof prisma,
            );
            const existingCompany =
              (await companyRepo.findByVatNumber(primaryCompany.vatNumber!)) ??
              (await companyRepo.findByFiscalCode(primaryCompany.fiscalCode!));
            if (existingCompany) {
              const existingMembership = await userOnCompanyRepo.findByCompanyAndUser(
                existingCompany.id,
                userId,
              );
              if (!existingMembership) {
                await userOnCompanyRepo.create(
                  UserOnCompany.create({
                    companyId: existingCompany.id,
                    userId,
                    type: null,
                    role: CompanyRole.ADMIN,
                  }),
                );
              }
              resolvedCompanyId = existingCompany.id;
            } else {
              const workspaceRepo = new PrismaWorkspaceRepository(tx as unknown as typeof prisma);
              const workspaceMemberRepo = new PrismaWorkspaceMemberRepository(
                tx as unknown as typeof prisma,
              );
              const companyOnWorkspaceRepo = new PrismaCompanyOnWorkspaceRepository(
                tx as unknown as typeof prisma,
              );
              const useCase = new CreateCompanyUseCase(
                companyRepo,
                userOnCompanyRepo,
                workspaceRepo,
                workspaceMemberRepo,
                companyOnWorkspaceRepo,
              );
              const { company } = await useCase.execute({
                name: primaryCompany.name,
                vatNumber: primaryCompany.vatNumber!,
                fiscalCode: primaryCompany.fiscalCode!,
                cuaa: primaryCompany.cuaa ?? null,
                nation: primaryCompany.nation ?? 'IT',
                city: primaryCompany.city ?? null,
                address: primaryCompany.address ?? null,
                cap: primaryCompany.cap ?? null,
                email: null,
                phoneNumber: null,
                website: null,
                logoUrl: null,
                userId,
              });
              resolvedCompanyId = company.id;
            }
          }

          if (importFields && fields.length > 0) {
            const fieldBatch = buildFieldEntities({
              fields,
              companyId: resolvedCompanyId,
              skippedIndexes: skippedOrigIdxs,
              reusedIds: reuseExistingIdByOrigIdx,
            });
            const upserted = await fieldRepo.upsertMany(fieldBatch.entities);
            createdFieldCount = upserted.length;
            for (let i = 0; i < upserted.length; i++) {
              const field = upserted[i];
              const origIdx = fieldBatch.originalIndexes[i];
              const key = `${field.name}|${field.sezione ?? ''}|${field.foglio ?? ''}|${field.particella ?? ''}|${field.subalterno || ''}|${field.companyId || ''}`;
              fieldMap.set(key, field.id);
              if (field.foglio && field.particella) {
                fieldMap.set(`${field.foglio}_${field.particella}`.toLowerCase(), field.id);
              }
              fieldMap.set(`__index_${origIdx}`, field.id);
            }
            // Reuse decisions: bind existing fields to original indices without re-upserting.
            for (const [origIdx, existingId] of reuseExistingIdByOrigIdx.entries()) {
              const rawField = fields[origIdx];
              fieldMap.set(`__index_${origIdx}`, existingId);
              if (rawField.foglio && rawField.particella) {
                fieldMap.set(`${rawField.foglio}_${rawField.particella}`.toLowerCase(), existingId);
              }
            }
          }

          if (importProductionUnits && productionUnits.length > 0) {
            const puEntities = buildProductionUnitEntries({
              productionUnits,
              fieldMap,
              companyId: resolvedCompanyId,
              errors,
            });
            if (errors.length > 0) {
              throw new Error(
                `Import validation failed: ${errors.map((entry) => `${entry.entity} - ${entry.error}`).join('; ')}`,
              );
            }

            createdPUCount = (await puRepo.createBulk(puEntities)).length;
          }

          return {
            companyId: resolvedCompanyId,
            createdFieldCount,
            createdPUCount,
            fieldIds: Array.from(fieldMap.values()),
          };
        });

        updateWorkingMemory(threadId, {
          createdCompanyId: result.companyId ?? undefined,
          createdFieldIds: result.fieldIds,
        });

        return JSON.stringify({
          companyId: result.companyId,
          fieldsImported: result.createdFieldCount,
          productionUnitsImported: result.createdPUCount,
          message: `Importazione completata: ${result.createdFieldCount} campi e ${result.createdPUCount} unità produttive.`,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        return JSON.stringify({ error: msg });
      }
    },
  });
}
