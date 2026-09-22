# Documentazione — Sezione Etichette — Part 3

[Back to the guide index](../LABEL_DOCS.md)

| Campo       | Descrizione                       |
| ----------- | --------------------------------- |
| `fileName`  | Nome file PDF                     |
| `status`    | `"extracted"` o `"failed"`        |
| `name`      | Nome prodotto estratto            |
| `regNumber` | Numero registrazione estratto     |
| `bucketUrl` | URL storage PDF                   |
| `label`     | Dati strutturati estratti         |
| `labelId`   | ID etichetta creata (se successo) |
| `error`     | Messaggio errore (se fallito)     |

**Storico operazioni:** toggle "Storico operazioni" mostra tabella job con colonne Job ID, File, Stato, Progresso, Data creazione, Data completamento, Risultati. Al completamento, pulsante per aprire `/label/{labelId}` in nuova tab.

---

## 6. Riferimento API completo con curl

### Setup

```bash
export BASE_URL="http://localhost:8081"
export COOKIE="session=YOUR_SESSION_COOKIE"
# Opzionale (per endpoint che usano authenticatedHttpClient):
export TOKEN="YOUR_JWT_TOKEN"
```

Tutte le chiamate includono `--cookie "$COOKIE"`. Dove indicato, aggiungere anche `-H "Authorization: Bearer $TOKEN"`.

---

### 1. Lista etichette

|                 |                                                                 |
| --------------- | --------------------------------------------------------------- |
| **Endpoint**    | `GET /labels/summary`                                           |
| **File FE**     | `src/api/labels.ts` → `getLabelsSummary()`                      |
| **Chiamato da** | `Label/index.tsx`, `useLabelsSummary`, `Dashboard`, `Job/index` |

```bash
curl "$BASE_URL/labels/summary" \
  -H "Accept: application/json" \
  --cookie "$COOKIE"
```

---

### 2. Dettaglio etichetta

|                 |                                                  |
| --------------- | ------------------------------------------------ |
| **Endpoint**    | `GET /labels/{id}`                               |
| **File FE**     | `src/api/labels.ts` → `getLabelById()`           |
| **Chiamato da** | `useLabel` → `Label/Detail.tsx`, `Job/index.tsx` |

```bash
curl "$BASE_URL/labels/LABEL_UUID" \
  -H "Accept: application/json" \
  --cookie "$COOKIE"
```

---

### 3. Estrazione bulk fitofarmaci (manuale/CSV)

|                 |                                             |
| --------------- | ------------------------------------------- |
| **Endpoint**    | `POST /labels/bulk-extract`                 |
| **File FE**     | `src/api/labels.ts` → `bulkExtractLabels()` |
| **Chiamato da** | `Label/New.tsx` (modalità manuale)          |

```bash
curl -X POST "$BASE_URL/labels/bulk-extract" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  --cookie "$COOKIE" \
  -d '{
    "items": [
      { "name": "REVOLUTION", "regNumber": "16667" }
    ],
    "concurrency": 5
  }'
```

**Risposta:**

```json
{
  "status": "success",
  "data": {
    "processed": 1,
    "successful": 1,
    "failed": 0,
    "results": [
      /* LabelSummary[] */
    ]
  }
}
```

---

### 4. Estrazione PDF fitofarmaci (async)

|                 |                                                               |
| --------------- | ------------------------------------------------------------- |
| **Endpoint**    | `POST /labels/bulk-pdf-label-async`                           |
| **File FE**     | `Label/New.tsx` → `pdfMutation` via `authenticatedHttpClient` |
| **Chiamato da** | `Label/New.tsx` (modalità PDF, fitofarmaci)                   |

```bash
curl -X POST "$BASE_URL/labels/bulk-pdf-label-async" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  --cookie "$COOKIE" \
  -F "files=@/path/to/etichetta.pdf" \
  -F "files=@/path/to/etichetta2.pdf" \
  -F "concurrency=5"
```

**Risposta:**

```json
{
  "status": "success",
  "data": { "jobId": "uuid-del-job" }
}
```

---

### 5. Estrazione PDF fertilizzanti (async)

|                 |                                                                         |
| --------------- | ----------------------------------------------------------------------- |
| **Endpoint**    | `POST /labels/bulk-pdf-label-fertilizer-async`                          |
| **File FE**     | `Label/New.tsx` → `fertilizerPdfMutation` via `authenticatedHttpClient` |
| **Chiamato da** | `Label/New.tsx` (tipo fertilizzanti)                                    |

```bash
curl -X POST "$BASE_URL/labels/bulk-pdf-label-fertilizer-async" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  --cookie "$COOKIE" \
  -F "files=@/path/to/fertilizzante.pdf" \
  -F "concurrency=5"
```

---

### 6. Stato job PDF

|                 |                                                                   |
| --------------- | ----------------------------------------------------------------- |
| **Endpoint**    | `GET /labels/job-status/{jobId}`                                  |
| **File FE**     | `Label/New.tsx` → `pollJobStatus()` via `authenticatedHttpClient` |
| **Chiamato da** | Polling ogni 3s fino a `completed`/`failed`                       |

```bash
curl "$BASE_URL/labels/job-status/JOB_UUID" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  --cookie "$COOKIE"
```

**Risposta (shape usata dal frontend):**

```json
{
  "status": "success",
  "data": {
    "state": "active",
    "progress": 50,
    "result": {
      "results": [
        {
          "fileName": "etichetta.pdf",
          "status": "extracted",
          "name": "PRODOTTO X",
          "regNumber": "12345",
          "bucketUrl": "https://...",
          "label": { "prodotto": "PRODOTTO X", "categoria": "..." },
          "labelId": "uuid-etichetta",
          "error": null
        }
      ],
      "cost": {}
    }
  }
}
```

---

### 7. Eliminazione bulk

|                 |                                            |
| --------------- | ------------------------------------------ |
| **Endpoint**    | `DELETE /labels/bulk`                      |
| **File FE**     | `src/api/labels.ts` → `bulkDeleteLabels()` |
| **Chiamato da** | `Label/index.tsx` (selezione multipla)     |

```bash
curl -X DELETE "$BASE_URL/labels/bulk" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  --cookie "$COOKIE" \
  -d '{ "ids": ["uuid-1", "uuid-2"] }'
```

**Risposta:**

```json
{
  "status": "success",
  "message": "Labels deleted",
  "deleted_count": 2
}
```

---

### 8. Aggiornamento etichetta

|                 |                                                  |
| --------------- | ------------------------------------------------ |
| **Endpoint**    | `PUT /labels/{id}`                               |
| **File FE**     | `src/api/labels.ts` → `updateLabel()`            |
| **Chiamato da** | `useLabel` → `saveAsync()` in `Label/Detail.tsx` |

```bash
curl -X PUT "$BASE_URL/labels/LABEL_UUID" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  --cookie "$COOKIE" \
  -d '{
    "productName": "REVOLUTION",
    "registrationNumber": "16667",
    "label": {
      "prodotto": "REVOLUTION",
      "dosaggi_dettagliati": [
        {
          "coltura": "Vite",
          "malattia": "Peronospora",
          "dose_minima": 100,
          "dose_massima": 150,
          "dose_um": "ml/hl"
        }
      ]
    }
  }'
```

Tutti i campi di `UpdateLabelPayload` sono opzionali (update parziale).

---

### 9. Verifica etichetta
