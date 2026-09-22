# 🔒 Migrazione Autenticazione Frontend - Fix Vulnerabilità XSS — Part 1

[Back to the guide index](../FRONTEND_AUTH_MIGRATION.md)


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
