# API Workspace e Rules - Documentazione cURL — Part 2

[Back to the guide index](../WORKSPACE_AND_RULES_API.md)

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
