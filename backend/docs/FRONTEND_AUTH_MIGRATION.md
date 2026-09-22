# 🔒 Migrazione Autenticazione Frontend - Fix Vulnerabilità XSS

## 📋 Panoramica

Questo documento descrive le modifiche necessarie nel frontend dopo la risoluzione della vulnerabilità XSS relativa ai cookie JWT.

**Data Migrazione:** Gennaio 2025  
**Priorità:** 🔴 **ALTA** - Risolvere entro 1 settimana

---

## 🚨 Problema Risolto

### Vulnerabilità Precedente

Il backend accettava cookie di autenticazione (`auth_bearer`, `auth_token`, `token`) che potevano essere impostati dal frontend tramite JavaScript. Questo rendeva i token JWT accessibili da JavaScript, esponendoli ad attacchi XSS (Cross-Site Scripting).

### Soluzione Implementata

Il backend ora:

- ✅ Imposta automaticamente il cookie `auth_token` con flag `httpOnly: true` (non accessibile da JavaScript)
- ✅ Usa `sameSite: 'none'` in produzione per permettere richieste cross-site (frontend e backend su domini diversi)
- ✅ Accetta **solo** il cookie `auth_token` impostato dal backend
- ✅ Mantiene supporto per header `Authorization: Bearer <token>` per client non-browser

---

## 🔄 Modifiche Richieste nel Frontend

### ❌ DA RIMUOVERE

#### 1. Rimuovere impostazione manuale di cookie

**Prima (VULNERABILE):**

```typescript
// ❌ NON FARE PIÙ - Cookie accessibile da JavaScript
function setCookie(name: string, value: string, days?: number): void {
  const expires = days ? `; expires=${new Date(Date.now() + days * 864e5).toUTCString()}` : '';
  const cookieString = `${name}=${value || ''}${expires}; path=/; SameSite=Lax`;
  document.cookie = cookieString; // ⚠️ VULNERABILE A XSS
}

// Dopo login
const response = await fetch('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email, password }),
});
const { token } = await response.json();
setCookie('auth_bearer', token); // ❌ RIMUOVERE
setCookie('auth_token', token); // ❌ RIMUOVERE
```

**Dopo (SICURO):**

```typescript
// ✅ Il cookie viene impostato automaticamente dal backend
// Non serve più impostarlo manualmente nel frontend

const response = await fetch('/api/auth/login', {
  method: 'POST',
  credentials: 'include', // ✅ IMPORTANTE: Permette l'invio automatico dei cookie
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ email, password }),
});

// Il cookie 'auth_token' viene impostato automaticamente dal backend
// Non è più necessario salvare il token in localStorage o sessionStorage
```

#### 2. Rimuovere lettura di cookie da JavaScript

**Prima (VULNERABILE):**

```typescript
// ❌ NON FARE PIÙ - Cookie accessibile da JavaScript
function getCookie(name: string): string | null {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
  return null;
}

const token = getCookie('auth_bearer') || getCookie('auth_token'); // ❌ RIMUOVERE
```

**Dopo (SICURO):**

```typescript
// ✅ Il cookie è httpOnly, non è accessibile da JavaScript
// Le richieste HTTP inviano automaticamente i cookie se credentials: 'include'
// Non serve più leggere il cookie manualmente
```

#### 3. Rimuovere salvataggio token in localStorage/sessionStorage

**Prima (OPZIONALE - Se usato):**

```typescript
// ❌ Se stavi salvando il token in localStorage, rimuovilo
const response = await fetch('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email, password }),
});
const { token } = await response.json();
localStorage.setItem('token', token); // ❌ RIMUOVERE se non necessario
```

**Dopo:**

```typescript
// ✅ Il cookie httpOnly è più sicuro di localStorage
// Se hai bisogno del token per client non-browser (es. mobile app),
// usa solo header Authorization
```

---

### ✅ DA MODIFICARE

#### 1. Configurare fetch/axios per inviare cookie automaticamente

**Fetch API:**

```typescript
// ✅ Aggiungere credentials: 'include' a tutte le richieste
const response = await fetch('/api/endpoint', {
  method: 'GET',
  credentials: 'include', // ✅ IMPORTANTE: Invia cookie automaticamente
  headers: {
    'Content-Type': 'application/json',
  },
});
```

**Axios:**

```typescript
// ✅ Configurare axios per inviare cookie
import axios from 'axios';

const apiClient = axios.create({
  baseURL: 'https://api.yourdomain.com',
  withCredentials: true, // ✅ IMPORTANTE: Invia cookie automaticamente
  headers: {
    'Content-Type': 'application/json',
  },
});

// Oppure per singola richiesta
axios.get('/api/endpoint', {
  withCredentials: true,
});
```

#### 2. Aggiornare funzione di logout

**Prima:**

```typescript
// ❌ Se stavi cancellando cookie manualmente
function logout(): void {
  document.cookie = 'auth_bearer=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
  document.cookie = 'auth_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
  localStorage.removeItem('token');
  window.location.href = '/login';
}
```

**Dopo:**

```typescript
// ✅ Chiamare endpoint logout del backend
async function logout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include', // ✅ Invia cookie per autenticazione
      headers: {
        'Content-Type': 'application/json',
      },
    });
    // Il backend cancella automaticamente il cookie httpOnly
    window.location.href = '/login';
  } catch (error) {
    console.error('Logout error:', error);
    // Fallback: redirect comunque al login
    window.location.href = '/login';
  }
}
```

#### 3. Aggiornare gestione autenticazione nelle richieste API

**Prima (con token in localStorage):**

```typescript
// ❌ Se stavi usando token da localStorage
async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token');

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`, // ❌ Non più necessario se usi cookie
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  return await response.json();
}
```

**Dopo (con cookie httpOnly):**

```typescript
// ✅ Usare cookie httpOnly (più sicuro)
async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    credentials: 'include', // ✅ Invia cookie automaticamente
    headers: {
      'Content-Type': 'application/json',
      // ✅ Opzionale: Mantieni header Authorization per client non-browser
      // Se il frontend ha bisogno del token (es. per Socket.IO),
      // può ancora usare header Authorization, ma il cookie è prioritario
      ...options.headers,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      // Token scaduto o non valido
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }
    throw new Error(`HTTP ${response.status}`);
  }

  return await response.json();
}
```

#### 4. Aggiornare configurazione CORS nel frontend (se necessario)

Se stai usando un proxy o configurazione CORS personalizzata, assicurati che:

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
