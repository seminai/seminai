import { prisma } from '../../../repositories/Prisma';

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

export async function assertCompanyAccess(userId: string, companyId: string): Promise<void> {
  const row = await prisma.company.findFirst({
    where: { id: companyId, companyUsers: { some: { userId } } },
    select: { id: true },
  });
  if (!row) {
    throw new Error('Azienda non trovata o non autorizzata per questo utente.');
  }
}

export async function assertFieldAccess(userId: string, fieldId: string): Promise<void> {
  const row = await prisma.field.findFirst({
    where: { id: fieldId, company: { companyUsers: { some: { userId } } } },
    select: { id: true },
  });
  if (!row) {
    throw new Error('Campo non trovato o non autorizzato per questo utente.');
  }
}

export async function assertFieldsAccess(
  userId: string,
  fieldIds: readonly string[],
): Promise<void> {
  const ids = unique(fieldIds);
  if (ids.length === 0) {
    throw new Error('Nessun campo da validare.');
  }
  const rows = await prisma.field.findMany({
    where: { id: { in: ids }, company: { companyUsers: { some: { userId } } } },
    select: { id: true },
  });
  const authorizedIds = new Set(rows.map((row) => row.id));
  const missing = ids.filter((id) => !authorizedIds.has(id));
  if (missing.length > 0) {
    throw new Error(`Uno o più campi non sono autorizzati per questo utente (${missing.length}).`);
  }
}

export async function assertProductionUnitAccess(
  userId: string,
  productionUnitId: string,
): Promise<void> {
  const row = await prisma.productionUnit.findFirst({
    where: {
      id: productionUnitId,
      productionUnitsOnFields: {
        some: { field: { company: { companyUsers: { some: { userId } } } } },
      },
    },
    select: { id: true },
  });
  if (!row) {
    throw new Error('Unità produttiva non trovata o non autorizzata per questo utente.');
  }
}

export async function assertProductionUnitsAccess(
  userId: string,
  productionUnitIds: readonly string[],
): Promise<void> {
  const ids = unique(productionUnitIds);
  if (ids.length === 0) {
    throw new Error('Nessuna unità produttiva da validare.');
  }
  const rows = await prisma.productionUnit.findMany({
    where: {
      id: { in: ids },
      productionUnitsOnFields: {
        some: { field: { company: { companyUsers: { some: { userId } } } } },
      },
    },
    select: { id: true },
  });
  const authorizedIds = new Set(rows.map((row) => row.id));
  const missing = ids.filter((id) => !authorizedIds.has(id));
  if (missing.length > 0) {
    throw new Error(
      `Una o più unità produttive non sono autorizzate per questo utente (${missing.length}).`,
    );
  }
}

export async function assertWorkspaceAccess(userId: string, workspaceId: string): Promise<void> {
  const row = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { id: true },
  });
  if (!row) {
    throw new Error('Workspace non trovato o non autorizzato per questo utente.');
  }
}
