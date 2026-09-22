import 'dotenv/config';
import createFertilizerLabelService, {
  type FertilizerLabelRecord,
  type FertilizerLabelService,
} from '../infrastructure/services/agents/fertilizer_agent/get_fertilizer_label';

const FERTILIZER_NAMES: ReadonlyArray<string> = [
  'COSMO DORADO 10/16/23',
  'YaraBela SULFAN 24% N',
  'YaraBela EXTRAN 33,5 % N.A.',
  'UREA GRANULARE 46%',
  'FOSFATO BIAMMONICO 18/46',
  'CLORURO POTASSICO KCL 60%',
  'MAGPHOS',
  'YaraLiva TROPICOTE Nitr.CALCIO',
  'YARA AMPLIX ACTISIL',
  'OPTINUE',
  'NITRATO DI CALCIO sfuso',
  'IONIFOSS ZN-MN',
  'POLACID 5-30 + ZN sfuso',
  'N21 21+10 SO3 liquido sfuso',
  'SEME MAIS LG 31.545 STARCO OVER ACTIVE+',
  'YARA AMPLIX FLOSTREL',
  'FRUTREL',
  'YARA VITA OPTIVI',
  'DECCOSHIELD 15 Concime liquido',
  'MACYS BC 28',
  'TURN ON',
];

class FertilizerGroundTest {
  constructor(private readonly labelService: FertilizerLabelService) {}
  async execute(): Promise<void> {
    const sampleNames: ReadonlyArray<string> = FERTILIZER_NAMES.slice(0, 2);
    for (const name of sampleNames) {
      const labels = await this.labelService.getLabelLinks(name);
      console.log(`\n${name}`);
      if (labels.length === 0) {
        console.log('Nessuna etichetta PDF valida trovata.');
        continue;
      }
      console.log('Elenco etichette PDF:');
      labels.forEach((label: FertilizerLabelRecord) => {
        console.log(`- <${label.labelName}> ${label.url}`);
      });
    }
  }
}

export async function runFertilizerGroundTest(): Promise<void> {
  const service = createFertilizerLabelService();
  const testRunner = new FertilizerGroundTest(service);
  await testRunner.execute();
}

if (process.argv[1]?.includes('match_fertilizer_0')) {
  void runFertilizerGroundTest();
}
