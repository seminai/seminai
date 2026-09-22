import { DynamicStructuredTool } from '@langchain/core/tools';
import { CompanyRole } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../../../repositories/Prisma';
import { PrismaCompanyRepository } from '../../../../repositories/PrismaCompanyRepository';
import { PrismaUserOnCompanyRepository } from '../../../../repositories/PrismaUserOnCompanyRepository';
import { PrismaWorkspaceRepository } from '../../../../repositories/PrismaWorkspaceRepository';
import { PrismaWorkspaceMemberRepository } from '../../../../repositories/PrismaWorkspaceMemberRepository';
import { PrismaCompanyOnWorkspaceRepository } from '../../../../repositories/PrismaCompanyOnWorkspaceRepository';
import { PrismaFieldRepository } from '../../../../repositories/PrismaFieldRepository';
import { PrismaProductionUnitRepository } from '../../../../repositories/PrismaProductionUnitRepository';
import { CreateCompanyUseCase } from '../../../../../application/use-cases/company/CreateCompanyUseCase';
import { Field } from '../../../../../domain/entities/Field';
import { ProductionUnit } from '../../../../../domain/entities/ProductionUnit';
import { UserOnCompany } from '../../../../../domain/entities/UserOnCompany';
import { getWorkingMemory, hasWorkingMemoryData, updateWorkingMemory } from '../working-memory';
import { normalizeAreaHa } from '../../../../utils/area-normalization';
import { assertCompanyAccess } from './authorization';

interface ExtractedCompany {
  name: string;
  vatNumber: string | null;
  fiscalCode: string | null;
  cuaa: string | null;
  nation: string | null;
  region: string | null;
  city: string | null;
  address: string | null;
  cap: string | null;
}

interface ExtractedField {
  nome?: string;
  name?: string;
  regione?: string | null;
  provincia?: string | null;
  comune?: string;
  indirizzo?: string | null;
  cap?: string | null;
  sezione?: string | null;
  foglio?: string;
  particella?: string;
  subalterno?: string | null;
  superficieCatastaleHa?: number | null;
  superficieGraficaHa?: number | null;
  superficieCatastaleMq?: number | null;
  sauHa?: number | null;
  gisHa?: number | null;
  usiSuolo?: string[];
  qualita?: string | null;
  coordinates?: number[];
  latitude?: number | null;
  longitude?: number | null;
  polygon?: { type: string; coordinates: number[][][] } | null;
  coordinatesGaussBoaga?: number[] | null;
  polygonGaussBoaga?: { type: string; coordinates: number[][][] } | null;
  nation?: string | null;
  region?: string | null;
  soilType?: string | null;
  inizioConduzione?: string | null;
  fineConduzione?: string | null;
}

