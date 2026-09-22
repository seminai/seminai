# LLM Test — Dosage Agent Evaluation Suite

Structured LLM evaluation environment using [promptfoo](https://promptfoo.dev/).
Tests the quality, safety, and compliance of both the Dosage ReAct Agent
and the underlying Dosage Agent pipeline prompts.

## Quick Start

```bash
# Run Layer 1 + Layer 3 (system prompt + edge cases + tool routing)
npm run llm-test:eval

# Run all Layer 2 evaluations (task-specific prompts)
npm run llm-test:eval:l2-all

# Run everything
npm run llm-test:eval:all

# Run P1 extraction evals (category classifier, crop catalog, disciplinari limits)
npm run llm-test:eval:p1-all

# Open the web dashboard to inspect results
npm run llm-test:view
```

## Architecture

```
llm-test/
├── promptfooconfig.yaml                       # Layer 1 + 3: system prompt eval
├── promptfooconfig.layer2-crop-matcher.yaml   # Layer 2: crop matching
├── promptfooconfig.layer2-region-matcher.yaml # Layer 2: region matching
├── promptfooconfig.layer2-compliance.yaml     # Layer 2: compliance validation
├── promptfooconfig.layer2-date-planner.yaml   # Layer 2: phenological dates
├── promptfooconfig.layer2-product-selection.yaml # Layer 2: product filtering
├── promptfooconfig.layer2-category-classifier.yaml   # P1: file category routing
├── promptfooconfig.layer2-crop-catalog-resolver.yaml # P1: crop catalog disambiguation
├── promptfooconfig.layer2-disciplinari-limits.yaml   # P1: disciplinari chunk limits
├── providers/
│   ├── system-prompt.provider.ts    # Loads system prompt, calls OpenAI
│   ├── task-prompt.provider.ts      # Generic: loads .txt template, substitutes vars
│   ├── category-classifier.provider.ts    # P1: CategoryClassifierService
│   ├── crop-catalog-resolver.provider.ts  # P1: resolveUnresolvedCropsWithLlm
│   └── disciplinari-limits.provider.ts      # P1: extractDisciplinariChunkLimits
├── prompts/
│   ├── crop-matcher.txt             # Extracted from llmCropMatcher.ts
│   ├── region-matcher.txt           # Extracted from flowMatchDosageDisciplinari.ts
│   ├── compliance-validator.txt     # Extracted from flowValidateRulesCompliance.ts
│   ├── date-planner-phenology.txt   # Extracted from treatmentDatePlanner.ts
│   └── product-selection.txt        # Extracted from flowOrchestrateProductSelection.ts
├── datasets/
│   ├── dosage-basic.yaml            # Layer 1: base scenarios (8 tests)
│   ├── dosage-edge-cases.yaml       # Layer 1: advanced edge cases (6 tests)
│   ├── tool-routing.yaml            # Layer 3: tool routing (4 tests)
│   ├── crop-matcher.yaml            # Layer 2: crop matching (7 tests)
│   ├── region-matcher.yaml          # Layer 2: region matching (6 tests)
│   ├── compliance-validator.yaml    # Layer 2: compliance validation (3 tests)
│   ├── date-planner.yaml            # Layer 2: phenological dates (4 tests)
│   └── product-selection.yaml       # Layer 2: product filtering (3 tests)
├── scripts/
│   └── generate-prompt.ts           # Pre-build: generates system prompt from source
├── .generated/                      # Auto-generated files (gitignored)
│   └── system-prompt.json
└── tsconfig.json
```

## Layers

| Layer                | Config                                              | What it tests                                 | Provider                       |
| -------------------- | --------------------------------------------------- | --------------------------------------------- | ------------------------------ |
| 1 — System Prompt    | `promptfooconfig.yaml`                              | LLM response quality with full system prompt  | system-prompt.provider         |
| 2a — Crop Matcher    | `promptfooconfig.layer2-crop-matcher.yaml`          | Product-crop compatibility                    | task-prompt.provider           |
| 2b — Region Matcher  | `promptfooconfig.layer2-region-matcher.yaml`        | Address-to-region matching                    | task-prompt.provider           |
| 2c — Compliance      | `promptfooconfig.layer2-compliance.yaml`            | Treatment adjustment vs disciplinare limits   | task-prompt.provider           |
| 2d — Date Planner    | `promptfooconfig.layer2-date-planner.yaml`          | Phenological date estimation                  | task-prompt.provider           |
| 2e — Product Select. | `promptfooconfig.layer2-product-selection.yaml`     | Product filtering by priority targets         | task-prompt.provider           |
| 3 — Tool Routing     | `promptfooconfig.yaml`                              | Correct tool identification from user queries | system-prompt.provider         |
| P1 — Category        | `promptfooconfig.layer2-category-classifier.yaml`   | PDF/CSV/XML file routing for extraction       | category-classifier.provider   |
| P1 — Crop Catalog    | `promptfooconfig.layer2-crop-catalog-resolver.yaml` | Melo/Melone and AGEA crop resolution          | crop-catalog-resolver.provider |
| P1 — Disciplinari    | `promptfooconfig.layer2-disciplinari-limits.yaml`   | Limit extraction from disciplinari chunks     | disciplinari-limits.provider   |

## P1 Extraction Eval

Regression suite for the P1 LLM refactor (category classifier, crop catalog resolver,
disciplinari chunk limits). Providers call **production TypeScript code** directly — no
extracted prompt templates.

**Prerequisite:** `OPENROUTER_API_KEY` in `seminai-be-v2/.env` for chat, vision, embeddings, and label extraction evals.
`OPENAI_API_KEY` is only required for Whisper audio transcription.
`MISTRAL_API_KEY` is only required for Mistral OCR (not routed via OpenRouter).

P1 npm scripts preload the `tsx` loader (`NODE_OPTIONS='--import tsx'`) so providers can import production code from `src/`.

```bash
npm run llm-test:eval:p1-category
npm run llm-test:eval:p1-crop
npm run llm-test:eval:p1-disciplinari
npm run llm-test:eval:p1-all
```

## Requirements

- `OPENROUTER_API_KEY` (or `OPENAI_API_KEY` when `LLM_GATEWAY=openai`) for chat/completion, vision, and embeddings
- `OPENAI_API_KEY` additionally required for Whisper audio transcription
- Node.js v22+

## Commands

```bash
# Generate system prompt from source code (required before Layer 1/3 eval)
npm run llm-test:generate

# Run Layer 1 + 3 evaluation
npm run llm-test:eval

# Run individual Layer 2 evaluations
npm run llm-test:eval:l2-crop
npm run llm-test:eval:l2-region
npm run llm-test:eval:l2-compliance
npm run llm-test:eval:l2-dates
npm run llm-test:eval:l2-products

# Run all Layer 2
npm run llm-test:eval:l2-all

# Run P1 extraction evals
npm run llm-test:eval:p1-all

# Run everything (Layer 1 + 2 + 3 + P1)
npm run llm-test:eval:all

# Open results dashboard
npm run llm-test:view
```

## Adding Test Scenarios

### Layer 1/3 (system prompt / tool routing)

Edit `datasets/dosage-basic.yaml`, `dosage-edge-cases.yaml`, or `tool-routing.yaml`.
Each scenario has:

- `vars.input_prompt`: the user message
- `assert`: list of assertions

### Layer 2 (task-specific prompts)

Edit the relevant dataset (e.g. `datasets/crop-matcher.yaml`).
Each scenario has:

- `vars`: template variables matching `{{placeholders}}` in the `.txt` prompt
- `assert`: list of assertions (typically `is-json` + `javascript` checks)

## Providers

### `system-prompt.provider.ts`

Reads the pre-generated system prompt and calls OpenAI with it as system message.

Config: `model`, `temperature`, `variant` (`allFeatures` | `minimalFeatures`)

### `task-prompt.provider.ts`

Generic provider that loads a `.txt` prompt template, substitutes `{{variables}}`
from the test dataset, and calls OpenAI.

Config: `model`, `temperature`, `promptFile`, `maxTokens`
