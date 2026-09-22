# Guida Integrazione Frontend - Field Notes System — Part 8

[Back to the guide index](../FRONTEND_INTEGRATION_GUIDE.md)

- **Lista:** membri attivi (con user name/email) e inviti in sospeso; per ogni membro viene mostrato il ruolo (Proprietario, Admin, Membro, Visualizzatore).
- **Ruoli:** `OWNER` (un solo proprietario, non modificabile), `ADMIN`, `MEMBER`, `VIEWER`. Solo chi ha permessi (es. OWNER/ADMIN) può cambiare ruoli, invitare o rimuovere.
- **Invita:** form email + ruolo → invio invito; l’invitato riceve un link (es. `/workspace/accept-invitation`) per accettare.
- **Azioni:** cambia ruolo (dropdown/menu), rimuovi membro, annulla invito.
- **API (tipiche):**
  - **GET** `/workspaces/:workspaceId/members` — restituisce `{ members, invitations }`.
  - **POST** `/workspaces/:workspaceId/invitations` — body `{ email, role }`.
  - **PATCH** `/workspaces/:workspaceId/members/:memberId` — body `{ role }`.
  - **DELETE** `/workspaces/:workspaceId/members/:memberId` — rimuovi membro.
  - **DELETE** `/workspaces/:workspaceId/invitations/:invitationId` — annulla invito.
- **Hook:** `useWorkspaceMembers(workspaceId)`, `useInviteMember`, `useUpdateMember`, `useRemoveMember`, `useCancelInvitation`.

### 4. Regole

- **Lista:** regole del workspace con nome, categoria, stato, regione; filtri per categoria (Disciplinare, Standard, Buona Pratica, Metodologia, Personalizzata), stato (Bozza, Attiva, Archiviata, Deprecata) e ricerca testuale.
- **Limite:** il workspace ha un `maxRules`; non si possono creare più regole del consentito.
- **Azioni:** Crea Regola → `/new-rule`; Modifica → `/workspace/settings/rules/:ruleId`; Elimina (con conferma); Assegna/rimuovi regola ad aziende (drawer con lista aziende).
- **API (tipiche):**
  - **GET** `/workspaces/:workspaceId/rules` — lista regole (con eventuali filtri).
  - **POST** `/rules` — crea (body con nome, categoria, descrizione, ecc.).
  - **GET** `/rules/:ruleId`, **PUT** `/rules/:ruleId`, **DELETE** `/rules/:ruleId`.
  - Assegnazione aziende: **POST** e **DELETE** su endpoint tipo `/rules/:ruleId/companies` o equivalente.
- **Hook:** `useWorkspaceRules(workspaceId)`, `useRule(ruleId)`, `useDeleteRule`, `useAssignRuleToCompany`, `useRemoveRuleFromCompany`.

### 5. Zona Pericolosa

- **Elimina workspace:** pulsante che apre un dialog; per confermare bisogna digitare il **nome esatto** del workspace. Solo allora viene chiamata **DELETE** `/workspaces/:workspaceId`.
- **Dopo l’eliminazione:** il frontend chiama `exitWorkspace()`, mostra un toast e reindirizza alla dashboard (es. `/dashboard`).
- **Hook:** `useDeleteWorkspace`, `useWorkspaceContext().exitWorkspace`.

### Riepilogo API workspace (riferimento)

- **GET** `/workspaces` — lista workspace dell’utente.
- **GET** `/workspaces/:id` — dettaglio workspace.
- **POST** `/workspaces` — crea workspace.
- **PUT** `/workspaces/:id` — aggiorna (nome, slug, descrizione, logoUrl, colori).
- **DELETE** `/workspaces/:id` — elimina workspace.
- **POST** `/workspaces/:id/logo` — upload logo (multipart).
- Membri/inviti: GET members, POST invite, PATCH member, DELETE member, DELETE invitation.
- Regole: CRUD su `/rules` e assegnazioni alle aziende come da backend.

---

## 📚 Risorse Aggiuntive

- **Swagger UI**: `http://localhost:8081/api-docs`
- **Postman Collection**: [Download](link)
- **TypeScript SDK**: `npm install @yourcompany/seminai-sdk`
- **Support**: support@yourdomain.com

---

## 🔐 Sicurezza

1. **Sempre HTTPS** in produzione
2. **Token refresh** automatico prima della scadenza
3. **Rate limiting**: Max 60 req/min per utente
4. **Input sanitization**: Il backend già valida, ma fai anche lato frontend
5. **CORS**: Solo domini whitelisted

---

## 📊 Monitoraggio Performance

```typescript
// Track API performance
const trackApiCall = async (endpoint: string, fn: () => Promise<any>) => {
  const start = performance.now();
  try {
    const result = await fn();
    const duration = performance.now() - start;

    // Send to analytics
    analytics.track('api_call', {
      endpoint,
      duration,
      success: true,
    });

    return result;
  } catch (error) {
    const duration = performance.now() - start;

    analytics.track('api_call', {
      endpoint,
      duration,
      success: false,
      error: error.message,
    });

    throw error;
  }
};
```

---

**Ultimo aggiornamento**: 2024-01-15
**Versione API**: v1.0
**Mantainer**: dev@seminai.com
