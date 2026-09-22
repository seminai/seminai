import type { Label } from '../../../../../domain/dtos/label.dto';
import { extractLabelFacts, formatLabelFactsForUser } from '../tools/label-facts';

function buildMetripharLabel(): Label {
  return {
    prodotto: 'METRIPHAR 70 WG',
    categoria: 'Erbicida selettivo',
    formulazione: 'WG',
    principio_attivo: 'Metribuzin',
    composizione: 'Metribuzin puro 70%',
    meccanismo_azione_frac: null,
    malattie: [],
    specie: ['Cencio molle'],
    colture_target: ['Patata', 'Pomodoro'],
    dosaggi_dettagliati: [
      {
        coltura: 'Patata',
        dose_minima: 250,
        dose_massima: 400,
        dose_um: 'g/ha',
        epoca_impiego: 'pre-emergenza',
        intervallo_sicurezza_giorni: 60,
        istruzioni: 'Non trattare su terreni sabbiosi.',
      },
      {
        coltura: 'Patata',
        dose_minima: 250,
        dose_massima: 300,
        dose_um: 'g/ha',
        epoca_impiego: 'post-emergenza',
        intervallo_sicurezza_giorni: 60,
      },
      {
        coltura: 'Pomodoro',
        dose_minima: 300,
        dose_massima: 500,
        dose_um: 'g/ha',
      },
    ],
    fasce_di_rispetto_e_deriva: [],
    fasce_rispetto_acqua: null,
    fasce_rispetto_colture: null,
    avvertenze: ['Non effettuare trattamenti sulle varieta Draga, Jarla e Vivax.'],
    frasi_pericolo: ['H410: Molto tossico per gli organismi acquatici.'],
    frasi_prudenza: [],
    compatibilita: 'Compatibile solo con diserbanti a reazione neutra.',
    fitotossicita: null,
    note_tecniche: null,
    extraction_confidence: 95,
    extracted_fields: [],
    errors: [],
    numero_registrazione: '10577',
  };
}

describe('label facts', () => {
  it('extracts crop-specific dose facts and explicit missing buffer status', () => {
    const facts = extractLabelFacts({
      label: buildMetripharLabel(),
      productName: 'Metriphar',
      registrationNumber: '10577',
      cropName: 'patata',
    });

    expect(facts.productName).toBe('Metriphar');
    expect(facts.doseFacts).toHaveLength(2);
    expect(facts.doseFacts[0]).toMatchObject({
      crop: 'Patata',
      dose: '250-400 g/ha',
      timing: 'pre-emergenza',
      phiDays: 60,
      instructions: 'Non trattare su terreni sabbiosi.',
    });
    expect(facts.doseFacts[1].dose).toBe('250-300 g/ha');
    expect(facts.bufferFacts.status).toBe('not_found');
    expect(facts.bufferFacts.message).toContain('Nessuna fascia');
    expect(facts.warnings[0]).toContain('Draga');
  });

  it('formats a user-facing fallback without technical loop wording', () => {
    const facts = extractLabelFacts({
      label: buildMetripharLabel(),
      productName: 'Metriphar',
      registrationNumber: '10577',
      cropName: 'Patata',
    });

    const message = formatLabelFactsForUser(facts);

    expect(message).toContain('250-400 g/ha');
    expect(message).toContain('250-300 g/ha');
    expect(message).toContain('60 giorni');
    expect(message).toContain('Nessuna fascia');
    expect(message).not.toContain('ciclo tecnico');
  });
});
