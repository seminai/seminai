# Forgot Password / Reset Password - Guida implementazione frontend

## Overview

Il backend espone due endpoint pubblici (senza autenticazione) per il flusso **password dimenticata**:

1. **Forgot password**: l'utente inserisce l'email e riceve un link di reset (se l'email è registrata).
2. **Reset password**: l'utente apre il link dall'email, inserisce la nuova password e la conferma.

Il backend **non rivela** se l'email esiste o meno (risposta sempre 200 su forgot-password), per evitare enumerazione degli account. Il token di reset è un JWT con `type: 'password_reset'` e **scadenza 1 ora**. Il link inviato via email ha forma: `{FRONTEND_URL}/auth/reset-password?token={jwt}`.

---

## Riepilogo endpoint

| Metodo | Path                    | Auth | Descrizione                         |
| ------ | ----------------------- | ---- | ----------------------------------- |
| `POST` | `/auth/forgot-password` | No   | Richiedi invio email con link reset |
| `POST` | `/auth/reset-password`  | No   | Reimposta password con token JWT    |

Base URL: `{API_BASE}` (es. `https://api.example.com`).

---

## 1. Forgot Password – `POST /auth/forgot-password`

Richiede l'invio dell'email di reset. La risposta è **sempre 200** con lo stesso messaggio, indipendentemente dal fatto che l'email esista nel sistema.

### Request

**Content-Type:** `application/json`

```json
{
  "email": "utente@example.com"
}
```

| Campo   | Tipo   | Obbligatorio | Descrizione       |
| ------- | ------ | ------------ | ----------------- |
| `email` | string | Sì           | Email dell'utente |

### Response 200

```json
{
  "status": "success",
  "message": "If the email exists, a password reset link has been sent"
}
```

### Comportamento frontend consigliato

- Mostrare un messaggio generico: _"Se l'indirizzo email è registrato, riceverai a breve un link per reimpostare la password."_
- Non indicare mai se l'email esiste o meno.

### Errori (formato standard)

In caso di errore il backend risponde con:

```json
{
  "status": "error",
  "message": "Email is required",
  "code": "MISSING_EMAIL"
}
```

| HTTP | Codice          | Descrizione            |
| ---- | --------------- | ---------------------- |
| 400  | `MISSING_EMAIL` | Campo `email` mancante |

---

## 2. Reset Password – `POST /auth/reset-password`

Reimposta la password usando il token ricevuto nel link dell'email.

### Request

**Content-Type:** `application/json`

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "newPassword": "NuovaPassword123!",
  "confirmPassword": "NuovaPassword123!"
}
```

| Campo             | Tipo   | Obbligatorio | Descrizione                      |
| ----------------- | ------ | ------------ | -------------------------------- |
| `token`           | string | Sì           | JWT ricevuto nel link email      |
| `newPassword`     | string | Sì           | Nuova password (min 6 caratteri) |
| `confirmPassword` | string | Sì           | Conferma della nuova password    |

### Response 200

```json
{
  "status": "success",
  "message": "Password reset successfully"
}
```

### Errori (formato standard)

```json
{
  "status": "error",
  "message": "Messaggio leggibile",
  "code": "CODICE_ERRORE"
}
```

| HTTP | Codice               | Descrizione                                  |
| ---- | -------------------- | -------------------------------------------- |
| 400  | `MISSING_FIELDS`     | Mancano token, newPassword o confirmPassword |
| 400  | `PASSWORD_MISMATCH`  | newPassword e confirmPassword non coincidono |
| 400  | `PASSWORD_TOO_SHORT` | Password con meno di 6 caratteri             |
| 400  | `INVALID_TOKEN`      | Token non valido o scaduto (es. dopo 1 ora)  |
| 400  | `INVALID_TOKEN_TYPE` | Token non è di tipo password_reset           |

---

## Pagine da implementare

### 1. Pagina “Password dimenticata” – `/auth/forgot-password`

- Form con un solo campo: **email**.
- Submit → `POST {API_BASE}/auth/forgot-password` con body `{ "email": "..." }`.
- In caso di 200: mostrare messaggio generico di conferma (es. “Se l’email è registrata, riceverai un link…”).
- In caso di 400: mostrare `message` (o mappare `code` a un testo locale).

Esempio concettuale:

```ts
const handleSubmit = async () => {
  try {
    await api.post('/auth/forgot-password', { email });
    setSubmitted(true); // mostra messaggio di conferma
  } catch (err: any) {
    setError(err.response?.data?.message ?? 'Errore di richiesta');
  }
};
```

### 2. Pagina “Reimposta password” – `/auth/reset-password`

- URL atteso: `/auth/reset-password?token={jwt}` (il token è nel query).
- Se `token` manca: mostrare errore “Link non valido” e link per richiedere di nuovo il reset.
- Form: **nuova password** + **conferma password**.
- Submit → `POST {API_BASE}/auth/reset-password` con body:
  `{ "token": tokenFromQuery, "newPassword", "confirmPassword" }`.
- In caso di 200: redirect a login (es. `/auth/login`) con messaggio di successo.
- In caso di 400:
  - `INVALID_TOKEN` / `INVALID_TOKEN_TYPE`: “Link scaduto o non valido. Richiedi un nuovo link.”
  - `PASSWORD_MISMATCH`: “Le due password non coincidono.”
  - `PASSWORD_TOO_SHORT`: “La password deve avere almeno 6 caratteri.”

Esempio concettuale:

```ts
const searchParams = new URLSearchParams(window.location.search);
const token = searchParams.get('token');

if (!token) {
  setError('Link non valido. Richiedi un nuovo link di reset.');
  return;
}

const handleSubmit = async () => {
  try {
    await api.post('/auth/reset-password', {
      token,
      newPassword,
      confirmPassword,
    });
    navigate('/auth/login', {
      state: { message: 'Password reimpostata. Accedi con la nuova password.' },
    });
  } catch (err: any) {
    const code = err.response?.data?.code;
    const msg = err.response?.data?.message;
    if (code === 'INVALID_TOKEN' || code === 'INVALID_TOKEN_TYPE') {
      setError(
        'Link scaduto o non valido. Vai alla pagina "Password dimenticata" per richiederne uno nuovo.',
      );
    } else {
      setError(msg ?? 'Errore durante il reset.');
    }
  }
};
```

---

## Validazioni consigliate lato frontend

- **Email:** formato email valido prima di chiamare forgot-password.
- **Nuova password:** lunghezza minima 6 caratteri.
- **Conferma password:** deve essere uguale a nuova password.
- **Token:** se la pagina reset-password viene aperta senza `?token=...`, mostrare “Link non valido” e non inviare la richiesta.

---

## Dettagli tecnici

- **Scadenza token:** 1 ora dalla richiesta di forgot-password.
- **Link nell’email:** il backend costruisce l’URL con `process.env.FRONTEND_URL` (es. `https://app.example.com`). Il frontend deve esporre la route `/auth/reset-password` e leggere il query param `token`.
- **Formato errori:** tutte le risposte di errore usano `status: "error"`, `message` e opzionale `code` come nella tabella sopra.

---

## Esempi cURL

**Forgot password:**

```bash
curl -X POST "https://api.example.com/auth/forgot-password" \
  -H "Content-Type: application/json" \
  -d '{"email":"utente@example.com"}'
```

**Reset password:**

```bash
curl -X POST "https://api.example.com/auth/reset-password" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "newPassword": "NuovaPassword123!",
    "confirmPassword": "NuovaPassword123!"
  }'
```
