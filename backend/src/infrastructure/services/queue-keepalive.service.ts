/**
 * Servizio Keep-Alive Ottimizzato per Cloud Run
 *
 * Mantiene l'istanza Cloud Run attiva quando ci sono job in esecuzione,
 * prevenendo lo scale-to-zero e la perdita di job durante l'elaborazione.
 *
 * Funzionalità:
 * 1. Monitora tutte le code BullMQ (waiting, active, delayed)
 * 2. Esegue richieste HTTP periodiche per mantenere l'istanza attiva
 * 3. Retry automatico con backoff esponenziale in caso di errori
 * 4. Metriche dettagliate per debugging e monitoring
 * 5. Graceful shutdown quando non ci sono più job
 */

import { getLabelExtractionQueue } from '../queue/LabelExtractionQueue';
import { getDosageAgentQueue } from '../queue/DosageAgentQueue';
import { getFieldExtractionQueue } from '../queue/FieldExtractionQueue';
import { getFertilizerLabelExtractionQueue } from '../queue/FertilizerLabelExtractionQueue';
import { getConformityCheckerQueue } from '../queue/ConformityCheckerQueue';

// Intervalli ottimizzati per massimizzare l'affidabilità
const CHECK_INTERVAL_MS = 15_000; // Controlla ogni 15 secondi (più frequente)
const KEEP_ALIVE_INTERVAL_MS = 10_000; // Richiesta ogni 10 secondi (più sicuro)
const IDLE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minuti senza job = può spegnersi (più conservativo)
const REQUEST_TIMEOUT_MS = 5_000; // Timeout richiesta HTTP: 5 secondi
const MAX_RETRY_ATTEMPTS = 3; // Numero massimo di retry per richiesta

// Determina l'URL del server per il keep-alive
// In produzione Cloud Run, usa l'URL pubblico se disponibile
// Altrimenti usa localhost (per sviluppo locale)
function getServerUrl(): string {
  // Se SERVER_URL è esplicitamente configurato, usalo
  if (process.env.SERVER_URL) {
    return process.env.SERVER_URL;
  }

  // In produzione Cloud Run, prova a costruire l'URL dal servizio
  // Altrimenti usa localhost per sviluppo locale
  const port = process.env.PORT || 8081;
  // const host = process.env.HOST || '0.0.0.0';

  // Se siamo in produzione e abbiamo un URL pubblico, usalo
  // Altrimenti usa localhost (funziona solo se il servizio fa richiesta a se stesso)
  if (process.env.NODE_ENV === 'production' && process.env.CLOUD_RUN_SERVICE_URL) {
    return process.env.CLOUD_RUN_SERVICE_URL;
  }

  // Per sviluppo locale o quando il servizio fa richiesta a se stesso
  return `http://localhost:${port}`;
}

const SERVER_URL = getServerUrl();

// Interfacce per type safety
interface JobStats {
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
}

interface DetailedJobStatus {
  hasJobs: boolean;
  activeCount: number;
  waitingCount: number;
  delayedCount: number;
  estimatedTimeRemaining: number;
  queueStats: {
    label: JobStats;
    dosage: JobStats;
    field: JobStats;
    fertilizer: JobStats;
    conformity: JobStats;
  };
}

interface KeepAliveMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  lastSuccessTime: number | null;
  lastFailureTime: number | null;
  consecutiveFailures: number;
}

// Stato del servizio
let keepAliveInterval: NodeJS.Timeout | null = null;
let checkJobsInterval: NodeJS.Timeout | null = null;
let lastJobActivityTime = Date.now();
let isEnabled = false;

// Metriche di performance
const metrics: KeepAliveMetrics = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  lastSuccessTime: null,
  lastFailureTime: null,
  consecutiveFailures: 0,
};

/**
 * Controlla se ci sono job in attesa in tutte le code con dettagli completi
 */
