# Setup Field Notes - Guida Completa

## Riepilogo Modifiche

Ho completato l'implementazione completa del sistema di Field Notes seguendo l'architettura esagonale del progetto. Di seguito trovi tutte le modifiche apportate.

## File Creati

### 1. Schema Database (Prisma)

**Modificato:** `prisma/schema.prisma`

- Aggiunti enum `FieldNoteCategory` e `FieldNoteProcessingStatus`
- Aggiunti modelli `FieldNote` e `FieldNoteAttachment`
- Aggiunte relazioni ai modelli esistenti (User, Field, ProductionUnit, Product, Job)

### 2. Domain Layer

**Entities:**

- `src/domain/entities/FieldNote.ts` - Entità dominio per le note di campo
- `src/domain/entities/FieldNoteAttachment.ts` - Entità dominio per gli allegati

**DTOs:**

- `src/domain/dtos/field-note.dto.ts` - Tutti i DTO necessari (Create, Update, Response, Filters, ecc.)

**Repositories:**

- `src/domain/repositories/IFieldNoteRepository.ts` - Interfaccia del repository

### 3. Application Layer

**Use Cases** (in `src/application/use-cases/field-note/`):

- `CreateFieldNoteUseCase.ts` - Creazione nuova nota
- `GetFieldNoteByIdUseCase.ts` - Recupero singola nota con relazioni
- `ListFieldNotesByUserUseCase.ts` - Lista note con filtri
- `UpdateFieldNoteUseCase.ts` - Aggiornamento nota
- `DeleteFieldNoteUseCase.ts` - Eliminazione nota
- `AddFieldNoteAttachmentUseCase.ts` - Aggiunta allegato
- `GetFieldNoteStatsUseCase.ts` - Statistiche utente

### 4. Infrastructure Layer

**Repository:**

- `src/infrastructure/repositories/PrismaFieldNoteRepository.ts` - Implementazione Prisma

**Controller:**

- `src/infrastructure/http/controllers/FieldNoteController.ts` - Controller Express

**Routes:**

- `src/infrastructure/http/routes/field-note.routes.ts` - Definizione routes
- Modificato `src/infrastructure/http/routes/index.ts` - Aggiunta route `/field-notes`

### 5. Documentazione

- `docs/FIELD_NOTES.md` - Documentazione completa API e architettura
- `FIELD_NOTES_SETUP.md` - Questo file

## Prossimi Passi

### 1. Migration Database

Esegui la migration per creare le nuove tabelle nel database:

```bash
# Genera la migration
npx prisma migrate dev --name add_field_notes

# Visualizza lo schema generato
npx prisma generate

# (Opzionale) Visualizza il database con Prisma Studio
npx prisma studio
```

### 2. Verifica Compilazione TypeScript

```bash
# Compila il progetto per verificare che non ci siano errori
npm run build

# Oppure esegui il type-check
npx tsc --noEmit
```

### 3. Test delle API

Avvia il server:

```bash
npm run dev
```

Testa gli endpoint (esempio con curl):

