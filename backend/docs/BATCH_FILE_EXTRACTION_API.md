# Batch File Extraction API

Endpoint unificato per caricare N file, estrarre dati strutturati in background, visualizzare/modificare i risultati e confermare la creazione delle entita'.

## Indice

1. [Flusso completo](#flusso-completo)
2. [Categorie supportate](#categorie-supportate)
3. [Upload batch](#1-upload-batch)
4. [Progress real-time (Socket.IO)](#2-progress-real-time-socketio)
5. [Lista estrazioni](#3-lista-estrazioni)
6. [Dettaglio estrazione](#4-dettaglio-singola-estrazione)
7. [Modifica dati estratti](#5-modifica-dati-estratti-patch)
8. [Conferma singola](#6-conferma-singola)
9. [Conferma batch](#7-conferma-batch)
10. [Elimina estrazione](#8-elimina-estrazione)
11. [Struttura extractedData per categoria](#struttura-extracteddata-per-categoria)
12. [Errori](#errori)

---

## Flusso completo

```
1. POST /extractions/batch        -> Upload file + avvio estrazioni in background (202)
2. Socket.IO room extraction:{batchId}  -> Progress real-time per ogni file
3. GET /extractions?companyId=X   -> Lista estrazioni (storico)
4. GET /extractions/:id           -> Dettaglio singola con extractedData
5. PATCH /extractions/:id         -> (opzionale) Modifica dati prima della conferma
6. POST /extractions/:id/confirm  -> Conferma singola -> crea entita' nel DB
   POST /extractions/batch/:batchId/confirm -> Conferma intero batch
7. DELETE /extractions/:id        -> Elimina estrazione
```

### Stati di una estrazione

| Stato                  | Significato                                         |
| ---------------------- | --------------------------------------------------- |
| `LOADING`              | Estrazione in corso (progress 0-100)                |
| `PENDING_CONFIRMATION` | Estrazione completata, in attesa di conferma utente |
| `CONFIRMED`            | Dati confermati e entita' create nel DB             |
| `ERROR`                | Estrazione fallita                                  |

---

## Categorie supportate

| Categoria          | Descrizione                     | Formati file supportati     |
| ------------------ | ------------------------------- | --------------------------- |
| `fields`           | Parcelle/campi                  | CSV, Excel, ZIP (shapefile) |
| `production_units` | Unita' produttive               | CSV, Excel, PDF             |
| `invoice`          | Fatture                         | PDF, XML (FatturaPA)        |
| `ddt`              | Documenti di trasporto          | PDF                         |
| `stock`            | Magazzino (carico/scarico)      | CSV, Excel                  |
| `auto`             | Rilevamento automatico del tipo | Tutti                       |

Quando si usa `auto`, il sistema analizza il contenuto del file e assegna la categoria piu' appropriata (puo' diventare `agricultural` = campi + unita' produttive insieme).

---

## 1. Upload batch

Carica uno o piu' file (max 10) e avvia le estrazioni in background.

### Request

```
POST /extractions/batch
Content-Type: multipart/form-data
Authorization: Bearer <token>
```

| Campo        | Tipo   | Obbligatorio | Descrizione                           |
| ------------ | ------ | ------------ | ------------------------------------- |
| `files`      | File[] | si           | Array di file (max 10)                |
| `companyId`  | string | si           | ID azienda                            |
| `categories` | string | si           | JSON array di categorie, uno per file |

> **Nota:** L'utente deve avere ruolo `ADMIN` o `EDITOR` nella company specificata.

### cURL — Upload singolo file (fattura PDF)

```bash
curl -X POST http://localhost:8081/extractions/batch \
  -H "Authorization: Bearer <token>" \
  -F "companyId=abc-123-company-id" \
  -F "categories=[\"invoice\"]" \
  -F "files=@/path/to/fattura.pdf"
```

### cURL — Upload multiplo (campi CSV + fattura PDF + magazzino Excel)

```bash
curl -X POST http://localhost:8081/extractions/batch \
  -H "Authorization: Bearer <token>" \
  -F "companyId=abc-123-company-id" \
  -F 'categories=["fields", "invoice", "stock"]' \
  -F "files=@/path/to/campi.csv" \
  -F "files=@/path/to/fattura.pdf" \
  -F "files=@/path/to/magazzino.xlsx"
```

### cURL — Upload con auto-detection

```bash
curl -X POST http://localhost:8081/extractions/batch \
  -H "Authorization: Bearer <token>" \
  -F "companyId=abc-123-company-id" \
  -F 'categories=["auto", "auto"]' \
  -F "files=@/path/to/file1.csv" \
  -F "files=@/path/to/file2.pdf"
```

### Response (HTTP 202 Accepted)

```json
{
  "status": "accepted",
  "data": {
    "batchId": "b7f3a1e2-9c4d-4e6f-8a2b-1d3e5f7a9b0c",
    "extractions": [
      {
        "id": "e1a2b3c4-d5e6-f7a8-b9c0-d1e2f3a4b5c6",
        "fileIndex": 0,
        "fileName": "campi.csv",
        "category": "fields",
        "status": "LOADING"
      },
      {
        "id": "f2b3c4d5-e6f7-a8b9-c0d1-e2f3a4b5c6d7",
        "fileIndex": 1,
        "fileName": "fattura.pdf",
        "category": "invoice",
        "status": "LOADING"
      },
      {
        "id": "a3b4c5d6-e7f8-a9b0-c1d2-e3f4a5b6c7d8",
        "fileIndex": 2,
        "fileName": "magazzino.xlsx",
        "category": "stock",
        "status": "LOADING"
      }
    ]
  }
}
```

Le estrazioni avvengono **in background** (in parallelo). Il client riceve subito il `batchId` e gli `extractionId` per monitorare il progresso.

---

## 2. Progress real-time (Socket.IO)

Il client si connette alla room `extraction:{batchId}` per ricevere aggiornamenti in tempo reale.

### Connessione

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:8081', {
  auth: { token: '<jwt-token>' },
});

socket.emit('join', `extraction:${batchId}`);
```

### Eventi emessi dal server

#### `extraction:progress` — Avanzamento file

```json
{
  "extractionId": "e1a2b3c4-d5e6-f7a8-b9c0-d1e2f3a4b5c6",
  "fileIndex": 0,
  "fileName": "campi.csv",
  "progress": 50
}
```

#### `extraction:completed` — File estratto con successo

```json
{
  "extractionId": "e1a2b3c4-d5e6-f7a8-b9c0-d1e2f3a4b5c6",
  "fileIndex": 0,
  "fileName": "campi.csv",
  "category": "fields",
  "status": "PENDING_CONFIRMATION"
}
```

#### `extraction:error` — Estrazione fallita

```json
{
  "extractionId": "f2b3c4d5-e6f7-a8b9-c0d1-e2f3a4b5c6d7",
  "fileIndex": 1,
  "fileName": "fattura.pdf",
  "error": "Failed to parse PDF: corrupted file"
}
```

#### `extraction:done` — Batch completato (tutti i file processati)

```json
{
  "batchId": "b7f3a1e2-9c4d-4e6f-8a2b-1d3e5f7a9b0c"
}
```

> **Nota:** `extraction:done` viene emesso quando **tutti** i file del batch sono stati processati (con successo o errore). I file che falliscono non bloccano gli altri.

### Esempio listener completo (frontend)

```javascript
socket.on('extraction:progress', ({ extractionId, fileName, progress }) => {
  console.log(`${fileName}: ${progress}%`);
  updateProgressBar(extractionId, progress);
});

socket.on('extraction:completed', ({ extractionId, fileName, category }) => {
  console.log(`${fileName} completato (${category})`);
  markAsReady(extractionId);
});

socket.on('extraction:error', ({ extractionId, fileName, error }) => {
  console.error(`${fileName} fallito: ${error}`);
  markAsError(extractionId, error);
});

socket.on('extraction:done', ({ batchId }) => {
  console.log('Batch completato!');
  loadExtractionResults(batchId);
});
```

---

## 3. Lista estrazioni

Recupera tutte le estrazioni per una company (storico).

### Request

```
GET /extractions?companyId=abc-123-company-id
Authorization: Bearer <token>
```

### cURL

```bash
curl -s http://localhost:8081/extractions?companyId=abc-123-company-id \
  -H "Authorization: Bearer <token>" | jq
```

### Response (HTTP 200)

```json
{
  "status": "success",
  "data": {
    "extractions": [
      {
        "id": "e1a2b3c4-d5e6-f7a8-b9c0-d1e2f3a4b5c6",
        "batchId": "b7f3a1e2-9c4d-4e6f-8a2b-1d3e5f7a9b0c",
        "status": "PENDING_CONFIRMATION",
        "category": "fields",
        "progress": 100,
        "fileName": "campi.csv",
        "fileIndex": 0,
        "fileUrl": "https://storage.googleapis.com/bucket/path/campi.csv",
        "extractedData": {
          "fields": [ ... ],
          "extractedCount": 5
        },
        "error": null,
        "createdAt": "2026-03-16T10:30:00.000Z",
        "updatedAt": "2026-03-16T10:30:15.000Z"
      },
      {
        "id": "f2b3c4d5-e6f7-a8b9-c0d1-e2f3a4b5c6d7",
        "batchId": "b7f3a1e2-9c4d-4e6f-8a2b-1d3e5f7a9b0c",
        "status": "ERROR",
        "category": "invoice",
        "progress": 20,
        "fileName": "fattura_corrotta.pdf",
        "fileIndex": 1,
        "fileUrl": "https://storage.googleapis.com/bucket/path/fattura.pdf",
        "extractedData": null,
        "error": "Failed to parse PDF",
        "createdAt": "2026-03-16T10:30:00.000Z",
        "updatedAt": "2026-03-16T10:30:05.000Z"
      },
      {
        "id": "a3b4c5d6-e7f8-a9b0-c1d2-e3f4a5b6c7d8",
        "batchId": "b7f3a1e2-9c4d-4e6f-8a2b-1d3e5f7a9b0c",
        "status": "CONFIRMED",
        "category": "stock",
        "progress": 100,
        "fileName": "magazzino.xlsx",
        "fileIndex": 2,
        "fileUrl": "https://storage.googleapis.com/bucket/path/magazzino.xlsx",
        "extractedData": {
          "entries": [ ... ],
          "extractedCount": 12
        },
        "error": null,
        "createdAt": "2026-03-16T10:30:00.000Z",
        "updatedAt": "2026-03-16T10:35:00.000Z"
      }
    ]
  }
}
```

---

## 4. Dettaglio singola estrazione

Recupera i dati completi di una estrazione, incluso `extractedData`.

### Request

```
GET /extractions/:id
Authorization: Bearer <token>
```

### cURL

```bash
curl -s http://localhost:8081/extractions/e1a2b3c4-d5e6-f7a8-b9c0-d1e2f3a4b5c6 \
  -H "Authorization: Bearer <token>" | jq
```

### Response (HTTP 200) — Esempio categoria `fields`

```json
{
  "status": "success",
  "data": {
    "extraction": {
      "id": "e1a2b3c4-d5e6-f7a8-b9c0-d1e2f3a4b5c6",
      "batchId": "b7f3a1e2-9c4d-4e6f-8a2b-1d3e5f7a9b0c",
      "status": "PENDING_CONFIRMATION",
      "category": "fields",
      "progress": 100,
      "fileName": "campi.csv",
      "fileIndex": 0,
      "fileUrl": "https://storage.googleapis.com/bucket/path/campi.csv",
      "extractedData": {
        "fields": [
          {
            "companyId": "abc-123-company-id",
            "name": "Vigneto Nord",
            "coordinates": [],
            "coordinatesGaussBoaga": [],
            "latitude": 44.4949,
            "longitude": 11.3426,
            "polygon": null,
            "polygonGaussBoaga": null,
            "gisHa": 2.5,
            "sauHa": 2.3,
            "ph": null,
            "nitrogen": null,
            "phosphorus": null,
            "potassium": null,
            "calcium": null,
            "magnesium": null,
            "soilType": "argilloso",
            "uso": "seminativo",
            "qualita": "buona",
            "superficieCatastaleMq": 25000,
            "sezione": "A",
            "foglio": "12",
            "particella": "345",
            "subalterno": null,
            "nation": "Italia",
            "region": "Emilia-Romagna",
            "city": "Bologna",
            "address": "Via Campagna 1",
            "cap": "40100",
            "variazioneMq": null,
            "inizioConduzione": "2020-01-15",
            "fineConduzione": null
          }
        ],
        "extractedCount": 1
      },
      "error": null,
      "createdAt": "2026-03-16T10:30:00.000Z",
      "updatedAt": "2026-03-16T10:30:15.000Z"
    }
  }
}
```

### Response — Esempio categoria `invoice`

```json
{
  "status": "success",
  "data": {
    "extraction": {
      "id": "f2b3c4d5-e6f7-a8b9-c0d1-e2f3a4b5c6d7",
      "batchId": "b7f3a1e2-9c4d-4e6f-8a2b-1d3e5f7a9b0c",
      "status": "PENDING_CONFIRMATION",
      "category": "invoice",
      "progress": 100,
      "fileName": "fattura_bellini.pdf",
      "fileIndex": 0,
      "fileUrl": "https://storage.googleapis.com/bucket/path/fattura_bellini.pdf",
      "extractedData": {
        "entries": [
          {
            "productName": "GLYPHOSATE 360 SL",
            "registrationNumber": "12345",
            "productCategory": "PHYTOSANITARY",
            "administrativeStatus": "Autorizzato",
            "quantity": 20,
            "quantityUnitOfMeasure": "L",
            "supplierName": "Agri Supply S.r.l.",
            "supplierVat": "IT01234567890",
            "invoiceNumber": "FT-2026/0042",
            "invoiceDate": "2026-03-10",
            "invoiceDueDate": "2026-04-10",
            "unitPrice": 12.5,
            "totalPrice": 250.0
          },
          {
            "productName": "CONCIME NPK 20-10-10",
            "registrationNumber": null,
            "productCategory": "FERTILIZER",
            "administrativeStatus": null,
            "quantity": 500,
            "quantityUnitOfMeasure": "KG",
            "supplierName": "Agri Supply S.r.l.",
            "supplierVat": "IT01234567890",
            "invoiceNumber": "FT-2026/0042",
            "invoiceDate": "2026-03-10",
            "invoiceDueDate": "2026-04-10",
            "unitPrice": 0.85,
            "totalPrice": 425.0
          }
        ],
        "extractedCount": 2
      },
      "error": null,
      "createdAt": "2026-03-16T10:30:00.000Z",
      "updatedAt": "2026-03-16T10:30:25.000Z"
    }
  }
}
```

### Response — Esempio categoria `stock`

```json
{
  "status": "success",
  "data": {
    "extraction": {
      "id": "a3b4c5d6-e7f8-a9b0-c1d2-e3f4a5b6c7d8",
      "batchId": "b7f3a1e2-9c4d-4e6f-8a2b-1d3e5f7a9b0c",
      "status": "PENDING_CONFIRMATION",
      "category": "stock",
      "progress": 100,
      "fileName": "magazzino.xlsx",
      "fileIndex": 0,
      "fileUrl": "https://storage.googleapis.com/bucket/path/magazzino.xlsx",
      "extractedData": {
        "entries": [
          {
            "name": "GLYPHOSATE 360 SL",
            "category": "PESTICIDE",
            "registrationNumber": "12345",
            "stock": {
              "quantity": 20,
              "unitOfMeasureQuantity": "L",
              "price": 250.0,
              "type": "IN",
              "ddtCode": "DDT-2026-001",
              "ddtDate": "2026-03-10",
              "invoiceCode": "FT-2026/0042",
              "companySupplierName": "Agri Supply S.r.l."
            }
          }
        ],
        "extractedCount": 1
      },
      "error": null,
      "createdAt": "2026-03-16T10:30:00.000Z",
      "updatedAt": "2026-03-16T10:30:10.000Z"
    }
  }
}
```

### Response — Esempio categoria `agricultural` (campi + unita' produttive)

```json
{
  "status": "success",
  "data": {
    "extraction": {
      "id": "d4e5f6a7-b8c9-d0e1-f2a3-b4c5d6e7f8a9",
      "batchId": "b7f3a1e2-9c4d-4e6f-8a2b-1d3e5f7a9b0c",
      "status": "PENDING_CONFIRMATION",
      "category": "agricultural",
      "progress": 100,
      "fileName": "piano_colturale.xlsx",
      "fileIndex": 0,
      "fileUrl": "https://storage.googleapis.com/bucket/path/piano_colturale.xlsx",
      "extractedData": {
        "fields": [
          {
            "companyId": "abc-123-company-id",
            "name": "Vigneto Nord",
            "foglio": "12",
            "particella": "345",
            "gisHa": 2.5,
            "...": "..."
          }
        ],
        "productionUnits": [
          {
            "name": "UP Vite Sangiovese",
            "cropName": "Vite",
            "cropType": "frutticoli",
            "variety": "Sangiovese",
            "protocoll": "Biologico",
            "protectionStructure": null,
            "startDate": "2026-03-01",
            "endDate": "2026-10-15",
            "areaHa": 2.5,
            "fieldAllocations": [
              {
                "foglio": "12",
                "particella": "345",
                "areaHa": 2.5,
                "fieldId": null,
                "fieldName": "Vigneto Nord"
              }
            ]
          }
        ],
        "extractedCount": 2
      },
      "error": null,
      "createdAt": "2026-03-16T10:30:00.000Z",
      "updatedAt": "2026-03-16T10:30:20.000Z"
    }
  }
}
```

---

## 5. Modifica dati estratti (PATCH)

L'utente puo' modificare i dati estratti **prima** della conferma. Solo le estrazioni con status `PENDING_CONFIRMATION` possono essere modificate.

### Request

```
PATCH /extractions/:id
Content-Type: application/json
Authorization: Bearer <token>
```

### cURL — Modificare una entry di fattura

```bash
curl -X PATCH http://localhost:8081/extractions/f2b3c4d5-e6f7-a8b9-c0d1-e2f3a4b5c6d7 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "extractedData": {
      "entries": [
        {
          "productName": "GLYPHOSATE 360 SL (corretto)",
          "registrationNumber": "12345",
          "productCategory": "PHYTOSANITARY",
          "administrativeStatus": "Autorizzato",
          "quantity": 25,
          "quantityUnitOfMeasure": "L",
          "supplierName": "Agri Supply S.r.l.",
          "supplierVat": "IT01234567890",
          "invoiceNumber": "FT-2026/0042",
          "invoiceDate": "2026-03-10",
          "invoiceDueDate": "2026-04-10",
          "unitPrice": 12.50,
          "totalPrice": 312.50
        }
      ],
      "extractedCount": 1
    }
  }'
```

### cURL — Rimuovere un campo estratto dalla lista

```bash
curl -X PATCH http://localhost:8081/extractions/e1a2b3c4-d5e6-f7a8-b9c0-d1e2f3a4b5c6 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "extractedData": {
      "fields": [
        {
          "companyId": "abc-123-company-id",
          "name": "Vigneto Nord (solo questo campo mantenuto)",
          "coordinates": [],
          "coordinatesGaussBoaga": [],
          "latitude": 44.4949,
          "longitude": 11.3426
        }
      ],
      "extractedCount": 1
    }
  }'
```

### Response (HTTP 200)

```json
{
  "status": "success",
  "data": {
    "extraction": {
      "id": "f2b3c4d5-e6f7-a8b9-c0d1-e2f3a4b5c6d7",
      "batchId": "b7f3a1e2-9c4d-4e6f-8a2b-1d3e5f7a9b0c",
      "status": "PENDING_CONFIRMATION",
      "category": "invoice",
      "progress": 100,
      "fileName": "fattura_bellini.pdf",
      "fileIndex": 0,
      "fileUrl": "https://storage.googleapis.com/...",
      "extractedData": {
        "entries": [
          {
            "productName": "GLYPHOSATE 360 SL (corretto)",
            "quantity": 25,
            "totalPrice": 312.5,
            "...": "..."
          }
        ],
        "extractedCount": 1
      },
      "error": null,
      "createdAt": "2026-03-16T10:30:00.000Z",
      "updatedAt": "2026-03-16T10:40:00.000Z"
    }
  }
}
```

---

## 6. Conferma singola

Conferma una estrazione e crea le entita' nel database. Solo estrazioni con status `PENDING_CONFIRMATION`.

### Request

```
POST /extractions/:id/confirm
Authorization: Bearer <token>
```

### cURL

```bash
curl -X POST http://localhost:8081/extractions/e1a2b3c4-d5e6-f7a8-b9c0-d1e2f3a4b5c6/confirm \
  -H "Authorization: Bearer <token>"
```

### Response (HTTP 200) — Conferma `fields`

```json
{
  "status": "success",
  "data": {
    "extractionId": "e1a2b3c4-d5e6-f7a8-b9c0-d1e2f3a4b5c6",
    "category": "fields",
    "status": "CONFIRMED",
    "summary": {
      "fieldsCreated": 5
    }
  }
}
```

### Response — Conferma `production_units`

```json
{
  "status": "success",
  "data": {
    "extractionId": "...",
    "category": "production_units",
    "status": "CONFIRMED",
    "summary": {
      "productionUnitsCreated": 3
    }
  }
}
```

### Response — Conferma `agricultural`

```json
{
  "status": "success",
  "data": {
    "extractionId": "...",
    "category": "agricultural",
    "status": "CONFIRMED",
    "summary": {
      "fieldsCreated": 5,
      "productionUnitsCreated": 3
    }
  }
}
```

### Response — Conferma `invoice` / `ddt`

```json
{
  "status": "success",
  "data": {
    "extractionId": "...",
    "category": "invoice",
    "status": "CONFIRMED",
    "summary": {
      "productsCreated": 2,
      "productsUpdated": 0,
      "stocksCreated": 2
    }
  }
}
```

### Response — Conferma `stock`

```json
{
  "status": "success",
  "data": {
    "extractionId": "...",
    "category": "stock",
    "status": "CONFIRMED",
    "summary": {
      "productsCreated": 1,
      "stocksCreated": 1
    }
  }
}
```

---

## 7. Conferma batch

Conferma tutte le estrazioni `PENDING_CONFIRMATION` di un batch in un'unica chiamata. Le estrazioni in `ERROR` o gia' `CONFIRMED` vengono ignorate.

### Request

```
POST /extractions/batch/:batchId/confirm
Authorization: Bearer <token>
```

### cURL

```bash
curl -X POST http://localhost:8081/extractions/batch/b7f3a1e2-9c4d-4e6f-8a2b-1d3e5f7a9b0c/confirm \
  -H "Authorization: Bearer <token>"
```

### Response (HTTP 200)

```json
{
  "status": "success",
  "data": {
    "confirmed": [
      {
        "extractionId": "e1a2b3c4-d5e6-f7a8-b9c0-d1e2f3a4b5c6",
        "category": "fields",
        "status": "CONFIRMED",
        "summary": { "fieldsCreated": 5 }
      },
      {
        "extractionId": "a3b4c5d6-e7f8-a9b0-c1d2-e3f4a5b6c7d8",
        "category": "stock",
        "status": "CONFIRMED",
        "summary": { "productsCreated": 3, "stocksCreated": 3 }
      }
    ],
    "skipped": 1,
    "errors": []
  }
}
```

- `confirmed`: estrazioni confermate con successo
- `skipped`: numero di estrazioni saltate (non `PENDING_CONFIRMATION`)
- `errors`: estrazioni che hanno fallito durante la conferma

### Response con errori parziali

```json
{
  "status": "success",
  "data": {
    "confirmed": [
      {
        "extractionId": "e1a2b3c4-...",
        "category": "fields",
        "status": "CONFIRMED",
        "summary": { "fieldsCreated": 5 }
      }
    ],
    "skipped": 1,
    "errors": [
      {
        "extractionId": "f2b3c4d5-...",
        "error": "Company not found for extraction"
      }
    ]
  }
}
```

---

## 8. Elimina estrazione

Elimina un record di estrazione.

### Request

```
DELETE /extractions/:id
Authorization: Bearer <token>
```

### cURL

```bash
curl -X DELETE http://localhost:8081/extractions/e1a2b3c4-d5e6-f7a8-b9c0-d1e2f3a4b5c6 \
  -H "Authorization: Bearer <token>"
```

### Response

```
HTTP 204 No Content
```

---

## Struttura extractedData per categoria

### `fields`

```typescript
{
  fields: FieldBulkPreview[];   // Array di campi estratti
  extractedCount: number;       // Numero totale
  diagnostics?: unknown;        // Eventuali diagnostiche
}
```

Ogni `FieldBulkPreview`:

| Campo                   | Tipo           | Descrizione               |
| ----------------------- | -------------- | ------------------------- |
| `companyId`             | string         | ID azienda                |
| `name`                  | string         | Nome campo                |
| `foglio`                | string \| null | Foglio catastale          |
| `particella`            | string \| null | Particella catastale      |
| `sezione`               | string \| null | Sezione catastale         |
| `subalterno`            | string \| null | Subalterno                |
| `gisHa`                 | number \| null | Superficie GIS (ettari)   |
| `sauHa`                 | number \| null | SAU (ettari)              |
| `superficieCatastaleMq` | number \| null | Superficie catastale (mq) |
| `coordinates`           | number[]       | Coordinate [lon, lat]     |
| `latitude`              | number \| null | Latitudine                |
| `longitude`             | number \| null | Longitudine               |
| `polygon`               | object \| null | Poligono GeoJSON          |
| `soilType`              | string \| null | Tipo di suolo             |
| `uso`                   | string \| null | Uso del suolo             |
| `qualita`               | string \| null | Qualita' (SIAN)           |
| `nation`                | string \| null | Nazione                   |
| `region`                | string \| null | Regione/provincia         |
| `city`                  | string \| null | Comune                    |
| `address`               | string \| null | Indirizzo                 |
| `cap`                   | string \| null | CAP                       |

### `production_units`

```typescript
{
  productionUnits: ProductionUnitPreview[];
  extractedCount: number;
  diagnostics?: unknown;
}
```

Ogni `ProductionUnitPreview`:

| Campo                 | Tipo              | Descrizione                       |
| --------------------- | ----------------- | --------------------------------- |
| `name`                | string            | Nome unita' produttiva            |
| `cropName`            | string \| null    | Nome coltura                      |
| `cropType`            | string \| null    | Tipo coltura                      |
| `variety`             | string \| null    | Varieta'                          |
| `protocoll`           | string \| null    | Protocollo (bio, integrato, ecc.) |
| `protectionStructure` | string \| null    | Struttura di protezione           |
| `startDate`           | string \| null    | Data inizio ciclo (ISO)           |
| `endDate`             | string \| null    | Data fine ciclo (ISO)             |
| `areaHa`              | number \| null    | Superficie (ettari)               |
| `fieldAllocations`    | FieldAllocation[] | Parcelle associate                |

Ogni `FieldAllocation`:

| Campo        | Tipo           | Descrizione         |
| ------------ | -------------- | ------------------- |
| `foglio`     | string \| null | Foglio catastale    |
| `particella` | string \| null | Particella          |
| `areaHa`     | number \| null | Superficie (ha)     |
| `fieldId`    | string \| null | ID campo (se match) |
| `fieldName`  | string \| null | Nome campo          |

### `agricultural`

Combinazione di `fields` + `production_units`:

```typescript
{
  fields: FieldBulkPreview[];
  productionUnits: ProductionUnitPreview[];
  extractedCount: number;
  diagnostics?: unknown;
}
```

### `invoice` / `ddt`

```typescript
{
  entries: InvoiceEntry[];
  extractedCount: number;
}
```

Ogni `InvoiceEntry`:

| Campo                   | Tipo           | Descrizione                                      |
| ----------------------- | -------------- | ------------------------------------------------ |
| `productName`           | string         | Nome prodotto                                    |
| `registrationNumber`    | string \| null | Numero registrazione (fitofarmaci)               |
| `productCategory`       | string         | `"PHYTOSANITARY"` \| `"FERTILIZER"` \| `"OTHER"` |
| `administrativeStatus`  | string \| null | Stato amministrativo                             |
| `quantity`              | number \| null | Quantita'                                        |
| `quantityUnitOfMeasure` | string \| null | Unita' misura (KG, L, ecc.)                      |
| `supplierName`          | string \| null | Nome fornitore                                   |
| `supplierVat`           | string \| null | P.IVA fornitore                                  |
| `invoiceNumber`         | string \| null | Numero fattura                                   |
| `invoiceDate`           | string \| null | Data fattura (ISO)                               |
| `invoiceDueDate`        | string \| null | Data scadenza (ISO)                              |
| `unitPrice`             | number \| null | Prezzo unitario                                  |
| `totalPrice`            | number \| null | Prezzo totale                                    |

### `stock`

```typescript
{
  entries: StockPreviewEntry[];
  extractedCount: number;
}
```

Ogni `StockPreviewEntry`:

| Campo                         | Tipo           | Descrizione                                                |
| ----------------------------- | -------------- | ---------------------------------------------------------- |
| `name`                        | string         | Nome prodotto                                              |
| `category`                    | string         | `"PESTICIDE"` \| `"FERTILIZER"` \| `"SEED"` \| `"HARVEST"` |
| `registrationNumber`          | string \| null | Numero registrazione                                       |
| `stock.quantity`              | number         | Quantita'                                                  |
| `stock.unitOfMeasureQuantity` | string         | Unita' misura                                              |
| `stock.price`                 | number         | Prezzo                                                     |
| `stock.type`                  | string         | `"IN"` (carico) o `"OUT"` (scarico)                        |
| `stock.ddtCode`               | string         | Codice DDT                                                 |
| `stock.ddtDate`               | string         | Data DDT                                                   |
| `stock.invoiceCode`           | string \| null | Codice fattura                                             |
| `stock.companySupplierName`   | string \| null | Nome fornitore                                             |

---

## Errori

Tutti gli errori seguono questo formato:

```json
{
  "error": {
    "message": "Descrizione errore",
    "code": "ERROR_CODE",
    "statusCode": 400
  }
}
```

| Codice                       | HTTP | Descrizione                                     |
| ---------------------------- | ---- | ----------------------------------------------- |
| `USER_NOT_AUTHENTICATED`     | 401  | Token mancante o non valido                     |
| `NO_FILES`                   | 400  | Nessun file caricato                            |
| `MISSING_COMPANY_ID`         | 400  | companyId non specificato                       |
| `MISSING_CATEGORIES`         | 400  | categories non specificato                      |
| `INVALID_CATEGORIES`         | 400  | categories non e' un JSON array valido          |
| `CATEGORIES_LENGTH_MISMATCH` | 400  | Numero di categories diverso dal numero di file |
| `EXTRACTION_NOT_FOUND`       | 404  | Estrazione non trovata                          |
| `INVALID_EXTRACTION_STATUS`  | 400  | Operazione non permessa per lo stato corrente   |
| `NO_EXTRACTED_DATA`          | 400  | Tentativo di conferma senza dati estratti       |
| `MISSING_EXTRACTED_DATA`     | 400  | PATCH senza extractedData nel body              |
| `UNKNOWN_CATEGORY`           | 400  | Categoria non riconosciuta durante la conferma  |
| `COMPANY_NOT_FOUND`          | 404  | Azienda non trovata durante la conferma         |

---

## Flusso completo — Esempio pratico

```bash
# 1. Login e ottenere il token
TOKEN=$(curl -s -X POST http://localhost:8081/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}' \
  | jq -r '.data.token')

# 2. Upload batch (2 file: CSV campi + PDF fattura)
BATCH=$(curl -s -X POST http://localhost:8081/extractions/batch \
  -H "Authorization: Bearer $TOKEN" \
  -F "companyId=abc-123-company-id" \
  -F 'categories=["fields", "invoice"]' \
  -F "files=@campi.csv" \
  -F "files=@fattura.pdf")

BATCH_ID=$(echo $BATCH | jq -r '.data.batchId')
EXTRACTION_1=$(echo $BATCH | jq -r '.data.extractions[0].id')
EXTRACTION_2=$(echo $BATCH | jq -r '.data.extractions[1].id')

echo "Batch: $BATCH_ID"
echo "Extraction 1 (fields): $EXTRACTION_1"
echo "Extraction 2 (invoice): $EXTRACTION_2"

# 3. Attendere completamento via polling (o Socket.IO)
sleep 10

# 4. Verificare lista estrazioni
curl -s "http://localhost:8081/extractions?companyId=abc-123-company-id" \
  -H "Authorization: Bearer $TOKEN" | jq '.data.extractions[] | {id, status, category, fileName}'

# 5. Vedere dettaglio del file campi (PENDING_CONFIRMATION)
curl -s "http://localhost:8081/extractions/$EXTRACTION_1" \
  -H "Authorization: Bearer $TOKEN" | jq '.data.extraction.extractedData'

# 6. Modificare un dato estratto (opzionale)
curl -s -X PATCH "http://localhost:8081/extractions/$EXTRACTION_1" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "extractedData": {
      "fields": [
        {
          "companyId": "abc-123-company-id",
          "name": "Vigneto Nord (corretto)",
          "coordinates": [],
          "coordinatesGaussBoaga": [],
          "latitude": 44.4949,
          "longitude": 11.3426,
          "gisHa": 2.8,
          "foglio": "12",
          "particella": "345"
        }
      ],
      "extractedCount": 1
    }
  }' | jq '.status'

# 7a. Conferma singola
curl -s -X POST "http://localhost:8081/extractions/$EXTRACTION_1/confirm" \
  -H "Authorization: Bearer $TOKEN" | jq

# 7b. Oppure conferma l'intero batch
curl -s -X POST "http://localhost:8081/extractions/batch/$BATCH_ID/confirm" \
  -H "Authorization: Bearer $TOKEN" | jq

# 8. Verificare che lo stato sia CONFIRMED
curl -s "http://localhost:8081/extractions/$EXTRACTION_1" \
  -H "Authorization: Bearer $TOKEN" | jq '.data.extraction.status'
# Output: "CONFIRMED"
```
