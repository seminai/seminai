import { LlmJobType } from '@prisma/client';
import { LangChainUsageCollector, UsageAccumulator } from '../../llm_costs/usage';
import { usageLogger, ExtractedCompanyData, CompaniesExtractionSchema, ExtractedCompaniesData } from './company_data_extractor_agent.support';
import type { CompanyDataExtractorAgentContext } from './company-data-extractor-agent.context';

export async function companyDataExtractorAgentExtractCompaniesData(this: CompanyDataExtractorAgentContext, csvContent: string): Promise<ExtractedCompanyData[]> {
    const lines = csvContent.split('\n').filter((line) => line.trim().length > 0);
    if (lines.length < 2) {
      throw new Error('CSV troppo corto per estrarre dati azienda');
    }

    const headerLine = lines[0];
    const separator = this.detectSeparator(headerLine);
    const headers = this.parseCsvLine(headerLine, separator);
    const format = this.detectFormat(headers);

    if (format === 'SATA') {
      const companies = this.extractCompaniesFromSataCsv({ lines, headers, separator });
      return companies.map((c) => this.normalizeCompany(c));
    }

    // Sample up to 60 rows spread across the file to support multi-company files.
    const dataLines = lines.slice(1);
    const targetSamples = 60;
    const sampleLines: string[] = [headerLine];
    if (dataLines.length <= targetSamples) {
      sampleLines.push(...dataLines);
    } else {
      const step = Math.max(1, Math.floor(dataLines.length / targetSamples));
      for (let i = 0; i < dataLines.length && sampleLines.length < targetSamples + 1; i += step) {
        sampleLines.push(dataLines[i]);
      }
    }
    const sampleContent = sampleLines.join('\n');

    console.log('CompanyDataExtractorAgent: Extracting companies with LLM');

    const usageAccumulator = new UsageAccumulator();
    const usageCollector = new LangChainUsageCollector(usageAccumulator);
    const extractor = this.getModel().withStructuredOutput(CompaniesExtractionSchema);
    const result = await extractor.invoke(
      [
        {
          role: 'system',
          content: `Sei un esperto di dati agricoli italiani. Analizza il CSV e estrai i dati delle aziende agricole.

OBIETTIVO: Estrarre TUTTE le aziende presenti nel file. Se il file contiene dati di UNA sola azienda (anche con più righe/colture), restituisci UN SOLO elemento nell'array.

⚠️ CRITICO - DISTINGUI COLONNE AZIENDA DA COLONNE COLTURALI:

**COLONNE DATI AZIENDA** (usale per il nome azienda):
- "RAGIONE SOCIALE", "Ragione Sociale" → Nome ufficiale azienda
- "Az cond asservimento", "Azienda" → Nome azienda
- "Conduttore" → Nome conduttore/proprietario
- "Unita produttiva" → Può contenere nome azienda se formato "NOME - COMUNE - INDIRIZZO"

**COLONNE DATI COLTURALI** (NON usare MAI per il nome azienda):
- "Occupazione Suolo", "Occupazione Suolo Uso Suolo Primario" → Nome COLTURA (es. "ERBA MEDICA", "SOIA", "VITE")
- "Coltura", "Crop", "Prodotto" → Nome COLTURA
- "Varietà", "Varieta" → Varietà colturale
- "Destinazione", "Uso" → Tipo di uso colturale

⚠️ REGOLA FONDAMENTALE: Se una colonna contiene nomi di COLTURE (es. "ERBA MEDICA", "SOIA", "GRANTURCO", "VITE", "FRUMENTO"), quella colonna NON è il nome dell'azienda. È un dato colturale che varia per ogni riga.

FORMATI CSV COMUNI:

1. **Formato AGEA/Emilia-Romagna**:
   - Colonna "RAGIONE SOCIALE": nome ufficiale azienda (esempio generico: "NOME AZIENDA SOCIETA' AGRICOLA") - NON copiare l'esempio
   - Colonna "CUAA": codice fiscale/P.IVA (esempio generico: "01234567890") - NON copiare l'esempio
   - Colonna "REGIONE": regione (es. "EMILIA ROMAGNA")
   - Colonna "PROVINCIA": sigla provincia (es. "RA")
   - Colonna "COMUNE": comune (es. "ALFONSINE")

2. **Formato SATA/SIAN**:
   - Colonna "Unita produttiva": contiene "CODICE - COMUNE - INDIRIZZO" o "NOME AZIENDA - COMUNE - INDIRIZZO"
   - Colonna "Comune Descrizione": "COMUNE (PROV)" (es. "POZZOLO FORMIGARO (AL)")
   - Colonna "Conduttore": nome del conduttore/proprietario
   - Colonna "Az cond asservimento": nome azienda se diverso da conduttore
   - Colonna "Id appezzamento AGEA": contiene codice fiscale nel formato "IT10/CODICEFISCALE/..."

REGOLE DI ESTRAZIONE - PRIORITÀ ASSOLUTA:

**name** (CAMPO CRITICO - OBBLIGATORIO):
Analizza l'intestazione CSV e identifica le colonne disponibili. Poi applica questa PRIORITÀ STRINGENTE:

1. Se esiste una colonna nell'intestazione che contiene "RAGIONE SOCIALE" (o varianti):
   → Il campo "name" DEVE essere preso ESCLUSIVAMENTE dal valore di quella colonna nella prima riga dati valida
   → NON usare MAI il comune/city come name se questa colonna esiste
   → NON usare MAI "Azienda Agricola" generico

2. Se NON esiste "RAGIONE SOCIALE" ma esiste "Az cond asservimento":
   → Usa il valore di "Az cond asservimento" dalla prima riga valida (se non vuoto)

3. Se NON esiste né "RAGIONE SOCIALE" né "Az cond asservimento" ma esiste "Conduttore":
   → Usa il valore di "Conduttore" dalla prima riga valida (se non vuoto)

4. Se NON esiste "RAGIONE SOCIALE" né "Az cond asservimento" né "Conduttore":
   → Se "Unita produttiva" contiene formato "NOME - COMUNE - INDIRIZZO", estrai il NOME (prima parte)
   → Altrimenti usa "Azienda Agricola [comune]" dove comune è il comune principale del file

⚠️ NON USARE MAI:
- Valori da colonne "Occupazione Suolo", "Coltura", "Crop" → sono COLTURE, non aziende
- Se vedi valori come "ERBA MEDICA", "SOIA", "VITE", "GRANTURCO" → sono COLTURE, non nomi azienda
- Se tutte le righe hanno lo stesso comune ma colture diverse → c'è UNA sola azienda, non una per coltura

IMPORTANTE: Il campo "name" rappresenta il NOME UFFICIALE DELL'AZIENDA/SOCIETÀ, non la coltura né la località. Se non trovi colonne azienda esplicite, deduci che c'è UNA sola azienda per tutto il file.

**cuaa/fiscalCode**:
- Cerca in colonna "CUAA"
- Oppure estrai da "Id appezzamento AGEA" la parte dopo "IT10/" e prima del secondo "/" (es. da "IT10/CPRRRT60T02F965V/AAB93" estrai "CPRRRT60T02F965V")

**vatNumber**:
- Se CUAA è di 11 cifre, è una P.IVA
- Altrimenti è un codice fiscale

**region**:
- Cerca in colonna "REGIONE"
- Oppure deduci dalla provincia:
  - AL, TO, CN, AT, VC, NO, BI, VB → Piemonte
  - RA, BO, FE, MO, RE, PR, PC, FC, RN → Emilia-Romagna
  - MI, BG, BS, CO, CR, LC, LO, MN, MB, PV, SO, VA → Lombardia
  - VR, VI, TV, PD, VE, BL, RO → Veneto

**province**:
- Cerca in colonna "PROVINCIA"
- Oppure estrai da "Comune Descrizione" la sigla tra parentesi (es. da "POZZOLO FORMIGARO (AL)" estrai "AL")

**city**:
- Cerca in colonna "COMUNE"
- Oppure da "Comune Descrizione" senza la provincia
- Oppure dalla seconda parte di "Unita produttiva" (dopo il primo " - ")

**address**:
- Dalla terza parte di "Unita produttiva" (dopo il secondo " - ")

IMPORTANTE:
- Analizza TUTTE le righe fornite per trovare i dati
- Non restituire valori vuoti o generici se i dati sono presenti
- Non inventare dati: se non trovi un campo, metti null (JSON null, non la stringa "null")
- Il campo "name" deve contenere il nome REALE dell'azienda
- Se non trovi colonne azienda esplicite (RAGIONE SOCIALE, Az cond asservimento, Conduttore), deduci che c'è UNA sola azienda per tutto il file
- NON creare un'azienda per ogni riga o per ogni coltura diversa: le colture (ERBA MEDICA, SOIA, VITE, ecc.) sono DATI COLTURALI, non aziende separate`,
        },
        {
          role: 'user',
          content: `Estrai le aziende (companies[]) da questo CSV:\n\n${sampleContent}`,
        },
      ],
      { callbacks: [usageCollector] },
    );

    // Log usage asynchronously
    usageLogger
      .logFromAccumulator(usageAccumulator, {
        jobType: LlmJobType.CSV_IMPORT,
        model: 'gpt-4o-mini',
        metadata: { step: 'company-data-extraction', rowsSampled: sampleLines.length },
      })
      .catch((err) => console.warn('[COMPANY-EXTRACTOR] Failed to log usage:', err));

    const companies = (result as ExtractedCompaniesData).companies;
    const normalized = companies.map((c) => this.normalizeCompany(c));
    const withRegion = normalized.map((c) => ({
      ...c,
      region: c.region ?? (c.province ? this.getRegionFromProvince(c.province) : null),
    }));
    return withRegion;
  }
