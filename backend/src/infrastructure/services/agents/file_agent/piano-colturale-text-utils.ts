/**
 * Text processing utilities for Piano Colturale PDF extraction.
 * Handles page categorization, particella block splitting, and chunking
 * to support large multi-page AGREA documents.
 */

export interface CategorizedPages {
  readonly aziendaText: string;
  readonly pianoColturaleText: string;
  readonly pianoColturalePageCount: number;
}

export const MAX_PARTICELLE_PER_CHUNK = 15;

const AZIENDA_MARKERS = ['FORMA GIURIDICA', 'RAGIONE SOCIALE', 'DOMICILIO O SEDE LEGALE'] as const;
const PIANO_COLTURALE_TITLE = 'PIANO COLTURALE ALFANUMERICO';
const PARTICELLA_HEADER_RE = /FOGLIO:\s*\d+\s*-\s*PARTICELLA:/i;
const PARTICELLA_SPLIT_RE =
  /(?=\([A-Z]{2}\)[^(]+?-\s*Sezione:[^-]*-\s*Foglio:\s*\d+\s*-\s*Particella:)/;

/**
 * Remove repeated page footers (domanda/settore lines + page numbers)
 * to reduce token usage without losing data.
 */
export function stripPageFooter(page: string): string {
  return page
    .replace(/Domanda:\s*\d+\s*-\s*Azienda:[^\n]*/g, '')
    .replace(/Settore:\s*PC\s*-\s*Piano Colturale[^\n]*/g, '')
    .replace(/^\s*\d+\/\d+\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Separate pages into azienda (company info) and piano colturale (particella data).
 *
 * The previous implementation matched every page because every footer contained
 * "Azienda:". This version uses specific section markers to avoid including
 * irrelevant pages (PARCELLA DI RIFERIMENTO, RIEPILOGO MACROUSI, etc.).
 *
 * Once the piano colturale section is found, all subsequent pages are included
 * to handle particella blocks that span page boundaries.
 */
export function categorizePages(fullText: string): CategorizedPages {
  const pages = fullText.split('--- Page Break ---');
  const aziendaPages: string[] = [];
  const pianoColturalePages: string[] = [];
  let foundPianoColturale = false;

  for (let i = 0; i < pages.length; i++) {
    const stripped = stripPageFooter(pages[i]);
    if (!stripped) continue;
    const upper = stripped.toUpperCase();

    if (!foundPianoColturale && AZIENDA_MARKERS.some((m) => upper.includes(m))) {
      aziendaPages.push(stripped);
      continue;
    }

    if (
      !foundPianoColturale &&
      (upper.includes(PIANO_COLTURALE_TITLE) || PARTICELLA_HEADER_RE.test(stripped))
    ) {
      foundPianoColturale = true;
    }

    if (foundPianoColturale) {
      pianoColturalePages.push(stripped);
    }
  }

  return {
    aziendaText: aziendaPages.join('\n\n'),
    pianoColturaleText: pianoColturalePages.join('\n\n'),
    pianoColturalePageCount: pianoColturalePages.length,
  };
}

/**
 * Split piano colturale text into individual particella blocks.
 * Each block starts with a header like:
 *   "(PC)COMUNE - Sezione: X - Foglio: NN - Particella: NNNNN - ..."
 * and contains all crop data until the next header.
 *
 * This ensures every chunk sent to the LLM has complete, non-split blocks.
 */
export function splitIntoParticellaBlocks(pianoText: string): string[] {
  const parts = pianoText.split(PARTICELLA_SPLIT_RE);
  return parts.filter((p) => PARTICELLA_HEADER_RE.test(p)).map((p) => p.trim());
}

export function chunkArray<T>(array: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
