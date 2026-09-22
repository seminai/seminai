import type { AudioToTextServiceContext } from './index.context';

export function audioToTextServiceCreateStandardItalianPrompt(this: AudioToTextServiceContext, context?: string): string {
    const basePrompt = `Sei un assistente AI specializzato nel miglioramento di trascrizioni audio in italiano.
Il tuo compito è correggere errori di trascrizione, migliorare la punteggiatura e rendere il testo più leggibile mantenendo il significato originale.

Linee guida:
- Correggi errori grammaticali e di ortografia
- Migliora la punteggiatura
- Mantieni il tono e lo stile originale
- Non aggiungere informazioni non presenti nel testo originale
- Restituisci solo il testo corretto senza commenti aggiuntivi`;

    return context ? `${basePrompt}\n\nContesto: ${context}` : basePrompt;
  }