async function checkForPendingJobsDetailed(): Promise<DetailedJobStatus> {
  try {
    const [labelStats, dosageStats, fieldStats, fertilizerStats, conformityStats] =
      await Promise.all([
        getLabelExtractionQueue().queue.getJobCounts(),
        getDosageAgentQueue().queue.getJobCounts(),
        getFieldExtractionQueue().queue.getJobCounts(),
        getFertilizerLabelExtractionQueue().queue.getJobCounts(),
        getConformityCheckerQueue().queue.getJobCounts(),
      ]);

    const activeCount =
      (labelStats.active ?? 0) +
      (dosageStats.active ?? 0) +
      (fieldStats.active ?? 0) +
      (fertilizerStats.active ?? 0) +
      (conformityStats.active ?? 0);

    const waitingCount =
      (labelStats.waiting ?? 0) +
      (dosageStats.waiting ?? 0) +
      (fieldStats.waiting ?? 0) +
      (fertilizerStats.waiting ?? 0) +
      (conformityStats.waiting ?? 0);

    const delayedCount =
      (labelStats.delayed ?? 0) +
      (dosageStats.delayed ?? 0) +
      (fieldStats.delayed ?? 0) +
      (fertilizerStats.delayed ?? 0) +
      (conformityStats.delayed ?? 0);

    const hasJobs = activeCount > 0 || waitingCount > 0 || delayedCount > 0;

    // Stima tempo rimanente (pessimistico: 15 min per job attivo)
    const estimatedTimeRemaining = activeCount * 15 * 60 * 1000;

    if (hasJobs) {
      lastJobActivityTime = Date.now();
      console.log(
        `[QUEUE-KEEPALIVE] 📊 Jobs detected - Active: ${activeCount}, Waiting: ${waitingCount}, Delayed: ${delayedCount}`,
      );
      console.log(
        `[QUEUE-KEEPALIVE] 📋 Details - Label: ${labelStats.active}/${labelStats.waiting}, Dosage: ${dosageStats.active}/${dosageStats.waiting}, Field: ${fieldStats.active}/${fieldStats.waiting}, Fertilizer: ${fertilizerStats.active}/${fertilizerStats.waiting}, Conformity: ${conformityStats.active}/${conformityStats.waiting}`,
      );
      if (estimatedTimeRemaining > 0) {
        console.log(
          `[QUEUE-KEEPALIVE] ⏱️  Estimated time remaining: ${Math.round(estimatedTimeRemaining / 60000)} minutes`,
        );
      }
    }

    return {
      hasJobs,
      activeCount,
      waitingCount,
      delayedCount,
      estimatedTimeRemaining,
      queueStats: {
        label: {
          waiting: labelStats.waiting ?? 0,
          active: labelStats.active ?? 0,
          delayed: labelStats.delayed ?? 0,
          completed: labelStats.completed ?? 0,
          failed: labelStats.failed ?? 0,
        },
        dosage: {
          waiting: dosageStats.waiting ?? 0,
          active: dosageStats.active ?? 0,
          delayed: dosageStats.delayed ?? 0,
          completed: dosageStats.completed ?? 0,
          failed: dosageStats.failed ?? 0,
        },
        field: {
          waiting: fieldStats.waiting ?? 0,
          active: fieldStats.active ?? 0,
          delayed: fieldStats.delayed ?? 0,
          completed: fieldStats.completed ?? 0,
          failed: fieldStats.failed ?? 0,
        },
        fertilizer: {
          waiting: fertilizerStats.waiting ?? 0,
          active: fertilizerStats.active ?? 0,
          delayed: fertilizerStats.delayed ?? 0,
          completed: fertilizerStats.completed ?? 0,
          failed: fertilizerStats.failed ?? 0,
        },
        conformity: {
          waiting: conformityStats.waiting ?? 0,
          active: conformityStats.active ?? 0,
          delayed: conformityStats.delayed ?? 0,
          completed: conformityStats.completed ?? 0,
          failed: conformityStats.failed ?? 0,
        },
      },
    };
  } catch (error) {
    console.error('[QUEUE-KEEPALIVE] ❌ Error checking for pending jobs:', error);
    // In caso di errore, mantieni attivo per sicurezza
    return {
      hasJobs: true,
      activeCount: 0,
      waitingCount: 0,
      delayedCount: 0,
      estimatedTimeRemaining: 0,
      queueStats: {
        label: { waiting: 0, active: 0, delayed: 0, completed: 0, failed: 0 },
        dosage: { waiting: 0, active: 0, delayed: 0, completed: 0, failed: 0 },
        field: { waiting: 0, active: 0, delayed: 0, completed: 0, failed: 0 },
        fertilizer: { waiting: 0, active: 0, delayed: 0, completed: 0, failed: 0 },
        conformity: { waiting: 0, active: 0, delayed: 0, completed: 0, failed: 0 },
      },
    };
  }
}

