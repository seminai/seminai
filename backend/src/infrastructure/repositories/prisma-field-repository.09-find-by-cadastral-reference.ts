import { Field } from '../../domain/entities/Field';
import type { PrismaFieldRepositoryContext } from './prisma-field-repository.context';

export async function prismaFieldRepositoryFindByCadastralReference(this: PrismaFieldRepositoryContext, params: {
    companyId: string;
    sezione?: string | null;
    foglio: string;
    particella: string;
    subalterno?: string | null;
  }): Promise<Field | null> {
    const { companyId, sezione, foglio, particella, subalterno } = params;
    const found = await this.prisma.field.findFirst({
      where: {
        companyId,
        foglio,
        particella,
        sezione: sezione ?? undefined,
        subalterno: subalterno ?? undefined,
      },
    });
    return found ? Field.fromPrisma(found) : null;
  }
