#!/bin/bash
# Run all promptfoo evaluations and save results as a baseline snapshot.
# Usage: ./llm-test/scripts/run-baseline.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LLM_TEST_DIR="$(dirname "$SCRIPT_DIR")"
BASELINE_DIR="$LLM_TEST_DIR/.baselines/$(date +%Y-%m-%d_%H%M%S)"

echo "=== Dosage Agent — Promptfoo Baseline ==="
echo "Output: $BASELINE_DIR"
mkdir -p "$BASELINE_DIR"

# Generate system prompt first
echo "[1/6] Generating system prompt..."
npx tsx "$LLM_TEST_DIR/scripts/generate-prompt.ts"

CONFIGS=(
  "promptfooconfig.yaml"
  "promptfooconfig.layer2-crop-matcher.yaml"
  "promptfooconfig.layer2-compliance.yaml"
  "promptfooconfig.layer2-date-planner.yaml"
  "promptfooconfig.layer2-product-selection.yaml"
  "promptfooconfig.layer2-region-matcher.yaml"
  "promptfooconfig.layer3-tool-routing.yaml"
  "promptfooconfig.layer5-approval.yaml"
  "promptfooconfig.multi-turn.yaml"
)

STEP=2
for config in "${CONFIGS[@]}"; do
  config_path="$LLM_TEST_DIR/$config"
  if [ ! -f "$config_path" ]; then
    echo "[$STEP/6] Skipping $config (not found)"
    STEP=$((STEP + 1))
    continue
  fi
  base_name="${config%.yaml}"
  echo "[$STEP/6] Running $config..."
  npx promptfoo eval \
    -c "$config_path" \
    -o "$BASELINE_DIR/${base_name}.json" \
    --no-progress-bar \
    2>&1 | tee "$BASELINE_DIR/${base_name}.log" || true
  STEP=$((STEP + 1))
done

# Generate summary
echo ""
echo "=== Baseline Summary ==="
for json_file in "$BASELINE_DIR"/*.json; do
  [ -f "$json_file" ] || continue
  base_name=$(basename "$json_file" .json)
  if command -v jq &>/dev/null; then
    total=$(jq '.results | length' "$json_file" 2>/dev/null || echo "?")
    passed=$(jq '[.results[] | select(.success == true)] | length' "$json_file" 2>/dev/null || echo "?")
    echo "  $base_name: $passed/$total passed"
  else
    echo "  $base_name: saved (install jq for summary)"
  fi
done

echo ""
echo "Baseline saved to: $BASELINE_DIR"
