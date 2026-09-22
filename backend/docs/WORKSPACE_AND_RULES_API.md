# API Workspace e Rules - Documentazione cURL

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
      "logoUrl": "https://storage.googleapis.com/bucket/user-id/workspaces/uuid/logo/1234567890_1234_logo.png",
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
    "logoUrl": "https://storage.googleapis.com/bucket/user-id/workspaces/uuid/logo/1234567890_1234_logo.png",
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

### 6. Elimina Workspace

```bash
curl -X DELETE http://localhost:8081/workspaces/WORKSPACE_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Risposta (204 No Content)** - Nessun body nella risposta

**Nota**: Solo OWNER può eliminare il workspace.

---

### 7. Lista Membri del Workspace

```bash
curl -X GET http://localhost:8081/workspaces/WORKSPACE_ID/members \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Risposta (200 OK)**:

```json
{
  "status": "success",
  "data": {
    "members": [
      {
        "id": "uuid",
        "workspaceId": "uuid",
        "userId": "uuid",
        "role": "OWNER",
        "canManageRules": true,
        "canInviteMembers": true,
        "joinedAt": "2025-01-13T12:00:00.000Z",
        "user": {
          "id": "uuid",
          "email": "rossi@example.com",
          "name": "Mario Rossi"
        }
      },
      {
        "id": "uuid",
        "workspaceId": "uuid",
        "userId": "uuid",
        "role": "MEMBER",
        "canManageRules": false,
        "canInviteMembers": false,
        "joinedAt": "2025-01-13T12:30:00.000Z",
        "user": {
          "id": "uuid",
          "email": "bianchi@example.com",
          "name": "Luigi Bianchi"
        }
      }
    ]
  }
}
```

---

### 8. Invita Membro al Workspace

```bash
curl -X POST http://localhost:8081/workspaces/WORKSPACE_ID/invite \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "nuovo.membro@example.com",
    "role": "MEMBER"
  }'
```

**Campi obbligatori**: `email`

**Campi opzionali**: `role` (ADMIN, MEMBER, VIEWER) - default: MEMBER

**Risposta (201 Created)**:

```json
{
  "status": "success",
  "data": {
    "invitation": {
      "id": "uuid",
      "workspaceId": "uuid",
      "email": "nuovo.membro@example.com",
      "role": "MEMBER",
      "token": "invitation-token-uuid",
      "expiresAt": "2025-01-20T12:00:00.000Z",
      "acceptedAt": null,
      "invitedById": "uuid",
      "createdAt": "2025-01-13T12:00:00.000Z"
    }
  }
}
```

**Nota**: Solo ADMIN o OWNER possono invitare membri. Non è possibile invitare come OWNER.

---

### 9. Accetta Invito

```bash
curl -X POST http://localhost:8081/workspaces/invitations/INVITATION_TOKEN/accept \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Risposta (200 OK)**:

```json
{
  "status": "success",
  "data": {
    "member": {
      "id": "uuid",
      "workspaceId": "uuid",
      "userId": "uuid",
      "role": "MEMBER",
      "canManageRules": false,
      "canInviteMembers": false,
      "joinedAt": "2025-01-13T12:00:00.000Z"
    }
  }
}
```

---

### 10. Aggiorna Membro (Ruolo/Permessi)

```bash
curl -X PUT http://localhost:8081/workspaces/WORKSPACE_ID/members/MEMBER_ID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "role": "ADMIN",
    "canManageRules": true,
    "canInviteMembers": true
  }'
```

**Risposta (200 OK)**:

```json
{
  "status": "success",
  "data": {
    "member": {
      "id": "uuid",
      "workspaceId": "uuid",
      "userId": "uuid",
      "role": "ADMIN",
      "canManageRules": true,
      "canInviteMembers": true,
      "joinedAt": "2025-01-13T12:00:00.000Z"
    }
  }
}
```

**Nota**: Solo ADMIN o OWNER possono aggiornare i membri. Non è possibile cambiare il ruolo di un OWNER.

---

### 11. Rimuovi Membro

```bash
curl -X DELETE http://localhost:8081/workspaces/WORKSPACE_ID/members/MEMBER_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Risposta (204 No Content)** - Nessun body nella risposta

