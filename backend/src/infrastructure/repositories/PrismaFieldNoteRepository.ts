import { PrismaClient, Prisma } from '@prisma/client';
import { FieldNote } from '../../domain/entities/FieldNote';
import { FieldNoteAttachment } from '../../domain/entities/FieldNoteAttachment';
import {
  IFieldNoteRepository,
  FindFieldNotesFilters,
  UpdateFieldNoteData,
} from '../../domain/repositories/IFieldNoteRepository';

type FieldNoteWithRelations = Prisma.FieldNoteGetPayload<{
  include: {
    field: {
      include: {
        company: {
          select: {
            id: true;
            name: true;
          };
        };
      };
    };
    product: {
      include: {
        warehouse: {
          include: {
            company: {
              select: {
                id: true;
                name: true;
              };
            };
          };
        };
      };
    };
    productionUnit: {
      include: {
        productionUnitsOnFields: {
          include: {
            field: {
              select: {
                id: true;
                name: true;
              };
            };
          };
        };
      };
    };
  };
}>;

export class PrismaFieldNoteRepository implements IFieldNoteRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(fieldNote: FieldNote): Promise<FieldNote> {
    const created = await this.prisma.fieldNote.create({
      data: {
        id: fieldNote.id,
        userId: fieldNote.userId,
        category: fieldNote.category,
        status: fieldNote.status,
        rawContent: fieldNote.rawContent,
        extractedData: fieldNote.extractedData as Prisma.InputJsonValue,
        latitude: fieldNote.latitude,
        longitude: fieldNote.longitude,
        altitude: fieldNote.altitude,
        gpsAccuracy: fieldNote.gpsAccuracy,
        conformityNotes: fieldNote.conformityNotes as Prisma.InputJsonValue,
        operationDate: fieldNote.operationDate,
        fieldId: fieldNote.fieldId,
        productionUnitId: fieldNote.productionUnitId,
        productId: fieldNote.productId,
        jobId: fieldNote.jobId,
        metadata: fieldNote.metadata as Prisma.InputJsonValue,
        aiConfidenceScore: fieldNote.aiConfidenceScore,
        notes: fieldNote.notes,
        createdAt: fieldNote.createdAt,
        updatedAt: fieldNote.updatedAt,
      },
    });
    return FieldNote.fromPrisma(created);
  }

  async findById(id: string): Promise<FieldNote | null> {
    const fieldNote = await this.prisma.fieldNote.findUnique({
      where: { id },
    });
    if (!fieldNote) return null;
    return FieldNote.fromPrisma(fieldNote);
  }

  async findByIdWithRelations(id: string): Promise<FieldNote | null> {
    const fieldNote = await this.prisma.fieldNote.findUnique({
      where: { id },
      include: {
        user: true,
        field: {
          include: {
            company: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        productionUnit: true,
        product: {
          include: {
            warehouse: {
              include: {
                company: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
        job: true,
        attachments: true,
      },
    });
    if (!fieldNote) return null;
    return FieldNote.fromPrisma(fieldNote);
  }

  async findByIdWithRelationsForResponse(id: string): Promise<FieldNoteWithRelations | null> {
    const fieldNote = await this.prisma.fieldNote.findUnique({
      where: { id },
      include: {
        field: {
          include: {
            company: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        product: {
          include: {
            warehouse: {
              include: {
                company: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
        productionUnit: {
          include: {
            productionUnitsOnFields: {
              include: {
                field: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    return fieldNote;
  }

  async findAll(filters: FindFieldNotesFilters): Promise<FieldNote[]> {
    const where: Prisma.FieldNoteWhereInput = {};

    if (filters.userId) {
      where.userId = filters.userId;
    }
    if (filters.category) {
      where.category = filters.category;
    }
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.fieldId) {
      where.fieldId = filters.fieldId;
    }
    if (filters.productionUnitId) {
      where.productionUnitId = filters.productionUnitId;
    }
    if (filters.productId) {
      where.productId = filters.productId;
    }
    if (filters.startDate || filters.endDate) {
      where.operationDate = {};
      if (filters.startDate) {
        where.operationDate.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.operationDate.lte = filters.endDate;
      }
    }
    if (filters.hasLocation !== undefined) {
      if (filters.hasLocation) {
        where.AND = [{ latitude: { not: null } }, { longitude: { not: null } }];
      } else {
        where.OR = [{ latitude: null }, { longitude: null }];
      }
    }

    const fieldNotes = await this.prisma.fieldNote.findMany({
      where,
      include: {
        field: {
          include: {
            company: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        product: {
          include: {
            warehouse: {
              include: {
                company: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
        productionUnit: true,
        attachments: {
          select: {
            id: true,
            fileUrl: true,
            fileName: true,
            fileType: true,
            thumbnailUrl: true,
          },
        },
      },
      orderBy: { operationDate: 'desc' },
    });

    return fieldNotes.map((fn) => FieldNote.fromPrisma(fn));
  }

  async findAllWithRelations(filters: FindFieldNotesFilters): Promise<FieldNoteWithRelations[]> {
    const where: Prisma.FieldNoteWhereInput = {};

    if (filters.userId) {
      where.userId = filters.userId;
    }
    if (filters.category) {
      where.category = filters.category;
    }
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.fieldId) {
      where.fieldId = filters.fieldId;
    }
    if (filters.productionUnitId) {
      where.productionUnitId = filters.productionUnitId;
    }
    if (filters.productId) {
      where.productId = filters.productId;
    }
    if (filters.startDate || filters.endDate) {
      where.operationDate = {};
      if (filters.startDate) {
        where.operationDate.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.operationDate.lte = filters.endDate;
      }
    }
    if (filters.hasLocation !== undefined) {
      if (filters.hasLocation) {
        where.AND = [{ latitude: { not: null } }, { longitude: { not: null } }];
      } else {
        where.OR = [{ latitude: null }, { longitude: null }];
      }
    }

    const fieldNotes = await this.prisma.fieldNote.findMany({
      where,
      include: {
        field: {
          include: {
            company: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        product: {
          include: {
            warehouse: {
              include: {
                company: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
        productionUnit: {
          include: {
            productionUnitsOnFields: {
              include: {
                field: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
        attachments: {
          select: {
            id: true,
            fileUrl: true,
            fileName: true,
            fileType: true,
            thumbnailUrl: true,
          },
        },
      },
      orderBy: { operationDate: 'desc' },
    });

    return fieldNotes;
  }

  async findByUser(userId: string): Promise<FieldNote[]> {
    const fieldNotes = await this.prisma.fieldNote.findMany({
      where: { userId },
      orderBy: { operationDate: 'desc' },
    });
    return fieldNotes.map(FieldNote.fromPrisma);
  }

  async findPendingProcessing(): Promise<FieldNote[]> {
    const fieldNotes = await this.prisma.fieldNote.findMany({
      where: {
        status: 'PENDING',
      },
      orderBy: { createdAt: 'asc' },
    });
    return fieldNotes.map(FieldNote.fromPrisma);
  }

  async update(id: string, data: UpdateFieldNoteData): Promise<FieldNote> {
    const updated = await this.prisma.fieldNote.update({
      where: { id },
      data: {
        category: data.category,
        status: data.status,
        rawContent: data.rawContent,
        extractedData: data.extractedData as Prisma.InputJsonValue,
        latitude: data.latitude,
        longitude: data.longitude,
        altitude: data.altitude,
        gpsAccuracy: data.gpsAccuracy,
        conformityNotes: data.conformityNotes as Prisma.InputJsonValue,
        operationDate: data.operationDate,
        fieldId: data.fieldId,
        productionUnitId: data.productionUnitId,
        productId: data.productId,
        jobId: data.jobId,
        metadata: data.metadata as Prisma.InputJsonValue,
        aiConfidenceScore: data.aiConfidenceScore,
        notes: data.notes,
        updatedAt: new Date(),
      },
    });
    return FieldNote.fromPrisma(updated);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.fieldNote.delete({
      where: { id },
    });
  }

  async deleteAllByCompanyId(companyId: string): Promise<number> {
    const result = await this.prisma.fieldNote.deleteMany({
      where: {
        OR: [
          { field: { companyId } },
          {
            productionUnit: {
              productionUnitsOnFields: { some: { field: { companyId } } },
            },
          },
          { product: { warehouse: { companyId } } },
        ],
      },
    });
    return result.count;
  }

  async addAttachment(attachment: FieldNoteAttachment): Promise<FieldNoteAttachment> {
    const created = await this.prisma.fieldNoteAttachment.create({
      data: {
        id: attachment.id,
        fieldNoteId: attachment.fieldNoteId,
        fileUrl: attachment.fileUrl,
        fileName: attachment.fileName,
        fileType: attachment.fileType,
        fileSize: attachment.fileSize,
        thumbnailUrl: attachment.thumbnailUrl,
        metadata: attachment.metadata as Prisma.InputJsonValue,
        aiAnalysis: attachment.aiAnalysis as Prisma.InputJsonValue,
        createdAt: attachment.createdAt,
      },
    });
    return FieldNoteAttachment.fromPrisma(created);
  }

  async findAttachmentsByFieldNoteId(fieldNoteId: string): Promise<FieldNoteAttachment[]> {
    const attachments = await this.prisma.fieldNoteAttachment.findMany({
      where: { fieldNoteId },
      orderBy: { createdAt: 'asc' },
    });
    return attachments.map(FieldNoteAttachment.fromPrisma);
  }

  async deleteAttachment(attachmentId: string): Promise<void> {
    await this.prisma.fieldNoteAttachment.delete({
      where: { id: attachmentId },
    });
  }

  async countByStatus(userId: string): Promise<Record<string, number>> {
    const counts = await this.prisma.fieldNote.groupBy({
      by: ['status'],
      where: { userId },
      _count: { status: true },
    });

    const result: Record<string, number> = {
      PENDING: 0,
      PROCESSING: 0,
      PROCESSED: 0,
      FAILED: 0,
      MANUALLY_REVIEWED: 0,
    };

    counts.forEach((count) => {
      result[count.status] = count._count.status;
    });

    return result;
  }

  async findNearbyFieldNotes(
    latitude: number,
    longitude: number,
    radiusMeters: number,
  ): Promise<FieldNote[]> {
    // Haversine formula approximation using raw SQL
    // Note: This is a simplified approach. For production, consider using PostGIS
    const radiusInDegrees = radiusMeters / 111320; // Rough conversion

    const fieldNotes = await this.prisma.$queryRaw<any[]>`
      SELECT *
      FROM "FieldNote"
      WHERE latitude IS NOT NULL
        AND longitude IS NOT NULL
        AND (
          POW(69.1 * (latitude - ${latitude}), 2) +
          POW(69.1 * (${longitude} - longitude) * COS(latitude / 57.3), 2)
        ) < POW(${radiusInDegrees * 69.1}, 2)
      ORDER BY (
        POW(69.1 * (latitude - ${latitude}), 2) +
        POW(69.1 * (${longitude} - longitude) * COS(latitude / 57.3), 2)
      )
    `;

    return fieldNotes.map((fn) =>
      FieldNote.fromPrisma({
        ...fn,
        operationDate: new Date(fn.operationDate),
        createdAt: new Date(fn.createdAt),
        updatedAt: new Date(fn.updatedAt),
      }),
    );
  }
}
