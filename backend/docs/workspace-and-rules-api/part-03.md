# API Workspace e Rules - Documentazione cURL — Part 3

[Back to the guide index](../WORKSPACE_AND_RULES_API.md)

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