**Nota**: Solo ADMIN o OWNER possono rimuovere membri. Non è possibile rimuovere l'OWNER.

---

## 📋 RULES - Come Funzionano e Chiamate API

### Concetto Generale

Le **Rules** (regole) sono disciplinari, standard, best practice o metodologie di applicazione che vengono gestite all'interno di un **Workspace**. Ogni workspace può contenere un numero limitato di rules in base al piano (FREE=50, PROFESSIONAL=100, ENTERPRISE=500).

### Architettura e Relazioni

```
Workspace (Studio Agronomico)
  ├── Rule 1: "Disciplinare Biologico Emilia-Romagna"
  ├── Rule 2: "Standard Qualità DOP"
  └── Rule 3: "Best Practice Irrigazione"
       │
       ├── Assegnata a → Company A (con priorità 1, overrides custom)
       ├── Assegnata a → Company B (con priorità 2)
       └── Assegnata a → Company C (con priorità 1, note specifiche)
```

**Punti importanti**:

- ✅ **Una Rule può essere assegnata a più Companies**: La stessa rule (es: "Disciplinare Biologico Emilia-Romagna") può essere applicata a tutte le aziende agricole che lavorano con quel disciplinare. Ogni assegnazione può avere personalizzazioni diverse (priority, overrides, notes).
- ✅ **Una Company può avere più Rules**: Un'azienda può avere assegnate più rules contemporaneamente (es: un disciplinare biologico + uno standard di qualità). L'ordine di priorità (`priority`) determina quale rule ha precedenza in caso di conflitti.
- ✅ **Companies sono indipendenti dal Workspace**: Una company può avere rules assegnate da diversi workspace. Il workspace serve per organizzare le rules del team, non per possedere le companies.
- ✅ **Omogeneità kind (Phase 1)**: `POST /companies` accetta `workspaceId` opzionale; se presente, `company.kind` deve coincidere con `workspace.kind` (altrimenti `400 COMPANY_KIND_WORKSPACE_MISMATCH`). Lo stesso vincolo si applica all'assegnazione rule→company e al cambio `kind` su company già collegata a regole di workspace incompatibili.
- ⚠️ **Vincolo**: Non è possibile assegnare la stessa rule due volte alla stessa company (vincolo univoco `ruleId + companyId`).

### Flusso di Lavoro Completo

#### 1️⃣ **Gestione Rules nel Workspace**

**a) Creare una Rule**

```bash
POST /workspaces/{workspaceId}/rules
```

- Crea una nuova rule nel workspace
- Richiede permessi di gestione (`canManageRules: true` o ADMIN/OWNER)
- La rule viene creata con status `DRAFT` di default

**b) Listare le Rules del Workspace**

```bash
GET /workspaces/{workspaceId}/rules?category=DISCIPLINARE&status=ACTIVE
```

- Visualizza tutte le rules del workspace
- Supporta filtri: `category`, `status`, `region`, `search`
- Accessibile a tutti i membri del workspace

**c) Visualizzare una Rule Specifica**

```bash
GET /rules/{ruleId}
```

- Ottiene i dettagli completi di una rule
- Include conteggio di companies e crops assegnati
- Accessibile a membri del workspace o se `isPublic: true`

**d) Aggiornare una Rule**

```bash
PUT /rules/{ruleId}
```

- Modifica nome, descrizione, status, date di validità, etc.
- Richiede permessi di gestione

**e) Eliminare una Rule**

```bash
DELETE /rules/{ruleId}
```

