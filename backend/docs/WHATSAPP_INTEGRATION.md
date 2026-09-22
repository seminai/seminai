# WhatsApp Integration con Field Note Agent

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

   - URL: `https://evolution-api-661301438659.europe-west1.run.app`
   - API Key configurata

2. **Variabili d'ambiente** nel backend:

   ```bash
   EVOLUTION_API_URL=https://evolution-api-661301438659.europe-west1.run.app
   EVOLUTION_API_KEY=your-api-key
   WHATSAPP_WEBHOOK_URL=https://seminai-be-v2-661301438659.europe-west1.run.app/webhooks/whatsapp
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

**Base URL:** `https://seminai-be-v2-661301438659.europe-west1.run.app`

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
  "webhookUrl": "https://seminai-be-v2-661301438659.europe-west1.run.app/webhooks/whatsapp"
}
```

**cURL:**

```bash
curl -X POST https://seminai-be-v2-661301438659.europe-west1.run.app/settings/whatsapp/setup \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "instanceName": "seminai_user123",
    "webhookUrl": "https://seminai-be-v2-661301438659.europe-west1.run.app/webhooks/whatsapp"
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
curl -X GET https://seminai-be-v2-661301438659.europe-west1.run.app/settings/whatsapp/qr-code \
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
curl -X GET https://seminai-be-v2-661301438659.europe-west1.run.app/settings/whatsapp/status \
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
curl -X POST https://seminai-be-v2-661301438659.europe-west1.run.app/settings/whatsapp/disconnect \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "deleteInstance": false
  }'
```

**Response:**

```json
{
  "status": "success",
  "message": "WhatsApp disconnected successfully"
}
```

### 5. Invia Messaggio WhatsApp

Invia un messaggio di testo tramite WhatsApp (per test).

**Endpoint:** `POST /settings/whatsapp/send-message`

**Headers:**

```bash
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "phoneNumber": "+393331234567",
  "message": "Test messaggio da seminai"
}
```

**cURL:**

```bash
curl -X POST https://seminai-be-v2-661301438659.europe-west1.run.app/settings/whatsapp/send-message \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+393331234567",
    "message": "Test messaggio da seminai"
  }'
```

**Response:**

```json
{
  "status": "success",
  "data": {
    "messageId": "msg-abc123",
    "sent": true
  }
}
```

### 6. Webhook (Evolution API → Backend)

Endpoint che riceve i messaggi da Evolution API.

**Endpoint:** `POST /webhooks/whatsapp`

**Nota:** Questo endpoint è chiamato automaticamente da Evolution API, non va chiamato manualmente.

**Request Body (da Evolution API):**

```json
{
  "event": "messages.upsert",
  "instance": "seminai_user123",
  "data": {
    "key": {
      "remoteJid": "393331234567@s.whatsapp.net",
      "fromMe": false,
      "id": "msg-123"
    },
    "pushName": "Mario Rossi",
    "message": {
      "conversation": "ho dato 10 kg di rame nel campo vite"
    },
    "messageType": "conversation",
    "messageTimestamp": 1705678900
  }
}
```

**Response:**

```json
{
  "status": "ok"
}
```

### 7. Health Check Webhook

Verifica lo stato del webhook endpoint.

**Endpoint:** `GET /webhooks/whatsapp/health`

**cURL:**

```bash
curl -X GET https://seminai-be-v2-661301438659.europe-west1.run.app/webhooks/whatsapp/health
```

**Response:**

```json
{
  "status": "ok",
  "configured": true,
  "timestamp": "2026-01-19T14:30:00Z"
}
```

## Flusso Completo di Utilizzo

### Step 1: Setup Iniziale

```bash
# 1. L'utente fa setup WhatsApp
curl -X POST https://seminai-be-v2-661301438659.europe-west1.run.app/settings/whatsapp/setup \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

**Risposta:** Ricevi un QR code in base64

### Step 2: Scansione QR Code

1. L'utente apre WhatsApp sul telefono
2. Va in Impostazioni → Dispositivi collegati → Collega un dispositivo
3. Scansiona il QR code ricevuto dall'API

### Step 3: Verifica Connessione

```bash
# Verifica che la connessione sia attiva
curl -X GET https://seminai-be-v2-661301438659.europe-west1.run.app/settings/whatsapp/status \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Risposta:** `"connected": true`

### Step 4: Invia Messaggio (Test)

L'utente invia un messaggio WhatsApp al numero collegato:

```
"ho dato 10 kg di rame nel campo vite ieri mattina"
```

### Step 5: Elaborazione Automatica

1. Evolution API riceve il messaggio
2. Invia webhook a `/webhooks/whatsapp`
3. Il backend processa il messaggio con Field Note Agent
4. L'agente analizza e cerca corrispondenze (campi, prodotti, etc.)
5. Risponde all'utente via WhatsApp con un riepilogo

**Esempio risposta agente:**

```
Ho analizzato la tua nota di campo. Ecco cosa ho trovato:

