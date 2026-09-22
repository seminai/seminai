# Implementazione Frontend - API Macchine (Machines) — Part 1

[Back to the guide index](../MACHINES_FRONTEND_IMPLEMENTATION.md)


Guida per integrare nel frontend le API delle Macchine, incluse le date di revisione, controllo funzionale e taratura e i giorni di preavviso per gli alert.

## Indice

1. [Modello dati](#modello-dati)
2. [Endpoints](#endpoints)
3. [TypeScript types](#typescript-types)
4. [Logica alert e scadenze](#logica-alert-e-scadenze)
5. [Esempi UI e form](#esempi-ui-e-form)
6. [Gestione errori](#gestione-errori)

---

## Modello dati

Ogni **Machine** espone:

| Campo                           | Tipo                      | Descrizione                                                   |
| ------------------------------- | ------------------------- | ------------------------------------------------------------- |
| `id`                            | string (UUID)             | Identificativo univoco                                        |
| `name`                          | string                    | Nome della macchina                                           |
| `identifier`                    | string                    | Codice/identificativo (es. targa, matricola)                  |
| `companyId`                     | string (UUID)             | Azienda di appartenenza                                       |
| `lastPositiveRevisionDate`      | string \| null (ISO 8601) | Data ultima revisione positiva                                |
| `functionalControlDate`         | string \| null (ISO 8601) | Data ultimo controllo funzionale                              |
| `calibrationDate`               | string \| null (ISO 8601) | Data ultima taratura                                          |
| `revisionReminderDays`          | number \| null            | Giorni di preavviso per alert revisione (scaduta/in scadenza) |
| `calibrationReminderDays`       | number \| null            | Giorni di preavviso per alert taratura                        |
| `functionalControlReminderDays` | number \| null            | Giorni di preavviso per alert controllo funzionale            |
| `createdAt`                     | string (ISO 8601)         | Data creazione                                                |
| `updatedAt`                     | string (ISO 8601)         | Data ultimo aggiornamento                                     |

I campi **ReminderDays** indicano quanti giorni prima (o dopo) la scadenza il sistema deve “ricordare” l’evento: in frontend puoi usarli per mostrare badge, notifiche o messaggi (es. “Scade tra X giorni” / “Scaduta da X giorni”).

---

## Endpoints

Base URL: `{API_BASE_URL}/machines`

Autenticazione: Bearer token o cookie (stesso meccanismo del resto dell’app).

### 1. Creare macchine (bulk)

**POST** `/machines/bulk`

Ruoli richiesti: `ADMIN` o `EDITOR` sull’azienda (`companyId` nel body).

**Request body:**

```json
{
  "machines": [
    {
      "name": "Trattore JD 6120",
      "identifier": "TR-001",
      "companyId": "uuid-azienda",
      "lastPositiveRevisionDate": "2024-06-15T00:00:00.000Z",
      "functionalControlDate": "2024-09-01T00:00:00.000Z",
      "calibrationDate": "2024-03-10T00:00:00.000Z",
      "revisionReminderDays": 30,
      "calibrationReminderDays": 60,
      "functionalControlReminderDays": 30
    }
  ]
}
```

| Campo                                      | Obbligatorio | Tipo               | Note                                  |
| ------------------------------------------ | ------------ | ------------------ | ------------------------------------- |
| `machines`                                 | ✅           | array              | Almeno un elemento                    |
| `machines[].name`                          | ✅           | string             |                                       |
| `machines[].identifier`                    | ✅           | string             |                                       |
| `machines[].companyId`                     | ✅           | string (UUID)      |                                       |
| `machines[].lastPositiveRevisionDate`      | ❌           | string (date-time) | ISO 8601                              |
| `machines[].functionalControlDate`         | ❌           | string (date-time) | ISO 8601                              |
| `machines[].calibrationDate`               | ❌           | string (date-time) | ISO 8601                              |
| `machines[].revisionReminderDays`          | ❌           | integer            | Giorni per alert revisione            |
| `machines[].calibrationReminderDays`       | ❌           | integer            | Giorni per alert taratura             |
| `machines[].functionalControlReminderDays` | ❌           | integer            | Giorni per alert controllo funzionale |

**Response 201:**

```json
{
  "status": "success",
  "data": {
    "count": 1,
    "machines": [
      {
        "id": "uuid-machine",
        "name": "Trattore JD 6120",
        "identifier": "TR-001",
        "companyId": "uuid-azienda",
        "lastPositiveRevisionDate": "2024-06-15T00:00:00.000Z",
        "functionalControlDate": "2024-09-01T00:00:00.000Z",
        "calibrationDate": "2024-03-10T00:00:00.000Z",
        "revisionReminderDays": 30,
        "calibrationReminderDays": 60,
        "functionalControlReminderDays": 30,
        "createdAt": "2025-01-31T12:00:00.000Z",
        "updatedAt": "2025-01-31T12:00:00.000Z"
      }
    ]
  }
}
```

### 2. Elenco macchine per azienda

**GET** `/machines/company/:companyId`

Ruoli: `ADMIN`, `EDITOR` o `VIEWER` sull’azienda (parametro path).

**Response 200:**

```json
{
  "status": "success",
  "data": {
    "machines": [
      {
        "id": "uuid-machine",
        "name": "Trattore JD 6120",
        "identifier": "TR-001",
        "companyId": "uuid-azienda",
        "lastPositiveRevisionDate": "2024-06-15T00:00:00.000Z",
        "functionalControlDate": "2024-09-01T00:00:00.000Z",
        "calibrationDate": "2024-03-10T00:00:00.000Z",
        "revisionReminderDays": 30,
        "calibrationReminderDays": 60,
        "functionalControlReminderDays": 30,
        "createdAt": "2025-01-31T12:00:00.000Z",
        "updatedAt": "2025-01-31T12:00:00.000Z"
      }
    ]
  }
}
```

### 3. Aggiornare una macchina

**PUT** `/machines/:id`

Body: stesso insieme di campi della singola macchina in bulk (tutti opzionali; si inviano solo i campi da aggiornare).

**Request body (esempio):**

```json
{
  "functionalControlDate": "2025-01-15T00:00:00.000Z",
  "functionalControlReminderDays": 45
}
```

**Response 200:** oggetto `machine` completo aggiornato.

### 4. Eliminare macchine (bulk)

**DELETE** `/machines/bulk`

**Request body:**

```json
{
  "ids": ["uuid-1", "uuid-2"]
}
```

**Response 204:** nessun body.

---

## TypeScript types

```typescript
/** Machine come restituita dalle API (date in ISO string). */
export interface MachineDTO {
  id: string;
  name: string;
  identifier: string;
  companyId: string;
  lastPositiveRevisionDate: string | null;
  functionalControlDate: string | null;
  calibrationDate: string | null;
  revisionReminderDays: number | null;
  calibrationReminderDays: number | null;
  functionalControlReminderDays: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Payload per creare una macchina (POST bulk). */
export interface MachineCreateInput {
  name: string;
  identifier: string;
  companyId: string;
  lastPositiveRevisionDate?: string | null;
  functionalControlDate?: string | null;
  calibrationDate?: string | null;
  revisionReminderDays?: number | null;
  calibrationReminderDays?: number | null;
  functionalControlReminderDays?: number | null;
}

/** Payload per aggiornare una macchina (PUT). Tutti i campi opzionali. */
export type MachineUpdateInput = Partial<MachineCreateInput>;

/** Response POST /machines/bulk */
export interface MachinesBulkCreateResponse {
  status: 'success';
  data: { count: number; machines: MachineDTO[] };
}

/** Response GET /machines/company/:companyId */
export interface MachinesListResponse {
  status: 'success';
  data: { machines: MachineDTO[] };
}

/** Response PUT /machines/:id */
export interface MachineUpdateResponse {
  status: 'success';
  data: { machine: MachineDTO };
}
```

---

## Logica alert e scadenze

Le date indicano **l’ultima volta** in cui è stato fatto revisione / controllo funzionale / taratura. La “scadenza” va calcolata in frontend in base alla periodicità che usi (es. 1 anno, 2 anni). I **ReminderDays** indicano quanti giorni prima (o dopo) considerare l’evento “in scadenza” o “scaduto” per mostrare l’alert.

Esempio di helper (periodicità annuale; puoi parametrizzare gli anni):