- Rimuove la rule dal workspace
- Richiede permessi di gestione
- ⚠️ **Attenzione**: Non rimuove automaticamente le assegnazioni alle companies

#### 2️⃣ **Assegnazione Rules alle Companies**

**a) Assegnare una Rule a una Company**

```bash
POST /rules/{ruleId}/companies
```

- Collega una rule a una company specifica
- ✅ **Puoi assegnare la stessa rule a più companies diverse** chiamando questo endpoint più volte con `companyId` diversi
- Permette di specificare:
  - `priority`: Ordine di priorità (utile quando più rules si applicano alla stessa company)
  - `overrides`: Personalizzazioni JSON specifiche per quella company
  - `notes`: Note contestuali per quella specifica assegnazione
- ⚠️ **Vincolo**: Non è possibile assegnare la stessa rule due volte alla stessa company (vincolo univoco)

**Esempio**: Assegnare lo stesso disciplinare a 3 aziende diverse:

```bash
# Assegna a Company A
POST /rules/{ruleId}/companies
{ "companyId": "company-a-uuid", "priority": 1 }

# Assegna a Company B (stessa rule, company diversa)
POST /rules/{ruleId}/companies
{ "companyId": "company-b-uuid", "priority": 1, "notes": "Produzione biologica certificata" }

# Assegna a Company C (stessa rule, company diversa)
POST /rules/{ruleId}/companies
{ "companyId": "company-c-uuid", "priority": 2, "overrides": { "customParam": "value" } }
```

**b) Listare Aziende Assegnate a una Rule**

```bash
GET /rules/{ruleId}/companies
```

- Visualizza tutte le aziende che hanno questa rule assegnata
- Include i dettagli dell'assegnazione (priority, overrides, notes) e i dati dell'azienda
- Ordinato per priorità
- Accessibile a membri del workspace o se la rule è pubblica

**Risposta (200 OK)**:

```json
{
  "status": "success",
  "data": {
    "companies": [
      {
        "assignment": {
          "id": "uuid",
          "ruleId": "uuid",
          "companyId": "uuid",
          "isActive": true,
          "priority": 1,
          "overrides": {
            "customField": "customValue"
          },
          "notes": "Produzione biologica certificata",
          "assignedAt": "2025-01-13T12:00:00.000Z",
          "assignedById": "uuid"
        },
        "company": {
          "id": "uuid",
          "name": "Azienda Agricola Rossi",
          "vatNumber": "IT12345678901",
          "address": "Via Roma 1, 40100 Bologna"
        }
      }
    ]
  }
}
```

**c) Rimuovere Assegnazione**

```bash
DELETE /rules/{ruleId}/companies/{companyId}
```

- Rimuove l'assegnazione di una rule da una company
- La rule rimane nel workspace, ma non si applica più a quella company

**d) Listare Rules di una Company**

```bash
GET /companies/{companyId}/rules?onlyActive=true
```

- Visualizza tutte le rules assegnate a una company
- Include sia i dettagli della rule che i metadati dell'assegnazione
- Parametro `onlyActive` per filtrare solo assegnazioni attive

### Esempio di Flusso Completo

**Scenario 1**: Un agronomo vuole applicare un disciplinare biologico a un'azienda agricola.

```bash
# 1. Crea il workspace (se non esiste)
POST /workspaces
{
  "name": "Studio Agronomico Rossi",
  "plan": "PROFESSIONAL"
}

# 2. Crea la rule (disciplinare) nel workspace
POST /workspaces/{workspaceId}/rules
{
  "name": "Disciplinare Biologico Emilia-Romagna 2024",
  "category": "DISCIPLINARE",
  "content": { ... },
  "region": "Emilia-Romagna",
  "validFrom": "2024-01-01T00:00:00.000Z",
  "validUntil": "2024-12-31T23:59:59.000Z"
}

# 3. Attiva la rule
PUT /rules/{ruleId}
{
  "status": "ACTIVE"
}

# 4. Assegna la rule all'azienda agricola
POST /rules/{ruleId}/companies
{
  "companyId": "company-uuid",
  "priority": 1,
  "notes": "Applicato per produzione biologica certificata"
}

# 5. (Opzionale) Verifica le rules assegnate all'azienda
GET /companies/{companyId}/rules?onlyActive=true
```

