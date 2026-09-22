# Batch File Extraction API — Part 1

[Back to the guide index](../BATCH_FILE_EXTRACTION_API.md)


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
