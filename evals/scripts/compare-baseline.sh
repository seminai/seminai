#!/bin/bash
# Compare current promptfoo results against the most recent baseline.
# Usage: ./llm-test/scripts/compare-baseline.sh [baseline_dir]
# If no baseline_dir is specified, uses the most recent one.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LLM_TEST_DIR="$(dirname "$SCRIPT_DIR")"
BASELINES_DIR="$LLM_TEST_DIR/.baselines"

if [ ! -d "$BASELINES_DIR" ]; then
  echo "No baselines found. Run run-baseline.sh first."
  exit 1
fi

# Determine baseline to compare against
if [ $# -gt 0 ]; then
  BASELINE_DIR="$1"
else
  BASELINE_DIR=$(ls -d "$BASELINES_DIR"/*/ 2>/dev/null | sort -r | head -1)
fi

if [ -z "$BASELINE_DIR" ] || [ ! -d "$BASELINE_DIR" ]; then
  echo "No baseline directory found at $BASELINES_DIR"
  exit 1
fi

echo "=== Comparing against baseline: $(basename "$BASELINE_DIR") ==="
echo ""

if ! command -v jq &>/dev/null; then
  echo "jq is required for comparison. Install with: brew install jq"
  exit 1
fi

REGRESSIONS=0
IMPROVEMENTS=0

for baseline_json in "$BASELINE_DIR"/*.json; do
  [ -f "$baseline_json" ] || continue
  config_name=$(basename "$baseline_json" .json)

  baseline_total=$(jq '.results | length' "$baseline_json" 2>/dev/null || echo "0")
  baseline_passed=$(jq '[.results[] | select(.success == true)] | length' "$baseline_json" 2>/dev/null || echo "0")

  if [ "$baseline_total" = "0" ]; then
    echo "  $config_name: baseline empty, skipping"
    continue
  fi

  baseline_rate=$(echo "scale=1; $baseline_passed * 100 / $baseline_total" | bc)

  # Check if there's a current result to compare
  current_json="$LLM_TEST_DIR/.promptfoo-cache/${config_name}.json"
  if [ -f "$current_json" ]; then
    current_total=$(jq '.results | length' "$current_json" 2>/dev/null || echo "0")
    current_passed=$(jq '[.results[] | select(.success == true)] | length' "$current_json" 2>/dev/null || echo "0")
    current_rate=$(echo "scale=1; $current_passed * 100 / $current_total" | bc)

    if [ "$(echo "$current_rate < $baseline_rate" | bc)" = "1" ]; then
      echo "  ❌ $config_name: REGRESSION ${current_rate}% (was ${baseline_rate}%)"
      REGRESSIONS=$((REGRESSIONS + 1))
    elif [ "$(echo "$current_rate > $baseline_rate" | bc)" = "1" ]; then
      echo "  ✅ $config_name: IMPROVED ${current_rate}% (was ${baseline_rate}%)"
      IMPROVEMENTS=$((IMPROVEMENTS + 1))
    else
      echo "  ➡️  $config_name: STABLE ${current_rate}%"
    fi
  else
    echo "  ⏳ $config_name: baseline ${baseline_rate}% (no current run to compare)"
  fi
done

echo ""
echo "=== Summary ==="
echo "  Regressions: $REGRESSIONS"
echo "  Improvements: $IMPROVEMENTS"

if [ "$REGRESSIONS" -gt 0 ]; then
  echo ""
  echo "⚠️  Regressions detected! Review prompt changes before merging."
  exit 1
fi
