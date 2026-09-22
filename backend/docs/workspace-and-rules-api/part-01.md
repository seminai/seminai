# API Workspace e Rules - Documentazione cURL — Part 1

[Back to the guide index](../WORKSPACE_AND_RULES_API.md)


Base URL: `http://localhost:8081`

**Nota**: Tutti gli endpoint richiedono autenticazione tramite Bearer token nell'header `Authorization: Bearer <token>`

---

## 📁 WORKSPACES

### 1. Lista Workspace dell'utente

```bash
curl -X GET http://localhost:8081/workspaces \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Risposta (200 OK)**:

```json
{
  "status": "success",
  "data": {
    "workspaces": [
      {
        "id": "uuid",
        "name": "Studio Agronomico Rossi",
        "slug": "studio-agronomico-rossi",
        "description": "Workspace principale",
        "logoUrl": "https://example.com/logo.png",
        "iconUrl": "https://example.com/icon.png",
        "primaryColor": "#2563eb",
        "secondaryColor": "#1e40af",
        "accentColor": "#3b82f6",
        "kind": "AGRICULTURAL",
        "customCss": null,
        "plan": "FREE",
        "isActive": true,
        "maxMembers": 5,
        "maxRules": 50,
        "createdAt": "2025-01-13T12:00:00.000Z",
        "updatedAt": "2025-01-13T12:00:00.000Z"
      }
    ]
  }
}
```

---

### 2. Crea Workspace

```bash
curl -X POST http://localhost:8081/workspaces \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Studio Agronomico Rossi",
    "kind": "AGRICULTURAL",
    "slug": "studio-agronomico-rossi",
    "description": "Workspace principale per lo studio",
    "logoUrl": "https://example.com/logo.png",
    "iconUrl": "https://example.com/icon.png",
    "primaryColor": "#2563eb",
    "secondaryColor": "#1e40af",
    "accentColor": "#3b82f6",
    "plan": "PROFESSIONAL"
  }'
```

**Campi obbligatori**: `name`, `kind`

**Campi opzionali**: `slug`, `description`, `logoUrl`, `iconUrl`, `primaryColor`, `secondaryColor`, `accentColor`, `plan` (FREE, PROFESSIONAL, ENTERPRISE)

**Valori `kind`**: `AGRICULTURAL` (default agronomico) · `MANUFACTURING` (ambiente manifatturiero)

**Breaking change (2026-06)**: i client esistenti devono inviare `kind` in creazione; in assenza → `400 MISSING_KIND`.

**Risposta (201 Created)**:

```json
{
  "status": "success",
  "data": {
    "workspace": {
      "id": "uuid",
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
      "maxMembers": 25,
      "maxRules": 100,
      "createdAt": "2025-01-13T12:00:00.000Z",
      "updatedAt": "2025-01-13T12:00:00.000Z"
    },
    "member": {
      "id": "uuid",
      "workspaceId": "uuid",
      "userId": "uuid",
      "role": "OWNER",
      "canManageRules": true,
      "canInviteMembers": true,
      "joinedAt": "2025-01-13T12:00:00.000Z"
    }
  }
}
```

---

### 3. Ottieni Workspace per ID

```bash
curl -X GET http://localhost:8081/workspaces/WORKSPACE_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Risposta (200 OK)**:

```json
{
  "status": "success",
  "data": {
    "workspace": {
      "id": "uuid",
      "name": "Studio Agronomico Rossi",
      "slug": "studio-agronomico-rossi",
      "description": "Workspace principale",
      "logoUrl": "https://example.com/logo.png",
      "iconUrl": "https://example.com/icon.png",
      "primaryColor": "#2563eb",
      "secondaryColor": "#1e40af",
      "accentColor": "#3b82f6",
      "customCss": null,
      "plan": "PROFESSIONAL",
      "isActive": true,
      "maxMembers": 25,
      "maxRules": 100,
      "createdAt": "2025-01-13T12:00:00.000Z",
      "updatedAt": "2025-01-13T12:00:00.000Z",
      "_count": {
        "members": 3,
        "rules": 15
      }
    }
  }
}
```

---

### 4. Aggiorna Workspace

```bash
curl -X PUT http://localhost:8081/workspaces/WORKSPACE_ID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Studio Agronomico Rossi - Aggiornato",
    "description": "Nuova descrizione",
    "primaryColor": "#10b981",
    "plan": "ENTERPRISE"
  }'
```

**Risposta (200 OK)**:

```json
{
  "status": "success",
  "data": {
    "workspace": {
      "id": "uuid",
      "name": "Studio Agronomico Rossi - Aggiornato",
      "slug": "studio-agronomico-rossi",
      "description": "Nuova descrizione",
      "logoUrl": "https://example.com/logo.png",
      "iconUrl": "https://example.com/icon.png",
      "primaryColor": "#10b981",
      "secondaryColor": "#1e40af",
      "accentColor": "#3b82f6",
      "customCss": null,
      "plan": "ENTERPRISE",
      "isActive": true,
      "maxMembers": 100,
      "maxRules": 500,
      "createdAt": "2025-01-13T12:00:00.000Z",
      "updatedAt": "2025-01-13T12:05:00.000Z"
    }
  }
}
```

**Nota**: Solo ADMIN o OWNER possono aggiornare il workspace.

---

### 5. Carica Logo ed Estrai Colori Automaticamente

```bash
curl -X POST http://localhost:8081/workspaces/WORKSPACE_ID/logo \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "logo=@/path/to/logo.png"
```

**Campi obbligatori**: `logo` (file immagine)

**Formati supportati**: PNG, JPG, JPEG, GIF, WebP

**Risposta (200 OK)**:

```json
{
  "status": "success",
  "data": {
    "workspace": {
      "id": "uuid",
      "name": "Studio Agronomico Rossi",
      "slug": "studio-agronomico-rossi",
      "description": "Workspace principale",
      "logoUrl": "http://localhost:8081/files/bucket/user-id/workspaces/uuid/logo/1234567890_1234_logo.png",
      "iconUrl": null,
      "primaryColor": "#2563eb",
      "secondaryColor": "#1e40af",
      "accentColor": "#3b82f6",
      "customCss": null,
      "plan": "PROFESSIONAL",
      "isActive": true,
      "maxMembers": 25,
      "maxRules": 100,
      "createdAt": "2025-01-13T12:00:00.000Z",
      "updatedAt": "2025-01-13T12:05:00.000Z"
    },
    "logoUrl": "http://localhost:8081/files/bucket/user-id/workspaces/uuid/logo/1234567890_1234_logo.png",
    "extractedColors": {
      "primaryColor": "#2563eb",
      "secondaryColor": "#1e40af",
      "accentColor": "#3b82f6"
    }
  }
}
```

**Nota**:

- Solo ADMIN o OWNER possono caricare il logo
- Il sistema estrae automaticamente i 3 colori principali dall'immagine
- I colori vengono aggiornati automaticamente nel workspace (`primaryColor`, `secondaryColor`, `accentColor`)
- Il logo viene caricato su Google Cloud Storage e l'URL viene salvato in `logoUrl`
- Se l'estrazione colori fallisce, vengono utilizzati i colori di default

---
