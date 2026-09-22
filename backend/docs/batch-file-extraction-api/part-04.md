# Batch File Extraction API — Part 4

[Back to the guide index](../BATCH_FILE_EXTRACTION_API.md)

```json
{
  "status": "success",
  "data": {
    "extractionId": "...",
    "category": "stock",
    "status": "CONFIRMED",
    "summary": {
      "productsCreated": 1,
      "stocksCreated": 1
    }
  }
}
```

---

## 7. Conferma batch

Conferma tutte le estrazioni `PENDING_CONFIRMATION` di un batch in un'unica chiamata. Le estrazioni in `ERROR` o gia' `CONFIRMED` vengono ignorate.

### Request

```
POST /extractions/batch/:batchId/confirm
Authorization: Bearer <token>
```

### cURL

```bash
curl -X POST http://localhost:8081/extractions/batch/b7f3a1e2-9c4d-4e6f-8a2b-1d3e5f7a9b0c/confirm \
  -H "Authorization: Bearer <token>"
```

### Response (HTTP 200)

```json
{
  "status": "success",
  "data": {
    "confirmed": [
      {
        "extractionId": "e1a2b3c4-d5e6-f7a8-b9c0-d1e2f3a4b5c6",
        "category": "fields",
        "status": "CONFIRMED",
        "summary": { "fieldsCreated": 5 }
      },
      {
        "extractionId": "a3b4c5d6-e7f8-a9b0-c1d2-e3f4a5b6c7d8",
        "category": "stock",
        "status": "CONFIRMED",
        "summary": { "productsCreated": 3, "stocksCreated": 3 }
      }
    ],
    "skipped": 1,
    "errors": []
  }
}
```

- `confirmed`: estrazioni confermate con successo
- `skipped`: numero di estrazioni saltate (non `PENDING_CONFIRMATION`)
- `errors`: estrazioni che hanno fallito durante la conferma

### Response con errori parziali

```json
{
  "status": "success",
  "data": {
    "confirmed": [
      {
        "extractionId": "e1a2b3c4-...",
        "category": "fields",
        "status": "CONFIRMED",
        "summary": { "fieldsCreated": 5 }
      }
    ],
    "skipped": 1,
    "errors": [
      {
        "extractionId": "f2b3c4d5-...",
        "error": "Company not found for extraction"
      }
    ]
  }
}
```

---

## 8. Elimina estrazione

Elimina un record di estrazione.

### Request

```
DELETE /extractions/:id
Authorization: Bearer <token>
```

### cURL

```bash
curl -X DELETE http://localhost:8081/extractions/e1a2b3c4-d5e6-f7a8-b9c0-d1e2f3a4b5c6 \
  -H "Authorization: Bearer <token>"
```

### Response

```
HTTP 204 No Content
```

---

## Struttura extractedData per categoria

### `fields`

```typescript
{
  fields: FieldBulkPreview[];   // Array di campi estratti
  extractedCount: number;       // Numero totale
  diagnostics?: unknown;        // Eventuali diagnostiche
}
```

Ogni `FieldBulkPreview`:

| Campo                   | Tipo           | Descrizione               |
| ----------------------- | -------------- | ------------------------- |
| `companyId`             | string         | ID azienda                |
| `name`                  | string         | Nome campo                |
| `foglio`                | string \| null | Foglio catastale          |
| `particella`            | string \| null | Particella catastale      |
| `sezione`               | string \| null | Sezione catastale         |
| `subalterno`            | string \| null | Subalterno                |
| `gisHa`                 | number \| null | Superficie GIS (ettari)   |
| `sauHa`                 | number \| null | SAU (ettari)              |
| `superficieCatastaleMq` | number \| null | Superficie catastale (mq) |
| `coordinates`           | number[]       | Coordinate [lon, lat]     |
| `latitude`              | number \| null | Latitudine                |
| `longitude`             | number \| null | Longitudine               |
| `polygon`               | object \| null | Poligono GeoJSON          |
| `soilType`              | string \| null | Tipo di suolo             |
| `uso`                   | string \| null | Uso del suolo             |
| `qualita`               | string \| null | Qualita' (SIAN)           |
| `nation`                | string \| null | Nazione                   |
| `region`                | string \| null | Regione/provincia         |
| `city`                  | string \| null | Comune                    |
| `address`               | string \| null | Indirizzo                 |
| `cap`                   | string \| null | CAP                       |

