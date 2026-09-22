import 'dotenv/config';
import { bootstrapInstanceSecrets } from '../runtime/bootstrapSecrets';
import { validateRuntimeEnv } from '../runtime/validateRuntimeEnv';
import { applyPersistedInstanceSettings } from '../settings/instanceSettingSingleton';
import { getAnalyticsService } from '../services/analytics/analytics-service.singleton';
import { getLabelExtractionQueue } from '../queue/LabelExtractionQueue';
import { getLabelRefreshQueue } from '../queue/LabelRefreshQueue';
import { getDosageAgentQueue } from '../queue/DosageAgentQueue';
import { getFieldExtractionQueue } from '../queue/FieldExtractionQueue';
import { getProductLabelMatchingQueue } from '../queue/ProductLabelMatchingQueue';
import { getFileExpiryCheckerQueue } from '../queue/FileExpiryCheckerQueue';
import { getClientFollowUpQueue } from '../queue/ClientFollowUpQueue';
import { getQdcSyncQueue } from '../queue/QdcSyncQueue';
import { getOuterLoopProcessorQueue } from '../queue/OuterLoopProcessorQueue';
import { getAgentStreamEventCleanupQueue } from '../queue/AgentStreamEventCleanupQueue';

bootstrapInstanceSecrets();
validateRuntimeEnv();
void applyPersistedInstanceSettings();

console.log('[WORKER] Starting background workers...');
console.log('[WORKER] Environment:', process.env.NODE_ENV);
console.log('[WORKER] Redis URL:', process.env.UPSTASH_REDIS_REST_URL ? 'configured' : 'missing');
console.log(
  '[WORKER] Redis Token:',
  process.env.UPSTASH_REDIS_REST_TOKEN ? 'configured' : 'missing',
);

try {
  console.log('[WORKER] Initializing label extraction worker...');
  getLabelExtractionQueue();
  console.log('[WORKER] ✅ Label extraction worker started successfully');
} catch (error) {
  console.error('[WORKER] ❌ Failed to start label extraction worker:', error);
  process.exit(1);
}

try {
  console.log('[WORKER] Initializing label refresh worker...');
  getLabelRefreshQueue({ startWorker: true });
  console.log('[WORKER] ✅ Label refresh worker started successfully');
} catch (error) {
  console.error('[WORKER] ❌ Failed to start label refresh worker:', error);
  process.exit(1);
}

try {
  console.log('[WORKER] Initializing dosage agent worker...');
  getDosageAgentQueue();
  console.log('[WORKER] ✅ Dosage agent worker started successfully');
} catch (error) {
  console.error('[WORKER] ❌ Failed to start dosage agent worker:', error);
  process.exit(1);
}

try {
  console.log('[WORKER] Initializing field extraction worker...');
  getFieldExtractionQueue();
  console.log('[WORKER] ✅ Field extraction worker started successfully');
} catch (error) {
  console.error('[WORKER] ❌ Failed to start field extraction worker:', error);
  process.exit(1);
}

try {
  console.log('[WORKER] Initializing product label matching worker...');
  getProductLabelMatchingQueue();
  console.log('[WORKER] ✅ Product label matching worker started successfully');
} catch (error) {
  console.error('[WORKER] ❌ Failed to start product label matching worker:', error);
  process.exit(1);
}

try {
  console.log('[WORKER] Initializing file expiry checker worker...');
  getFileExpiryCheckerQueue();
  console.log('[WORKER] ✅ File expiry checker worker started successfully');
} catch (error) {
  console.error('[WORKER] ❌ Failed to start file expiry checker worker:', error);
  process.exit(1);
}

try {
  console.log('[WORKER] Initializing client follow-up worker...');
  getClientFollowUpQueue();
  console.log('[WORKER] ✅ Client follow-up worker started successfully');
} catch (error) {
  console.error('[WORKER] ❌ Failed to start client follow-up worker:', error);
  process.exit(1);
}

try {
  console.log('[WORKER] Initializing QDC sync worker...');
  getQdcSyncQueue({ startWorker: true });
  console.log('[WORKER] ✅ QDC sync worker started successfully');
} catch (error) {
  console.error('[WORKER] ❌ Failed to start QDC sync worker:', error);
  process.exit(1);
}

try {
  console.log('[WORKER] Initializing outer loop processor worker...');
  getOuterLoopProcessorQueue();
  console.log('[WORKER] ✅ Outer loop processor worker started successfully');
} catch (error) {
  console.error('[WORKER] ❌ Failed to start outer loop processor worker:', error);
  process.exit(1);
}

try {
  console.log('[WORKER] Initializing agent stream event cleanup worker...');
  getAgentStreamEventCleanupQueue();
  console.log('[WORKER] ✅ Agent stream event cleanup worker started successfully');
} catch (error) {
  console.error('[WORKER] ❌ Failed to start agent stream event cleanup worker:', error);
  process.exit(1);
}

console.log('[WORKER] 🚀 All workers are running. Press Ctrl+C to stop.');

// The dosage agent (and its LLM calls) run in THIS process, so PostHog events
// are emitted here. Flush them before exiting or they would be lost on SIGTERM.
async function shutdownWorker(signal: string): Promise<void> {
  console.log(`[WORKER] ${signal} received, shutting down gracefully...`);
  try {
    await getAnalyticsService().shutdown();
    console.log('[WORKER] PostHog analytics flushed');
  } catch (error) {
    console.error('[WORKER] Error flushing analytics on shutdown:', error);
  } finally {
    process.exit(0);
  }
}

process.on('SIGTERM', () => void shutdownWorker('SIGTERM'));
process.on('SIGINT', () => void shutdownWorker('SIGINT'));

setInterval(() => {
  const timestamp = new Date().toISOString();
  console.log(`[WORKER] ${timestamp} - Heartbeat: workers still running`);
}, 60000);
