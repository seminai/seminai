# Field Notes API — Part 1

[Back to the guide index](../FIELD_NOTES.md)


Le Field Notes (Note di Campo) sono una funzionalità che permette agli utenti di registrare osservazioni, operazioni e altre informazioni direttamente dal campo in formato libero.

## Caratteristiche Principali

- **Registrazione testuale libera**: Gli utenti possono inserire testo in linguaggio naturale (es: "ho dato 10 kg di prodotto X nel campo vite")
- **Geolocalizzazione**: Supporto per coordinate GPS (latitudine, longitudine, altitudine, accuratezza)
- **Categorie**: OPERATION, OBSERVATION, MEASUREMENT, HARVEST, MAINTENANCE, OTHER
- **Processamento AI**: Sistema di riconoscimento automatico per estrarre dati strutturati
- **Allegati**: Supporto per foto e documenti
- **Collegamento automatico**: Riconoscimento di prodotti, campi e unità produttive

## Architettura

Il sistema segue l'architettura esagonale del progetto:

```
Domain/
  ├── entities/
  │   ├── FieldNote.ts
  │   └── FieldNoteAttachment.ts
  ├── dtos/
  │   └── field-note.dto.ts
  └── repositories/
      └── IFieldNoteRepository.ts

Application/
  └── use-cases/field-note/
      ├── CreateFieldNoteUseCase.ts
      ├── GetFieldNoteByIdUseCase.ts
      ├── ListFieldNotesByUserUseCase.ts
      ├── UpdateFieldNoteUseCase.ts
      ├── DeleteFieldNoteUseCase.ts
      ├── AddFieldNoteAttachmentUseCase.ts
      └── GetFieldNoteStatsUseCase.ts

Infrastructure/
  ├── repositories/
  │   └── PrismaFieldNoteRepository.ts
  └── http/
      ├── controllers/
      │   └── FieldNoteController.ts
      └── routes/
          └── field-note.routes.ts
```

## Schema Database

### FieldNote

```prisma
model FieldNote {
  id                String                    @id @default(uuid())
  userId            String
  user              User                      @relation(...)

  category          FieldNoteCategory
  status            FieldNoteProcessingStatus @default(PENDING)

  rawContent        String                    // Testo originale
  extractedData     Json?                     // Dati estratti

  latitude          Float?
  longitude         Float?
  altitude          Float?
  gpsAccuracy       Float?

  operationDate     DateTime                  @default(now())

  // Relazioni opzionali (riconosciute automaticamente)
  fieldId           String?
  field             Field?
  productionUnitId  String?
  productionUnit    ProductionUnit?
  productId         String?
  product           Product?
  jobId             String?
  job               Job?

  metadata          Json?
  aiConfidenceScore Float?
  notes             String?

  attachments       FieldNoteAttachment[]

  createdAt         DateTime                  @default(now())
  updatedAt         DateTime                  @updatedAt
}
```

### Enums

```prisma
enum FieldNoteCategory {
  OPERATION     // Operazioni (trattamenti, semina, etc.)
  OBSERVATION   // Osservazioni (malattie, parassiti, etc.)
  MEASUREMENT   // Misurazioni (umidità, temperature, etc.)
  HARVEST       // Raccolta
  MAINTENANCE   // Manutenzione
  OTHER         // Altro
}

enum FieldNoteProcessingStatus {
  PENDING           // In attesa di processamento
  PROCESSING        // In elaborazione (AI sta analizzando)
  PROCESSED         // Processata con successo
  FAILED            // Fallita
  MANUALLY_REVIEWED // Revisionata manualmente
}
```

## API Endpoints

### POST /field-notes

Crea una nuova field note.

```bash
POST /field-notes
Authorization: Bearer <token>
Content-Type: application/json

{
  "category": "OPERATION",
  "rawContent": "ho dato 10 kg di prodotto 1 nel campo vite",
  "latitude": 45.464211,
  "longitude": 9.191383,
  "altitude": 120.5,
  "gpsAccuracy": 5.0,
  "operationDate": "2026-01-17T10:30:00Z",
  "metadata": {
    "weather": "sunny",
    "temperature": 22
  }
}
```

**Response:**

```json
{
  "status": "success",
  "data": {
    "fieldNote": {
      "id": "...",
      "userId": "...",
      "category": "OPERATION",
      "status": "PENDING",
      "rawContent": "ho dato 10 kg di prodotto 1 nel campo vite",
      "latitude": 45.464211,
      "longitude": 9.191383,
      ...
    }
  }
}
```

### GET /field-notes

Lista tutte le field notes dell'utente corrente con filtri opzionali.

**Query Parameters:**

- `category`: OPERATION, OBSERVATION, MEASUREMENT, HARVEST, MAINTENANCE, OTHER
- `status`: PENDING, PROCESSING, PROCESSED, FAILED, MANUALLY_REVIEWED
- `fieldId`: ID del campo
- `productionUnitId`: ID dell'unità produttiva
- `productId`: ID del prodotto
- `startDate`: Data inizio (ISO 8601)
- `endDate`: Data fine (ISO 8601)
- `hasLocation`: true/false (filtro per note con/senza GPS)

```bash
GET /field-notes?category=OPERATION&status=PROCESSED
Authorization: Bearer <token>
```

### GET /field-notes/:id

Ottiene una field note specifica con tutte le relazioni.

```bash
GET /field-notes/550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer <token>
```

### PUT /field-notes/:id

Aggiorna una field note.

```bash
PUT /field-notes/550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "MANUALLY_REVIEWED",
  "fieldId": "campo-123",
  "productId": "prodotto-456",
  "notes": "Verificato manualmente"
}
```

### DELETE /field-notes/:id

Elimina una field note.

```bash
DELETE /field-notes/550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer <token>
```

### POST /field-notes/attachments

Aggiunge un allegato a una field note.

**Upload diretto (consigliato):**

```bash
POST /field-notes/attachments
Authorization: Bearer <token>
Content-Type: multipart/form-data

fieldNoteId=550e8400-e29b-41d4-a716-446655440000
file=@/percorso/immagine.jpg
```

**Upload con URL già disponibile (alternativa):**

```bash
POST /field-notes/attachments
Authorization: Bearer <token>
Content-Type: application/json

{
  "fieldNoteId": "550e8400-e29b-41d4-a716-446655440000",
  "fileUrl": "https://storage.example.com/photos/image.jpg",
  "fileName": "peronospora_campo_vite.jpg",
  "fileType": "image/jpeg",
  "fileSize": 2048000,
  "thumbnailUrl": "https://storage.example.com/thumbnails/image_thumb.jpg",
  "metadata": {
    "width": 1920,
    "height": 1080,
    "exif": {...}
  }
}
```

### GET /field-notes/stats

Ottiene statistiche sulle field notes dell'utente.

```bash
GET /field-notes/stats
Authorization: Bearer <token>
```

**Response:**