**Scenario 2**: Assegnare lo stesso disciplinare a più aziende agricole.

```bash
# 1-3. (Come sopra) Crea workspace, rule e attivala

# 4. Assegna la stessa rule a più aziende
POST /rules/{ruleId}/companies
{ "companyId": "azienda-1-uuid", "priority": 1, "notes": "Azienda principale" }

POST /rules/{ruleId}/companies
{ "companyId": "azienda-2-uuid", "priority": 1, "notes": "Azienda satellite" }

POST /rules/{ruleId}/companies
{ "companyId": "azienda-3-uuid", "priority": 1, "overrides": { "maxDosi": 100 } }

# 5. Verifica quante aziende hanno questa rule
GET /rules/{ruleId}
# La risposta include "_count": { "companies": 3 }
```

```bash
# 1. Crea il workspace (se non esiste)
POST /workspaces
{
  "name": "Studio Agronomico Rossi",
  "plan": "PROFESSIONAL"
}

# 2. Crea la rule (disciplinare) nel workspace
POST /workspaces/{workspaceId}/rules
{
  "name": "Disciplinare Biologico Emilia-Romagna 2024",
  "category": "DISCIPLINARE",
  "content": { ... },
  "region": "Emilia-Romagna",
  "validFrom": "2024-01-01T00:00:00.000Z",
  "validUntil": "2024-12-31T23:59:59.000Z"
}

# 3. Attiva la rule
PUT /rules/{ruleId}
{
  "status": "ACTIVE"
}

# 4. Assegna la rule all'azienda agricola
POST /rules/{ruleId}/companies
{
  "companyId": "company-uuid",
  "priority": 1,
  "notes": "Applicato per produzione biologica certificata"
}

# 5. (Opzionale) Verifica le rules assegnate all'azienda
GET /companies/{companyId}/rules?onlyActive=true
```

### Categorie di Rules Disponibili

- **DISCIPLINARE**: Disciplinari di produzione (biologico, DOP, IGP, etc.)
- **STANDARD**: Standard di qualità o certificazioni
- **BEST_PRACTICE**: Buone pratiche agricole
- **METHODOLOGY**: Metodologie di applicazione
- **CUSTOM**: Regole personalizzate

### Status delle Rules

- **DRAFT**: Bozza, non ancora attiva (default alla creazione)
- **ACTIVE**: Regola attiva e valida
- **ARCHIVED**: Archiviata, non più in uso
- **DEPRECATED**: Deprecata, sostituita da altra versione

### Permessi e Sicurezza

- **Creare/Modificare/Eliminare Rules**:
  - Richiede ruolo ADMIN o OWNER, oppure
  - `canManageRules: true` per i MEMBER
- **Visualizzare Rules**:
  - Tutti i membri del workspace possono vedere le rules
  - Rules con `isPublic: true` sono visibili anche a non-membri
- **Assegnare Rules a Companies**:
  - Richiede permessi di gestione rules nel workspace
  - Non richiede permessi sulla company (le companies sono indipendenti)

### Caratteristiche Avanzate

- **Validità Temporale**: `validFrom` e `validUntil` per definire il periodo di validità
- **Versioning**: Campo `version` per tracciare versioni diverse
- **Template**: `isTemplate: true` per creare rules riutilizzabili
- **Pubblicazione**: `isPublic: true` per condividere rules con altri workspace
- **Overrides**: Personalizzazioni specifiche per company tramite campo JSON `overrides`
- **Priority**: Ordine di priorità quando più rules si applicano alla stessa company

