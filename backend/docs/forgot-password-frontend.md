# Forgot Password - Guida Implementazione Frontend

## Flusso Utente

1. Nella pagina di login, l'utente clicca "Password dimenticata?"
2. Viene mostrato un form dove inserire la propria email
3. Il backend invia un'email con un link di reset (valido 1 ora)
4. L'utente clicca il link nell'email e viene portato a `/auth/reset-password?token=...`
5. L'utente inserisce la nuova password e la conferma
6. Dopo il reset, viene reindirizzato alla pagina di login

---

## API Endpoints

### POST `/auth/forgot-password`

Richiede l'invio dell'email di reset password.

**Request:**

```json
{
  "email": "utente@example.com"
}
```

**Response (sempre 200):**

```json
{
  "status": "success",
  "message": "If the email exists, a password reset link has been sent"
}
```

> La risposta e' sempre la stessa, indipendentemente dal fatto che l'email esista o meno nel sistema. Mostrare all'utente un messaggio generico tipo: "Se l'indirizzo email e' registrato, riceverai un link per reimpostare la password."

**Errori:**
| Status | Codice | Descrizione |
|--------|--------|-------------|
| 400 | `MISSING_EMAIL` | Campo email mancante |

---

### POST `/auth/reset-password`

Reimposta la password usando il token ricevuto via email.

**Request:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "newPassword": "NuovaPassword123!",
  "confirmPassword": "NuovaPassword123!"
}
```

**Response (200):**

```json
{
  "status": "success",
  "message": "Password reset successfully"
}
```

**Errori:**
| Status | Codice | Descrizione |
|--------|--------|-------------|
| 400 | `MISSING_FIELDS` | Campi obbligatori mancanti |
| 400 | `PASSWORD_MISMATCH` | Le password non corrispondono |
| 400 | `PASSWORD_TOO_SHORT` | Password minore di 6 caratteri |
| 400 | `INVALID_TOKEN` | Token non valido o scaduto |
| 400 | `INVALID_TOKEN_TYPE` | Tipo di token errato |

---

## Pagine da Creare

### 1. Pagina "Password Dimenticata" (`/auth/forgot-password`)

Form con un solo campo email. Alla submit chiama `POST /auth/forgot-password`.

```tsx
// Esempio concettuale
const [email, setEmail] = useState('');
const [submitted, setSubmitted] = useState(false);

const handleSubmit = async () => {
  await api.post('/auth/forgot-password', { email });
  setSubmitted(true);
};

// Dopo la submit, mostrare:
// "Se l'indirizzo email e' registrato, riceverai un link per reimpostare la password."
```

### 2. Pagina "Reimposta Password" (`/auth/reset-password`)

Questa pagina viene aperta dal link nell'email. Il token e' nel query parameter `?token=...`.

Form con due campi: nuova password e conferma password.

```tsx
// Esempio concettuale
const token = new URLSearchParams(window.location.search).get('token');
const [newPassword, setNewPassword] = useState('');
const [confirmPassword, setConfirmPassword] = useState('');

const handleSubmit = async () => {
  try {
    await api.post('/auth/reset-password', {
      token,
      newPassword,
      confirmPassword,
    });
    // Redirect a /auth/login con messaggio di successo
  } catch (error) {
    // Gestire errori (token scaduto, password non valida, ecc.)
  }
};
```

---

## Validazioni Frontend

- **Email:** formato email valido
- **Password:** minimo 6 caratteri
- **Conferma password:** deve corrispondere alla nuova password
- **Token:** se assente nel query parameter, mostrare errore "Link non valido"

## Note

- Il token scade dopo **1 ora**
- Se il token e' scaduto, l'utente ricevera' errore `INVALID_TOKEN` e dovra' richiedere un nuovo link
- L'email contiene un link nel formato: `{FRONTEND_URL}/auth/reset-password?token={jwt_token}`
