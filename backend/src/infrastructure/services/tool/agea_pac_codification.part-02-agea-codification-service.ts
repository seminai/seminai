import * as path from 'path';
import * as fs from 'fs';
import { AgeaCropEntry } from './agea_pac_codification.part-01-usage-logger';

/**
 * AGEA Codification Service - Singleton that loads and caches AGEA data from CSV
 */
export class AgeaCodificationService {
  private static instance: AgeaCodificationService;
  private cropsByOccupationCode: Map<string, AgeaCropEntry[]> = new Map();
  private occupationDescriptions: Map<string, string> = new Map();
  private initialized = false;

  private constructor() {}

  static getInstance(): AgeaCodificationService {
    if (!AgeaCodificationService.instance) {
      AgeaCodificationService.instance = new AgeaCodificationService();
    }
    return AgeaCodificationService.instance;
  }

  /**
   * Initialize the service by loading data from CSV
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const csvPath = path.join(
      process.cwd(),
      'dataset/agea/matrix_18.07.2025_v1_catalogo_agea_varieta_codifica_2015-2020.csv',
    );

    try {
      if (!fs.existsSync(csvPath)) {
        console.warn(`[AGEA] CSV file not found at ${csvPath}, using fallback mappings`);
        this.loadFallbackMappings();
        this.initialized = true;
        return;
      }

      const content = fs.readFileSync(csvPath, 'utf-8');
      const lines = content.split('\n');

      // Skip header line
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Parse CSV line (semicolon-separated)
        const parts = line.split(';');
        if (parts.length < 15) continue;

        const entry: AgeaCropEntry = {
          occupationCode: parts[0]?.trim() || '',
          destinationCode: parts[1]?.trim() || '',
          useCode: parts[2]?.trim() || '',
          qualityCode: parts[3]?.trim() || '',
          varietyName: parts[4]?.trim() || '',
          varietyCode: parts[5]?.trim() || '',
          occupationDescription: parts[10]?.trim() || '',
          destinationDescription: parts[11]?.trim() || '',
          useDescription: parts[12]?.trim() || '',
          qualityDescription: parts[13]?.trim() || '',
        };

        if (entry.occupationCode) {
          // Store unique occupation code -> description mapping
          if (!this.occupationDescriptions.has(entry.occupationCode)) {
            this.occupationDescriptions.set(entry.occupationCode, entry.occupationDescription);
          }

          // Store all entries by occupation code
          if (!this.cropsByOccupationCode.has(entry.occupationCode)) {
            this.cropsByOccupationCode.set(entry.occupationCode, []);
          }
          this.cropsByOccupationCode.get(entry.occupationCode)!.push(entry);
        }
      }

      console.log(
        `[AGEA] Loaded ${this.occupationDescriptions.size} unique occupation codes from CSV`,
      );
      this.initialized = true;
    } catch (error) {
      console.error('[AGEA] Error loading CSV file:', error);
      this.loadFallbackMappings();
      this.initialized = true;
    }
  }

  /**
   * Load fallback mappings if CSV is not available
   */
  private loadFallbackMappings(): void {
    // Fallback occupation descriptions from CSV data
    const fallbackMappings: Record<string, string> = {
      '1': 'GRANTURCO (MAIS)',
      '2': 'GRANO (FRUMENTO) DURO',
      '4': 'SOIA',
      '9': 'FARRO',
      '16': 'LENTICCHIE',
      '19': 'RISONE',
      '20': 'PISELLO',
      '24': 'BIETOLA',
      '25': 'TABACCO',
      '27': 'CAROTA',
      '28': 'CAVOLO',
      '29': 'CICERCHIA',
      '32': 'ERBA MAZZOLINA',
      '44': 'MELO',
      '45': 'SPELTA',
      '46': 'LOIETTO LOGLIO',
      '47': 'LOIETTO LOGLIO PERENNE/LOIETTO INGLESE',
      '51': 'LUPOLINA',
      '56': 'CANAPA',
      '60': 'CEDRO',
      '76': 'LUPPOLO',
      '79': 'VECCE',
      '83': 'TOPINAMBUR',
      '89': 'PATATA AMERICANA (BATATA)',
      '113': 'AGLIO',
      '117': 'BROCCOLETTO DI RAPA',
      '118': 'CAVOLFIORE',
      '121': 'FAGIOLINO',
      '122': 'FAGIOLO',
      '127': 'LATTUGA LATTUGHINO',
      '129': 'MELANZANA',
      '130': 'MELONE',
      '134': 'POMODORO',
      '135': 'PORRO',
      '145': 'SEDANO',
      '162': 'INDIVIA O SCAROLA',
      '176': 'SORBO',
      '177': 'GELSO',
      '178': 'ACERO',
      '179': 'ONTANO',
      '181': 'CARPINO',
      '183': 'OLMO',
      '189': 'PERO',
      '194': 'TIGLIO',
      '195': 'ABETE',
      '199': 'CIPRESSO',
      '201': 'ARANCIO',
      '202': 'MANDARINO',
      '203': 'MANDARANCIO (CLEMENTINO)',
      '204': 'LIMONE',
      '205': 'POMPELMO',
      '207': 'SATSUMA',
      '240': 'BARBABIETOLA - RAPA ROSSA/BIETOLA DA COSTA',
      '265': 'FAGIOLO DI SPAGNA',
      '289': 'ANICE COMUNE',
      '298': 'BETULLA',
      '303': 'FAGGIO',
      '304': 'BIANCOSPINO',
      '305': 'BIRICOCCOLO SUSINCOCCO',
      '315': 'SAMBUCO',
      '317': 'GINEPRO',
      '357': 'ERBA MEDICA',
      '359': 'FESTUCA',
      '361': 'FESTUCA',
      '362': 'FESTUCA',
      '369': 'LOIETTO',
      '375': 'POA',
      '379': 'TRIFOGLIO',
      '381': 'TRIFOGLIO',
      '383': 'TRIFOGLIO',
      '384': 'TRIFOGLIO',
      '385': 'TRIFOGLIO',
      '388': 'TRIFOGLIO',
      '389': 'VECCIA SATIVA',
      '390': 'VECCIA VILLOSA',
      '407': "FICODINDIA O FICO D'INDIA",
      '408': 'MELOGRANO',
      '410': 'VITE',
      '412': 'ROVEJA PISELLO SELVATICO',
      '420': 'OLIVO',
      '430': 'AGRUMI',
      '435': 'LIMETTE',
      '453': "FAGIOLO DALL'OCCHIO",
      '468': 'CILIEGIO ACIDO',
      '471': 'LOTO (KAKI)',
      '472': 'FICO',
      '475': 'MIRTILLI',
      '476': 'NESPOLO',
      '491': 'CARRUBO',
      '492': 'CASTAGNO',
      '493': 'MANDORLO',
      '494': 'NOCCIOLO',
      '495': 'NOCE',
      '533': 'AVENA',
      '539': 'CARTAMO',
      '544': 'CECE',
      '562': 'ERBA MEDICA',
      '575': 'FAVE, FAVINO E FAVETTE',
      '587': 'GRANO (FRUMENTO) TENERO',
      '597': 'GRANO SARACENO',
      '607': 'LEGUMINOSE DA GRANELLA',
      '612': 'LUPINELLA',
      '615': 'LUPINO',
      '656': 'POMODORINO',
      '661': 'COTOGNO',
      '667': 'SALICE',
      '671': 'ALBICOCCO',
      '672': 'CILIEGIO',
      '673': 'SUSINO',
      '680': 'SCALOGNO',
      '684': 'SEGALA',
      '693': 'SORGO',
      '710': 'PATATA',
      '715': 'ZUCCA LAGENARIA',
      '801': 'PESCO',
      '804': 'PESCO NETTARINA',
      '831': 'ACTINIDIA (KIWI)',
      '840': 'SULLA',
      '870': 'ORZO',
      '902': 'ASPARAGO',
      '903': 'BASILICO',
      '909': 'CARCIOFO',
      '910': 'CARDI',
      '917': 'CETRIOLO',
      '919': 'CICORIA',
      '921': 'CIPOLLA',
      '924': 'COCOMERO',
      '926': 'FINOCCHIO',
      '927': 'FRAGOLA',
      '932': 'PEPERONE',
      '935': 'RADICCHIO',
      '936': 'RAVANELLO',
      '940': 'ZUCCA',
      '941': 'ZUCCHINO',
      '954': 'CAVOLO RAPA',
      '967': 'FRASSINO',
      '968': 'CAPPERO',
      '969': 'AZZERUOLO',
      '970': 'CAVOLO BROCCOLO',
      A02: 'ARANCIO AMARO o MELANGOLO',
      A10: 'AGLIONE',
      A15: 'FAVINO',
      A16: 'FAVA (FAVA GROSSA)',
      A17: 'FAVA (FAVETTA)',
    };

    for (const [code, desc] of Object.entries(fallbackMappings)) {
      this.occupationDescriptions.set(code, desc);
    }

    console.log(`[AGEA] Loaded ${this.occupationDescriptions.size} fallback occupation codes`);
  }

  /**
   * Get crop description by AGEA occupation code
   */
  getOccupationDescription(code: string): string | null {
    if (!this.initialized) {
      // Sync initialize for fallback
      this.loadFallbackMappings();
      this.initialized = true;
    }
    return this.occupationDescriptions.get(code) || null;
  }

  /**
   * Get all entries for an occupation code
   */
  getCropEntries(code: string): AgeaCropEntry[] {
    return this.cropsByOccupationCode.get(code) || [];
  }

  /**
   * Search for crops by name (partial match)
   */
  searchByName(query: string): Array<{ code: string; description: string }> {
    const results: Array<{ code: string; description: string }> = [];
    const upperQuery = query.toUpperCase();

    for (const [code, desc] of this.occupationDescriptions) {
      if (desc.toUpperCase().includes(upperQuery)) {
        results.push({ code, description: desc });
      }
    }

    return results;
  }

  /**
   * Get all occupation codes and descriptions
   */
  getAllOccupationCodes(): Map<string, string> {
    return this.occupationDescriptions;
  }
}

// Export singleton instance
export const ageaCodificationService = AgeaCodificationService.getInstance();
