# API Workspace e Rules - Documentazione cURL — Part 5

[Back to the guide index](../WORKSPACE_AND_RULES_API.md)

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
