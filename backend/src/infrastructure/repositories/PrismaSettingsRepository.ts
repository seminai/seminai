import { PrismaClient } from '@prisma/client';
import { Settings } from '../../domain/entities/Settings';
import { ISettingsRepository } from '../../domain/repositories/ISettingsRepository';

export class PrismaSettingsRepository implements ISettingsRepository {
  constructor(private prisma: PrismaClient) {}

  async create(settings: Settings): Promise<Settings> {
    const created = await this.prisma.settings.create({
      data: {
        id: settings.id,
        userId: settings.userId,
        language: settings.language,
        qdcApiKey: settings.qdcApiKey,
        ifarmingApiKey: settings.ifarmingApiKey,
        tablesViewMode: settings.tablesViewMode,
        whatsappInstanceName: settings.whatsappInstanceName,
        whatsappApiKey: settings.whatsappApiKey,
        whatsappInstanceId: settings.whatsappInstanceId,
        whatsappConnected: settings.whatsappConnected,
        whatsappPhoneNumber: settings.whatsappPhoneNumber,
        whatsappQrCode: settings.whatsappQrCode,
        whatsappAllowedNumbers: settings.whatsappAllowedNumbers,
        whatsappLastSync: settings.whatsappLastSync,
        openMeteoEnabled: settings.openMeteoEnabled,
        qdcSyncEnabled: settings.qdcSyncEnabled,
        createdAt: settings.createdAt,
        updatedAt: settings.updatedAt,
      },
    });
    return Settings.fromPrisma(created);
  }

  async findById(id: string): Promise<Settings | null> {
    const found = await this.prisma.settings.findUnique({ where: { id } });
    if (!found) return null;
    return Settings.fromPrisma(found);
  }

  async findByUserId(userId: string): Promise<Settings | null> {
    const found = await this.prisma.settings.findFirst({ where: { userId } });
    if (!found) return null;
    return Settings.fromPrisma(found);
  }

  async findByWhatsappInstanceName(instanceName: string): Promise<Settings | null> {
    const found = await this.prisma.settings.findFirst({
      where: { whatsappInstanceName: instanceName },
    });
    if (!found) return null;
    return Settings.fromPrisma(found);
  }

  async update(id: string, settingsData: Partial<Settings>): Promise<Settings> {
    const updated = await this.prisma.settings.update({
      where: { id },
      data: {
        language: settingsData.language,
        qdcApiKey: settingsData.qdcApiKey,
        ifarmingApiKey: settingsData.ifarmingApiKey,
        tablesViewMode: settingsData.tablesViewMode,
        whatsappInstanceName: settingsData.whatsappInstanceName,
        whatsappApiKey: settingsData.whatsappApiKey,
        whatsappInstanceId: settingsData.whatsappInstanceId,
        whatsappConnected: settingsData.whatsappConnected,
        whatsappPhoneNumber: settingsData.whatsappPhoneNumber,
        whatsappQrCode: settingsData.whatsappQrCode,
        whatsappAllowedNumbers: settingsData.whatsappAllowedNumbers,
        whatsappLastSync: settingsData.whatsappLastSync,
        updatedAt: new Date(),
      },
    });
    return Settings.fromPrisma(updated);
  }

  async updateWhatsAppConfig(
    id: string,
    whatsappConfig: {
      whatsappInstanceName?: string | null;
      whatsappApiKey?: string | null;
      whatsappInstanceId?: string | null;
      whatsappConnected?: boolean;
      whatsappPhoneNumber?: string | null;
      whatsappQrCode?: string | null;
      whatsappLastSync?: Date | null;
    },
  ): Promise<Settings> {
    const updated = await this.prisma.settings.update({
      where: { id },
      data: {
        ...whatsappConfig,
        updatedAt: new Date(),
      },
    });
    return Settings.fromPrisma(updated);
  }

  async updateEmailIngestionEnabled(id: string, enabled: boolean): Promise<Settings> {
    const updated = await this.prisma.settings.update({
      where: { id },
      data: {
        emailIngestionEnabled: enabled,
        updatedAt: new Date(),
      },
    });
    return Settings.fromPrisma(updated);
  }

  async updateOpenMeteoEnabled(id: string, enabled: boolean): Promise<Settings> {
    const updated = await this.prisma.settings.update({
      where: { id },
      data: {
        openMeteoEnabled: enabled,
        updatedAt: new Date(),
      },
    });
    return Settings.fromPrisma(updated);
  }

  async updateQdcSyncEnabled(id: string, enabled: boolean): Promise<Settings> {
    const updated = await this.prisma.settings.update({
      where: { id },
      data: {
        qdcSyncEnabled: enabled,
        updatedAt: new Date(),
      },
    });
    return Settings.fromPrisma(updated);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.settings.delete({ where: { id } });
  }
}
