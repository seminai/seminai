export interface DemoChatItem {
  readonly id: string;
  readonly title: string;
}

export interface DemoChatMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly timestamp: string;
}

export const DEMO_PAST_CHATS: readonly DemoChatItem[] = [
  { id: 'chat-1', title: 'Campi doc details' },
  { id: 'chat-2', title: 'Spese fertilizzanti Q1' },
  { id: 'chat-3', title: 'Negoziazione consorzio' },
];

export const DEMO_CHAT_MESSAGES: Record<string, readonly DemoChatMessage[]> = {
  'chat-1': [
    {
      id: 'm1',
      role: 'user',
      content: 'Quali campi ha il documento DDT 24869800?',
      timestamp: '10:32',
    },
    {
      id: 'm2',
      role: 'assistant',
      content:
        'Il DDT 24869800 contiene i seguenti campi: Numero documento, Data emissione, Fornitore, Destinatario, Elenco prodotti (nome, quantità, unità di misura), Peso lordo/netto, Firma del trasportatore.',
      timestamp: '10:32',
    },
    {
      id: 'm3',
      role: 'user',
      content: 'Manca il campo "lotto"?',
      timestamp: '10:33',
    },
    {
      id: 'm4',
      role: 'assistant',
      content:
        'Sì, il campo "Lotto" non è presente nel documento. Vuoi che lo aggiunga come campo personalizzato?',
      timestamp: '10:33',
    },
  ],
  'chat-2': [
    {
      id: 'm1',
      role: 'user',
      content: 'Quanto abbiamo speso in fertilizzanti nel Q1 2026?',
      timestamp: '14:10',
    },
    {
      id: 'm2',
      role: 'assistant',
      content: [
        'Nel **Q1 2026** la spesa totale per fertilizzanti è stata di **€12.450,00**. Ecco il dettaglio per fornitore:',
        '',
        '| Fornitore | Importo | Documenti | Variazione vs Q1 2025 |',
        '| --- | --- | --- | --- |',
        '| Az. Agr. Rossi | €5.200,00 | 3 | +18% |',
        '| Consorzio Bellettini | €4.750,00 | 2 | +5% |',
        '| Agri Forniture Srl | €2.500,00 | 1 | +8% |',
        '',
        "L'incremento principale è dovuto all'aumento dei prezzi di **Az. Agr. Rossi** (+18%).",
      ].join('\n'),
      timestamp: '14:10',
    },
    {
      id: 'm3',
      role: 'user',
      content: 'Mostrami il dettaglio dei prodotti acquistati',
      timestamp: '14:12',
    },
    {
      id: 'm4',
      role: 'assistant',
      content: [
        'Ecco il dettaglio dei prodotti acquistati nel Q1 2026:',
        '',
        '| Prodotto | Fornitore | Quantità | Unità | Prezzo unitario | Totale |',
        '| --- | --- | --- | --- | --- | --- |',
        '| Urea 46% | Az. Agr. Rossi | 500 | kg | €1,80 | €900,00 |',
        '| NPK 15-15-15 | Az. Agr. Rossi | 1.200 | kg | €2,10 | €2.520,00 |',
        '| Solfato ammonico | Az. Agr. Rossi | 800 | kg | €2,22 | €1.780,00 |',
        '| Concime fogliare | Consorzio Bellettini | 300 | lt | €8,50 | €2.550,00 |',
        '| Humus liquido | Consorzio Bellettini | 200 | lt | €11,00 | €2.200,00 |',
        '| Calcio granulare | Agri Forniture Srl | 1.000 | kg | €2,50 | €2.500,00 |',
      ].join('\n'),
      timestamp: '14:13',
    },
  ],
  'chat-3': [
    {
      id: 'm1',
      role: 'user',
      content: 'Riassumi la negoziazione con il consorzio Bellettini',
      timestamp: '09:05',
    },
    {
      id: 'm2',
      role: 'assistant',
      content:
        "La negoziazione con il Consorzio Bellettini riguarda il rinnovo del contratto di fornitura fertilizzanti 2026. Punti chiave: sconto volume del 8% confermato, pagamento a 60gg, consegna entro 5gg lavorativi. La fattura in scadenza il 20/03/2026 è relativa all'ultimo ordine del contratto corrente.",
      timestamp: '09:05',
    },
  ],
};
