# Disciplinari Extraction API — Part 1

[Back to the guide index](../DISCIPLINARI_EXTRACTION_API.md)


API per l'estrazione automatica di dati strutturati dai PDF dei disciplinari di produzione integrata regionali.

## Panoramica

Il sistema estrae informazioni strutturate dai disciplinari italiani, inclusi:

- Metadati documento (regione, anno, versione, date validità)
- Regole generali, divieti, azioni obbligatorie
- Avversità/bersagli di difesa
- Interventi ammessi con dosi, n. applicazioni, intervalli, finestre fenologiche

### Caratteristiche principali

- **Deduplicazione automatica**: I file già estratti (stesso hash SHA256) vengono restituiti dalla cache
- **Gestione validità**: Estrae automaticamente date di validità per identificare disciplinari scaduti
- **Elaborazione asincrona**: Upload immediato, estrazione in background
- **Supporto documenti lunghi**: Chunking intelligente per PDF di 50+ pagine

## Endpoints

### POST /disciplinari/extract-data-from-disciplinari

Carica uno o più file PDF di disciplinari per l'estrazione asincrona.

#### Request

```bash
curl -X POST \
  'https://api.example.com/disciplinari/extract-data-from-disciplinari' \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: multipart/form-data' \
  -F 'files=@disciplinare_emilia_romagna_2025.pdf' \
  -F 'files=@disciplinare_piemonte_2025.pdf' \
  -F 'concurrency=3' \
  -F 'forceReExtract=false'
```

#### Parametri

| Nome             | Tipo    | Default  | Descrizione                         |
| ---------------- | ------- | -------- | ----------------------------------- |
| `files`          | File[]  | required | File PDF dei disciplinari           |
| `concurrency`    | integer | 3        | N. max elaborazioni parallele       |
| `forceReExtract` | boolean | false    | Forza ri-estrazione anche se esiste |

#### Response

```json
{
  "status": "success",
  "data": {
    "jobId": "123e4567-e89b-12d3-a456-426614174000",
    "filesQueued": 2,
    "forceReExtract": false,
    "message": "Job created successfully. Use /disciplinari/job-status/:jobId to check progress"
  }
}
```

---

### GET /disciplinari/job-status/:jobId

Controlla lo stato di un job di estrazione.

#### Request

```bash
curl -X GET \
  'https://api.example.com/disciplinari/job-status/123e4567-e89b-12d3-a456-426614174000'
```

#### Response (in corso)

```json
{
  "status": "success",
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "state": "active",
    "progress": 45
  }
}
```

#### Response (completato)

```json
{
  "status": "success",
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "state": "completed",
    "progress": 100,
    "result": {
      "results": [
        {
          "fileName": "disciplinare_emilia_romagna_2025.pdf",
          "status": "extracted",
          "fileHash": "a1b2c3d4e5f6...",
          "bucketUrl": "http://localhost:8081/files/...",
          "data": {
            /* dati estratti strutturati */
          },
          "error": null
        },
        {
          "fileName": "disciplinare_piemonte_2025.pdf",
          "status": "cached",
          "fileHash": "f6e5d4c3b2a1...",
          "bucketUrl": "http://localhost:8081/files/...",
          "data": {
            /* dati dalla cache */
          },
          "error": null
        }
      ],
      "totalProcessed": 2,
      "totalExtracted": 1,
      "totalCached": 1,
      "totalFailed": 0,
      "cost": {
        "inputTokens": 125000,
        "outputTokens": 8500,
        "totalCostUsd": 0.45,
        "costWithMarginUsd": 0.54
      }
    }
  }
}
```

---

### GET /disciplinari/summary

Elenco riassuntivo di tutti i disciplinari estratti.

```bash
curl -X GET 'https://api.example.com/disciplinari/summary'
```

---

### GET /disciplinari/expired

Lista disciplinari scaduti da aggiornare.

```bash
curl -X GET 'https://api.example.com/disciplinari/expired'
```

---

### GET /disciplinari/check-validity

Verifica se un disciplinare è ancora valido.

```bash
curl -X GET \
  'https://api.example.com/disciplinari/check-validity?region=Emilia-Romagna&year=2025'
```

#### Response

```json
{
  "status": "success",
  "data": {
    "exists": true,
    "isValid": true,
    "isExpired": false,
    "validUntil": "2025-12-31T00:00:00.000Z",
    "needsUpdate": false,
    "lastUpdated": "2025-01-15T10:30:00.000Z"
  }
}
```

---

### GET /disciplinari/search

Cerca disciplinari per regione e anno.

```bash
curl -X GET \
  'https://api.example.com/disciplinari/search?region=Emilia-Romagna&year=2025'
```

---

### GET /disciplinari/:id

Dettaglio completo di un'estrazione.

```bash
curl -X GET 'https://api.example.com/disciplinari/abc123'
```

---

## Schema Dati Estratti

### Struttura completa
