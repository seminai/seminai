import { PrismaClient, File as PrismaFileModel } from '@prisma/client';
import { IFileRepository, FindExpiringParams } from '../../domain/repositories/IFileRepository';
import { File } from '../../domain/entities/File';

export class PrismaFileRepository implements IFileRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(file: File): Promise<File> {
    if (!file.id) {
      throw new Error('File.id must not be empty — generate a UUID before calling save()');
    }
    const data = {
      id: file.id,
      name: file.name,
      url: file.url,
      companyId: file.companyId,
      path: file.path ?? undefined,
      type: file.type ?? undefined,
      metadata: file.metadata ?? undefined,
      expiresAt: file.expiresAt ?? undefined,
      reminderDaysBefore: file.reminderDaysBefore ?? undefined,
      alertStatus: file.alertStatus ?? undefined,
    };

    const saved = await this.prisma.file.upsert({
      where: { id: file.id },
      update: data,
      create: data,
    });

    return this.toDomain(saved);
  }

  async findById(id: string): Promise<File | null> {
    const found = await this.prisma.file.findUnique({
      where: { id },
    });

    return found ? this.toDomain(found) : null;
  }

  async findByCompanyId(companyId: string): Promise<File[]> {
    const files = await this.prisma.file.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });

    return files.map((f) => this.toDomain(f));
  }

  async deleteBulk(ids: string[]): Promise<void> {
    await this.prisma.file.deleteMany({
      where: {
        id: {
          in: ids,
        },
      },
    });
  }

  async findByIds(ids: string[]): Promise<File[]> {
    const files = await this.prisma.file.findMany({
      where: {
        id: {
          in: ids,
        },
      },
    });

    return files.map((f) => this.toDomain(f));
  }

  async findExpiring(params: FindExpiringParams): Promise<File[]> {
    const files = await this.prisma.file.findMany({
      where: {
        expiresAt: { not: null, gte: params.referenceDate },
        alertStatus: { in: [...params.alertStatuses] },
      },
    });
    return files
      .map((f) => this.toDomain(f))
      .filter((f) => f.isWithinReminderWindow(params.referenceDate));
  }

  async updateAlertStatus(id: string, alertStatus: string): Promise<void> {
    await this.prisma.file.update({
      where: { id },
      data: { alertStatus },
    });
  }

  private toDomain(prismaFile: PrismaFileModel): File {
    return new File(
      prismaFile.id,
      prismaFile.name,
      prismaFile.url,
      prismaFile.companyId,
      prismaFile.path || undefined,
      prismaFile.type || undefined,
      prismaFile.metadata || undefined,
      prismaFile.createdAt,
      prismaFile.updatedAt,
      prismaFile.expiresAt || undefined,
      prismaFile.reminderDaysBefore || undefined,
      prismaFile.alertStatus || undefined,
    );
  }
}
