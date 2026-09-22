# Field Note Agent

Agent AI per la classificazione e gestione delle note di campo agricole.

## Caratteristiche

- **Classificazione automatica** con GPT-4o di note di campo in formato libero
- **Estrazione dati strutturati**: categoria, prodotti, quantità, campi, osservazioni
- **Ricerca intelligente** di corrispondenze con entità esistenti (fields, production units, products)
- **Workflow con approvazione umana** (human-in-the-loop)
- **Filtri per utente** - Tutti i dati sono filtrati automaticamente per userId

## Architettura
```
field_note_agent/
├── ChatFieldNoteAgent.ts  # Entry point e funzioni pubbliche
├── graph.ts               # LangGraph workflow con interrupt
├── tools.ts               # Inizializzazione dei 4 tool
├── types.ts               # TypeScript types
├── index.ts               # Export pubblici
└── README.md              # Documentazione
```
### Tools Disponibili
1. **classify_field_note_data**: Classifica il testo con LLM
2. **find_user_fields**: Cerca campi dell'utente
3. **find_user_production_units**: Cerca unità produttive
4. **find_user_products**: Cerca prodotti con stock
## Utilizzo Base
### 1. Creare l'agent
```typescript
import { createFieldNoteAgentApp } from './field_note_agent';
import { prisma } from '../../repositories/Prisma';
const agent = createFieldNoteAgentApp({
  userId: 'user-123',
  prisma,
  modelName: 'gpt-4o', // o 'gpt-4o-mini'
  temperature: 0.1,
});
```
### 2. Gestire un messaggio utente
```typescript
import { handleUserMessage } from './field_note_agent';
const response = await handleUserMessage(
  agent,
  'thread-456', // ID univoco della conversazione
  'ho dato 10 kg di rame nel campo vite ieri mattina',
);
console.log(response.status); // 'REQUIRES_APPROVAL' | 'COMPLETED' | 'ERROR'
console.log(response.message); // Risposta dell'agent
```
### 3. Workflow con approvazione
```typescript
import { approveAndExecute, rejectAndRespond } from './field_note_agent';
// Se lo stato è REQUIRES_APPROVAL
if (response.status === 'REQUIRES_APPROVAL') {
  console.log('Tool pending:', response.pendingToolCalls);
  // L'utente approva
  const finalResponse = await approveAndExecute(agent, 'thread-456');
  console.log(finalResponse.message);
  // OPPURE l'utente rifiuta e fornisce feedback
  // const correctedResponse = await rejectAndRespond(
  //   agent,
  //   'thread-456',
  //   'No, il campo era vigneto nord, non campo vite'
  // );
}
```
## Esempi di Messaggi
### Esempio 1: Operazione con prodotto
**Input:**
```
"ho dato 10 kg di rame nel campo vite"
```
**Classificazione attesa:**
```json
{
  "category": "OPERATION",
  "extractedData": {
    "recognizedProducts": [
      {
        "name": "rame",
        "quantity": 10,
        "unit": "kg",
        "confidence": 0.95
      }
    ],
    "recognizedField": {
      "name": "campo vite",
      "confidence": 0.88
    }
  },
  "confidence": 0.85
}
```
### Esempio 2: Osservazione malattia
**Input:**
```
"ho notato peronospora nel vigneto nord, le foglie hanno macchie marroni"
```
**Classificazione attesa:**
```json
{
  "category": "OBSERVATION",
  "extractedData": {
    "recognizedField": {
      "name": "vigneto nord",
      "confidence": 0.92
    },
    "recognizedObservations": [
      {
        "type": "disease",
        "name": "peronospora",
        "severity": "medium",
        "confidence": 0.9
      }
    ]
  }
}
```
### Esempio 3: Misurazione
**Input:**
```
"temperatura del terreno nel campo A: 18°C"
```
**Classificazione attesa:**
```json
{
  "category": "MEASUREMENT",
  "extractedData": {
    "recognizedField": {
      "name": "campo A",
      "confidence": 0.95
    },
    "extractedQuantities": [
      {
        "value": 18,
        "unit": "°C",
        "context": "temperatura del terreno"
      }
    ]
  }
}
```
## Test Scenarios
### Scenario 1: Creazione nota semplice
```typescript
// 1. L'utente invia la nota
const response1 = await handleUserMessage(
  agent,
  'thread-001',
  'ho dato 5 litri di concime liquido nel campo pomodori',
);
// 2. L'agent classifica e cerca corrispondenze
// Status: REQUIRES_APPROVAL
// L'agent ha trovato: classify_field_note_data, find_user_fields, find_user_products
// 3. L'utente approva
const response2 = await approveAndExecute(agent, 'thread-001');
// 4. L'agent presenta i risultati
// Status: COMPLETED
// L'agent suggerisce: Campo ID: xyz, Prodotto ID: abc
```
### Scenario 2: Nota ambigua con chiarimenti
```typescript
// 1. Nota ambigua
const response1 = await handleUserMessage(agent, 'thread-002', 'ho dato del prodotto nel campo');
// 2. L'agent chiede chiarimenti
// Status: COMPLETED
// Message: "Quale prodotto hai utilizzato? E in quale campo specifico?"
// 3. L'utente fornisce dettagli
const response2 = await handleUserMessage(
  agent,
  'thread-002',
  'era rame bordolese, 8 kg nel vigneto rosso',
);
// 4. Classificazione completa
// Status: REQUIRES_APPROVAL
```
### Scenario 3: Correzione dopo rifiuto
```typescript
// 1. Prima classificazione
const response1 = await handleUserMessage(
  agent,
  'thread-003',
  'ho trattato il campo con 10 kg di prodotto',
);
// 2. Richiede approvazione
// L'agent suggerisce un campo sbagliato
// 3. L'utente corregge
const response2 = await rejectAndRespond(
  agent,
  'thread-003',
  'No, il campo era vigneto sud, non campo vite',
);
// 4. L'agent riclassifica con il feedback
// Status: REQUIRES_APPROVAL (con campo corretto)
```
## Query Prisma
### Come l'agent filtra i dati per userId
```typescript
// Via UserOnCompany -> Company -> Field
const fields = await prisma.field.findMany({
  where: {
    company: {
      companyUsers: {
        some: { userId },
      },
    },
  },
});
// Via UserOnCompany -> Company -> Warehouse -> Product
const products = await prisma.product.findMany({
  where: {
    warehouse: {
      company: {
        companyUsers: {
          some: { userId },
        },
      },
    },
  },
});
// Via Field -> ProductionUnitOnField -> ProductionUnit
const productionUnits = await prisma.productionUnit.findMany({
  where: {
    productionUnitsOnFields: {
      some: {
        field: {
          company: {
            companyUsers: {
              some: { userId },
            },
          },
        },
      },
    },
  },
});
```
## Configurazione
### Variabili d'ambiente richieste
```bash
OPENAI_API_KEY=sk-...
DATABASE_URL=postgresql://...
```
### Modelli supportati
- `gpt-4o` (consigliato)
- `gpt-4o-mini` (economico)
- `gpt-4-turbo`
- `gpt-4`
- `gpt-3.5-turbo`
## Integrazione con Controller/Routes
Per integrare l'agent in un controller Express:
```typescript
// src/infrastructure/http/controllers/FieldNoteAgentController.ts
export class FieldNoteAgentController {
  async chat(request: Request, response: Response): Promise<Response> {
    const { message, threadId } = request.body;
    const userId = request.user.id;
    const agent = createFieldNoteAgentApp({
      userId,
      prisma,
      modelName: 'gpt-4o',
    });
    const result = await handleUserMessage(agent, threadId, message);
    return response.json({
      status: 'success',
      data: result,
    });
  }
  async approve(request: Request, response: Response): Promise<Response> {
    const { threadId } = request.body;
    const userId = request.user.id;
    const agent = createFieldNoteAgentApp({ userId, prisma });
    const result = await approveAndExecute(agent, threadId);
    return response.json({
      status: 'success',
      data: result,
    });
  }
}
```
## Debugging
Per debuggare l'agent, abilita i log:
```typescript
import { getConversationState } from './field_note_agent';
const state = await getConversationState(agent, 'thread-123');
console.log('Messages:', state.messages);
console.log('Pending field note:', state.pendingFieldNote);
```
## Limitazioni Attuali
1. L'agent non salva automaticamente le field notes nel database
2. Il salvataggio deve essere gestito dal controller dopo l'approvazione
3. Le coordinate GPS devono essere fornite separatamente (non estratte dal testo)
4. L'analisi delle immagini non è implementata (future)
## Prossimi Sviluppi
1. Tool per salvare direttamente la field note nel database
2. Fuzzy matching migliorato per prodotti con nomi simili
3. Estrazione coordinate GPS da EXIF delle foto
4. Analisi immagini per riconoscimento malattie
5. Supporto per note vocali (speech-to-text)
