/**
 * Integration test buckets by cost/type.
 *
 * FAST     - DB/Prisma only, no LLM, no OCR. Always run in pre-push.
 * LLM      - calls OpenAI/Anthropic/langchain. Run on-demand or via smart-select.
 * OCR      - PDF/image/audio/CSV extraction. On-demand or via smart-select.
 * EXTERNAL - depends on live external APIs (e.g. BDF WS). Manual only.
 */

const FAST = [
  'auth',
  'user',
  'user-on-company',
  'workspace',
  'settings',
  'company',
  'product',
  'product-bulk',
  'product-and-job-bulk',
  'job',
  'job-cross-tenant',
  'job-assign',
  'fill-the-job',
  'create-jobs-agronomic-gate',
  'agronomic-guardrails-real-data',
  'field',
  'stock',
  'warehouse',
  'patentino',
  'rule',
  'production-unit',
  'import-from-file',
  'group-invoice-suggested-products-with-stocks',
  'agent-memory',
  'socket-dual-channel',
  'bdf-cache',
  'field-note-cross-tenant',
  'workspace-rule-cross-tenant',
  'extraction-api',
  'manufacture-react-agent-tools',
];

const LLM = [
  'agent-chat',
  'agent-chat-controller',
  'agent-task',
  'outer-loop',
  'dosage-agent',
  'dosage-agent-queue',
  'dosage-agent-historical-benchmark',
  'dosage-planning-chat',
  'dosage-react-agent',
  'dosage-react-agent-mention-bug',
  'manufacture-react-agent',
  'dosage-disciplinari-context',
  'chat-dosage-agent-modifications',
  'field-note-agent',
  'field-note-agent-streaming',
  'double-approve-idempotent',
  'field-note-persistence-roundtrip',
  'stock-tools',
  'job-verification-agent',
  'conformity-checker',
  'fertilizer-agent',
  'context-compressor',
  'risk-classifier',
  'subagent-spawning',
  'tool-result-injection',
  'propose-form-patch-tools',
  'category-classifier',
];

const OCR = [
  'invoice-extraction-quality',
  'ocr-benchmark',
  'disciplinari-extraction',
  'disciplinari-pdf-vector-index',
  'rule-rag-extraction',
  'piano-colturale-pdf-extraction',
  'pcg-geojson-extraction',
  'audio-to-text',
  'batch-extraction',
  'brogliaccio-pipeline',
  'stock-upload-ddt-classifier',
  'field-extraction',
  'field-extraction-formats',
  'agea-pac-codification',
  'company-csv-extraction',
  'production-unit-csv-extraction',
  'production-unit-csv-comparison',
  'production-unit-csv-table',
  'registration-enrichment',
  'extraction-api-accuracy',
];

const EXTERNAL = ['bdf'];

// Deterministic integration coverage that is safe to run in a clean public
// checkout. It intentionally excludes live providers, private fixtures, OCR
// documents, and third-party HTTP APIs.
const PUBLIC = [
  ...FAST,
  'agent-chat-attachments',
  'auto-present-mentions-isolation',
  'chat-extraction-message-writer',
  'chat-sequence-lock',
  'client-follow-up',
  'commercial-inbox',
  'company-rules-service',
  'courier-summary',
  'extraction-schemas-line-validation',
  'fertilizer-plan',
  'file-extraction-edit-log',
  'manufacturing-extraction',
  'map-invoice-review-to-extraction-data',
  'normalize-extraction',
  'order-template-import',
  'proforma',
  'sales-ddt',
  'sales-invoice',
];

const toTestMatch = (names) =>
  names.map((name) => `**/integration-test/${name}.integration.test.ts`);

module.exports = { FAST, LLM, OCR, EXTERNAL, PUBLIC, toTestMatch };
