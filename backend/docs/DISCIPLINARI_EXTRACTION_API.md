# Disciplinari Extraction API

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
          "bucketUrl": "https://storage.googleapis.com/...",
          "data": {
            /* dati estratti strutturati */
          },
          "error": null
        },
        {
          "fileName": "disciplinare_piemonte_2025.pdf",
          "status": "cached",
          "fileHash": "f6e5d4c3b2a1...",
          "bucketUrl": "https://storage.googleapis.com/...",
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

```json
{
  "documentMetadata": {
    "region": "Emilia-Romagna",
    "year": 2025,
    "version": "1.0",
    "title": "Disciplinari di Produzione Integrata - Difesa",
    "sourceUrlOrFile": "https://storage.googleapis.com/...",
    "validFrom": "2025-01-01",
    "validUntil": "2025-12-31",
    "isExpired": false
  },
  "scopeEntities": [
    {
      "crop": {
        "name": "Melo",
        "group": "frutticole"
      },
      "section": {
        "name": "Difesa"
      },
      "subsection": {
        "name": "Ticchiolatura"
      }
    }
  ],
  "rules": {
    "generalPrinciples": [
      "Privilegiare mezzi agronomici e biologici",
      "Rispettare le soglie di intervento"
    ],
    "prohibitions": ["Vietato l'uso di neonicotinoidi in fioritura"],
    "mandatoryActions": ["Monitoraggio settimanale con trappole"],
    "definitions": [
      {
        "term": "Soglia di intervento",
        "definition": "Livello di infestazione oltre il quale è necessario intervenire"
      }
    ]
  },
  "defenseTargets": [
    {
      "target": {
        "name": "Ticchiolatura",
        "type": "fungo"
      },
      "monitoring": ["Controllo settimanale foglie", "Modello previsionale"],
      "agronomicMeasures": ["Rimozione foglie infette", "Potatura verde"],
      "biologicalMeasures": ["Bacillus subtilis"],
      "interventions": [
        {
          "productOrActive": {
            "name": "Captano",
            "normalized": "captano"
          },
          "formulation": "WG",
          "dose": {
            "min": 1.5,
            "max": 2.0,
            "unit": "kg/ha",
            "notes": "Dose maggiore su varietà sensibili"
          },
          "applications": {
            "min": null,
            "max": 4,
            "scope": "anno"
          },
          "interval": {
            "minDays": 7
          },
          "phi": {
            "preharvestIntervalDays": 21
          },
          "phenology": {
            "from": "BBCH 10",
            "to": "BBCH 75"
          },
          "constraints": ["Non miscelare con prodotti alcalini"],
          "environmentalConstraints": ["Fascia rispetto 20m da corsi d'acqua"],
          "resistanceManagement": [
            "Alternare con prodotti di diverso MoA",
            "Max 2 applicazioni consecutive"
          ],
          "notes": "Efficace anche contro alternaria",
          "sourceLocator": {
            "page": 15,
            "tableId": "tab_difesa_melo",
            "rowHint": "Captano WG 80%"
          }
        }
      ]
    }
  ],
  "normalizationOutputs": null,
  "extractionConfidence": 85,
  "extractionErrors": []
}
```

---

## Integrazione Frontend

### Flusso di upload e polling

```typescript
// 1. Upload file
async function uploadDisciplinari(files: File[]): Promise<string> {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));
  formData.append('forceReExtract', 'false');

  const response = await fetch('/api/disciplinari/extract-data-from-disciplinari', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  const data = await response.json();
  return data.data.jobId;
}

// 2. Polling dello stato
async function pollJobStatus(jobId: string): Promise<JobResult> {
  return new Promise((resolve, reject) => {
    const interval = setInterval(async () => {
      const response = await fetch(`/api/disciplinari/job-status/${jobId}`);
      const data = await response.json();

      if (data.data.state === 'completed') {
        clearInterval(interval);
        resolve(data.data.result);
      } else if (data.data.state === 'failed') {
        clearInterval(interval);
        reject(new Error(data.data.failedReason));
      }

      // Aggiorna progress bar
      updateProgress(data.data.progress);
    }, 2000); // Poll ogni 2 secondi
  });
}

// 3. Uso completo
async function extractDisciplinari(files: File[]) {
  try {
    showLoadingUI();
    const jobId = await uploadDisciplinari(files);
    const result = await pollJobStatus(jobId);

    console.log(`Estratti: ${result.totalExtracted}`);
    console.log(`Dalla cache: ${result.totalCached}`);
    console.log(`Falliti: ${result.totalFailed}`);
    console.log(`Costo: $${result.cost.costWithMarginUsd}`);

    displayResults(result.results);
  } catch (error) {
    showError(error.message);
  } finally {
    hideLoadingUI();
  }
}
```

### Verifica validità prima di usare i dati

```typescript
async function checkAndUseDisciplinare(region: string, year: number) {
  const validity = await fetch(
    `/api/disciplinari/check-validity?region=${region}&year=${year}`,
  ).then((r) => r.json());

  if (!validity.data.exists) {
    // Disciplinare non presente, richiedi upload
    showUploadPrompt(`Disciplinare ${region} ${year} non trovato`);
    return null;
  }

  if (validity.data.isExpired) {
    // Mostra warning che i dati potrebbero non essere aggiornati
    showWarning(`Disciplinare ${region} ${year} scaduto il ${validity.data.validUntil}`);
  }

  // Cerca e usa i dati
  const data = await fetch(`/api/disciplinari/search?region=${region}&year=${year}`).then((r) =>
    r.json(),
  );

  return data.data;
}
```

---

## Gestione Errori

| Codice | Errore               | Descrizione              |
| ------ | -------------------- | ------------------------ |
| 400    | MISSING_FILES        | Nessun file PDF caricato |
| 400    | INSUFFICIENT_CREDITS | Crediti insufficienti    |
| 401    | MISSING_USER_ID      | Utente non autenticato   |
| 404    | JOB_NOT_FOUND        | Job non trovato          |
| 404    | NOT_FOUND            | Disciplinare non trovato |

---

## Note Implementative

### Deduplicazione

Il sistema usa l'hash SHA256 del file per la deduplicazione:

- Se il file esiste e `validUntil >= oggi` → ritorna dati dalla cache
- Se il file esiste ma scaduto → ri-estrae e aggiorna
- Se il file non esiste → estrae e salva

### Estrazione date validità

Il sistema cerca automaticamente nel testo pattern come:

- "Valido dal 01/01/2025 al 31/12/2025"
- "Anno 2025"
- "In vigore fino al 31/12/2025"

Se non trova date esplicite, assume `validUntil = year-12-31`.

### Documenti lunghi

Per PDF di 50+ pagine:

1. Il testo viene diviso in sezioni basate su heading
2. Ogni sezione viene processata separatamente
3. I risultati vengono merged con LLM dedicato
