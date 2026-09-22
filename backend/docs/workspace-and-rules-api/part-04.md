# API Workspace e Rules - Documentazione cURL — Part 4

[Back to the guide index](../WORKSPACE_AND_RULES_API.md)

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
