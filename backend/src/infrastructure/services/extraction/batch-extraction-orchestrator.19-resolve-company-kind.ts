import { CompanyKind } from '@prisma/client';
import { prisma } from '../../repositories/Prisma';
import type { BatchExtractionOrchestratorContext } from './batch-extraction-orchestrator.context';

export async function batchExtractionOrchestratorResolveCompanyKind(this: BatchExtractionOrchestratorContext, companyId: string): Promise<CompanyKind> {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { kind: true },
    });
    return company?.kind ?? CompanyKind.AGRICULTURAL;
  }