---

## 📋 RULES - API Endpoints Dettagliati

### 1. Lista Regole del Workspace

```bash
curl -X GET "http://localhost:8081/workspaces/WORKSPACE_ID/rules?category=DISCIPLINARE&status=ACTIVE&region=Emilia-Romagna&search=biologico" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Query Parameters opzionali**:

- `category`: DISCIPLINARE, STANDARD, BEST_PRACTICE, METHODOLOGY, CUSTOM
- `status`: DRAFT, ACTIVE, ARCHIVED, DEPRECATED
- `region`: stringa (es: "Emilia-Romagna")
- `search`: stringa per ricerca nel nome/descrizione

**Risposta (200 OK)**:

```json
{
  "status": "success",
  "data": {
    "rules": [
      {
        "id": "uuid",
        "workspaceId": "uuid",
        "name": "Disciplinare Biologico Emilia-Romagna",
        "slug": "disciplinare-biologico-emilia-romagna",
        "description": "Disciplinare per produzione biologica",
        "category": "DISCIPLINARE",
        "status": "ACTIVE",
        "content": {
          "sezioni": [],
          "requisiti": []
        },
        "sourceUrl": "https://example.com/disciplinare.pdf",
        "sourceDocument": "Disciplinare_ER_2024.pdf",
        "region": "Emilia-Romagna",
        "validFrom": "2024-01-01T00:00:00.000Z",
        "validUntil": "2024-12-31T23:59:59.000Z",
        "version": "2024.1",
        "isPublic": false,
        "isTemplate": false,
        "createdById": "uuid",
        "createdAt": "2025-01-13T12:00:00.000Z",
        "updatedAt": "2025-01-13T12:00:00.000Z",
        "companiesCount": 3,
        "cropsCount": 2,
        "companies": [
          {
            "id": "company-uuid-1",
            "name": "Azienda Agricola Rossi"
          },
          {
            "id": "company-uuid-2",
            "name": "Azienda Agricola Bianchi"
          },
          {
            "id": "company-uuid-3",
            "name": "Azienda Agricola Verdi"
          }
        ]
      }
    ]
  }
}
```

**Nota**:

- La risposta include `companiesCount` e `cropsCount` che indicano rispettivamente quante aziende e quante colture hanno questa rule assegnata
- L'array `companies` contiene tutte le aziende assegnate con `id` e `name`, ordinate per priorità

---

### 2. Crea Regola

```bash
curl -X POST http://localhost:8081/workspaces/WORKSPACE_ID/rules \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Disciplinare Biologico Emilia-Romagna",
    "slug": "disciplinare-biologico-emilia-romagna",
    "description": "Disciplinare per produzione biologica",
    "category": "DISCIPLINARE",
    "content": {
      "sezioni": [
        {
          "titolo": "Requisiti generali",
          "contenuto": "..."
        }
      ],
      "requisiti": []
    },
    "sourceUrl": "https://example.com/disciplinare.pdf",
    "sourceDocument": "Disciplinare_ER_2024.pdf",
    "region": "Emilia-Romagna",
    "validFrom": "2024-01-01T00:00:00.000Z",
    "validUntil": "2024-12-31T23:59:59.000Z",
    "version": "2024.1",
    "isPublic": false,
    "isTemplate": false
  }'
