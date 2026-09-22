# WhatsApp Integration con Field Note Agent — Part 2

[Back to the guide index](../WHATSAPP_INTEGRATION.md)

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
curl -X POST http://localhost:8081/settings/whatsapp/send-message \
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
curl -X GET http://localhost:8081/webhooks/whatsapp/health
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
curl -X POST http://localhost:8081/settings/whatsapp/setup \
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
curl -X GET http://localhost:8081/settings/whatsapp/status \
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
