import 'dotenv/config';
import { runGroundTest, runMatch1Only } from './index';
import { runFertilizerGroundTest } from './match_fertilizer_0';
import { runDualScoreTest } from './match_master';

interface NpmConfigArgv {
  readonly original?: ReadonlyArray<string>;
}

function resolveCliArgs(): ReadonlyArray<string> {
  const directArgs: ReadonlyArray<string> = process.argv.slice(2);
  if (directArgs.length > 0) {
    return directArgs;
  }
  const npmConfigArgvRaw: string | undefined = process.env.npm_config_argv;
  if (!npmConfigArgvRaw) {
    return [];
  }
  try {
    const parsed: NpmConfigArgv = JSON.parse(npmConfigArgvRaw) as NpmConfigArgv;
    const original: ReadonlyArray<string> = Array.isArray(parsed.original) ? parsed.original : [];
    const runIndex: number = original.indexOf('run');
    const scriptName: string | undefined = runIndex >= 0 ? original[runIndex + 1] : undefined;
    if (scriptName !== 'ground') {
      return [];
    }
    const extraArgs: ReadonlyArray<string> = original
      .slice(runIndex + 2)
      .filter((token) => token !== '--');
    return extraArgs;
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const args = resolveCliArgs();
  const command = args[0] || 'full';
  const companyName: string = args[1] || 'AZIENDA DEMO';
  const year: number = args[2] ? Number.parseInt(args[2], 10) : 2025;
  if (command === 'help' || command === '-h' || command === '--help') {
    console.log(`
Uso: bun run ground-test [command] [company] [year]

Comandi:
  match1    Esegue solo il test Match-1 (abbinamento prodotti-colture)
  full      Esegue il test completo (Match-1 + Match-2 con LLM) (Legacy)
  dual      Esegue il NUOVO test Dual Score (Compliance + Plausibility)
  fertilizer Avvia il test di estrazione etichette fertilizzanti
  help      Mostra questo messaggio

Esempi:
  bun run ground-test dual "AZIENDA DEMO" 2025
  bun run ground-test match1 "AZIENDA DEMO" 2025
  bun run ground-test full "AZIENDA DEMO" 2025
  bun run ground-test match1
  npm run ground fertilizer
    `);
    process.exit(0);
  }
  try {
    let savedPath: string;
    if (command === 'fertilizer') {
      console.log('\n🧪 Esecuzione test Fertilizer Labels\n');
      await runFertilizerGroundTest();
      console.log('\n✅ Test completato.\n');
      process.exit(0);
      return;
    }
    if (command === 'match1') {
      console.log(`\n🧪 Esecuzione test Match-1 per: ${companyName} (anno ${year})\n`);
      savedPath = await runMatch1Only(companyName, { year });
    } else if (command === 'dual') {
      console.log(`\n🧪 Esecuzione test DUAL SCORE per: ${companyName} (anno ${year})\n`);
      await runDualScoreTest(companyName, { year });
      console.log(`\n✅ Test completato.\n`);
      process.exit(0);
      return;
    } else {
      console.log(`\n🧪 Esecuzione test completo per: ${companyName} (anno ${year})\n`);
      savedPath = await runGroundTest(companyName, { year });
    }
    console.log(`\n✅ Test completato. File salvato: ${savedPath}\n`);
    process.exit(0);
  } catch (err) {
    const message: string = err instanceof Error ? err.message : String(err);
    console.error(`\n❌ Test fallito: ${message}\n`);
    if (err instanceof Error && err.stack) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

void main();
