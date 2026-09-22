# API Inviti Workspace - Documentazione cURL — Part 1

[Back to the guide index](../WORKSPACE_INVITATIONS_API.md)


Base URL: `http://localhost:8081` (produzione)
Base URL locale: `http://localhost:8081` (sviluppo)

**Nota**: Tutti gli endpoint richiedono autenticazione tramite Bearer token nell'header `Authorization: Bearer <token>`

---

## 🔐 Autenticazione

Prima di utilizzare gli endpoint, è necessario autenticarsi e ottenere un token JWT.

### Login

```bash
curl -X POST http://localhost:8081/auth/login \
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
curl -X GET http://localhost:8081/workspaces/invitations/pending \
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
curl -X POST http://localhost:8081/workspaces/invitations/{TOKEN}/accept \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

**Esempio concreto**:

```bash
curl -X POST http://localhost:8081/workspaces/invitations/invitation-token-abc123/accept \
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
curl -X GET http://localhost:8081/workspaces \
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
curl -X POST http://localhost:8081/workspaces/{WORKSPACE_ID}/invite \
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
