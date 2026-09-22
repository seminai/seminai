/**
 * End-to-end di estrazione sulla pipeline reale (OCR + LLM).
 * Uso: `npx tsx --env-file=.env scripts/e2e-extraction.ts <kind> <path>`
 * dove `<kind>` è `invoice` o `ddt`.
 */
import path from 'path';
import { fileURLToPath } from 'url';

// Polyfill CommonJS globals because the project uses __dirname inside services
// loaded here, but tsx executes this script under native ESM ("type": "module").
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
(globalThis as unknown as { __dirname: string; __filename: string }).__dirname = projectRoot;
(globalThis as unknown as { __dirname: string; __filename: string }).__filename = path.join(
  projectRoot,
  'e2e-runner.ts',
);

const { DocumentExtractionOrchestrator } = await import(
  '../src/infrastructure/services/extraction/document-extraction-orchestrator'
);
const { DEFAULT_OCR_PROVIDER } = await import('../src/infrastructure/services/ocr/ocr-provider');

async function main(): Promise<void> {
  const [, , kindRaw, filePathRaw] = process.argv;
  if (!kindRaw || !filePathRaw) {
    console.error('Usage: tsx scripts/e2e-extraction.ts <invoice|ddt> <path>');
    process.exit(1);
  }
  const kind = kindRaw === 'ddt' ? 'ddt' : 'invoice';
  const filePath = path.resolve(filePathRaw);
  console.log(`\n=== E2E ${kind.toUpperCase()} on ${filePath} ===`);
  console.log(`OCR provider (default): ${DEFAULT_OCR_PROVIDER}`);
  const orchestrator = new DocumentExtractionOrchestrator();
  const started = Date.now();
  const result = await orchestrator.execute({ kind, filePath });
  const ms = Date.now() - started;
  console.log(
    `\n=== DONE in ${ms}ms — kind=${result.kind}, entries=${result.entries.length}, needsReview=${result.needsReviewCount} ===`,
  );
  result.entries.forEach((entry, i) => {
    const asAny = entry as Record<string, unknown>;
    const row = {
      n: i + 1,
      productName: asAny.productName,
      registrationNumber: asAny.registrationNumber,
      category: asAny.productCategory,
      quantity: asAny.quantity,
      UM: asAny.quantityUnitOfMeasure,
      unitPrice: asAny.unitPrice,
      totalPrice: asAny.totalPrice,
      supplier: asAny.supplierName,
      number: asAny.invoiceNumber ?? asAny.orderNumber,
      date: asAny.invoiceDate ?? asAny.ddtDate,
      needsReview: asAny.needsReview,
      reviewReasons: asAny.reviewReasons,
    };
    console.log(JSON.stringify(row));
  });
  console.log('\n=== STOCK PREVIEW ===');
  result.stockEntries.slice(0, 5).forEach((s) => {
    console.log(
      `• ${s.name} — ${s.stock.quantity} ${s.stock.unitOfMeasureQuantity} @ ${s.stock.price} (${s.stock.companySupplierName ?? 'N/A'})`,
    );
  });
}

main().catch((error) => {
  console.error('\nE2E extraction failed:', error);
  process.exit(1);
});
