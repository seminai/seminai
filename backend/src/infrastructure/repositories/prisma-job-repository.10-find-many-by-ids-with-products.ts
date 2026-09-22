import { JobProductLinkDTO } from '../../domain/dtos/job-product-link.dto';
import type { PrismaJobRepositoryContext } from './prisma-job-repository.context';

export async function prismaJobRepositoryFindManyByIdsWithProducts(this: PrismaJobRepositoryContext, jobIds: string[]): Promise<JobProductLinkDTO[]> {
    if (jobIds.length === 0) {
      return [];
    }
    const jobs = await this.prisma.job.findMany({
      where: { id: { in: jobIds } },
      select: {
        id: true,
        stocks: {
          select: {
            product: {
              select: {
                id: true,
                name: true,
                registrationNumber: true,
              },
            },
          },
        },
      },
    });
    const jobsById = new Map(
      jobs.map((job) => {
        const products = Array.from(
          job.stocks
            .map((stock) => stock.product)
            .filter(
              (
                product,
              ): product is {
                id: string;
                name: string;
                registrationNumber: string | null;
              } => Boolean(product),
            )
            .reduce(
              (acc, product) =>
                acc.has(product.id)
                  ? acc
                  : acc.set(product.id, {
                      id: product.id,
                      name: product.name,
                      registrationNumber: product.registrationNumber,
                    }),
              new Map<
                string,
                {
                  readonly id: string;
                  readonly name: string;
                  readonly registrationNumber: string | null;
                }
              >(),
            )
            .values(),
        );
        return [
          job.id,
          {
            jobId: job.id,
            stockCount: job.stocks.length,
            products,
          } as JobProductLinkDTO,
        ];
      }),
    );
    return jobIds
      .map((jobId) => jobsById.get(jobId))
      .filter((item): item is JobProductLinkDTO => !!item);
  }
