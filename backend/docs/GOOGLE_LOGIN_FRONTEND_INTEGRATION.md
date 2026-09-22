# Google Auth - Guida Integrazione Frontend

## Come funziona

Un singolo endpoint `POST /auth/google/login` gestisce sia **login** che **registrazione**:

1. L'utente clicca "Accedi con Google" nel frontend
2. Google mostra il popup di selezione account
3. Il frontend ottiene un **ID token** da Google
4. Il frontend invia l'ID token al backend
5. Il backend verifica il token con `google-auth-library` e:
   - **Utente gia' registrato** (trovato per `googleId` o `email`) → login
   - **Utente nuovo** (email non presente nel DB) → registrazione automatica (senza password, ruolo BASIC, 10 crediti)
   - **Utente esistente, primo login Google** → collega l'account Google e fa login

Gli utenti registrati via Google **non hanno password**. Se provano il login email/password riceveranno errore `GOOGLE_ONLY_ACCOUNT`.

---

## 1. Setup

### Variabile d'ambiente

Nel `.env` del frontend (lo stesso `GOOGLE_CLIENT_ID` configurato nel backend):

```text
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

### Installare il package

```bash
npm install @react-oauth/google
```

### Provider (App.tsx o main.tsx)

```tsx
import { GoogleOAuthProvider } from '@react-oauth/google';

function App() {
  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
      {/* ... app content ... */}
    </GoogleOAuthProvider>
  );
}
```

---

## 2. Componente bottone

```tsx
import { GoogleLogin, CredentialResponse } from '@react-oauth/google';

function LoginPage() {
  const handleGoogleLogin = async (response: CredentialResponse) => {
    if (!response.credential) return;

    try {
      const res = await fetch(`${API_BASE_URL}/auth/google/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // necessario per ricevere il cookie auth_token
        body: JSON.stringify({ idToken: response.credential }),
      });

      if (!res.ok) {
        const error = await res.json();
        // error.code contiene il codice errore (vedi sezione "Codici di errore")
        console.error('Google login error:', error.code);
        return;
      }

      const data = await res.json();
      // data.data.token -> JWT token
      // data.data.user  -> { id, email, name, role, credits }

      // Il cookie auth_token viene settato automaticamente dal backend.
      // Salva il token nello state/store e fai redirect alla dashboard.
    } catch (err) {
      console.error('Google login failed:', err);
    }
  };

  return (
    <div>
      {/* Login form esistente con email/password */}

      <div style={{ marginTop: '1rem', textAlign: 'center' }}>
        <span>oppure</span>
      </div>

      <GoogleLogin
        onSuccess={handleGoogleLogin}
        onError={() => console.error('Google Login Failed')}
        text="signin_with"
        shape="rectangular"
        locale="it"
        width="100%"
      />
    </div>
  );
}
```

---

## 3. API Reference

### `POST /auth/google/login`

#### Request

```json
{
  "idToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

Il campo `idToken` e' il valore `credential` restituito dalla callback `onSuccess` di Google Sign-In.

---

#### Esempio cURL

```bash
curl -X POST http://localhost:3000/auth/google/login \
  -H "Content-Type: application/json" \
  -d '{"idToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."}'
```

---

#### Response - Login utente esistente (200)

L'utente era gia' nel DB (trovato per `googleId` o per `email`):

```json
{
  "status": "success",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "mario.rossi@example.com",
      "name": "Mario Rossi",
      "role": "BASIC",
      "credits": 10
    }
  }
}
```

#### Response - Registrazione nuovo utente (200)

L'email Google non corrisponde a nessun utente nel DB. Il backend crea un nuovo account:

```json
{
  "status": "success",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "email": "new.user@example.com",
      "name": "Nuovo Utente",
      "role": "BASIC",
      "credits": 10
    }
  }
}
```

Il nuovo utente viene creato con:

- `password`: null (login solo via Google)
- `name`: dal profilo Google (o parte prima della @ se assente)
- `profilePictureUrl`: dal profilo Google
- `role`: BASIC
- `credits`: 10

In entrambi i casi il backend setta anche un cookie HTTP-only `auth_token` (durata 24h, stessa logica del login tradizionale). Per riceverlo, la richiesta deve includere `credentials: 'include'`.

---

#### Codici di errore

| Status | Code                        | Descrizione                       |
| ------ | --------------------------- | --------------------------------- |
| 400    | `MISSING_ID_TOKEN`          | Campo `idToken` mancante nel body |
| 401    | `INVALID_GOOGLE_TOKEN`      | Token non valido o scaduto        |
| 401    | `MISSING_GOOGLE_EMAIL`      | L'account Google non ha un'email  |
| 401    | `GOOGLE_EMAIL_NOT_VERIFIED` | L'email Google non e' verificata  |

Esempio risposta errore:

```json
{
  "status": "error",
  "code": "INVALID_GOOGLE_TOKEN",
  "message": "Invalid Google ID token"
}
```

---

## 4. Errore GOOGLE_ONLY_ACCOUNT

Se un utente registrato via Google prova a fare login con email/password (`POST /auth/login`), il backend risponde:

```json
{
  "status": "error",
  "code": "GOOGLE_ONLY_ACCOUNT",
  "message": "This account uses Google login. Please sign in with Google."
}
```

Il frontend dovrebbe intercettare questo codice e mostrare un messaggio tipo: _"Questo account usa Google. Accedi con Google."_

---

## 5. Note

- **`credentials: 'include'`**: Necessario in tutte le chiamate fetch (login, API successive) per ricevere e inviare il cookie `auth_token`.
- **Stesso JWT del login tradizionale**: Dopo il login Google, il token e il cookie sono identici a quelli del login email/password. Middleware, header Bearer e cookie funzionano allo stesso modo.
- **Logout**: Funziona normalmente con `POST /auth/logout` (cancella il cookie `auth_token`).
