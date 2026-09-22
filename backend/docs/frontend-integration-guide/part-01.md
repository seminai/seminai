# Guida Integrazione Frontend - Field Notes System — Part 1

[Back to the guide index](../FRONTEND_INTEGRATION_GUIDE.md)


Documentazione completa per integrare il sistema Field Notes nel frontend, inclusa la chat AI con streaming live.

**Base URL (sviluppo locale):** `http://localhost:8081` — avvia il backend con `npm run dev` dalla cartella `seminai-be-v2`.

## 📚 Indice

1. [Login e autenticazione](#login-e-autenticazione)
2. [API CRUD Field Notes](#api-crud-field-notes)
3. [Gestione audio (trascrizione e allegati)](#gestione-audio-trascrizione-e-allegati)
4. [API Chat Agent con Streaming](#api-chat-agent-con-streaming)
5. [TypeScript Types](#typescript-types)
6. [Esempi di Integrazione](#esempi-di-integrazione)
7. [Gestione Errori](#gestione-errori)
8. [Best Practices](#best-practices)
9. [Storico chat Agente Dosage (React)](#storico-chat-agente-dosage-react)
10. [Workspace e selezione ambiente](#workspace-e-selezione-ambiente)
11. [Impostazioni Workspace (Settings)](#impostazioni-workspace-settings)

---

## Login e autenticazione

Le API Field Notes e Audio richiedono autenticazione. Il backend supporta **cookie httpOnly** (consigliato per web) e **Bearer token** (per client non-browser).

Base URL auth: `http://localhost:8081/auth`

### Login

**POST** `/auth/login`

Invia `credentials: 'include'` per ricevere e inviare automaticamente il cookie `auth_token` (impostato dal backend con `httpOnly`). Non salvare il token in `localStorage` o in cookie da JavaScript: vedi [FRONTEND_AUTH_MIGRATION.md](./FRONTEND_AUTH_MIGRATION.md) per dettagli sulla sicurezza.

```typescript
const response = await fetch('http://localhost:8081/auth/login', {
  method: 'POST',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'your-password',
  }),
});

if (!response.ok) {
  const err = await response.json().catch(() => ({}));
  throw new Error(err.message ?? 'Login failed');
}

const body = await response.json();
// { token: string, user: { id, email, name, role, credits } }
const { token, user } = body;
// Per richieste da browser: non usare il token, usare sempre credentials: 'include'
// Per client non-browser (es. mobile): usa header Authorization: Bearer ${token}
```

### Utente corrente

**GET** `/auth/me`

Richiede autenticazione (cookie o `Authorization: Bearer <token>`).

```typescript
const response = await fetch('http://localhost:8081/auth/me', {
  credentials: 'include',
  headers: {
    Authorization: `Bearer ${token}`, // opzionale se usi cookie
  },
});
const { user } = await response.json();
```

### Logout

**POST** `/auth/logout`

Invalida la sessione e rimuove il cookie `auth_token`.

```typescript
await fetch('http://localhost:8081/auth/logout', {
  method: 'POST',
  credentials: 'include',
});
```

### Richieste autenticate successive

Per tutte le chiamate alle API (field-notes, audio-to-text, field-note-agent) usa sempre:

- **Browser (stesso dominio o CORS con credenziali):** `credentials: 'include'` e nessun header `Authorization` (il cookie viene inviato automaticamente).
- **Client non-browser o token esplicito:** `Authorization: Bearer <token>` (il token si ottiene dalla risposta di login).

---

## API CRUD Field Notes

Base URL: `http://localhost:8081/field-notes`

### 1. Creare una Field Note

**POST** `/field-notes`

```typescript
// Request
const response = await fetch('http://localhost:8081/field-notes', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    category: 'OPERATION', // OPERATION | OBSERVATION | MEASUREMENT | HARVEST | MAINTENANCE | OTHER
    rawContent: 'ho dato 10 kg di rame nel campo vite',
    latitude: 45.438,     // Opzionale
    longitude: 10.992,    // Opzionale
    altitude: 150,        // Opzionale (metri)
    gpsAccuracy: 5,       // Opzionale (metri)
    operationDate: '2024-01-15T10:30:00Z', // Opzionale, default: now
    metadata: {           // Opzionale
      source: 'mobile_app',
      device: 'iPhone 12'
    }
  })
});

// Response 201
{
  "status": "success",
  "data": {
    "id": "fn-abc-123",
    "userId": "user-xyz",
    "category": "OPERATION",
    "status": "PENDING",
    "rawContent": "ho dato 10 kg di rame nel campo vite",
    "extractedData": null,
    "latitude": 45.438,
    "longitude": 10.992,
    "altitude": 150,
    "gpsAccuracy": 5,
    "operationDate": "2024-01-15T10:30:00.000Z",
    "fieldId": null,
    "productionUnitId": null,
    "productId": null,
    "jobId": null,
    "metadata": { "source": "mobile_app" },
    "aiConfidenceScore": null,
    "notes": null,
    "attachments": [],
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### 2. Ottenere Lista Field Notes

**GET** `/field-notes`

Query Parameters (tutti opzionali):

- `category`: OPERATION | OBSERVATION | MEASUREMENT | HARVEST | MAINTENANCE | OTHER
- `status`: PENDING | PROCESSING | PROCESSED | FAILED | MANUALLY_REVIEWED
- `fieldId`: UUID del campo
- `productionUnitId`: UUID dell'unità produttiva
- `productId`: UUID del prodotto
- `startDate`: ISO 8601 date
- `endDate`: ISO 8601 date
- `hasLocation`: boolean (true = solo note con GPS)

```typescript
// Esempio: Tutte le operazioni processate con GPS
const response = await fetch(
  'http://localhost:8081/field-notes?' + new URLSearchParams({
    category: 'OPERATION',
    status: 'PROCESSED',
    hasLocation: 'true'
  }),
  {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }
);

// Response 200
{
  "status": "success",
  "data": [
    {
      "id": "fn-abc-123",
      "category": "OPERATION",
      "status": "PROCESSED",
      "rawContent": "ho dato 10 kg di rame nel campo vite",
      "fieldName": "Campo Vite Nord",
      "productName": "Rame Bordolese",
      // ... altri campi
    },
    // ... altre note
  ]
}
```

### 3. Ottenere Singola Field Note

**GET** `/field-notes/:id`

Restituisce la field note dell’utente autenticato. La risposta è sotto `data.fieldNote`.

**Dati restituiti (struttura completa):**

| Campo               | Tipo                      | Descrizione                                                                             |
| ------------------- | ------------------------- | --------------------------------------------------------------------------------------- |
| `id`                | `string`                  | ID univoco della field note                                                             |
| `userId`            | `string`                  | ID utente proprietario                                                                  |
| `category`          | `string`                  | `OPERATION` \| `OBSERVATION` \| `MEASUREMENT` \| `HARVEST` \| `MAINTENANCE` \| `OTHER`  |
| `status`            | `string`                  | `PENDING` \| `PROCESSING` \| `PROCESSED` \| `FAILED` \| `MANUALLY_REVIEWED`             |
| `rawContent`        | `string`                  | Testo grezzo inserito dall’utente                                                       |
| `extractedData`     | `object \| null`          | Dati estratti dall’AI (prodotti, quantità, campo, osservazioni, ecc.); struttura libera |
| `latitude`          | `number \| null`          | Latitudine GPS (se presente)                                                            |
| `longitude`         | `number \| null`          | Longitudine GPS (se presente)                                                           |
| `altitude`          | `number \| null`          | Altitudine in metri (opzionale)                                                         |
| `gpsAccuracy`       | `number \| null`          | Precisione GPS in metri (opzionale)                                                     |
| `conformityNotes`   | `object \| array \| null` | Note di conformità (es. disciplinari)                                                   |
| `operationDate`     | `string`                  | Data/ora operazione (ISO 8601)                                                          |
| `fieldId`           | `string \| null`          | ID campo associato (se riconosciuto/assegnato)                                          |
| `productionUnitId`  | `string \| null`          | ID unità produttiva (se associata)                                                      |
| `productId`         | `string \| null`          | ID prodotto (es. fitosanitario) se riconosciuto                                         |
| `jobId`             | `string \| null`          | ID job di trattamento collegato (se presente)                                           |
| `metadata`          | `object \| null`          | Metadati liberi (es. `source`, `device`)                                                |
| `aiConfidenceScore` | `number \| null`          | Punteggio di confidenza AI (0–1) se processata                                          |
| `notes`             | `string \| null`          | Note testuali aggiuntive                                                                |
| `createdAt`         | `string`                  | Creazione (ISO 8601)                                                                    |
| `updatedAt`         | `string`                  | Ultimo aggiornamento (ISO 8601)                                                         |

**Nota:** l’endpoint **GET** `/field-notes/:id` restituisce solo i campi sopra (entità “piana”). Gli allegati e le relazioni (campo, unità produttiva, prodotto con nomi) sono disponibili nell’endpoint **GET** `/field-notes` (lista), dove ogni elemento può includere `fieldName`, `productName`, `productionUnitName` e gli `attachments` vanno gestiti tramite gli endpoint dedicati agli allegati se necessario.
