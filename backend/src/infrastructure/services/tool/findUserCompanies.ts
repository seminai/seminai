import { PrismaClient } from '@prisma/client';

/**
 * Company information returned by the search.
 */
export interface UserCompanyInfo {
  id: string;
  name: string;
  fiscalCode: string | null;
  vatNumber: string | null;
  city: string | null;
  cap: string | null;
  userRole: string;
  fieldsCount: number;
  productionUnitsCount: number;
  warehousesCount: number;
}

/**
 * Finds all companies accessible by the user.
 * Returns company details with counts of related entities.
 */
export async function findUserCompanies(params: {
  userId: string;
  searchTerm?: string;
  prisma: PrismaClient;
}): Promise<UserCompanyInfo[]> {
  const { userId, searchTerm, prisma } = params;

  try {
    const userCompanies = await prisma.userOnCompany.findMany({
      where: {
        userId,
        company: searchTerm
          ? {
              name: {
                contains: searchTerm,
                mode: 'insensitive',
              },
            }
          : undefined,
      },
      include: {
        company: {
          include: {
            _count: {
              select: {
                fields: true,
                warehouses: true,
              },
            },
            fields: {
              include: {
                productionUnitsOnFields: true,
              },
            },
          },
        },
      },
    });

    const companies: UserCompanyInfo[] = userCompanies.map((uc) => {
      // Count unique production units across all fields
      const productionUnitIds = new Set<string>();
      uc.company.fields.forEach((field) => {
        field.productionUnitsOnFields.forEach((link) => {
          productionUnitIds.add(link.productionUnitId);
        });
      });

      return {
        id: uc.company.id,
        name: uc.company.name,
        fiscalCode: uc.company.fiscalCode,
        vatNumber: uc.company.vatNumber,
        city: uc.company.city,
        cap: uc.company.cap,
        userRole: uc.role,
        fieldsCount: uc.company._count.fields,
        productionUnitsCount: productionUnitIds.size,
        warehousesCount: uc.company._count.warehouses,
      };
    });

    return companies;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to find user companies: ${errorMessage}`);
  }
}
