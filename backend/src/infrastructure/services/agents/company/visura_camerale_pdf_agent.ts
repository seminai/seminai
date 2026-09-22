import { z } from 'zod';
import type { ChatOpenAI } from '@langchain/openai';
import { LlmJobType } from '@prisma/client';
import { pdfToText } from '../../ocr/pdfToText';
import { LlmUsageLogger } from '../../llm_costs/llm-usage-logger';
import { LangChainUsageCollector, UsageAccumulator } from '../../llm_costs/usage';
import { createChatModel } from '../../llm-model-factory';

const usageLogger = LlmUsageLogger.getInstance();

const VISURA_MODEL = 'gpt-4o-mini';

const VisuraExtractionSchema = z.object({
  name: z
    .string()
    .nullable()
    .describe('Denominazione / Ragione sociale ufficiale come riportata nella visura'),
  vatNumber: z
    .string()
    .nullable()
    .describe('Partita IVA: esattamente 11 cifre numeriche, senza prefisso paese'),
  fiscalCode: z
    .string()
    .nullable()
    .describe('Codice fiscale: 11-16 caratteri alfanumerici maiuscoli'),
  address: z
    .string()
    .nullable()
    .describe('Indirizzo della sede legale (via/piazza + numero civico)'),
  city: z.string().nullable().describe('Comune della sede legale'),
  cap: z.string().nullable().describe('CAP della sede legale (5 cifre)'),
  nation: z.string().nullable().describe('Nazione (default "Italia" se non specificata)'),
  email: z.string().nullable().describe('Email PEC o ordinaria della sede legale, se presente'),
  phoneNumber: z.string().nullable().describe('Numero di telefono della sede legale, se presente'),
  website: z.string().nullable().describe('Sito web aziendale, se presente'),
});

export type VisuraCameraleExtraction = z.infer<typeof VisuraExtractionSchema>;

const SYSTEM_PROMPT = `Sei un assistente specializzato nell'estrazione dati da visure camerali italiane (Camera di Commercio, CCIAA).

Una visura camerale contiene anagrafica e dati ufficiali di un'impresa italiana.
I campi tipici da cercare:
- Denominazione / Ragione sociale (di solito in alto, dopo "Denominazione" o "Forma giuridica")
- Codice fiscale (11-16 caratteri alfanumerici)
- Partita IVA (11 cifre)
- Sede legale: indirizzo, comune, CAP, provincia
- PEC / Email
- Telefono / Sito web (se presenti)

Regole di estrazione:
- Restituisci null per i campi non presenti, NON inventare dati.
- Partita IVA: solo cifre, senza spazi o prefisso paese (es. "12345678901").
- Codice fiscale: maiuscolo, senza spazi.
- CAP: esattamente 5 cifre (es. "20100"). Null se non chiaramente identificabile.
- Indirizzo: solo via/piazza + numero civico (NON includere comune o CAP).
- Nation: "Italia" se la visura è italiana e non specifica altro.
- Email: preferisci PEC se presente; altrimenti email ordinaria.`;

export class VisuraCameralePdfAgent {
  private model: ChatOpenAI | null = null;

  async extractFromPdf(pdfBuffer: Buffer): Promise<VisuraCameraleExtraction> {
    const { text, pageCount } = await pdfToText(pdfBuffer);
    if (!text || text.trim().length < 50) {
      throw new Error('Visura PDF illeggibile o vuota: testo estratto insufficiente.');
    }

    const usageAccumulator = new UsageAccumulator();
    const usageCollector = new LangChainUsageCollector(usageAccumulator);

    const extractor = this.getModel().withStructuredOutput(VisuraExtractionSchema);
    const result = await extractor.invoke(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Estrai i dati anagrafici dell'impresa dalla seguente visura camerale.\n\n--- INIZIO VISURA ---\n${text}\n--- FINE VISURA ---`,
        },
      ],
      { callbacks: [usageCollector] },
    );

    usageLogger
      .logFromAccumulator(usageAccumulator, {
        jobType: LlmJobType.CSV_IMPORT,
        model: VISURA_MODEL,
        metadata: { step: 'visura-camerale-extraction', pageCount },
      })
      .catch((err) => console.warn('[VISURA-EXTRACTOR] Failed to log usage:', err));

    return normalize(result);
  }

  private getModel(): ChatOpenAI {
    if (!this.model) {
      const { model } = createChatModel({ modelName: VISURA_MODEL, temperature: 0 });
      this.model = model;
    }
    return this.model;
  }
}

function normalize(raw: VisuraCameraleExtraction): VisuraCameraleExtraction {
  return {
    name: trimOrNull(raw.name),
    vatNumber: digitsOrNull(raw.vatNumber, 11),
    fiscalCode: alnumUpperOrNull(raw.fiscalCode, 11, 16),
    address: trimOrNull(raw.address),
    city: trimOrNull(raw.city),
    cap: digitsOrNull(raw.cap, 5),
    nation: trimOrNull(raw.nation),
    email: trimOrNull(raw.email),
    phoneNumber: trimOrNull(raw.phoneNumber),
    website: trimOrNull(raw.website),
  };
}

function trimOrNull(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function digitsOrNull(value: string | null, exactLength: number): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  return digits.length === exactLength ? digits : null;
}

function alnumUpperOrNull(
  value: string | null,
  minLength: number,
  maxLength: number,
): string | null {
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, '').toUpperCase();
  return /^[A-Z0-9]+$/.test(cleaned) && cleaned.length >= minLength && cleaned.length <= maxLength
    ? cleaned
    : null;
}
