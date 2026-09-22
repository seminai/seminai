# API Inviti Workspace - Documentazione cURL

Base URL: `https://seminai-be-v2-661301438659.europe-west1.run.app` (produzione)  
Base URL locale: `http://localhost:8081` (sviluppo)

**Nota**: Tutti gli endpoint richiedono autenticazione tramite Bearer token nell'header `Authorization: Bearer <token>`

---

## 🔐 Autenticazione

Prima di utilizzare gli endpoint, è necessario autenticarsi e ottenere un token JWT.

### Login

```bash
curl -X POST https://seminai-be-v2-661301438659.europe-west1.run.app/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "utente@example.com",
    "password": "password123"
  }'
```

**Risposta (200 OK)**:

```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "uuid",
      "email": "utente@example.com",
      "name": "Nome Utente"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Salva il token** dalla risposta per utilizzarlo negli header delle richieste successive.

---

## 📋 FLUSSO COMPLETO: Invito e Accettazione

### Scenario: Utente invitato in un workspace

Quando un utente viene invitato in un workspace, riceve un'email con:

- Link diretto per accettare l'invito: `/workspace/accept-invitation?token={TOKEN}`
- Istruzioni per accedere e vedere gli inviti pendenti

---

## 1️⃣ VEDERE GLI INVITI PENDENTI

Un utente invitato può vedere tutti i suoi inviti pendenti prima di accettarli.

### Endpoint

```bash
curl -X GET https://seminai-be-v2-661301438659.europe-west1.run.app/workspaces/invitations/pending \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

**Risposta (200 OK)**:

```json
{
  "status": "success",
  "data": {
    "invitations": [
      {
        "id": "invitation-uuid",
        "workspaceId": "workspace-uuid",
        "email": "utente@example.com",
        "role": "MEMBER",
        "token": "invitation-token-abc123",
        "invitedById": "inviter-uuid",
        "expiresAt": "2025-02-13T12:00:00.000Z",
        "createdAt": "2025-01-13T12:00:00.000Z",
        "workspace": {
          "id": "workspace-uuid",
          "name": "Studio Agronomico Rossi",
          "slug": "studio-agronomico-rossi",
          "description": "Workspace principale per lo studio",
          "logoUrl": "https://example.com/logo.png",
          "iconUrl": "https://example.com/icon.png"
        }
      }
    ]
  }
}
```

**Cosa vedere nella risposta**:

- `invitations[]`: Array di inviti pendenti
  - `id`: ID dell'invito
  - `workspaceId`: ID del workspace
  - `email`: Email dell'utente invitato
  - `role`: Ruolo assegnato (MEMBER, ADMIN, VIEWER)
  - `token`: Token per accettare l'invito (usato nell'endpoint di accettazione)
  - `expiresAt`: Data di scadenza dell'invito
  - `workspace`: Dettagli del workspace
    - `name`: Nome del workspace
    - `slug`: Slug del workspace
    - `logoUrl`: URL del logo
    - `iconUrl`: URL dell'icona

**Se non ci sono inviti pendenti**:

```json
{
  "status": "success",
  "data": {
    "invitations": []
  }
}
```

---

## 2️⃣ ACCETTARE UN INVITO

Dopo aver visto gli inviti pendenti, l'utente può accettare un invito utilizzando il token.

### Endpoint

