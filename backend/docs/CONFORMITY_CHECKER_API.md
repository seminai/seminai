# Conformity Checker API

API per il controllo di conformità dei job di trattamento fitosanitario.

## Flusso di utilizzo

1. L'utente crea manualmente uno o più job con `conformityChecked: false`
2. L'utente chiama `POST /conformity-checker/start-job` con il `jobGroupId`
3. Il sistema verifica la conformità di tutti i job del gruppo
4. L'utente riceve le proposte di ottimizzazione via polling su `GET /conformity-checker/job-status/:jobId`
5. L'utente decide se confermare le proposte con `POST /conformity-checker/confirm`

## Endpoints

### 1. Avvia controllo conformità

```bash
curl -X POST http://localhost:3000/conformity-checker/start-job \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "jobGroupId": "550e8400-e29b-41d4-a716-446655440000",
    "notes": "Evitare trattamenti in fioritura. Pressione oidio alta quest anno."
  }'
```

**Request Body:**

| Campo        | Tipo          | Obbligatorio | Descrizione                                                                           |
| ------------ | ------------- | ------------ | ------------------------------------------------------------------------------------- |
| `jobGroupId` | string (UUID) | ✅           | ID del gruppo di job da verificare (corrisponde al campo `jobId` nella tabella Job)   |
| `notes`      | string        | ❌           | Note agronomiche o regole aggiuntive. Le regole dell'etichetta hanno sempre priorità. |

**Response:**

```json
{
  "status": "success",
  "data": {
    "jobId": "job-123456",
    "message": "Conformity check job started successfully. Use /job-status endpoint to check progress."
  }
}
```

### 2. Verifica stato del job

```bash
curl -X GET http://localhost:3000/conformity-checker/job-status/job-123456 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response (in corso):**

```json
{
  "status": "success",
  "data": {
    "id": "job-123456",
    "state": "active",
    "progress": 50,
    "data": {
      "jobGroupId": "550e8400-e29b-41d4-a716-446655440000",
      "userId": "user-uuid",
      "notes": "Evitare trattamenti in fioritura..."
    }
  }
}
```

**Response (completato):**

```json
{
  "status": "success",
  "data": {
    "id": "job-123456",
    "state": "completed",
    "progress": 100,
    "result": {
      "jobGroupId": "550e8400-e29b-41d4-a716-446655440000",
      "proposals": [
        {
          "jobId": "job-uuid-1",
          "productionUnitId": "unit-uuid",
          "productName": "Rame Bordolese",
          "registrationNumber": "12345",
          "wasAlreadyChecked": false,
          "isConform": false,
          "violations": [
            {
              "type": "DISCIPLINARI_DOSE_EXCEEDED",
              "message": "Dose 5.00 kg/ha supera il massimo 4.00 kg/ha",
              "severity": "ERROR",
              "source": "LABEL",
              "field": "dose",
              "currentValue": 5.0,
              "expectedValue": 4.0
            }
          ],
          "originalValues": {
            "quantity": 10,
            "unitOfMeasureQuantity": "kg",
            "dateOfOpeation": "2024-06-15T00:00:00.000Z",
            "treatedSurface": 2
          },
          "proposedValues": {
            "quantity": 8,
            "unitOfMeasureQuantity": "kg",
            "dateOfOpeation": "2024-06-15T00:00:00.000Z",
            "treatedSurface": 2,
            "note": "[CONFORMITY] Dose ridotta da 5.00 a 4.00 kg/ha per rispettare il limite etichetta."
          },
          "shouldExclude": false
        }
      ],
      "summary": {
        "totalJobs": 5,
        "alreadyCheckedJobs": 2,
        "newlyCheckedJobs": 3,
        "conformJobs": 4,
        "nonConformJobs": 1,
        "jobsToExclude": 0,
        "totalViolations": 1,
        "errorCount": 1,
        "warningCount": 0
      },
      "userNotesAnalysis": {
        "originalNotes": "Evitare trattamenti in fioritura...",
        "appliedRules": ["Evitare applicazioni durante il periodo di fioritura"],
        "ignoredRules": []
      },
      "checkedAt": "2024-06-10T14:30:00.000Z"
    }
  }
}
```

### 3. Conferma proposte

```bash
curl -X POST http://localhost:3000/conformity-checker/confirm \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "jobGroupId": "550e8400-e29b-41d4-a716-446655440000",
    "proposals": [
      {
        "jobId": "job-uuid-1",
        "productionUnitId": "unit-uuid",
        "productName": "Rame Bordolese",
        "registrationNumber": "12345",
        "wasAlreadyChecked": false,
        "isConform": false,
        "violations": [...],
        "originalValues": {...},
        "proposedValues": {
          "quantity": 8,
          "unitOfMeasureQuantity": "kg",
          "dateOfOpeation": "2024-06-15T00:00:00.000Z",
          "treatedSurface": 2,
          "note": "[CONFORMITY] Dose ridotta..."
        },
        "shouldExclude": false
      }
    ]
  }'