/**
 * Esegue una richiesta HTTP con timeout per mantenere l'istanza attiva
 */
async function performKeepAliveWithRetry(maxRetries: number = MAX_RETRY_ATTEMPTS): Promise<void> {
  metrics.totalRequests++;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch(`${SERVER_URL}/health`, {
        method: 'GET',
        headers: {
          'User-Agent': 'queue-keepalive-service',
          'X-Keep-Alive': 'true',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        metrics.successfulRequests++;
        metrics.lastSuccessTime = Date.now();
        metrics.consecutiveFailures = 0;

        if (attempt > 1) {
          console.log(
            `[QUEUE-KEEPALIVE] ✅ Keep-alive successful on attempt ${attempt}/${maxRetries}`,
          );
        } else {
          console.log(`[QUEUE-KEEPALIVE] ✅ Keep-alive ping successful`);
        }

        return;
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      metrics.failedRequests++;
      metrics.lastFailureTime = Date.now();
      metrics.consecutiveFailures++;

      const isLastAttempt = attempt === maxRetries;
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (isLastAttempt) {
        console.error(
          `[QUEUE-KEEPALIVE] ❌ All ${maxRetries} keep-alive attempts failed. Last error: ${errorMessage}`,
        );
        console.error(
          `[QUEUE-KEEPALIVE] 📊 Metrics - Total: ${metrics.totalRequests}, Success: ${metrics.successfulRequests}, Failed: ${metrics.failedRequests}, Consecutive failures: ${metrics.consecutiveFailures}`,
        );

        // Alert se ci sono troppi fallimenti consecutivi
        if (metrics.consecutiveFailures >= 5) {
          console.error(
            `[QUEUE-KEEPALIVE] 🚨 CRITICAL: ${metrics.consecutiveFailures} consecutive failures! Instance may scale down and lose jobs!`,
          );
        }
      } else {
        console.warn(
          `[QUEUE-KEEPALIVE] ⚠️  Keep-alive attempt ${attempt}/${maxRetries} failed: ${errorMessage}`,
        );

        // Backoff esponenziale: 1s, 2s, 4s
        const backoffMs = 1000 * Math.pow(2, attempt - 1);
        console.log(`[QUEUE-KEEPALIVE] ⏳ Retrying in ${backoffMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }
}

/**
 * Avvia il servizio di keep-alive basato sui job in coda
 */
export function startQueueKeepAliveService(): void {
  if (isEnabled) {
    console.log('[QUEUE-KEEPALIVE] ℹ️  Service already running');
    return;
  }

  isEnabled = true;
  console.log('[QUEUE-KEEPALIVE] 🚀 Starting optimized queue keep-alive service');
  console.log(`[QUEUE-KEEPALIVE] ⚙️  Configuration:`);
  console.log(`[QUEUE-KEEPALIVE]    - Check interval: ${CHECK_INTERVAL_MS / 1000}s`);
  console.log(`[QUEUE-KEEPALIVE]    - Keep-alive interval: ${KEEP_ALIVE_INTERVAL_MS / 1000}s`);
  console.log(`[QUEUE-KEEPALIVE]    - Idle timeout: ${IDLE_TIMEOUT_MS / 1000}s`);
  console.log(`[QUEUE-KEEPALIVE]    - Request timeout: ${REQUEST_TIMEOUT_MS / 1000}s`);
  console.log(`[QUEUE-KEEPALIVE]    - Max retry attempts: ${MAX_RETRY_ATTEMPTS}`);
  console.log(`[QUEUE-KEEPALIVE]    - Server URL: ${SERVER_URL}`);

  // Controlla periodicamente se ci sono job e gestisce il keep-alive
  checkJobsInterval = setInterval(async () => {
    const jobStatus = await checkForPendingJobsDetailed();
    const idleTime = Date.now() - lastJobActivityTime;
    const idleSeconds = Math.round(idleTime / 1000);

    if (jobStatus.hasJobs) {
      // Ci sono job: avvia keep-alive se non è già attivo
      if (!keepAliveInterval) {
        console.log('[QUEUE-KEEPALIVE] 🔄 Jobs detected - starting keep-alive mechanism');
        keepAliveInterval = setInterval(() => performKeepAliveWithRetry(), KEEP_ALIVE_INTERVAL_MS);
        // Fai subito una richiesta
        await performKeepAliveWithRetry();
      }
    } else {
      // Non ci sono job: ferma keep-alive se è attivo dopo il timeout
      if (keepAliveInterval) {
        if (idleTime > IDLE_TIMEOUT_MS) {
          console.log(
            `[QUEUE-KEEPALIVE] 💤 No jobs for ${idleSeconds}s - stopping keep-alive (instance can scale to zero)`,
          );
          console.log(
            `[QUEUE-KEEPALIVE] 📊 Final metrics - Success rate: ${metrics.successfulRequests}/${metrics.totalRequests} (${Math.round((metrics.successfulRequests / metrics.totalRequests) * 100)}%)`,
          );
          clearInterval(keepAliveInterval);
          keepAliveInterval = null;
        } else {
          const remainingSeconds = Math.round((IDLE_TIMEOUT_MS - idleTime) / 1000);
          console.log(
            `[QUEUE-KEEPALIVE] ⏳ No jobs for ${idleSeconds}s - keeping alive for ${remainingSeconds}s more`,
          );
        }
      }
    }
  }, CHECK_INTERVAL_MS);

  // Controlla subito se ci sono job
  void checkForPendingJobsDetailed().then((jobStatus) => {
    if (jobStatus.hasJobs) {
      console.log(
        `[QUEUE-KEEPALIVE] 🎯 Found ${jobStatus.activeCount + jobStatus.waitingCount} jobs on startup - keep-alive will activate`,
      );
    } else {
      console.log('[QUEUE-KEEPALIVE] ✅ No jobs on startup - waiting for new jobs');
    }
  });
}

/**
 * Ferma il servizio di keep-alive
 */
export function stopQueueKeepAliveService(): void {
  if (!isEnabled) {
    return;
  }

  isEnabled = false;
  console.log('[QUEUE-KEEPALIVE] 🛑 Stopping queue keep-alive service');

  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
    console.log('[QUEUE-KEEPALIVE] ✅ Keep-alive interval cleared');
  }

  if (checkJobsInterval) {
    clearInterval(checkJobsInterval);
    checkJobsInterval = null;
    console.log('[QUEUE-KEEPALIVE] ✅ Check jobs interval cleared');
  }

  // Log metriche finali
  if (metrics.totalRequests > 0) {
    const successRate = Math.round((metrics.successfulRequests / metrics.totalRequests) * 100);
    console.log('[QUEUE-KEEPALIVE] 📊 Final statistics:');
    console.log(`[QUEUE-KEEPALIVE]    - Total requests: ${metrics.totalRequests}`);
    console.log(
      `[QUEUE-KEEPALIVE]    - Successful: ${metrics.successfulRequests} (${successRate}%)`,
    );
    console.log(`[QUEUE-KEEPALIVE]    - Failed: ${metrics.failedRequests}`);
    console.log(`[QUEUE-KEEPALIVE]    - Consecutive failures: ${metrics.consecutiveFailures}`);
  }
}

/**
 * Ottiene le metriche correnti del keep-alive service
 */
export function getKeepAliveMetrics(): KeepAliveMetrics & { isEnabled: boolean } {
  return {
    ...metrics,
    isEnabled,
  };
}

/**
 * Resetta le metriche del keep-alive service
 */
export function resetKeepAliveMetrics(): void {
  metrics.totalRequests = 0;
  metrics.successfulRequests = 0;
  metrics.failedRequests = 0;
  metrics.lastSuccessTime = null;
  metrics.lastFailureTime = null;
  metrics.consecutiveFailures = 0;
  console.log('[QUEUE-KEEPALIVE] 📊 Metrics reset');
}
