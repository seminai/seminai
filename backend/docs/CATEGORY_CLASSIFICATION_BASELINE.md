# Category Classification Baseline

This document defines the initial baseline for automatic file category detection (`auto`) and the rollout strategy for the new LLM-first classifier.

## Scope

- Input categories when user does not specify exact backend category.
- Supported outputs: `fields`, `production_units`, `agricultural`, `invoice`, `ddt`, `stock`.
- Formats covered: CSV/Excel, PDF, ZIP shapefile, XML, images.

## Baseline Dataset (v1)

Labeled cases are currently encoded in:

- `src/test/file-category-baseline.test.ts`

The baseline set includes:

- Standard agricultural CSV headers (`foglio`, `particella`).
- Standard stock CSV headers (`nome prodotto`, quantity, DDT/date).
- PDF with invoice patterns.
- PDF with DDT patterns.
- Ambiguous PDF fallback case.
- ZIP shapefile case.
- XML and image deterministic invoice routing.

## Baseline Target

- Rule-only baseline accuracy threshold: `>= 0.87` on labeled set.
- This value is enforced by automated test.

## LLM-first Rollout

The classifier is enabled behind feature flag:

- `LLM_CATEGORY_CLASSIFIER_ENABLED=true`

Suggested defaults for low latency/cost:

- `CATEGORY_CLASSIFIER_MODEL=gpt-4o-mini`
- `CATEGORY_CLASSIFIER_TIMEOUT_MS=4000`
- `CATEGORY_LLM_CONFIDENCE_THRESHOLD=0.55`
- `CATEGORY_CLASSIFIER_CACHE_TTL_MS=21600000`

## Operational Metrics to Track

- Decision source split (`rule`, `llm`, `hybrid`).
- Confidence bucket distribution (`high`, `medium`, `low`).
- LLM latency and cache hit rate.
- Fallback rate to rule-based decisions.

## Next Dataset Improvements

- Add real OCR-noisy PDFs for invoice/DDT confusion matrix.
- Add cross-region agricultural CSV templates and malformed headers.
- Add near-miss documents (generic reports) to measure false `agricultural` routing.
