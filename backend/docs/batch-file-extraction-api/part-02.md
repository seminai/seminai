# Batch File Extraction API — Part 2

[Back to the guide index](../BATCH_FILE_EXTRACTION_API.md)

```json
{
  "status": "success",
  "data": {
    "extractions": [
      {
        "id": "e1a2b3c4-d5e6-f7a8-b9c0-d1e2f3a4b5c6",
        "batchId": "b7f3a1e2-9c4d-4e6f-8a2b-1d3e5f7a9b0c",
        "status": "PENDING_CONFIRMATION",
        "category": "fields",
        "progress": 100,
        "fileName": "campi.csv",
        "fileIndex": 0,
        "fileUrl": "http://localhost:8081/files/bucket/path/campi.csv",
        "extractedData": {
          "fields": [ ... ],
          "extractedCount": 5
        },
        "error": null,
        "createdAt": "2026-03-16T10:30:00.000Z",
        "updatedAt": "2026-03-16T10:30:15.000Z"
      },
      {
        "id": "f2b3c4d5-e6f7-a8b9-c0d1-e2f3a4b5c6d7",
        "batchId": "b7f3a1e2-9c4d-4e6f-8a2b-1d3e5f7a9b0c",
        "status": "ERROR",
        "category": "invoice",
        "progress": 20,
        "fileName": "fattura_corrotta.pdf",
        "fileIndex": 1,
        "fileUrl": "http://localhost:8081/files/bucket/path/fattura.pdf",
        "extractedData": null,
        "error": "Failed to parse PDF",
        "createdAt": "2026-03-16T10:30:00.000Z",
        "updatedAt": "2026-03-16T10:30:05.000Z"
      },
      {
        "id": "a3b4c5d6-e7f8-a9b0-c1d2-e3f4a5b6c7d8",
        "batchId": "b7f3a1e2-9c4d-4e6f-8a2b-1d3e5f7a9b0c",
        "status": "CONFIRMED",
        "category": "stock",
        "progress": 100,
        "fileName": "magazzino.xlsx",
        "fileIndex": 2,
        "fileUrl": "http://localhost:8081/files/bucket/path/magazzino.xlsx",
        "extractedData": {
          "entries": [ ... ],
          "extractedCount": 12
        },
        "error": null,
        "createdAt": "2026-03-16T10:30:00.000Z",
        "updatedAt": "2026-03-16T10:35:00.000Z"
      }
    ]
  }
}
```

---

## 4. Dettaglio singola estrazione

Recupera i dati completi di una estrazione, incluso `extractedData`.

### Request

```
GET /extractions/:id
Authorization: Bearer <token>
```

### cURL

```bash
curl -s http://localhost:8081/extractions/e1a2b3c4-d5e6-f7a8-b9c0-d1e2f3a4b5c6 \
  -H "Authorization: Bearer <token>" | jq
```

### Response (HTTP 200) — Esempio categoria `fields`

```json
{
  "status": "success",
  "data": {
    "extraction": {
      "id": "e1a2b3c4-d5e6-f7a8-b9c0-d1e2f3a4b5c6",
      "batchId": "b7f3a1e2-9c4d-4e6f-8a2b-1d3e5f7a9b0c",
      "status": "PENDING_CONFIRMATION",
      "category": "fields",
      "progress": 100,
      "fileName": "campi.csv",
      "fileIndex": 0,
      "fileUrl": "http://localhost:8081/files/bucket/path/campi.csv",
      "extractedData": {
        "fields": [
          {
            "companyId": "abc-123-company-id",
            "name": "Vigneto Nord",
            "coordinates": [],
            "coordinatesGaussBoaga": [],
            "latitude": 44.4949,
            "longitude": 11.3426,
            "polygon": null,
            "polygonGaussBoaga": null,
            "gisHa": 2.5,
            "sauHa": 2.3,
            "ph": null,
            "nitrogen": null,
            "phosphorus": null,
            "potassium": null,
            "calcium": null,
            "magnesium": null,
            "soilType": "argilloso",
            "uso": "seminativo",
            "qualita": "buona",
            "superficieCatastaleMq": 25000,
            "sezione": "A",
            "foglio": "12",
            "particella": "345",
            "subalterno": null,
            "nation": "Italia",
            "region": "Emilia-Romagna",
            "city": "Bologna",
            "address": "Via Campagna 1",
            "cap": "40100",
            "variazioneMq": null,
            "inizioConduzione": "2020-01-15",
            "fineConduzione": null
          }
        ],
        "extractedCount": 1
      },
      "error": null,
      "createdAt": "2026-03-16T10:30:00.000Z",
      "updatedAt": "2026-03-16T10:30:15.000Z"
    }
  }
}
```

### Response — Esempio categoria `invoice`

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
      "fileUrl": "http://localhost:8081/files/bucket/path/fattura_bellini.pdf",
      "extractedData": {
        "entries": [
          {
            "productName": "GLYPHOSATE 360 SL",
            "registrationNumber": "12345",
            "productCategory": "PHYTOSANITARY",
            "administrativeStatus": "Autorizzato",
            "quantity": 20,
            "quantityUnitOfMeasure": "L",
            "supplierName": "Agri Supply S.r.l.",
            "supplierVat": "IT01234567890",
            "invoiceNumber": "FT-2026/0042",
            "invoiceDate": "2026-03-10",
            "invoiceDueDate": "2026-04-10",
            "unitPrice": 12.5,
            "totalPrice": 250.0
          },
          {
            "productName": "CONCIME NPK 20-10-10",
            "registrationNumber": null,
            "productCategory": "FERTILIZER",
            "administrativeStatus": null,
            "quantity": 500,
            "quantityUnitOfMeasure": "KG",
            "supplierName": "Agri Supply S.r.l.",
            "supplierVat": "IT01234567890",
            "invoiceNumber": "FT-2026/0042",
            "invoiceDate": "2026-03-10",
            "invoiceDueDate": "2026-04-10",
            "unitPrice": 0.85,
            "totalPrice": 425.0
          }
        ],
        "extractedCount": 2
      },
      "error": null,
      "createdAt": "2026-03-16T10:30:00.000Z",
      "updatedAt": "2026-03-16T10:30:25.000Z"
    }
  }
}
```

### Response — Esempio categoria `stock`

```json
{
  "status": "success",
  "data": {
    "extraction": {
      "id": "a3b4c5d6-e7f8-a9b0-c1d2-e3f4a5b6c7d8",
      "batchId": "b7f3a1e2-9c4d-4e6f-8a2b-1d3e5f7a9b0c",
      "status": "PENDING_CONFIRMATION",
      "category": "stock",
      "progress": 100,
      "fileName": "magazzino.xlsx",
      "fileIndex": 0,
      "fileUrl": "http://localhost:8081/files/bucket/path/magazzino.xlsx",
      "extractedData": {
        "entries": [
          {
            "name": "GLYPHOSATE 360 SL",
            "category": "PESTICIDE",
            "registrationNumber": "12345",
            "stock": {
              "quantity": 20,
              "unitOfMeasureQuantity": "L",
              "price": 250.0,
              "type": "IN",
              "ddtCode": "DDT-2026-001",
              "ddtDate": "2026-03-10",
              "invoiceCode": "FT-2026/0042",
              "companySupplierName": "Agri Supply S.r.l."
            }
          }
        ],
        "extractedCount": 1
      },
      "error": null,
      "createdAt": "2026-03-16T10:30:00.000Z",
      "updatedAt": "2026-03-16T10:30:10.000Z"
    }
  }
}
```

### Response — Esempio categoria `agricultural` (campi + unita' produttive)
