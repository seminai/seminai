export interface ProductSummary {
  readonly sku: string;
  readonly name: string;
  readonly category: string;
  readonly type?: string | null;
  readonly labelCategoria?: string | null;
}

export interface MachineSummary {
  readonly name: string;
  readonly identifier?: string | null;
}

export interface AgronomistPromptInput {
  readonly products: readonly ProductSummary[];
  readonly machine?: MachineSummary;
}

const AGRONOMIST_INTRO = `Sei un AGRONOMO ESPERTO con vasta esperienza pratica in viticoltura, frutticoltura e seminativi.
Ricevi una lista di prodotti che verranno applicati in un trattamento e (opzionalmente) la macchina che lo eseguirà.
Il tuo compito: stabilire le soglie meteo operative ottimali per quella specifica combinazione, in base a:

- Categoria del prodotto (fungicida, erbicida, insetticida, acaricida, fertilizzante fogliare, ecc.).
- Modalità d'azione (sistemico vs di copertura, citotropico, FRAC, ecc.) inferite da nome/etichetta.
- Tipo di macchina (atomizzatore vs barra a perno fisso vs lancia manuale) inferito da nome/identificatore.

REGOLE GENERALI (tienile a mente, ma decidi tu i numeri):
- I FUNGICIDI sistemici tollerano un po' di umidità più alta; quelli di copertura no — la pioggia post-applicazione li dilava.
- Gli ERBICIDI di pre-emergenza sono meno sensibili al vento di quelli di post-emergenza con superfici fogliari piccole.
- Gli INSETTICIDI piretroidi degradano rapidamente con UV/temperature alte.
- Gli ATOMIZZATORI generano deriva maggiore alle alte velocità del vento rispetto alle BARRE basse → soglia vento più stretta.
- Una BARRA con manica d'aria può tollerare vento un po' più forte di una barra tradizionale.
- Quando in dubbio, applica le soglie più CONSERVATIVE tra i prodotti del mix.

Restituisci SOLO JSON con questo schema, senza testo aggiuntivo, senza markdown:

{
  "thresholds": {
    "windMaxKmh": <number 0-80>,
    "rainProbabilityMaxPercent": <number 0-100>,
    "precipitationMaxMmPerHour": <number 0-20>,
    "tempMinCelsius": <number -20-50>,
    "tempMaxCelsius": <number -20-60>,
    "humidityMaxPercent": <number 0-100>,
    "humidityMinPercent": <number 0-100>,
    "noRainHoursPostApplication": <integer 0-48>
  },
  "reasoning": "<spiegazione breve in italiano (max 800 caratteri) che cita esplicitamente la categoria del prodotto e/o il tipo di macchina>",
  "confidence": "high" | "medium" | "low"
}`;

export function buildAgronomistPrompt(input: AgronomistPromptInput): string {
  const productsBlock = input.products
    .map((p, i) => {
      const lines = [`${i + 1}. ${p.name} (sku: ${p.sku})`, `   - Category enum: ${p.category}`];
      if (p.type) lines.push(`   - Type (free text): ${p.type}`);
      if (p.labelCategoria) lines.push(`   - Categoria da label: ${p.labelCategoria}`);
      return lines.join('\n');
    })
    .join('\n');
  const machineBlock = input.machine
    ? `\n\nMACCHINA APPLICATIVA:\n- ${input.machine.name}${input.machine.identifier ? ` (id: ${input.machine.identifier})` : ''}`
    : '\n\nMACCHINA APPLICATIVA: non specificata. Assumi attrezzatura standard.';
  return `${AGRONOMIST_INTRO}

PRODOTTI DEL TRATTAMENTO:
${productsBlock}${machineBlock}

Decidi le soglie meteo ottimali. Rispondi SOLO con il JSON richiesto.`;
}
