# WhatsApp Integration con Field Note Agent — Part 3

[Back to the guide index](../WHATSAPP_INTEGRATION.md)

**Soluzione:**

1. Verifica che il webhook sia configurato:
   ```bash
   curl -X GET http://localhost:8081/webhooks/whatsapp/health
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

Evolution API usa un database file-based. Per dati persistenti, configurare PostgreSQL esterno.

⚠️ **Cloud Run e sessioni**

Cloud Run può "dormire" se non c'è traffico. Con `--min-instances 1` mantieni sempre attiva un'istanza per preservare le sessioni WhatsApp.

## Riferimenti

- [Evolution API Documentation](https://doc.evolution-api.com)
- [Field Note Agent README](../src/infrastructure/services/agents/field_note_agent/README.md)
- [Evolution API GitHub](https://github.com/EvolutionAPI/evolution-api)
