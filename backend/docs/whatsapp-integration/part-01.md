# WhatsApp Integration con Field Note Agent — Part 1

[Back to the guide index](../WHATSAPP_INTEGRATION.md)


L'integrazione WhatsApp permette agli utenti di inviare note di campo direttamente tramite WhatsApp. I messaggi vengono processati dall'agente AI Field Note Agent che estrae informazioni strutturate e salva le note nel database.

## Caratteristiche Principali

- **Messaggi WhatsApp** → Note di campo automatiche
- **Agente AI integrato**: Classificazione automatica e estrazione dati
- **Workflow con approvazione**: L'utente conferma prima del salvataggio
- **Webhook automatico**: Ricezione messaggi in tempo reale
- **Multi-utente**: Ogni utente può collegare il proprio WhatsApp

## Architettura

```
┌──────────────┐      Messaggio      ┌─────────────────┐
│   Utente     │ ──────────────────▶│  WhatsApp       │
│  (telefono)  │                     │  (server Meta)  │
└──────────────┘                     └────────┬────────┘
                                              │
                                      Notifica
                                              ▼
                                     ┌─────────────────┐
                                     │  Evolution API  │
                                     │  (Cloud Run)    │
                                     └────────┬────────┘
                                              │
                                     Webhook POST
                                              ▼
                                     ┌─────────────────┐
                                     │  seminai-be     │
                                     │  /webhooks/     │
                                     │    whatsapp     │
                                     └────────┬────────┘
                                              │
                                     ┌────────▼────────┐
                                     │ Field Note      │
                                     │ Agent (AI)      │
                                     └────────┬────────┘
                                              │
                                     ┌────────▼────────┐
                                     │  Database      │
                                     │  (FieldNote)    │
                                     └─────────────────┘
```

## Prerequisiti

1. **Evolution API deployato** su Cloud Run

   - URL: `http://localhost:8080`
   - API Key configurata

2. **Variabili d'ambiente** nel backend:

   ```bash
   EVOLUTION_API_URL=http://localhost:8080
   EVOLUTION_API_KEY=your-api-key
   WHATSAPP_WEBHOOK_URL=http://localhost:8081/webhooks/whatsapp
   ```

3. **Database migrato** con i campi WhatsApp in Settings

## Schema Database

### Settings (campi WhatsApp)

```prisma
model Settings {
  // ... altri campi ...

  // WhatsApp Integration via Evolution API
  whatsappInstanceName  String?   // Nome univoco dell'istanza WhatsApp
  whatsappApiKey        String?   // API key per autenticazione Evolution API
  whatsappInstanceId    String?   // ID dell'istanza restituito da Evolution API
  whatsappConnected     Boolean   @default(false)
  whatsappPhoneNumber   String?   // Numero di telefono collegato
  whatsappQrCode        String?   // QR code temporaneo per connessione (base64)
  whatsappLastSync      DateTime? // Ultima sincronizzazione

  @@index([whatsappInstanceName])
}
```

## Endpoint API per Frontend

Il frontend deve chiamare questi endpoint del backend seminai-be:

**Base URL:** `http://localhost:8081`

### Endpoint Principali

| Endpoint                          | Metodo | Descrizione                            |
| --------------------------------- | ------ | -------------------------------------- |
| `/settings/whatsapp/setup`        | POST   | Inizializza WhatsApp e ottiene QR code |
| `/settings/whatsapp/qr-code`      | GET    | Ottiene QR code per connessione        |
| `/settings/whatsapp/status`       | GET    | Verifica stato connessione             |
| `/settings/whatsapp/disconnect`   | POST   | Disconnette WhatsApp                   |
| `/settings/whatsapp/send-message` | POST   | Invia messaggio (opzionale, per test)  |

**Nota:** Il webhook `/webhooks/whatsapp` è chiamato automaticamente da Evolution API, non dal frontend.

---

## Endpoint API

### 1. Setup WhatsApp

Crea una nuova istanza WhatsApp per l'utente.

**Endpoint:** `POST /settings/whatsapp/setup`

**Headers:**

```bash
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body (opzionale):**

```json
{
  "instanceName": "seminai_user123",
  "webhookUrl": "http://localhost:8081/webhooks/whatsapp"
}
```

**cURL:**

```bash
curl -X POST http://localhost:8081/settings/whatsapp/setup \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "instanceName": "seminai_user123",
    "webhookUrl": "http://localhost:8081/webhooks/whatsapp"
  }'
```

**Response:**

```json
{
  "status": "success",
  "data": {
    "instanceName": "seminai_user123",
    "instanceId": "instance-abc123",
    "apiKey": "apikey-xyz789",
    "qrCode": "https://...",
    "qrCodeBase64": "data:image/png;base64,iVBORw0KG...",
    "webhookConfigured": true
  }
}
```

### 2. Ottieni QR Code

Recupera il QR code per la connessione WhatsApp (se non ancora connesso).

**Endpoint:** `GET /settings/whatsapp/qr-code`

**Headers:**

```bash
Authorization: Bearer <token>
```

**cURL:**

```bash
curl -X GET http://localhost:8081/settings/whatsapp/qr-code \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**

```json
{
  "status": "success",
  "data": {
    "qrCode": "https://...",
    "qrCodeBase64": "data:image/png;base64,iVBORw0KG...",
    "expiresAt": "2026-01-19T15:30:00Z"
  }
}
```

### 3. Stato Connessione

Verifica lo stato della connessione WhatsApp.

**Endpoint:** `GET /settings/whatsapp/status`

**Headers:**

```bash
Authorization: Bearer <token>
```

**cURL:**

```bash
curl -X GET http://localhost:8081/settings/whatsapp/status \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**

```json
{
  "status": "success",
  "data": {
    "connected": true,
    "phoneNumber": "+393331234567",
    "instanceName": "seminai_user123",
    "lastSync": "2026-01-19T14:30:00Z",
    "connectionStatus": "connected"
  }
}
```

**Stati possibili:**

- `disconnected` - Non connesso
- `connecting` - In fase di connessione
- `connected` - Connesso e operativo
- `qr_code_ready` - QR code disponibile per scansione

### 4. Disconnetti WhatsApp

Disconnette l'istanza WhatsApp (mantiene l'istanza o la elimina).

**Endpoint:** `POST /settings/whatsapp/disconnect`

**Headers:**

```bash
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "deleteInstance": false
}
```

**cURL:**

```bash
curl -X POST http://localhost:8081/settings/whatsapp/disconnect \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "deleteInstance": false
  }'
```
