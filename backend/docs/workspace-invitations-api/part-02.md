# API Inviti Workspace - Documentazione cURL — Part 2

[Back to the guide index](../WORKSPACE_INVITATIONS_API.md)

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
curl -X POST http://localhost:8081/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "admin123"
  }'

# Risposta: { "data": { "token": "admin-token-xyz..." } }

# Admin invita un nuovo membro
curl -X POST http://localhost:8081/workspaces/workspace-uuid/invite \
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
curl -X POST http://localhost:8081/auth/login \
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
curl -X GET http://localhost:8081/workspaces/invitations/pending \
  -H "Authorization: Bearer user-token-abc..." \
  -H "Content-Type: application/json"

# Risposta: { "data": { "invitations": [{ "token": "invitation-token-123", "workspace": {...} }] } }
```

### Step 4: Utente accetta l'invito

```bash
# Utente accetta l'invito usando il token dall'endpoint precedente
curl -X POST http://localhost:8081/workspaces/invitations/invitation-token-123/accept \
  -H "Authorization: Bearer user-token-abc..." \
  -H "Content-Type: application/json"

# Risposta: { "data": { "member": {...} } }
```

### Step 5: Utente vede i workspace (ora è membro)

```bash
# Utente vede i workspace di cui è membro
curl -X GET http://localhost:8081/workspaces \
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