```

**Campi obbligatori**: `name`, `category`, `content`

**Campi opzionali**: `slug`, `description`, `sourceUrl`, `sourceDocument`, `region`, `validFrom`, `validUntil`, `version`, `isPublic`, `isTemplate`

**Categorie disponibili**: DISCIPLINARE, STANDARD, BEST_PRACTICE, METHODOLOGY, CUSTOM

**Risposta (201 Created)**:

```json
{
  "status": "success",
  "data": {
    "rule": {
      "id": "uuid",
      "workspaceId": "uuid",
      "name": "Disciplinare Biologico Emilia-Romagna",
      "slug": "disciplinare-biologico-emilia-romagna",
      "description": "Disciplinare per produzione biologica",
      "category": "DISCIPLINARE",
      "status": "DRAFT",
      "content": {
        "sezioni": [],
        "requisiti": []
      },
      "sourceUrl": "https://example.com/disciplinare.pdf",
      "sourceDocument": "Disciplinare_ER_2024.pdf",
      "region": "Emilia-Romagna",
      "validFrom": "2024-01-01T00:00:00.000Z",
      "validUntil": "2024-12-31T23:59:59.000Z",
      "version": "2024.1",
      "isPublic": false,
      "isTemplate": false,
      "createdById": "uuid",
      "createdAt": "2025-01-13T12:00:00.000Z",
      "updatedAt": "2025-01-13T12:00:00.000Z"
    }
  }
}
```

**Nota**: L'utente deve avere permessi di gestione regole nel workspace (ADMIN, OWNER, o `canManageRules: true`).

---

### 3. Ottieni Regola per ID

```bash
curl -X GET http://localhost:8081/rules/RULE_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Risposta (200 OK)**:

```json
{
  "status": "success",
  "data": {
    "rule": {
      "id": "uuid",
      "workspaceId": "uuid",
      "name": "Disciplinare Biologico Emilia-Romagna",
      "slug": "disciplinare-biologico-emilia-romagna",
      "description": "Disciplinare per produzione biologica",
      "category": "DISCIPLINARE",
      "status": "ACTIVE",
      "content": {
        "sezioni": [],
        "requisiti": []
      },
      "sourceUrl": "https://example.com/disciplinare.pdf",
      "sourceDocument": "Disciplinare_ER_2024.pdf",
      "region": "Emilia-Romagna",
      "validFrom": "2024-01-01T00:00:00.000Z",
      "validUntil": "2024-12-31T23:59:59.000Z",
      "version": "2024.1",
      "isPublic": false,
      "isTemplate": false,
      "createdById": "uuid",
      "createdAt": "2025-01-13T12:00:00.000Z",
      "updatedAt": "2025-01-13T12:00:00.000Z",
      "companiesCount": 5,
      "cropsCount": 3,
      "companies": [
        {
          "id": "company-uuid-1",
          "name": "Azienda Agricola Rossi"
        },
        {
          "id": "company-uuid-2",
          "name": "Azienda Agricola Bianchi"
        }
      ]
    }
  }
}
```

**Nota**:

- L'utente deve essere membro del workspace o la regola deve essere pubblica (`isPublic: true`)
- L'array `companies` contiene tutte le aziende assegnate con `id` e `name`, ordinate per priorità

---

### 4. Aggiorna Regola

```bash
curl -X PUT http://localhost:8081/rules/RULE_ID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Disciplinare Biologico Emilia-Romagna - Aggiornato",
    "status": "ACTIVE",
    "description": "Nuova descrizione",
    "validUntil": "2025-12-31T23:59:59.000Z"
  }'
```

**Risposta (200 OK)**:

```json
{
  "status": "success",
  "data": {
    "rule": {
      "id": "uuid",
      "workspaceId": "uuid",
      "name": "Disciplinare Biologico Emilia-Romagna - Aggiornato",
      "slug": "disciplinare-biologico-emilia-romagna",
      "description": "Nuova descrizione",
      "category": "DISCIPLINARE",
      "status": "ACTIVE",
      "content": {
        "sezioni": [],
        "requisiti": []
      },
      "sourceUrl": "https://example.com/disciplinare.pdf",
      "sourceDocument": "Disciplinare_ER_2024.pdf",
      "region": "Emilia-Romagna",
      "validFrom": "2024-01-01T00:00:00.000Z",
      "validUntil": "2025-12-31T23:59:59.000Z",
      "version": "2024.1",
      "isPublic": false,
      "isTemplate": false,
      "createdById": "uuid",
      "createdAt": "2025-01-13T12:00:00.000Z",
      "updatedAt": "2025-01-13T12:05:00.000Z"
    }
  }
}
```