interface ExtractedPU {
  name: string;
  sezione?: string | null;
  foglio?: string | null;
  particella?: string | null;
  subalterno?: string | null;
  areaHa?: number | null;
  protocoll?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  fieldIndex?: number;
  cropType?: string | null;
  protectionStructure?: string | null;
  destinazioneDiUso?: string | null;
  cycles?: Array<{
    cycleIndex?: number;
    cropName?: string | null;
    cropType?: string | null;
    variety?: string | null;
    occupazione?: string | null;
    destinazione?: string | null;
    protectionStructure?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    floweringDate?: string | null;
    harvestingDate?: string | null;
  }>;
  allocations?: Array<{
    fieldName?: string;
    sezione?: string | null;
    foglio?: string | null;
    particella?: string | null;
    subalterno?: string | null;
    areaHa?: number;
  }>;
}

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
            const fieldsWithOrigIdx = fields
              .map((value, origIdx) => ({ value, origIdx }))
              .filter(
                ({ origIdx }) =>
                  !skippedOrigIdxs.has(origIdx) && !reuseExistingIdByOrigIdx.has(origIdx),
              );
            const fieldEntities = fieldsWithOrigIdx.map(({ value: f }) => {
              const hasCadastral = f.foglio || f.particella;
              const name =
                f.nome ||
                f.name ||
                (hasCadastral
                  ? `F${f.foglio ?? '?'} P${f.particella ?? '?'}`
                  : `Campo ${fields.indexOf(f) + 1}`);
              const superficieMq =
                f.superficieCatastaleMq ??
                (f.superficieCatastaleHa != null ? f.superficieCatastaleHa * 10000 : null);

              return Field.create({
                companyId: resolvedCompanyId,
                name,
                coordinates: f.coordinates ?? [],
                coordinatesGaussBoaga: f.coordinatesGaussBoaga ?? undefined,
                latitude: f.latitude ?? null,
                longitude: f.longitude ?? null,
                polygon: f.polygon ?? null,
                polygonGaussBoaga: f.polygonGaussBoaga ?? undefined,
                gisHa: f.gisHa ?? f.superficieGraficaHa ?? null,
                sauHa: f.sauHa ?? null,
                ph: null,
                nitrogen: null,
                phosphorus: null,
                potassium: null,
                calcium: null,
                magnesium: null,
                soilType: f.soilType ?? null,
                uso: f.usiSuolo?.join(', ') ?? null,
                qualita: f.qualita ?? null,
                superficieCatastaleMq: superficieMq,
                sezione: f.sezione ?? null,
                foglio: f.foglio ?? null,
                particella: f.particella ?? null,
                subalterno: f.subalterno ?? null,
                nation: f.nation ?? 'IT',
                region: f.region ?? f.provincia ?? f.regione ?? null,
                city: f.comune ?? null,
                address: f.indirizzo ?? null,
                cap: f.cap ?? null,
                variazioneMq: null,
                inizioConduzione: f.inizioConduzione ? new Date(f.inizioConduzione) : null,
                fineConduzione: f.fineConduzione ? new Date(f.fineConduzione) : null,
                bufferZoneNotes: null,
              });
            });

            const upserted = await fieldRepo.upsertMany(fieldEntities);
            createdFieldCount = upserted.length;
            for (let i = 0; i < upserted.length; i++) {
              const field = upserted[i];
              const origIdx = fieldsWithOrigIdx[i].origIdx;
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
            const puEntities: Array<{
              productionUnit: ProductionUnit;
              allocations: Array<{ fieldId: string; areaHaOnField: number }>;
            }> = [];

            for (const pu of productionUnits) {
              const cycle = pu.cycles?.[0];
              const startDate = pu.startDate || cycle?.startDate;
              const endDate = pu.endDate || cycle?.endDate;
              if (!startDate || !endDate) {
                errors.push({ entity: `PU: ${pu.name}`, error: 'Date mancanti' });
                continue;
              }

              const allocations: Array<{ fieldId: string; areaHaOnField: number }> = [];
              if (pu.fieldIndex != null) {
                const fieldId = fieldMap.get(`__index_${pu.fieldIndex}`);
                if (fieldId)
                  allocations.push({ fieldId, areaHaOnField: normalizeAreaHa(pu.areaHa) ?? 0 });
              } else if ((pu.allocations ?? []).length > 0) {
                for (const alloc of pu.allocations ?? []) {
                  const simpleKey = `${alloc.foglio}_${alloc.particella}`.toLowerCase();
                  let fieldId = fieldMap.get(simpleKey);
                  if (!fieldId && alloc.fieldName) {
                    fieldId = fieldMap.get(
                      `${alloc.fieldName}|${alloc.sezione ?? ''}|${alloc.foglio}|${alloc.particella}|${alloc.subalterno || ''}|${resolvedCompanyId || ''}`,
                    );
                  }
                  if (!fieldId) {
                    errors.push({
                      entity: `PU: ${pu.name}`,
                      error: `Campo F${alloc.foglio} P${alloc.particella} non trovato`,
                    });
                    continue;
                  }
                  allocations.push({
                    fieldId,
                    areaHaOnField: normalizeAreaHa(alloc.areaHa) ?? 0,
                  });
                }
              } else if (pu.foglio && pu.particella) {
                const fieldId = fieldMap.get(`${pu.foglio}_${pu.particella}`.toLowerCase());
                if (fieldId)
                  allocations.push({ fieldId, areaHaOnField: normalizeAreaHa(pu.areaHa) ?? 0 });
              }

              if (allocations.length === 0) {
                errors.push({ entity: `PU: ${pu.name}`, error: 'Nessun campo associato trovato' });
                continue;
              }

              const totalArea = allocations.reduce(
                (sum, allocation) => sum + allocation.areaHaOnField,
                0,
              );
              puEntities.push({
                productionUnit: ProductionUnit.create({
                  name: pu.name,
                  cropName: cycle?.cropName ?? 'Sconosciuta',
                  cropType: cycle?.cropType ?? pu.cropType ?? 'N/A',
                  variety: cycle?.variety ?? 'N/A',
                  protocoll: cycle?.occupazione ?? pu.protocoll ?? 'Convenzionale',
                  areaHa: totalArea > 0 ? totalArea : normalizeAreaHa(pu.areaHa) ?? 0,
                  protectionStructure:
                    cycle?.protectionStructure ?? pu.protectionStructure ?? 'Nessuna',
                  startDate: new Date(startDate),
                  endDate: new Date(endDate),
                  floweringDate: cycle?.floweringDate
                    ? new Date(cycle.floweringDate)
                    : new Date(startDate),
                  harvestingDate: cycle?.harvestingDate
                    ? new Date(cycle.harvestingDate)
                    : new Date(endDate),
                  occupazione: cycle?.occupazione ?? null,
                  destinazioneDiUso: cycle?.destinazione ?? pu.destinazioneDiUso ?? null,
                  acquaTotalePeridoL: 0,
                }),
                allocations,
              });
            }

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
