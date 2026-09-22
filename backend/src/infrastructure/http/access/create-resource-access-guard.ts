import { PrismaClient } from '@prisma/client';
import { CompanyAccessGuard } from '../../../application/use-cases/access/CompanyAccessGuard';
import { ResourceAccessGuard } from '../../../application/use-cases/access/ResourceAccessGuard';
import { PrismaFileRepository } from '../../repositories/PrismaFileRepository';
import { PrismaJobRepository } from '../../repositories/PrismaJobRepository';
import { PrismaPatentinoRepository } from '../../repositories/PrismaPatentinoRepository';
import { PrismaProductionUnitRepository } from '../../repositories/PrismaProductionUnitRepository';
import { PrismaUserOnCompanyRepository } from '../../repositories/PrismaUserOnCompanyRepository';
import { PrismaWarehouseRepository } from '../../repositories/PrismaWarehouseRepository';

export function createResourceAccessGuard(prisma: PrismaClient): ResourceAccessGuard {
  return new ResourceAccessGuard(
    new CompanyAccessGuard(new PrismaUserOnCompanyRepository(prisma)),
    new PrismaJobRepository(prisma),
    new PrismaProductionUnitRepository(prisma),
    new PrismaWarehouseRepository(prisma),
    new PrismaFileRepository(prisma),
    new PrismaPatentinoRepository(prisma),
  );
}