```

**Request Body:**

| Campo        | Tipo          | Obbligatorio | Descrizione                                                               |
| ------------ | ------------- | ------------ | ------------------------------------------------------------------------- |
| `jobGroupId` | string (UUID) | ✅           | ID del gruppo di job                                                      |
| `jobIds`     | string[]      | ❌           | Se specificato, applica solo ai job indicati. Se omesso, applica a tutti. |
| `proposals`  | array         | ✅           | Array delle proposte dal risultato del check                              |

**Response:**

```json
{
  "status": "success",
  "data": {
    "jobGroupId": "550e8400-e29b-41d4-a716-446655440000",
    "updatedJobsCount": 3,
    "excludedJobsCount": 0,
    "updatedJobIds": ["job-uuid-1", "job-uuid-2", "job-uuid-3"],
    "message": "Successfully updated 3 jobs (0 excluded)."
  }
}
```

### 4. Cancella job

```bash
curl -X DELETE http://localhost:3000/conformity-checker/jobs/job-123456 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Forza cancellazione anche se in esecuzione
curl -X DELETE "http://localhost:3000/conformity-checker/jobs/job-123456?force=true" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Tipi di violazione

| Tipo                                | Severità     | Descrizione                                               |
| ----------------------------------- | ------------ | --------------------------------------------------------- |
| `ACTIVE_INGREDIENT_INCOMPATIBILITY` | ERROR        | Incompatibilità tra principi attivi di prodotti diversi   |
| `SUBSTITUTE_PRODUCT`                | ERROR        | Prodotto ridondante (stesso principio attivo di un altro) |
| `DISCIPLINARI_DOSE_EXCEEDED`        | ERROR        | Dose superiore al massimo consentito dall'etichetta       |
| `DISCIPLINARI_DOSE_BELOW_MIN`       | WARNING      | Dose inferiore al minimo raccomandato                     |
| `N_MAX_APPLICATIONS_EXCEEDED`       | ERROR        | Superato il numero massimo di applicazioni consentite     |
| `DDT_DATE_MISSING`                  | ERROR        | Data DDT mancante per il prodotto                         |
| `DDT_DATE_INVALID`                  | ERROR        | Data DDT non valida o successiva al trattamento           |
| `USER_NOTE_WARNING`                 | INFO/WARNING | Avviso derivante dalle note utente                        |

## Controlli eseguiti

L'agente esegue gli stessi controlli del dosage_agent:

1. **Compatibilità principi attivi**: Verifica che i prodotti applicati sullo stesso campo non abbiano incompatibilità chimiche
2. **Numero massimo applicazioni**: Verifica che non si superi il limite `n_max_applicazioni` dell'etichetta
3. **Range dosaggio**: Verifica che la dose sia nel range `dose_minima` - `dose_massima` dell'etichetta
4. **Data DDT**: Verifica che i prodotti abbiano una data DDT valida
5. **Note utente**: Analizza le note agronomiche fornite dall'utente (con priorità inferiore all'etichetta)

## Priorità dei controlli

1. **Etichetta (LABEL)**: Massima priorità - i vincoli dell'etichetta sono sempre rispettati
2. **Disciplinari regionali**: Alta priorità - se disponibili, vengono considerati
3. **Note utente**: Bassa priorità - vengono applicate solo se non violano i vincoli superiori

## Esempio flusso completo

```bash
# 1. Avvia il controllo
JOB_RESPONSE=$(curl -s -X POST http://localhost:3000/conformity-checker/start-job \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"jobGroupId": "550e8400-e29b-41d4-a716-446655440000"}')

JOB_ID=$(echo $JOB_RESPONSE | jq -r '.data.jobId')
echo "Job ID: $JOB_ID"

# 2. Polling per risultato (in produzione usare WebSocket)
while true; do
  STATUS=$(curl -s http://localhost:3000/conformity-checker/job-status/$JOB_ID \
    -H "Authorization: Bearer $TOKEN")

  STATE=$(echo $STATUS | jq -r '.data.state')
  echo "State: $STATE"

  if [ "$STATE" = "completed" ]; then
    echo "Check completato!"
    echo $STATUS | jq '.data.result.summary'
    break
  elif [ "$STATE" = "failed" ]; then
    echo "Check fallito: $(echo $STATUS | jq -r '.data.failedReason')"
    break
  fi

  sleep 2
done

# 3. Conferma le proposte
PROPOSALS=$(echo $STATUS | jq '.data.result.proposals')
curl -X POST http://localhost:3000/conformity-checker/confirm \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"jobGroupId\": \"550e8400-e29b-41d4-a716-446655440000\",
    \"proposals\": $PROPOSALS
  }"
```