```bash
curl -X POST https://seminai-be-v2-661301438659.europe-west1.run.app/workspaces/invitations/{TOKEN}/accept \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

**Esempio concreto**:

```bash
curl -X POST https://seminai-be-v2-661301438659.europe-west1.run.app/workspaces/invitations/invitation-token-abc123/accept \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json"
```

**Risposta (200 OK)**:

```json
{
  "status": "success",
  "data": {
    "member": {
      "id": "member-uuid",
      "workspaceId": "workspace-uuid",
      "userId": "user-uuid",
      "role": "MEMBER",
      "canManageRules": false,
      "canInviteMembers": false,
      "joinedAt": "2025-01-13T12:00:00.000Z",
      "updatedAt": "2025-01-13T12:00:00.000Z"
    }
  }
}
```

**Errori possibili**:

- `401 Unauthorized`: Token JWT non valido o mancante
- `404 Not Found`: Invito non trovato (`INVITATION_NOT_FOUND`)
- `400 Bad Request`: Invito scaduto (`INVITATION_EXPIRED`)
- `400 Bad Request`: Invito già utilizzato (`INVITATION_USED`)
- `403 Forbidden`: Email dell'utente non corrisponde all'invito (`EMAIL_MISMATCH`)
- `409 Conflict`: Utente già membro del workspace (`ALREADY_MEMBER`)

---

## 3️⃣ VEDERE I WORKSPACE DOPO L'ACCETTAZIONE

Dopo aver accettato un invito, l'utente diventa membro del workspace e può vederlo nella lista.

### Endpoint

```bash
curl -X GET https://seminai-be-v2-661301438659.europe-west1.run.app/workspaces \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

**Risposta (200 OK)**:

```json
{
  "status": "success",
  "data": {
    "workspaces": [
      {
        "id": "workspace-uuid",
        "name": "Studio Agronomico Rossi",
        "slug": "studio-agronomico-rossi",
        "description": "Workspace principale per lo studio",
        "logoUrl": "https://example.com/logo.png",
        "iconUrl": "https://example.com/icon.png",
        "primaryColor": "#2563eb",
        "secondaryColor": "#1e40af",
        "accentColor": "#3b82f6",
        "customCss": null,
        "plan": "PROFESSIONAL",
        "isActive": true,
        "maxMembers": 10,
        "maxRules": 200,
        "createdAt": "2025-01-13T12:00:00.000Z",
        "updatedAt": "2025-01-13T12:00:00.000Z"
      }
    ]
  }
}
```

**Nota importante**: Questo endpoint restituisce **solo i workspace di cui l'utente è già membro**. Gli inviti pendenti non vengono mostrati qui, ma solo nell'endpoint `/workspaces/invitations/pending`.

---

## 4️⃣ INVITARE UN MEMBRO (Admin/Owner)

Per completezza, ecco come un admin/owner può invitare un nuovo membro.

### Endpoint

```bash
curl -X POST https://seminai-be-v2-661301438659.europe-west1.run.app/workspaces/{WORKSPACE_ID}/invite \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "nuovo.utente@example.com",
    "role": "MEMBER"
  }'
```

**Campi**:

- `email` (obbligatorio): Email dell'utente da invitare
- `role` (opzionale): Ruolo da assegnare (MEMBER, ADMIN, VIEWER). Default: MEMBER

**Risposta (201 Created)**:

```json
{
  "status": "success",
  "data": {
    "invitation": {
      "id": "invitation-uuid",
      "workspaceId": "workspace-uuid",
      "email": "nuovo.utente@example.com",
      "role": "MEMBER",
      "token": "invitation-token-abc123",
      "invitedById": "inviter-uuid",
      "expiresAt": "2025-02-13T12:00:00.000Z",
      "acceptedAt": null,
      "createdAt": "2025-01-13T12:00:00.000Z"
    }
  }
}
```

**Cosa succede**:

1. Se l'utente non esiste, viene creato automaticamente con una password temporanea
2. Viene inviata un'email all'utente con:
   - Link diretto per accettare: `/workspace/accept-invitation?token={TOKEN}`
   - Istruzioni per accedere e vedere gli inviti pendenti
3. L'utente può accettare l'invito tramite il link nell'email o chiamando l'endpoint di accettazione

---

## 🔄 FLUSSO COMPLETO - Esempio Pratico

### Step 1: Admin invita un utente

```bash
# Admin fa login
curl -X POST https://seminai-be-v2-661301438659.europe-west1.run.app/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "admin123"
  }'

# Risposta: { "data": { "token": "admin-token-xyz..." } }

# Admin invita un nuovo membro
curl -X POST https://seminai-be-v2-661301438659.europe-west1.run.app/workspaces/workspace-uuid/invite \
  -H "Authorization: Bearer admin-token-xyz..." \
  -H "Content-Type: application/json" \
  -d '{
    "email": "nuovo.utente@example.com",
    "role": "MEMBER"
  }'
```