```bash
# 1. Crea una field note
curl -X POST http://localhost:3000/field-notes \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "category": "OPERATION",
    "rawContent": "ho dato 10 kg di prodotto X nel campo vite",
    "latitude": 45.464211,
    "longitude": 9.191383
  }'

# 2. Lista tutte le field notes
curl -X GET http://localhost:3000/field-notes \
  -H "Authorization: Bearer YOUR_TOKEN"

# 3. Ottieni statistiche
curl -X GET http://localhost:3000/field-notes/stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 4. Documentazione Swagger

Le API sono già documentate con JSDoc. Se hai Swagger configurato, gli endpoint saranno automaticamente disponibili nella documentazione Swagger UI alla route `/api-docs`.

## Funzionalità Implementate

✅ **CRUD Completo**

- Creazione note di campo con testo libero
- Lettura singola e lista con filtri avanzati
- Aggiornamento (inclusi collegamenti manuali a prodotti/campi)
- Eliminazione

✅ **Geolocalizzazione**

- Supporto coordinate GPS (lat, lon, altitude, accuracy)
- Query per note vicine (findNearbyFieldNotes)

✅ **Categorie**

- OPERATION (operazioni)
- OBSERVATION (osservazioni)
- MEASUREMENT (misurazioni)
- HARVEST (raccolta)
- MAINTENANCE (manutenzione)
- OTHER (altro)

✅ **Stati Processamento**

- PENDING (in attesa)
- PROCESSING (in elaborazione)
- PROCESSED (processata)
- FAILED (fallita)
- MANUALLY_REVIEWED (revisionata manualmente)

✅ **Allegati**

- Sistema di gestione allegati (foto, documenti)
- Supporto per thumbnail
- Metadati EXIF
- Spazio per analisi AI futura

✅ **Relazioni Opzionali**

- Collegamento a Field (campi)
- Collegamento a ProductionUnit (unità produttive)
- Collegamento a Product (prodotti)
- Collegamento a Job (operazioni formali)

✅ **Sicurezza**

- Autenticazione richiesta su tutti gli endpoint
- Verifica ownership delle note
- Protezione da accessi non autorizzati

## Sviluppi Futuri (Non Implementati)

Le seguenti funzionalità sono state progettate nello schema ma richiedono implementazione aggiuntiva:

### 1. Processamento AI con LLM

Creare un nuovo use case `ProcessFieldNoteWithAiUseCase` che:

- Analizza il `rawContent` con un LLM (es. OpenAI GPT-4)
- Estrae dati strutturati (prodotti, quantità, operazioni)
- Fa matching fuzzy con prodotti esistenti nel database
- Identifica il campo dalle coordinate GPS
- Popola `extractedData` e `aiConfidenceScore`
- Aggiorna automaticamente `fieldId`, `productionUnitId`, `productId`

**File da creare:**

```
src/application/use-cases/field-note/ProcessFieldNoteWithAiUseCase.ts
src/infrastructure/services/field-note-ai/FieldNoteAiService.ts
```

### 2. Analisi Immagini

Per gli allegati di tipo immagine:

- Riconoscimento malattie/parassiti con AI
- OCR per etichette prodotti
- Estrazione automatica metadati EXIF

### 3. Conversione in Job

Creare un endpoint per convertire una field note in un Job formale:

```
POST /field-notes/:id/convert-to-job
```

### 4. Background Processing Queue

Implementare una coda per il processamento asincrono:

- BullMQ per gestire le code
- Worker dedicato per processamento AI
- Notifiche push quando il processamento è completato

### 5. Ricerca Geospaziale Avanzata

Migliorare `findNearbyFieldNotes` con:

- PostGIS per query geospaziali performanti
- Ricerca all'interno di poligoni (campi)
- Clustering di note vicine

## Struttura Dati Estratti (AI)

Quando implementerai il processamento AI, usa questa struttura per `extractedData`:

```typescript
{
  "recognizedProducts": [
    {
      "name": "Prodotto X",
      "quantity": 10,
      "unit": "kg",
      "confidence": 0.95,
      "matchedProductId": "uuid-prodotto" // se trovato match
    }
  ],
  "recognizedField": {
    "name": "campo vite",
    "confidence": 0.88,
    "matchedFieldId": "uuid-campo"
  },
  "recognizedProductionUnit": {
    "name": "vigneto nord",
    "confidence": 0.75,
    "matchedProductionUnitId": "uuid-unit"
  },
  "recognizedOperation": {
    "type": "TREATMENT", // o FERTILIZATION, SEEDING
    "description": "applicazione prodotto",
    "confidence": 0.90
  },
  "recognizedObservations": [
    {
      "type": "disease",
      "name": "peronospora",
      "severity": "medium",
      "confidence": 0.85
    }
  ],
  "extractedQuantities": [
    {
      "value": 10,
      "unit": "kg",
      "context": "prodotto applicato"
    }
  ]
}
```

## Note Tecniche

### Performance

- Le query utilizzano indici su: `userId`, `category`, `status`, `operationDate`, `fieldId`, `productionUnitId`, `productId`, `[latitude, longitude]`
- `findNearbyFieldNotes` usa una query SQL raw con formula di Haversine (considera PostGIS per production)

### Validazioni

- Tutti i campi obbligatori sono validati nei use case
- Le date sono automaticamente convertite da string a Date nei controller
- I filtri sono opzionali e type-safe

### Testing

Per creare test:

1. Mock del repository (`PrismaFieldNoteRepository`)
2. Test dei use case con dati di esempio
3. Test di integrazione con database di test
4. Test E2E degli endpoint con Supertest

## Troubleshooting

### Errore: "Type 'FieldNote' is not assignable..."

Soluzione: Esegui `npx prisma generate` dopo la migration

### Errore: "Cannot find module '@prisma/client'"

Soluzione: Installa le dipendenze `npm install`

### Errore 401 Unauthorized

Soluzione: Verifica che il token JWT sia valido e presente nell'header `Authorization: Bearer <token>`

### Errore 403 Forbidden

Soluzione: L'utente sta cercando di accedere a una nota di un altro utente

## Checklist Completamento

- [x] Schema Prisma aggiornato
- [x] Entità dominio create
- [x] DTOs definiti
- [x] Repository interface e implementazione
- [x] Use cases implementati
- [x] Controller creato
- [x] Routes configurate
- [x] Documentazione API (JSDoc/Swagger)
- [x] Documentazione tecnica
- [ ] Migration eseguita (da fare)
- [ ] Test manuale API (da fare)
- [ ] Processamento AI (future)
- [ ] Analisi immagini (future)
- [ ] Test automatici (consigliato)

## Contatti e Supporto

Per domande o problemi, consulta:

- `docs/FIELD_NOTES.md` per documentazione API completa
- Codice sorgente con commenti JSDoc
- Architettura esagonale del progetto (`.cursor/rules/exagonal.mdc`)

Buon lavoro! 🚀
