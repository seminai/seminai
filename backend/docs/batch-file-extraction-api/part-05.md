# Batch File Extraction API — Part 5

[Back to the guide index](../BATCH_FILE_EXTRACTION_API.md)

Tutti gli errori seguono questo formato:

```json
{
  "error": {
    "message": "Descrizione errore",
    "code": "ERROR_CODE",
    "statusCode": 400
  }
}
```

| Codice                       | HTTP | Descrizione                                     |
| ---------------------------- | ---- | ----------------------------------------------- |
| `USER_NOT_AUTHENTICATED`     | 401  | Token mancante o non valido                     |
| `NO_FILES`                   | 400  | Nessun file caricato                            |
| `MISSING_COMPANY_ID`         | 400  | companyId non specificato                       |
| `MISSING_CATEGORIES`         | 400  | categories non specificato                      |
| `INVALID_CATEGORIES`         | 400  | categories non e' un JSON array valido          |
| `CATEGORIES_LENGTH_MISMATCH` | 400  | Numero di categories diverso dal numero di file |
| `EXTRACTION_NOT_FOUND`       | 404  | Estrazione non trovata                          |
| `INVALID_EXTRACTION_STATUS`  | 400  | Operazione non permessa per lo stato corrente   |
| `NO_EXTRACTED_DATA`          | 400  | Tentativo di conferma senza dati estratti       |
| `MISSING_EXTRACTED_DATA`     | 400  | PATCH senza extractedData nel body              |
| `UNKNOWN_CATEGORY`           | 400  | Categoria non riconosciuta durante la conferma  |
| `COMPANY_NOT_FOUND`          | 404  | Azienda non trovata durante la conferma         |

---

## Flusso completo — Esempio pratico

```bash
# 1. Login e ottenere il token
TOKEN=$(curl -s -X POST http://localhost:8081/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}' \
  | jq -r '.data.token')

# 2. Upload batch (2 file: CSV campi + PDF fattura)
BATCH=$(curl -s -X POST http://localhost:8081/extractions/batch \
  -H "Authorization: Bearer $TOKEN" \
  -F "companyId=abc-123-company-id" \
  -F 'categories=["fields", "invoice"]' \
  -F "files=@campi.csv" \
  -F "files=@fattura.pdf")

BATCH_ID=$(echo $BATCH | jq -r '.data.batchId')
EXTRACTION_1=$(echo $BATCH | jq -r '.data.extractions[0].id')
EXTRACTION_2=$(echo $BATCH | jq -r '.data.extractions[1].id')

echo "Batch: $BATCH_ID"
echo "Extraction 1 (fields): $EXTRACTION_1"
echo "Extraction 2 (invoice): $EXTRACTION_2"

# 3. Attendere completamento via polling (o Socket.IO)
sleep 10

# 4. Verificare lista estrazioni
curl -s "http://localhost:8081/extractions?companyId=abc-123-company-id" \
  -H "Authorization: Bearer $TOKEN" | jq '.data.extractions[] | {id, status, category, fileName}'

# 5. Vedere dettaglio del file campi (PENDING_CONFIRMATION)
curl -s "http://localhost:8081/extractions/$EXTRACTION_1" \
  -H "Authorization: Bearer $TOKEN" | jq '.data.extraction.extractedData'

# 6. Modificare un dato estratto (opzionale)
curl -s -X PATCH "http://localhost:8081/extractions/$EXTRACTION_1" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "extractedData": {
      "fields": [
        {
          "companyId": "abc-123-company-id",
          "name": "Vigneto Nord (corretto)",
          "coordinates": [],
          "coordinatesGaussBoaga": [],
          "latitude": 44.4949,
          "longitude": 11.3426,
          "gisHa": 2.8,
          "foglio": "12",
          "particella": "345"
        }
      ],
      "extractedCount": 1
    }
  }' | jq '.status'

# 7a. Conferma singola
curl -s -X POST "http://localhost:8081/extractions/$EXTRACTION_1/confirm" \
  -H "Authorization: Bearer $TOKEN" | jq

# 7b. Oppure conferma l'intero batch
curl -s -X POST "http://localhost:8081/extractions/batch/$BATCH_ID/confirm" \
  -H "Authorization: Bearer $TOKEN" | jq

# 8. Verificare che lo stato sia CONFIRMED
curl -s "http://localhost:8081/extractions/$EXTRACTION_1" \
  -H "Authorization: Bearer $TOKEN" | jq '.data.extraction.status'
# Output: "CONFIRMED"
```
