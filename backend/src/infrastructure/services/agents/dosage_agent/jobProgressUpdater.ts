import { prisma } from '../../../repositories/Prisma';
import { PrismaDosageAgentJobRepository } from '../../../repositories/PrismaDosageAgentJobRepository';

/**
 * Genera un nome descrittivo per il job
 */
export function generateJobName(
  companyName: string,
  productCount: number,
  unitCount: number,
): string {
  const date = new Date();
  const dateStr = date.toLocaleDateString('it-IT', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return `${companyName} - ${dateStr} - ${productCount} prodotti - ${unitCount} unità`;
}

/**
 * Aggiorna il progresso del job principale basato sui job aziendali completati
 */
export async function updateMainJobProgress(
  mainJobId: string | undefined,
  userId: string | undefined,
  completedCount: number,
  totalCount: number,
): Promise<void> {
  if (!mainJobId || !userId) {
    return;
  }

  const dosageAgentJobRepository = new PrismaDosageAgentJobRepository(prisma);
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const progressText = `${completedCount} su ${totalCount}`;

  try {
    // Recupera il nome attuale del job principale
    const currentJob = await dosageAgentJobRepository.findById(mainJobId);
    let baseName = 'Pianificazione Dosaggi';

    if (currentJob?.name) {
      // Se il nome contiene già "su X aziende", estrai solo la parte base
      const nameParts = currentJob.name.split(' - ');
      if (nameParts.length > 1 && nameParts[nameParts.length - 1].includes('aziende')) {
        baseName = nameParts.slice(0, -1).join(' - ');
      } else {
        baseName = currentJob.name;
      }
    }

    // Aggiorna il nome includendo il progresso "X su Y"
    const updatedName = totalCount > 1 ? `${baseName} - ${progressText} aziende` : baseName;

    await dosageAgentJobRepository.updateStatus({
      jobId: mainJobId,
      userId,
      progress,
      name: updatedName,
    });

    console.log(`[FLOWS] Main job ${mainJobId} progress updated: ${progressText} (${progress}%)`);
  } catch (error) {
    console.warn(`[FLOWS] Failed to update main job progress for ${mainJobId}:`, error);
  }
}