📋 Categoria: OPERAZIONE (trattamento fitosanitario)
📅 Data: 18/01/2026
🏢 Azienda: azienda-demo
🏭 Campo: Campo Vite (trovato nel tuo database)
💊 Prodotto: Rame - Hai 25L in magazzino
📊 Quantità utilizzata: 10 kg

Vuoi che salvi questa nota di campo?

✅ Rispondi *sì* per confermare
❌ Rispondi *no* o invia correzioni
```

### Step 6: Approvazione

L'utente risponde:

- **"sì"** → L'agente salva la nota di campo
- **"no"** → L'agente chiede modifiche
- **Correzioni** → L'agente riprocessa con le nuove informazioni

**Risposta finale dopo approvazione:**

```
✅ Nota di campo salvata con successo!

ID: abc-123-def-456
Campo: Campo Vite
Prodotto: Rame (10 kg)
Data: 18/01/2026
```

## Esempi di Messaggi Supportati

### Operazioni

```
"ho dato 10 kg di rame nel campo vite"
"trattato il vigneto nord con Revolution, 5 litri"
"concimato il campo soia con 20 quintali di letame"
```

### Osservazioni

```
"notata peronospora nel vigneto nord, le foglie hanno macchie marroni"
"visto afidi sul campo pomodori"
"campo vite: foglie gialle nella parte sud"
```

### Raccolte

```
"raccolto 50 quintali di uva nel campo vite"
"mietitura campo grano: 30 quintali"
```

### Misurazioni

```
"temperatura del terreno nel campo A: 18°C"
"umidità campo soia: 65%"
```

## Parole Chiave per Approvazione

### Approvazione

- `sì`, `si`, `yes`
- `ok`, `conferma`, `salva`
- `approva`, `confermo`

### Rifiuto/Correzione

- `no`, `annulla`, `rifiuta`
- `cancel`, `modifica`, `correggi`

## Gestione Conversazioni

- **Thread ID**: Ogni conversazione WhatsApp ha un thread ID univoco basato su `instanceName:phoneNumber`
- **Memoria**: Le conversazioni sono mantenute in memoria per 30 minuti di inattività
- **Contesto**: L'agente ricorda i messaggi precedenti nella stessa conversazione

## Troubleshooting

### Problema: QR Code non appare

**Soluzione:**

1. Verifica che Evolution API sia online
2. Controlla i log: `gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=evolution-api"`
3. Riprova il setup

### Problema: Messaggi non arrivano

**Soluzione:**

1. Verifica che il webhook sia configurato:
   ```bash
   curl -X GET https://seminai-be-v2-661301438659.europe-west1.run.app/webhooks/whatsapp/health
   ```
2. Controlla che `WHATSAPP_WEBHOOK_URL` sia corretto nelle variabili d'ambiente
3. Verifica i log del backend per errori

### Problema: Agente non risponde

**Soluzione:**

1. Verifica che `OPENAI_API_KEY` sia configurato
2. Controlla i log del backend per errori dell'agente
3. Verifica che l'utente abbia campi/prodotti nel database

### Problema: Connessione persa

**Soluzione:**

1. Verifica lo stato: `GET /settings/whatsapp/status`
2. Se `connected: false`, richiedi nuovo QR code: `GET /settings/whatsapp/qr-code`
3. Verifica che Evolution API sia sempre attivo (min-instances: 1)

## Note Importanti

⚠️ **Numero WhatsApp dedicato consigliato**

Se l'utente collega il suo WhatsApp personale, l'agente riceverà **TUTTI i messaggi** (anche personali). Consigliamo di usare un **numero WhatsApp Business dedicato** per l'azienda agricola.

⚠️ **Persistenza dati**

Evolution API usa un database file-based. I dati delle sessioni WhatsApp sono persi se il container viene ricreato. Per produzione, considera di usare un database esterno (MongoDB/PostgreSQL).

⚠️ **Cloud Run e sessioni**

Cloud Run può "dormire" se non c'è traffico. Con `--min-instances 1` mantieni sempre attiva un'istanza per preservare le sessioni WhatsApp.

## Riferimenti

- [Evolution API Documentation](https://doc.evolution-api.com)
- [Field Note Agent README](../src/infrastructure/services/agents/field_note_agent/README.md)
- [Evolution API GitHub](https://github.com/EvolutionAPI/evolution-api)