**Nota**: L'utente deve avere permessi di gestione regole nel workspace.

---

### 5. Elimina Regola

```bash
curl -X DELETE http://localhost:8081/rules/RULE_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Risposta (204 No Content)** - Nessun body nella risposta

**Nota**: L'utente deve avere permessi di gestione regole nel workspace.

---

### 6. Assegna Regola a Company

```bash
curl -X POST http://localhost:8081/rules/RULE_ID/companies \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": "COMPANY_UUID",
    "priority": 1,
    "overrides": {
      "customField": "customValue"
    },
    "notes": "Regola applicata per produzione biologica"
  }'
```

**Campi obbligatori**: `companyId`

**Campi opzionali**: `priority` (default: 0), `overrides` (JSON object), `notes`

**Risposta (201 Created)**:

```json
{
  "status": "success",
  "data": {
    "assignment": {
      "id": "uuid",
      "ruleId": "uuid",
      "companyId": "uuid",
      "isActive": true,
      "priority": 1,
      "overrides": {
        "customField": "customValue"
      },
      "notes": "Regola applicata per produzione biologica",
      "assignedAt": "2025-01-13T12:00:00.000Z",
      "assignedById": "uuid"
    }
  }
}
```

**Nota**: L'utente deve avere permessi di gestione regole nel workspace. Non è possibile assegnare la stessa regola due volte alla stessa company.

---

### 7. Lista Aziende Assegnate a una Regola

```bash
curl -X GET http://localhost:8081/rules/RULE_ID/companies \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Risposta (200 OK)**:

```json
{
  "status": "success",
  "data": {
    "companies": [
      {
        "assignment": {
          "id": "uuid",
          "ruleId": "uuid",
          "companyId": "uuid",
          "isActive": true,
          "priority": 1,
          "overrides": {
            "customField": "customValue"
          },
          "notes": "Produzione biologica certificata",
          "assignedAt": "2025-01-13T12:00:00.000Z",
          "assignedById": "uuid"
        },
        "company": {
          "id": "uuid",
          "name": "Azienda Agricola Rossi",
          "vatNumber": "IT12345678901",
          "address": "Via Roma 1, 40100 Bologna"
        }
      },
      {
        "assignment": {
          "id": "uuid",
          "ruleId": "uuid",
          "companyId": "uuid",
          "isActive": true,
          "priority": 2,
          "overrides": null,
          "notes": null,
          "assignedAt": "2025-01-13T12:30:00.000Z",
          "assignedById": "uuid"
        },
        "company": {
          "id": "uuid",
          "name": "Azienda Agricola Bianchi",
          "vatNumber": "IT98765432109",
          "address": "Via Verdi 2, 40100 Bologna"
        }
      }
    ]
  }
}
```

**Nota**:

- L'utente deve essere membro del workspace o la regola deve essere pubblica (`isPublic: true`)
- Le aziende sono ordinate per priorità (priority crescente)
- Include sia i dettagli dell'assegnazione che i dati dell'azienda

---

### 8. Rimuovi Assegnazione Regola da Company

```bash
curl -X DELETE http://localhost:8081/rules/RULE_ID/companies/COMPANY_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Risposta (204 No Content)** - Nessun body nella risposta

**Nota**: L'utente deve avere permessi di gestione regole nel workspace.

---

### 9. Lista Regole di una Company

```bash
curl -X GET "http://localhost:8081/companies/COMPANY_ID/rules?onlyActive=true" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Query Parameters opzionali**:

- `onlyActive`: boolean (default: false) - se true, restituisce solo le assegnazioni attive

**Risposta (200 OK)**:

```json
{
  "status": "success",
  "data": {
    "rules": [
      {
        "rule": {
          "id": "uuid",
          "workspaceId": "uuid",
          "name": "Disciplinare Biologico Emilia-Romagna",
          "slug": "disciplinare-biologico-emilia-romagna",
          "description": "Disciplinare per produzione biologica",
          "category": "DISCIPLINARE",
          "status": "ACTIVE",
          "content": {
            "sezioni": [],
            "requisiti": []
          },
          "sourceUrl": "https://example.com/disciplinare.pdf",
          "sourceDocument": "Disciplinare_ER_2024.pdf",
          "region": "Emilia-Romagna",
          "validFrom": "2024-01-01T00:00:00.000Z",
          "validUntil": "2024-12-31T23:59:59.000Z",
          "version": "2024.1",
          "isPublic": false,
          "isTemplate": false,
          "createdById": "uuid",
          "createdAt": "2025-01-13T12:00:00.000Z",
          "updatedAt": "2025-01-13T12:00:00.000Z"
        },
        "assignment": {
          "id": "uuid",
          "ruleId": "uuid",
          "companyId": "uuid",
          "isActive": true,
          "priority": 1,
          "overrides": {
            "customField": "customValue"
          },
          "notes": "Regola applicata per produzione biologica",
          "assignedAt": "2025-01-13T12:00:00.000Z",
          "assignedById": "uuid"
        }
      }
    ]
  }
}
```

---

## 🔐 Autenticazione

Tutti gli endpoint richiedono un token JWT nell'header:

```bash
-H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Per ottenere il token, usa l'endpoint di autenticazione (non incluso in questo documento).

---

## 📝 Note Generali

### Workspace Plans e Limiti

- **FREE**: maxMembers: 5, maxRules: 50
- **PROFESSIONAL**: maxMembers: 25, maxRules: 100
- **ENTERPRISE**: maxMembers: 100, maxRules: 500

### Hard-block sui limiti piano

- Quando il limite membri è raggiunto, l'API blocca inviti/accettazioni con `MEMBER_LIMIT_REACHED`.
- Quando il limite regole è raggiunto, la creazione regole viene bloccata con `RULE_LIMIT_REACHED`.
- Il downgrade del piano viene bloccato con `PLAN_DOWNGRADE_LIMIT_EXCEEDED` se membri/regole attuali superano i limiti del piano target.

### Ruoli Workspace

- **OWNER**: Controllo completo, può eliminare workspace, non può essere rimosso
- **ADMIN**: Può gestire membri e regole, non può eliminare workspace
- **MEMBER**: Accesso base, permessi configurabili (`canManageRules`, `canInviteMembers`)
- **VIEWER**: Solo lettura

### Status Regole

- **DRAFT**: Bozza, non ancora attiva
- **ACTIVE**: Regola attiva e valida
- **ARCHIVED**: Archiviata, non più in uso
- **DEPRECATED**: Deprecata, sostituita da altra versione

### Categorie Regole

- **DISCIPLINARE**: Disciplinari di produzione (es: biologico, DOP, IGP)
- **STANDARD**: Standard di qualità o certificazioni
- **BEST_PRACTICE**: Buone pratiche agricole
- **METHODOLOGY**: Metodologie di applicazione
- **CUSTOM**: Regole personalizzate

---

## ❌ Errori Comuni

### 401 Unauthorized

```json
{
  "status": "error",
  "message": "User not authenticated",
  "code": "USER_NOT_AUTHENTICATED"
}
```

### 403 Forbidden

```json
{
  "status": "error",
  "message": "User does not have permission to perform this action",
  "code": "INSUFFICIENT_PERMISSIONS"
}
```

### 404 Not Found

```json
{
  "status": "error",
  "message": "Workspace not found",
  "code": "WORKSPACE_NOT_FOUND"
}
```

### 400 Bad Request

```json
{
  "status": "error",
  "message": "Name is required",
  "code": "MISSING_NAME"
}
```
