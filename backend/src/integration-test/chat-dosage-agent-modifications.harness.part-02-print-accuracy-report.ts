import { AccuracyResult } from './chat-dosage-agent-modifications.harness.part-01-ground-truth';

export function printAccuracyReport(results: AccuracyResult[]): void {
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const accuracy = Math.round((passed / total) * 100);
  const avgLatency = Math.round(results.reduce((s, r) => s + r.latencyMs, 0) / total);

  console.log('\n════════════════════════════════════════════════════════');
  console.log(`  ACCURACY REPORT — Chat Dosage Agent (Modifications)`);
  console.log('════════════════════════════════════════════════════════');
  console.log(`  Overall Accuracy : ${accuracy}% (${passed}/${total})`);
  console.log(`  Avg Latency      : ${avgLatency} ms`);
  console.log('────────────────────────────────────────────────────────');
  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    const flags = [
      r.containsExpectedTerms ? '' : '[missing terms]',
      r.doesNotContainForbiddenTerms ? '' : '[forbidden terms found]',
      r.conformanceMentioned ? '' : '[conformance not mentioned]',
    ]
      .filter(Boolean)
      .join(' ');
    console.log(`  ${icon} ${r.scenario} (${r.latencyMs}ms) ${flags}`);
    if (!r.passed) {
      console.log(`     Response snippet: "${r.rawResponse}"`);
    }
  }
  console.log('════════════════════════════════════════════════════════\n');
}
