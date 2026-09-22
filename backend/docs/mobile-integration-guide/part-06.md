# Guida Integrazione Mobile - Seminai API — Part 6

[Back to the guide index](../MOBILE_INTEGRATION_GUIDE.md)

```typescript
const response = await apiClient.request('/settings', {
  method: 'POST',
  body: JSON.stringify({
    language: 'it',                    // Obbligatorio: 'it', 'en', 'fr', etc.
    qdcApiKey: 'your-qdc-key',        // Opzionale
    ifarmingApiKey: 'your-key'         // Opzionale
  })
});

// Response 201
{
  "status": "success",
  "data": {
    "settings": {
      "id": "settings-uuid",
      "userId": "user-uuid",
      "language": "it",
      "qdcApiKey": "your-qdc-key",
      "ifarmingApiKey": null,
      "whatsappConnected": false,
      "whatsappAllowedNumbers": [],
      "createdAt": "2024-06-15T10:00:00.000Z",
      "updatedAt": "2024-06-15T10:00:00.000Z"
    }
  }
}
```

**Errori:**
| Codice | Code | Descrizione |
|--------|------|-------------|
| 409 | `SETTINGS_EXISTS` | Settings gi&agrave; create per l'utente |

#### Leggere le impostazioni

**GET** `/settings/me`

```typescript
const response = await apiClient.request('/settings/me');

// Response 200
{
  "status": "success",
  "data": {
    "settings": {
      "id": "settings-uuid",
      "userId": "user-uuid",
      "language": "it",
      "qdcApiKey": "your-qdc-key",
      "ifarmingApiKey": null,
      "whatsappInstanceName": null,
      "whatsappConnected": false,
      "whatsappPhoneNumber": null,
      "whatsappAllowedNumbers": [],
      "createdAt": "...",
      "updatedAt": "..."
    }
  }
}
```

#### Aggiornare le impostazioni

**PUT** `/settings/:id`

```typescript
const response = await apiClient.request(`/settings/${settingsId}`, {
  method: 'PUT',
  body: JSON.stringify({
    language: 'en',                     // Opzionale
    qdcApiKey: 'new-key',              // Opzionale
    ifarmingApiKey: null                // null per rimuovere
  })
});

// Response 200
{
  "status": "success",
  "data": {
    "settings": { /* settings aggiornate */ }
  }
}
```

#### Eliminare le impostazioni

**DELETE** `/settings/:id`

```typescript
await apiClient.request(`/settings/${settingsId}`, { method: 'DELETE' });
// Response 204 No Content
```

---

### 5.3 Svuotare Cache LLM

**DELETE** `/users/me/cache`

```typescript
const response = await apiClient.request('/users/me/cache', { method: 'DELETE' });

// Response 200
{
  "status": "success",
  "data": { "deletedCount": 15 }
}
```

---

## 6. Gestione Errori

### Formato Standard Errore

```typescript
// Tutti gli errori seguono questo formato
{
  "status": "error",
  "message": "Descrizione leggibile dell'errore",
  "code": "ERROR_CODE"    // Codice macchina per gestione frontend
}
```

### Codici Errore Comuni

| HTTP | Code                  | Descrizione                    | Azione Suggerita                 |
| ---- | --------------------- | ------------------------------ | -------------------------------- |
| 400  | `MISSING_FIELDS`      | Campi obbligatori mancanti     | Validare form prima dell'invio   |
| 400  | `PASSWORD_MISMATCH`   | Password non coincidono        | Mostrare errore inline           |
| 400  | `PASSWORD_TOO_SHORT`  | Password < 6 caratteri         | Mostrare errore inline           |
| 401  | `INVALID_CREDENTIALS` | Credenziali errate             | Mostrare errore nel form login   |
| 401  | `GOOGLE_ONLY_ACCOUNT` | Account Google-only            | Mostrare bottone Google Login    |
| 401  | (nessun code)         | Token scaduto/invalido         | Redirect a login, pulire storage |
| 403  | (forbidden)           | Non proprietario della risorsa | Mostrare "Accesso negato"        |
| 404  | (not found)           | Risorsa non trovata            | Mostrare "Non trovato"           |
| 409  | `USER_EXISTS`         | Email gi&agrave; registrata    | Suggerire login                  |
| 409  | `SETTINGS_EXISTS`     | Settings gi&agrave; create     | Usare PUT per aggiornare         |
| 429  | `RATE_LIMIT_EXCEEDED` | Troppe richieste               | Attendere `Retry-After` secondi  |
| 500  | (internal)            | Errore server                  | Mostrare errore generico, retry  |

### Gestione Centralizzata Errori

```typescript
class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function apiRequest(url: string, options: RequestInit = {}) {
  const token = await SecureStorage.get('auth_token');

  const response = await fetch(`${BASE_URL}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));

    // Token scaduto -> redirect a login
    if (response.status === 401) {
      await SecureStorage.delete('auth_token');
      navigationRef.navigate('Login');
      throw new ApiError(401, 'UNAUTHORIZED', 'Sessione scaduta');
    }

    // Rate limit -> retry dopo attesa
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      throw new ApiError(429, 'RATE_LIMIT', `Riprova tra ${retryAfter}s`);
    }

    throw new ApiError(
      response.status,
      error.code || 'UNKNOWN',
      error.message || 'Errore sconosciuto',
    );
  }

  if (response.status === 204) return null;
  return response.json();
}
```

---

## 7. TypeScript Types di Riferimento
