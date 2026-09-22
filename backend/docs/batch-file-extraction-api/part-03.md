# Batch File Extraction API — Part 3

[Back to the guide index](../BATCH_FILE_EXTRACTION_API.md)

```json
{
  "status": "success",
  "data": {
    "extraction": {
      "id": "d4e5f6a7-b8c9-d0e1-f2a3-b4c5d6e7f8a9",
      "batchId": "b7f3a1e2-9c4d-4e6f-8a2b-1d3e5f7a9b0c",
      "status": "PENDING_CONFIRMATION",
      "category": "agricultural",
      "progress": 100,
      "fileName": "piano_colturale.xlsx",
      "fileIndex": 0,
      "fileUrl": "http://localhost:8081/files/bucket/path/piano_colturale.xlsx",
      "extractedData": {
        "fields": [
          {
            "companyId": "abc-123-company-id",
            "name": "Vigneto Nord",
            "foglio": "12",
            "particella": "345",
            "gisHa": 2.5,
            "...": "..."
          }
        ],
        "productionUnits": [
          {
            "name": "UP Vite Sangiovese",
            "cropName": "Vite",
            "cropType": "frutticoli",
            "variety": "Sangiovese",
            "protocoll": "Biologico",
            "protectionStructure": null,
            "startDate": "2026-03-01",
            "endDate": "2026-10-15",
            "areaHa": 2.5,
            "fieldAllocations": [
              {
                "foglio": "12",
                "particella": "345",
                "areaHa": 2.5,
                "fieldId": null,
                "fieldName": "Vigneto Nord"
              }
            ]
          }
        ],
        "extractedCount": 2
      },
      "error": null,
      "createdAt": "2026-03-16T10:30:00.000Z",
      "updatedAt": "2026-03-16T10:30:20.000Z"
    }
  }
}
```

---

## 5. Modifica dati estratti (PATCH)

L'utente puo' modificare i dati estratti **prima** della conferma. Solo le estrazioni con status `PENDING_CONFIRMATION` possono essere modificate.

### Request

```
PATCH /extractions/:id
Content-Type: application/json
Authorization: Bearer <token>
```

### cURL — Modificare una entry di fattura

```bash
curl -X PATCH http://localhost:8081/extractions/f2b3c4d5-e6f7-a8b9-c0d1-e2f3a4b5c6d7 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "extractedData": {
      "entries": [
        {
          "productName": "GLYPHOSATE 360 SL (corretto)",
          "registrationNumber": "12345",
          "productCategory": "PHYTOSANITARY",
          "administrativeStatus": "Autorizzato",
          "quantity": 25,
          "quantityUnitOfMeasure": "L",
          "supplierName": "Agri Supply S.r.l.",
          "supplierVat": "IT01234567890",
          "invoiceNumber": "FT-2026/0042",
          "invoiceDate": "2026-03-10",
          "invoiceDueDate": "2026-04-10",
          "unitPrice": 12.50,
          "totalPrice": 312.50
        }
      ],
      "extractedCount": 1
    }
  }'
```

### cURL — Rimuovere un campo estratto dalla lista

```bash
curl -X PATCH http://localhost:8081/extractions/e1a2b3c4-d5e6-f7a8-b9c0-d1e2f3a4b5c6 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "extractedData": {
      "fields": [
        {
          "companyId": "abc-123-company-id",
          "name": "Vigneto Nord (solo questo campo mantenuto)",
          "coordinates": [],
          "coordinatesGaussBoaga": [],
          "latitude": 44.4949,
          "longitude": 11.3426
        }
      ],
      "extractedCount": 1
    }
  }'
```

### Response (HTTP 200)

```json
{
  "status": "success",
  "data": {
    "extraction": {
      "id": "f2b3c4d5-e6f7-a8b9-c0d1-e2f3a4b5c6d7",
      "batchId": "b7f3a1e2-9c4d-4e6f-8a2b-1d3e5f7a9b0c",
      "status": "PENDING_CONFIRMATION",
      "category": "invoice",
      "progress": 100,
      "fileName": "fattura_bellini.pdf",
      "fileIndex": 0,
      "fileUrl": "http://localhost:8081/files/...",
      "extractedData": {
        "entries": [
          {
            "productName": "GLYPHOSATE 360 SL (corretto)",
            "quantity": 25,
            "totalPrice": 312.5,
            "...": "..."
          }
        ],
        "extractedCount": 1
      },
      "error": null,
      "createdAt": "2026-03-16T10:30:00.000Z",
      "updatedAt": "2026-03-16T10:40:00.000Z"
    }
  }
}
```

---

## 6. Conferma singola

Conferma una estrazione e crea le entita' nel database. Solo estrazioni con status `PENDING_CONFIRMATION`.

### Request

```
POST /extractions/:id/confirm
Authorization: Bearer <token>
```

### cURL

```bash
curl -X POST http://localhost:8081/extractions/e1a2b3c4-d5e6-f7a8-b9c0-d1e2f3a4b5c6/confirm \
  -H "Authorization: Bearer <token>"
```

### Response (HTTP 200) — Conferma `fields`

```json
{
  "status": "success",
  "data": {
    "extractionId": "e1a2b3c4-d5e6-f7a8-b9c0-d1e2f3a4b5c6",
    "category": "fields",
    "status": "CONFIRMED",
    "summary": {
      "fieldsCreated": 5
    }
  }
}
```

### Response — Conferma `production_units`

```json
{
  "status": "success",
  "data": {
    "extractionId": "...",
    "category": "production_units",
    "status": "CONFIRMED",
    "summary": {
      "productionUnitsCreated": 3
    }
  }
}
```

### Response — Conferma `agricultural`

```json
{
  "status": "success",
  "data": {
    "extractionId": "...",
    "category": "agricultural",
    "status": "CONFIRMED",
    "summary": {
      "fieldsCreated": 5,
      "productionUnitsCreated": 3
    }
  }
}
```

### Response — Conferma `invoice` / `ddt`

```json
{
  "status": "success",
  "data": {
    "extractionId": "...",
    "category": "invoice",
    "status": "CONFIRMED",
    "summary": {
      "productsCreated": 2,
      "productsUpdated": 0,
      "stocksCreated": 2
    }
  }
}
```

### Response — Conferma `stock`