### `production_units`

```typescript
{
  productionUnits: ProductionUnitPreview[];
  extractedCount: number;
  diagnostics?: unknown;
}
```

Ogni `ProductionUnitPreview`:

| Campo                 | Tipo              | Descrizione                       |
| --------------------- | ----------------- | --------------------------------- |
| `name`                | string            | Nome unita' produttiva            |
| `cropName`            | string \| null    | Nome coltura                      |
| `cropType`            | string \| null    | Tipo coltura                      |
| `variety`             | string \| null    | Varieta'                          |
| `protocoll`           | string \| null    | Protocollo (bio, integrato, ecc.) |
| `protectionStructure` | string \| null    | Struttura di protezione           |
| `startDate`           | string \| null    | Data inizio ciclo (ISO)           |
| `endDate`             | string \| null    | Data fine ciclo (ISO)             |
| `areaHa`              | number \| null    | Superficie (ettari)               |
| `fieldAllocations`    | FieldAllocation[] | Parcelle associate                |

Ogni `FieldAllocation`:

| Campo        | Tipo           | Descrizione         |
| ------------ | -------------- | ------------------- |
| `foglio`     | string \| null | Foglio catastale    |
| `particella` | string \| null | Particella          |
| `areaHa`     | number \| null | Superficie (ha)     |
| `fieldId`    | string \| null | ID campo (se match) |
| `fieldName`  | string \| null | Nome campo          |

### `agricultural`

Combinazione di `fields` + `production_units`:

```typescript
{
  fields: FieldBulkPreview[];
  productionUnits: ProductionUnitPreview[];
  extractedCount: number;
  diagnostics?: unknown;
}
```

### `invoice` / `ddt`

```typescript
{
  entries: InvoiceEntry[];
  extractedCount: number;
}
```

Ogni `InvoiceEntry`:

| Campo                   | Tipo           | Descrizione                                      |
| ----------------------- | -------------- | ------------------------------------------------ |
| `productName`           | string         | Nome prodotto                                    |
| `registrationNumber`    | string \| null | Numero registrazione (fitofarmaci)               |
| `productCategory`       | string         | `"PHYTOSANITARY"` \| `"FERTILIZER"` \| `"OTHER"` |
| `administrativeStatus`  | string \| null | Stato amministrativo                             |
| `quantity`              | number \| null | Quantita'                                        |
| `quantityUnitOfMeasure` | string \| null | Unita' misura (KG, L, ecc.)                      |
| `supplierName`          | string \| null | Nome fornitore                                   |
| `supplierVat`           | string \| null | P.IVA fornitore                                  |
| `invoiceNumber`         | string \| null | Numero fattura                                   |
| `invoiceDate`           | string \| null | Data fattura (ISO)                               |
| `invoiceDueDate`        | string \| null | Data scadenza (ISO)                              |
| `unitPrice`             | number \| null | Prezzo unitario                                  |
| `totalPrice`            | number \| null | Prezzo totale                                    |

### `stock`

```typescript
{
  entries: StockPreviewEntry[];
  extractedCount: number;
}
```

Ogni `StockPreviewEntry`:

| Campo                         | Tipo           | Descrizione                                                |
| ----------------------------- | -------------- | ---------------------------------------------------------- |
| `name`                        | string         | Nome prodotto                                              |
| `category`                    | string         | `"PESTICIDE"` \| `"FERTILIZER"` \| `"SEED"` \| `"HARVEST"` |
| `registrationNumber`          | string \| null | Numero registrazione                                       |
| `stock.quantity`              | number         | Quantita'                                                  |
| `stock.unitOfMeasureQuantity` | string         | Unita' misura                                              |
| `stock.price`                 | number         | Prezzo                                                     |
| `stock.type`                  | string         | `"IN"` (carico) o `"OUT"` (scarico)                        |
| `stock.ddtCode`               | string         | Codice DDT                                                 |
| `stock.ddtDate`               | string         | Data DDT                                                   |
| `stock.invoiceCode`           | string \| null | Codice fattura                                             |
| `stock.companySupplierName`   | string \| null | Nome fornitore                                             |

---

## Errori
