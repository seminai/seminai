export const sourceRepositories = Object.freeze([
  Object.freeze({ name: 'backend', source: '../seminai-be-v2', ref: 'origin/main' }),
  Object.freeze({ name: 'frontend', source: '../seminai-fe-v3', ref: 'origin/main' }),
]);

export const excludedPathPatterns = Object.freeze([
  /(^|\/)\.env($|\.)/,
  /^\.claude\/settings\.local\.json$/,
  /(^|\/)\.tanstack\//,
  /(^|\/)dist\//,
  /(^|\/)node_modules\//,
  /(^|\/)key_gcp\.json$/,
  /(^|\/)bun\.lock$/,
  /(^|\/)deploy-worker\.sh$/,
  /^docker-compose\.prod\.yml$/,
  /^openapi-extract-api\.json$/,
  /^dataset\/(user|bdf|dataset_trattamenti|test|ddt_pdf|disciplinari_pdf)\//,
  /^dataset\/sisco_lombardia\/CUAA_AZIENDA_UPLOADcsv\//,
  /^dataset\/dataset_crop_phases\/.*\.pdf$/i,
  /^dataset\/groundTruth\/label\.json$/,
  /^prisma\/data_seed\/LabelExtraction_rows\.csv$/,
  /^src\/generated\//,
  /^src\/routeTree\.gen\.ts$/,
  /^src\/infrastructure\/http\/public\/developer\//,
  /^docs\/ROADMAP_FALL_RFS_YC_2026\.md$/,
  /^docs\/bdf\//,
  /^docs\/feature\/.*roadmap.*\.md$/i,
  /^docs\/feature\/p2-dosage-react-stabilization\.md$/,
  /^docs\/(DB_BACKUP_RESTORE|KEEP_ALIVE_SERVICE|ASYNC_JOBS_SETUP|GITHUB_PAGES|COMPRESSION_STATUS|REDIS_COMPRESSION|WORKSPACE_KIND_ROLLOUT).*$/,
  /^docs\/(index\.html|styles\.css|llms\.txt|robots\.txt|sitemap\.xml|\.nojekyll)$/,
  /^scripts\/(e2e-batch\.ts|smoke-test-document-classifier\.ts)$/,
  /^scripts\/(export-qdc-user-dataset|export-invoice-edit-dataset)(\/|\.ts$)/,
  /^scripts\/cleanup\/cleanupInvalidGcsLabels\.ts$/,
  /^seminai-mcp\/(bun\.lock|endpoints-candidates\.json|\.gcloudignore)$/,
  /^seminai-mcp\/deploy\//,
  /^telegram-bot\/deploy\.sh$/,
  /^marketing\//,
  /^landingpage_html\//,
  /^public\/try-seminai\//,
  /^swagger\.json$/,
  /^scripts\/sync-prisma-schema\.mjs$/,
]);

export const customerCoupledPathPatterns = Object.freeze([
  /boscarato/i,
  /truzzi/i,
  /ivano/i,
  /^src\/test\/(veneto-pcg-zip-parser|preclassify-zip-inspector|pcg-geojson-parser|extract-brogliaccio|shapefile-parser|csv_agent_multirow_headers|header_detector)\.test\.ts$/,
  /^jest\.integration\.(boscarato|quality|benchmark|ocr)\.config\.cjs$/,
]);

export const forbiddenContentFragments = Object.freeze([
  'dataset/user/',
  'dataset/bdf/',
  'dataset/dataset_trattamenti/',
  'key_gcp.json',
  'seminai_bucket_1',
  'storage.googleapis.com/',
]);

export const importForbiddenContentFragments = Object.freeze([
  'dataset/user/',
  'dataset/bdf/',
  'dataset/dataset_trattamenti/',
]);

export function isExcludedSourcePath(path) {
  return [...excludedPathPatterns, ...customerCoupledPathPatterns].some((pattern) =>
    pattern.test(path),
  );
}

export function mapDestination(sourceName, path) {
  if (sourceName === 'frontend') return `frontend/${path}`;
  const mappings = [
    ['seminai-mcp/', 'packages/mcp/'],
    ['telegram-bot/', 'packages/telegram-bot/'],
    ['llm-test/', 'evals/'],
    ['load-test/', 'loadtest/'],
  ];
  const mapping = mappings.find(([prefix]) => path.startsWith(prefix));
  if (!mapping) return `backend/${path}`;
  const [prefix, destination] = mapping;
  return `${destination}${path.slice(prefix.length)}`;
}
