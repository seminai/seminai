# Disciplinari Extraction API — Part 2

[Back to the guide index](../DISCIPLINARI_EXTRACTION_API.md)

```json
{
  "documentMetadata": {
    "region": "Emilia-Romagna",
    "year": 2025,
    "version": "1.0",
    "title": "Disciplinari di Produzione Integrata - Difesa",
    "sourceUrlOrFile": "http://localhost:8081/files/...",
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
