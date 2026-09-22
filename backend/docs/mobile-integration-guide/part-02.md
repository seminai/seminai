# Guida Integrazione Mobile - Seminai API — Part 2

[Back to the guide index](../MOBILE_INTEGRATION_GUIDE.md)

```typescript
// L'utente arriva qui da un deep link nell'email
await fetch(`${BASE_URL}/auth/reset-password`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    token: 'token-dal-link-email',      // Dal deep link
    newPassword: 'nuovaPassword123',     // Min 6 caratteri
    confirmPassword: 'nuovaPassword123'
  })
});

// Response 200
{
  "status": "success",
  "message": "Password reset successfully"
}
```

**Errori reset:**
| Codice | Code | Descrizione |
|--------|------|-------------|
| 400 | `PASSWORD_MISMATCH` | Le password non coincidono |
| 400 | `PASSWORD_TOO_SHORT` | Password < 6 caratteri |
| 400 | `INVALID_TOKEN` | Token scaduto (1h) o non valido |

---

### 2.6 Cambio Password (Autenticato)

**PUT** `/auth/update-password`

```typescript
const response = await apiClient.request('/auth/update-password', {
  method: 'PUT',
  body: JSON.stringify({
    oldPassword: 'passwordVecchia',
    newPassword: 'passwordNuova123',     // Min 6 caratteri
    confirmPassword: 'passwordNuova123'
  })
});

// Response 200
{
  "status": "success",
  "data": {
    "user": { "id": "...", "email": "...", "name": "..." },
    "message": "Password updated successfully"
  }
}
```

---

### 2.7 Logout

**POST** `/auth/logout`

```typescript
await fetch(`${BASE_URL}/auth/logout`, { method: 'POST' });
// Lato mobile: eliminare token e dati utente dal secure storage
await SecureStorage.delete('auth_token');
await SecureStorage.delete('user');
```

---

### 2.8 Flusso Completo di Auth nell'App Mobile

```
App Start
  |
  ├─ Token salvato? ──YES──> GET /auth/me
  |                            ├─ 200 OK → Vai alla Home
  |                            └─ 401 → Token scaduto → Vai al Login
  |
  └─ NO ──> Mostra Login/Register
              |
              ├─ Register → POST /auth/register → Mostra "Verifica email"
              |
              ├─ Login email/pwd → POST /auth/login → Salva token → Home
              |
              ├─ Login Google → Google SDK → POST /auth/google/login → Salva token → Home
              |
              └─ Password dimenticata → POST /auth/forgot-password → Deep link email
                                          └─ POST /auth/reset-password → Vai al Login
```

---

## 3. CRUD Field Notes

Le field notes sono annotazioni in campo (trattamenti, osservazioni, misurazioni) che possono essere processate dall'AI.

### 3.1 Creare una Field Note

**POST** `/field-notes`

```typescript
const response = await apiClient.request('/field-notes', {
  method: 'POST',
  body: JSON.stringify({
    category: 'OPERATION',
    rawContent: 'Ho dato 10 kg di rame nel campo vite oggi pomeriggio',
    latitude: 45.438,          // Opzionale - GPS dal dispositivo
    longitude: 10.992,         // Opzionale
    altitude: 150,             // Opzionale (metri)
    gpsAccuracy: 5,            // Opzionale (metri)
    operationDate: '2024-06-15T14:30:00Z',  // Opzionale, default: now
    metadata: {                // Opzionale
      source: 'mobile_app',
      device: 'iPhone 15'
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
    "rawContent": "Ho dato 10 kg di rame nel campo vite oggi pomeriggio",
    "extractedData": null,
    "latitude": 45.438,
    "longitude": 10.992,
    "altitude": 150,
    "gpsAccuracy": 5,
    "operationDate": "2024-06-15T14:30:00.000Z",
    "fieldId": null,
    "productionUnitId": null,
    "productId": null,
    "jobId": null,
    "metadata": { "source": "mobile_app" },
    "aiConfidenceScore": null,
    "notes": null,
    "attachments": [],
    "createdAt": "2024-06-15T14:30:00.000Z",
    "updatedAt": "2024-06-15T14:30:00.000Z"
  }
}
```

**Categorie disponibili:**

| Categoria     | Descrizione                          |
| ------------- | ------------------------------------ |
| `OPERATION`   | Trattamenti, semine, potature        |
| `OBSERVATION` | Malattie, parassiti, stato coltura   |
| `MEASUREMENT` | Umidit&agrave;, temperatura, analisi |
| `HARVEST`     | Raccolta                             |
| `MAINTENANCE` | Manutenzione attrezzature            |
| `OTHER`       | Altro                                |

---

### 3.2 Lista Field Notes

**GET** `/field-notes`

```typescript
// Con filtri opzionali
const params = new URLSearchParams({
  category: 'OPERATION',                    // Opzionale
  status: 'PROCESSED',                      // Opzionale
  fieldId: 'field-uuid',                    // Opzionale
  productionUnitId: 'pu-uuid',             // Opzionale
  productId: 'product-uuid',               // Opzionale
  startDate: '2024-01-01T00:00:00Z',       // Opzionale
  endDate: '2024-12-31T23:59:59Z',         // Opzionale
  hasLocation: 'true'                       // Opzionale
});

const response = await apiClient.request(`/field-notes?${params}`);

// Response 200
{
  "status": "success",
  "data": [
    {
      "id": "fn-abc-123",
      "category": "OPERATION",
      "status": "PROCESSED",
      "rawContent": "Ho dato 10 kg di rame...",
      "extractedData": {
        "recognizedProducts": [
          { "name": "Rame", "quantity": 10, "unit": "kg", "confidence": 0.95 }
        ],
        "recognizedField": { "name": "Campo Vite", "confidence": 0.88 }
      },
      "operationDate": "2024-06-15T14:30:00.000Z",
      "field": {
        "id": "field-uuid",
        "name": "Campo Vite",
        "area": 2.5
      },
      "productionUnit": {
        "id": "pu-uuid",
        "name": "Vigneto Nord"
      },
      "company": {
        "id": "company-uuid",
        "name": "Azienda Agricola Rossi"
      },
      "attachments": [],
      "createdAt": "2024-06-15T14:30:00.000Z"
    }
    // ... altre note
  ]
}
```

**Stati di processamento:**

| Status              | Descrizione                  |
| ------------------- | ---------------------------- |
| `PENDING`           | In attesa di elaborazione AI |
| `PROCESSING`        | In corso di analisi          |
| `PROCESSED`         | Elaborata con successo       |
| `FAILED`            | Elaborazione fallita         |
| `MANUALLY_REVIEWED` | Rivista manualmente          |

---

### 3.3 Dettaglio Field Note

**GET** `/field-notes/:id`