### Step 2: Utente invitato fa login

```bash
# Utente invitato fa login
curl -X POST https://seminai-be-v2-661301438659.europe-west1.run.app/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "nuovo.utente@example.com",
    "password": "password123"
  }'

# Risposta: { "data": { "token": "user-token-abc..." } }
```

### Step 3: Utente vede gli inviti pendenti

```bash
# Utente vede i suoi inviti pendenti
curl -X GET https://seminai-be-v2-661301438659.europe-west1.run.app/workspaces/invitations/pending \
  -H "Authorization: Bearer user-token-abc..." \
  -H "Content-Type: application/json"

# Risposta: { "data": { "invitations": [{ "token": "invitation-token-123", "workspace": {...} }] } }
```

### Step 4: Utente accetta l'invito

```bash
# Utente accetta l'invito usando il token dall'endpoint precedente
curl -X POST https://seminai-be-v2-661301438659.europe-west1.run.app/workspaces/invitations/invitation-token-123/accept \
  -H "Authorization: Bearer user-token-abc..." \
  -H "Content-Type: application/json"

# Risposta: { "data": { "member": {...} } }
```

### Step 5: Utente vede i workspace (ora è membro)

```bash
# Utente vede i workspace di cui è membro
curl -X GET https://seminai-be-v2-661301438659.europe-west1.run.app/workspaces \
  -H "Authorization: Bearer user-token-abc..." \
  -H "Content-Type: application/json"

# Risposta: { "data": { "workspaces": [{ "name": "Studio Agronomico Rossi", ... }] } }
```

---

## ❓ FAQ

### Perché non vedo i workspace dopo essere stato invitato?

**Risposta**: Gli inviti devono essere **accettati** prima di diventare membri. Chiama:

1. `GET /workspaces/invitations/pending` per vedere gli inviti
2. `POST /workspaces/invitations/{TOKEN}/accept` per accettare l'invito
3. `GET /workspaces` per vedere i workspace di cui sei membro

### Come ottengo il token per accettare l'invito?

**Risposta**: Il token è disponibile in due modi:

1. **Dall'email**: L'email contiene un link con il token: `/workspace/accept-invitation?token={TOKEN}`
2. **Dall'API**: Chiama `GET /workspaces/invitations/pending` e usa il campo `token` di ogni invito

### L'invito è scaduto, cosa faccio?

**Risposta**: Gli inviti scadono dopo un periodo di tempo (default: 7 giorni). Se l'invito è scaduto:

- L'admin/owner deve reinvitare l'utente
- L'utente non può più accettare l'invito scaduto

### Posso vedere gli inviti di altri utenti?

**Risposta**: No, ogni utente può vedere solo i propri inviti pendenti tramite `GET /workspaces/invitations/pending`.

### Cosa succede se accetto un invito per un workspace di cui sono già membro?

**Risposta**: L'API restituirà un errore `409 Conflict` con il messaggio "You are already a member of this workspace".

---

## 📝 Note Tecniche

- **Token JWT**: Valido per 24 ore (configurabile)
- **Token Invito**: Valido per 7 giorni (configurabile in `WorkspaceInvitation.createDefaultExpirationDate()`)
- **Ruoli disponibili**: `OWNER`, `ADMIN`, `MEMBER`, `VIEWER`
- **Permessi invito**: Solo utenti con `canInviteMembers: true` o ruoli `ADMIN`/`OWNER` possono invitare
- **Limiti workspace**: Dipendono dal piano (FREE, PROFESSIONAL, ENTERPRISE)

---

## 🔗 Endpoint Correlati

- `GET /workspaces` - Lista workspace dell'utente (solo membri)
- `GET /workspaces/{id}` - Dettagli di un workspace
- `GET /workspaces/{id}/members` - Lista membri di un workspace
- `POST /workspaces/{id}/invite` - Invita un membro (admin/owner)
- `POST /workspaces/invitations/{token}/accept` - Accetta un invito
- `GET /workspaces/invitations/pending` - Lista inviti pendenti dell'utente

---

**Ultimo aggiornamento**: Gennaio 2025
