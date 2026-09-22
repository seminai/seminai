# Guida Integrazione Mobile - Seminai API — Part 1

[Back to the guide index](../MOBILE_INTEGRATION_GUIDE.md)


Documentazione completa per integrare le API Seminai in un'applicazione mobile (React Native, Flutter, Swift, Kotlin).

## Indice

1. [Setup e Configurazione](#1-setup-e-configurazione)
2. [Autenticazione e Registrazione](#2-autenticazione-e-registrazione)
3. [CRUD Field Notes](#3-crud-field-notes)
4. [Dosage Agent ReAct (Chat AI)](#4-dosage-agent-react-chat-ai)
5. [Settings Utente](#5-settings-utente)
6. [Gestione Errori](#6-gestione-errori)
7. [TypeScript Types di Riferimento](#7-typescript-types-di-riferimento)

---

## 1. Setup e Configurazione

### Base URL

```
Production: https://api.seminai.app
```

### Headers Comuni

```
Content-Type: application/json
Authorization: Bearer <jwt_token>
```

### Autenticazione

L'API utilizza **JWT (JSON Web Token)** con durata **24 ore**. Il token viene restituito al login/registrazione e va incluso in tutte le richieste autenticate nell'header `Authorization: Bearer <token>`.

### Rate Limiting

| Endpoint    | Limite       | Scope      |
| ----------- | ------------ | ---------- |
| Default     | 300 req/min  | Per IP     |
| Job polling | 1000 req/min | Per IP     |
| Start job   | 10 req/min   | Per utente |

Gli header di rate limit vengono restituiti in ogni risposta:

- `X-RateLimit-Limit` - Limite massimo
- `X-RateLimit-Remaining` - Richieste rimanenti
- `X-RateLimit-Reset` - Timestamp reset
- `Retry-After` - Secondi di attesa (solo su 429)

---

## 2. Autenticazione e Registrazione

### 2.1 Registrazione

**POST** `/auth/register`

```typescript
// Request
const response = await fetch(`${BASE_URL}/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'utente@example.com',       // Obbligatorio
    password: 'password123',            // Obbligatorio, min 6 caratteri
    name: 'Mario',                      // Obbligatorio
    surname: 'Rossi',                   // Opzionale
    phoneNumber: '+393331234567',       // Opzionale
    fiscalCode: 'RSSMRA80A01H501Z',    // Opzionale
    address: 'Via Roma 1, Milano',      // Opzionale
    profilePictureUrl: 'https://...'    // Opzionale
  })
});

// Response 201
{
  "status": "success",
  "data": {
    "user": {
      "id": "uuid-utente",
      "email": "utente@example.com",
      "name": "Mario",
      "role": "BASIC",
      "credits": 10
    },
    "message": "User registered successfully"
  }
}
```

**Errori:**
| Codice | Code | Descrizione |
|--------|------|-------------|
| 400 | `MISSING_FIELDS` | Campi obbligatori mancanti |
| 409 | `USER_EXISTS` | Email gi&agrave; registrata |

> **Nota:** Dopo la registrazione viene inviata una email di verifica. L'utente deve confermare prima di poter usare alcune funzionalit&agrave;.

---

### 2.2 Login

**POST** `/auth/login`

```typescript
// Request
const response = await fetch(`${BASE_URL}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'utente@example.com',
    password: 'password123'
  })
});

// Response 200
{
  "status": "success",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",  // JWT, durata 24h
    "user": {
      "id": "uuid-utente",
      "email": "utente@example.com",
      "name": "Mario",
      "role": "BASIC",
      "credits": 10
    }
  }
}
```

**Errori:**
| Codice | Code | Descrizione |
|--------|------|-------------|
| 400 | `MISSING_CREDENTIALS` | Email o password mancanti |
| 401 | `INVALID_CREDENTIALS` | Email non trovata o password errata |
| 401 | `GOOGLE_ONLY_ACCOUNT` | Account senza password, usare Google Login |

**Gestione Token nell'app mobile:**

```typescript
// Salvare il token in secure storage (es. react-native-keychain, flutter_secure_storage)
await SecureStorage.set('auth_token', data.token);
await SecureStorage.set('user', JSON.stringify(data.user));

// Creare un client HTTP con token automatico
const apiClient = {
  async request(url: string, options: RequestInit = {}) {
    const token = await SecureStorage.get('auth_token');
    return fetch(`${BASE_URL}${url}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });
  },
};
```

---

### 2.3 Login con Google

**POST** `/auth/google/login`

Per il login Google, l'app mobile deve prima ottenere un `idToken` tramite Google Sign-In SDK (es. `@react-native-google-signin/google-signin`, `google_sign_in` per Flutter).

```typescript
// 1. Ottenere idToken dal Google SDK
const googleUser = await GoogleSignin.signIn();
const idToken = googleUser.idToken;

// 2. Inviare al backend
const response = await fetch(`${BASE_URL}/auth/google/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ idToken })
});

// Response 200 - stessa struttura del login standard
{
  "status": "success",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "uuid-utente",
      "email": "user@example.com",
      "name": "Mario Rossi",
      "role": "BASIC",
      "credits": 10
    }
  }
}
```

**Errori:**
| Codice | Code | Descrizione |
|--------|------|-------------|
| 400 | `MISSING_ID_TOKEN` | idToken non fornito |
| 401 | `INVALID_GOOGLE_TOKEN` | Token non valido |
| 401 | `GOOGLE_EMAIL_NOT_VERIFIED` | Email Google non verificata |

> **Nota:** Se l'utente non esiste, viene creato automaticamente con `password: null` (pu&ograve; accedere solo via Google). Se esiste gi&agrave; con email/password, l'account Google viene collegato.

---

### 2.4 Utente Corrente

**GET** `/auth/me`

```typescript
const response = await apiClient.request('/auth/me');

// Response 200
{
  "id": "uuid-utente",
  "email": "utente@example.com",
  "name": "Mario",
  "emailVerified": true,
  "profilePictureUrl": "https://...",
  "role": "BASIC",
  "credits": 10
}
```

Utile per verificare se il token salvato &egrave; ancora valido all'avvio dell'app.

---

### 2.5 Recupero Password

**POST** `/auth/forgot-password`

```typescript
await fetch(`${BASE_URL}/auth/forgot-password`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'utente@example.com' })
});

// Response 200 (sempre, anche se email non esiste - per sicurezza)
{
  "status": "success",
  "message": "If the email exists, a password reset link has been sent"
}
```

**POST** `/auth/reset-password`
