# 🔒 Migrazione Autenticazione Frontend - Fix Vulnerabilità XSS — Part 2

[Back to the guide index](../FRONTEND_AUTH_MIGRATION.md)

```typescript
// ✅ Il frontend deve accettare cookie dal backend
// Se usi un proxy (es. Vite, Webpack Dev Server):
// vite.config.ts
export default {
  server: {
    proxy: {
      '/api': {
        target: 'https://api.yourdomain.com',
        changeOrigin: true,
        secure: true,
        // ✅ IMPORTANTE: Mantieni i cookie
        cookieDomainRewrite: '',
      },
    },
  },
};
```

---

## 📝 Esempio Completo: Login Flow

### Prima (VULNERABILE)

```typescript
// ❌ ESEMPIO DA NON USARE
async function login(email: string, password: string): Promise<void> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  const { token, user } = await response.json();

  // ❌ Salva token in localStorage (vulnerabile a XSS)
  localStorage.setItem('token', token);

  // ❌ Imposta cookie manualmente (vulnerabile a XSS)
  document.cookie = `auth_token=${token}; path=/; SameSite=Lax`;

  // Naviga alla dashboard
  window.location.href = '/dashboard';
}
```

### Dopo (SICURO)

```typescript
// ✅ ESEMPIO CORRETTO
async function login(email: string, password: string): Promise<void> {
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include', // ✅ IMPORTANTE: Permette ricezione cookie
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Login failed');
    }

    const { user } = await response.json();

    // ✅ Il cookie 'auth_token' è stato impostato automaticamente dal backend
    // ✅ È httpOnly, quindi non accessibile da JavaScript (sicuro)
    // ✅ Non serve salvare nulla in localStorage

    // Naviga alla dashboard
    window.location.href = '/dashboard';
  } catch (error) {
    console.error('Login error:', error);
    // Mostra errore all'utente
    alert('Login failed. Please check your credentials.');
  }
}
```

---

## 🔍 Verifica Stato Autenticazione

### Controllare se l'utente è autenticato

```typescript
// ✅ Usare endpoint /api/auth/me per verificare autenticazione
async function checkAuth(): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/me', {
      method: 'GET',
      credentials: 'include', // ✅ Invia cookie automaticamente
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const user = await response.json();
      return !!user.id; // Utente autenticato
    }

    return false; // Non autenticato
  } catch (error) {
    return false;
  }
}

// Uso
const isAuthenticated = await checkAuth();
if (!isAuthenticated) {
  window.location.href = '/login';
}
```

---

## 🔌 Socket.IO (se usato)

Se usi Socket.IO, puoi ancora passare il token tramite header:

```typescript
import { io } from 'socket.io-client';

// ✅ Opzione 1: Usare cookie (se Socket.IO è configurato per accettarli)
const socket = io('https://api.yourdomain.com', {
  withCredentials: true, // ✅ Invia cookie automaticamente
});

// ✅ Opzione 2: Passare token tramite header (se necessario)
// Nota: Il token può essere ottenuto solo al login, non da cookie httpOnly
// Se hai bisogno del token per Socket.IO, considera di:
// 1. Salvare il token in memoria (non localStorage) solo per Socket.IO
// 2. Oppure usare un endpoint che restituisce il token solo per Socket.IO

const socket = io('https://api.yourdomain.com', {
  auth: {
    token: tokenFromLoginResponse, // ✅ Solo se necessario
  },
  withCredentials: true,
});
```

---

## ✅ Checklist Migrazione

- [ ] Rimuovere tutte le chiamate a `document.cookie` per impostare cookie di autenticazione
- [ ] Rimuovere tutte le chiamate a `document.cookie` per leggere cookie di autenticazione
- [ ] Rimuovere salvataggio token in `localStorage` o `sessionStorage` (se non necessario)
- [ ] Aggiungere `credentials: 'include'` a tutte le chiamate `fetch()`
- [ ] Configurare `withCredentials: true` in axios (se usato)
- [ ] Aggiornare funzione `logout()` per chiamare endpoint backend
- [ ] Aggiornare funzione di verifica autenticazione per usare `/api/auth/me`
- [ ] Testare login/logout flow
- [ ] Testare che le richieste API funzionino correttamente
- [ ] Verificare che non ci siano errori CORS
- [ ] Aggiornare documentazione frontend (se presente)

---

## 🐛 Troubleshooting

### Problema: Cookie non viene inviato

**Soluzione:**

- Verifica che `credentials: 'include'` sia presente in tutte le richieste
- Verifica configurazione CORS del backend (deve accettare `credentials: true`)
- Verifica che il dominio del frontend sia autorizzato nel backend

### Problema: Errore CORS

**Soluzione:**

- Il backend deve avere `cors({ origin: true, credentials: true })`
- Il frontend deve usare `credentials: 'include'` nelle richieste
- Verifica che il dominio del frontend sia nella whitelist CORS del backend

### Problema: 401 Unauthorized dopo login

**Soluzione:**

- Verifica che `credentials: 'include'` sia presente nella richiesta di login
- Verifica che il backend stia impostando correttamente il cookie
- Controlla la console del browser per errori CORS o cookie

### Problema: Logout non funziona

**Soluzione:**

- Assicurati di chiamare l'endpoint `/api/auth/logout` con `credentials: 'include'`
- Il backend cancella automaticamente il cookie httpOnly
- Non serve cancellare manualmente il cookie nel frontend

---

## 📚 Riferimenti

- [MDN: Using Fetch with credentials](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch#sending_a_request_with_credentials_included)
- [MDN: HttpOnly Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies#restrict_access_to_cookies)
- [OWASP: XSS Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)

---

## ❓ Domande Frequenti

**Q: Posso ancora usare header Authorization?**
A: Sì, il backend accetta ancora header `Authorization: Bearer <token>`. Il cookie è prioritario, ma l'header funziona per client non-browser.

**Q: Devo rimuovere completamente localStorage?**
A: Solo per il token JWT. Puoi continuare a usare localStorage per altri dati non sensibili.

**Q: Come verifico se l'utente è autenticato?**
A: Usa l'endpoint `/api/auth/me` con `credentials: 'include'`.

**Q: Il cookie funziona su domini diversi?**
A: I cookie httpOnly funzionano solo sullo stesso dominio o su sottodomini se configurato correttamente. Per domini diversi, usa header Authorization.

---

**Ultimo aggiornamento:** Gennaio 2025
