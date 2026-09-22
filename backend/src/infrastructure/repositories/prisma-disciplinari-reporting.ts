import { DisciplinariExtraction, PrismaClient } from '@prisma/client';
import {
  DisciplinariExtractionSummary,
  DisciplinariValidityCheck,
} from '../../domain/dtos/disciplinari.dto';

export const listDisciplinariSummary = async (
  prisma: PrismaClient,
): Promise<DisciplinariExtractionSummary[]> => {
  const extractions = await prisma.disciplinariExtraction.findMany({
    select: {
      id: true,
      fileName: true,
      region: true,
      year: true,
      title: true,
      validFrom: true,
      validUntil: true,
      isExpired: true,
      extractionConfidence: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ year: 'desc' }, { region: 'asc' }, { title: 'asc' }],
  });
  return extractions;
};

export const checkDisciplinariValidity = (
  extractions: DisciplinariExtraction[],
): DisciplinariValidityCheck => {
  if (extractions.length === 0) {
    return {
      exists: false,
      isValid: false,
      isExpired: false,
      validUntil: null,
      needsUpdate: true,
      lastUpdated: null,
    };
  }
  const latest = extractions[0];
  const isExpired = latest.validUntil ? latest.validUntil < new Date() : false;
  return {
    exists: true,
    isValid: !isExpired,
    isExpired,
    validUntil: latest.validUntil,
    needsUpdate: isExpired,
    lastUpdated: latest.updatedAt,
  };
};

export const countDisciplinariByRegion = async (
  prisma: PrismaClient,
): Promise<Array<{ region: string; count: number }>> => {
  const result = await prisma.disciplinariExtraction.groupBy({
    by: ['region'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });
  return result.map(({ region, _count }) => ({ region, count: _count.id }));
};

export const getDisciplinariStats = async (prisma: PrismaClient) => {
  const [total, expired, byRegion, byYear, average] = await Promise.all([
    prisma.disciplinariExtraction.count(),
    prisma.disciplinariExtraction.count({ where: { isExpired: true } }),
    countDisciplinariByRegion(prisma),
    prisma.disciplinariExtraction.groupBy({
      by: ['year'],
      _count: { id: true },
      orderBy: { year: 'desc' },
    }),
    prisma.disciplinariExtraction.aggregate({ _avg: { extractionConfidence: true } }),
  ]);
  return {
    total,
    expired,
    valid: total - expired,
    avgConfidence: average._avg.extractionConfidence ?? 0,
    byRegion,
    byYear: byYear.map(({ year, _count }) => ({ year, count: _count.id })),
  };
};
