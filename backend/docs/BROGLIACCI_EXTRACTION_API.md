# Estrazione dati da Brogliacci — `POST /tools/extract-brogliacci`

Endpoint per estrarre dati strutturati da immagini di brogliacci (registri cartacei manoscritti di trattamenti fitosanitari). Utilizza GPT-4o Vision per leggere la calligrafia e restituisce JSON pronto per l'uso con `/jobs/create-product-and-job`.

---

## Autenticazione

Richiede Bearer token.

```
Authorization: Bearer <access_token>
```

---

## Input

**Content-Type:** `multipart/form-data`

| Campo   | Tipo   | Obbligatorio | Descrizione                                       |
| ------- | ------ | ------------ | ------------------------------------------------- |
| `files` | File[] | Si           | Una o piu immagini (JPG, PNG, WebP) di brogliacci |

### Esempio cURL

```bash
curl -X POST 'http://localhost:8081/tools/extract-brogliacci' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -F 'files=@brogliaccio_1.jpg' \
  -F 'files=@brogliaccio_2.jpg'
```

---

## Output

**HTTP 200:**

```json
{
  "status": "success",
  "data": {
    "results": [
      {
        "fileName": "brogliaccio_1.jpg",
        "status": "extracted",
        "rawEntries": [ ... ],
        "payload": [ ... ]
      }
    ]
  }
}
```

Ogni elemento di `results` corrisponde a un file caricato.

| Campo        | Tipo   | Descrizione                                                   |
| ------------ | ------ | ------------------------------------------------------------- |
| `fileName`   | string | Nome del file originale                                       |
| `status`     | string | `"extracted"` se OK, `"failed"` se errore                     |
| `rawEntries` | array  | Dati grezzi estratti dall'immagine (una riga per prodotto)    |
| `payload`    | array  | Dati trasformati e raggruppati, pronti per creare job         |
| `error`      | string | Presente solo se `status = "failed"`, con messaggio di errore |

---

## Struttura `rawEntries`

Ogni elemento rappresenta un singolo prodotto usato in un trattamento:

```json
{
  "date": "10/6/25",
  "productionUnitName": "Divetti",
  "areaHa": 3,
  "productName": "FOLPEC",
  "quantity": 4.5,
  "unitOfMeasure": "kg",
  "waterQuantityL": 2000
}
```

| Campo                | Tipo           | Descrizione                                                           |
| -------------------- | -------------- | --------------------------------------------------------------------- |
| `date`               | string         | Data come scritta nel brogliaccio (DD/MM/YY o DD-MM)                  |
| `productionUnitName` | string \| null | Nome dell'unita produttiva. `null` se non specificato nel brogliaccio |
| `areaHa`             | number \| null | Superficie in ettari                                                  |
| `productName`        | string         | Nome commerciale del prodotto fitosanitario                           |
| `quantity`           | number         | Quantita utilizzata                                                   |
| `unitOfMeasure`      | string         | Unita di misura (`"kg"`, `"L"`)                                       |
| `waterQuantityL`     | number \| null | Quantita d'acqua in litri (se indicata)                               |

---

## Struttura `payload`

Array di job raggruppati per **(data x unita produttiva)**, pronti per essere inviati a `POST /jobs/create-product-and-job` dopo aver mappato `productionUnitName` al relativo `productionUnitId`.

```json
{
  "productionUnitName": "Divetti",
  "dateOfOpeation": "2025-06-10T00:00:00.000Z",
  "category": "TREATMENT",
  "quantity": 14.31,
  "unitOfMeasureQuantity": "kg",
  "treatedSurface": 3,
  "totalDistributedWaterL": 2000,
  "stocks": [
    {
      "product": {
        "name": "FOLPEC",
        "category": "PESTICIDE",
        "type": "Fitosanitario",
        "registrationNumber": null
      },
      "quantity": -4.5,
      "unitOfMeasureQuantity": "kg",
      "type": "OUT"
    },
    {
      "product": {
        "name": "FORTUNE",
        "category": "PESTICIDE",
        "type": "Fitosanitario",
        "registrationNumber": null
      },
      "quantity": -9,
      "unitOfMeasureQuantity": "kg",
      "type": "OUT"
    }
  ]
}
```

| Campo                    | Tipo           | Descrizione                                                                        |
| ------------------------ | -------------- | ---------------------------------------------------------------------------------- |
| `productionUnitName`     | string \| null | Nome UP dal brogliaccio. **Il frontend deve mappare questo al `productionUnitId`** |
| `dateOfOpeation`         | string         | Data in formato ISO                                                                |
| `category`               | string         | Sempre `"TREATMENT"`                                                               |
| `quantity`               | number         | Somma delle quantita di tutti i prodotti nel trattamento                           |
| `unitOfMeasureQuantity`  | string         | Unita di misura principale                                                         |
| `treatedSurface`         | number \| null | Superficie trattata in ettari                                                      |
| `totalDistributedWaterL` | number \| null | Acqua distribuita in litri                                                         |
| `stocks`                 | array          | Prodotti usati nel trattamento (vedi sotto)                                        |

### Struttura di ogni `stock`

| Campo                        | Tipo           | Descrizione                                                                      |
| ---------------------------- | -------------- | -------------------------------------------------------------------------------- |
| `product.name`               | string         | Nome commerciale del prodotto                                                    |
| `product.category`           | string         | Sempre `"PESTICIDE"`                                                             |
| `product.type`               | string         | Sempre `"Fitosanitario"`                                                         |
| `product.registrationNumber` | string \| null | Numero registrazione (sempre `null` da brogliaccio, da arricchire lato frontend) |
| `quantity`                   | number         | Quantita negativa (uscita magazzino)                                             |
| `unitOfMeasureQuantity`      | string         | Unita di misura (`"kg"`, `"L"`)                                                  |
| `type`                       | string         | Sempre `"OUT"`                                                                   |

---

## Integrazione Frontend

### Flusso completo

```
1. Upload immagini  ──>  POST /tools/extract-brogliacci
                              │
2. Risposta con payload  <────┘
                              │
3. Frontend: mostra i dati estratti in una tabella editabile
   - L'utente mappa productionUnitName → productionUnitId (dropdown con le sue UP)
   - L'utente verifica/corregge quantita, prodotti, date
   - L'utente aggiunge registrationNumber se necessario
                              │
4. Frontend: invia i dati corretti  ──>  POST /jobs/create-product-and-job
```

### Step 1 — Upload

```typescript
const formData = new FormData();
formData.append('files', file1);
formData.append('files', file2); // opzionale, piu file

const response = await fetch('/tools/extract-brogliacci', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: formData,
});

const { data } = await response.json();
// data.results[0].payload -> BrogliaccioJobPayload[]
```

### Step 2 — Mapping UP e invio

```typescript
// Per ogni payload, sostituire productionUnitName con productionUnitId
const jobItems = data.results
  .flatMap((r) => r.payload)
  .map((job) => ({
    productionUnitId: mapNameToId(job.productionUnitName), // mapping dal frontend
    dateOfOpeation: job.dateOfOpeation,
    category: job.category,
    quantity: job.quantity,
    unitOfMeasureQuantity: job.unitOfMeasureQuantity,
    treatedSurface: job.treatedSurface,
    totalDistributedWaterL: job.totalDistributedWaterL,
    stocks: job.stocks,
  }));

// Invia a create-product-and-job
await fetch('/jobs/create-product-and-job', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(jobItems),
});
```

### Risposta `create-product-and-job`

La risposta include ora un mapping esplicito tra job creati e prodotti collegati:

```json
{
  "status": "success",
  "data": {
    "jobs": [{ "...": "..." }],
    "jobProductLinks": [
      {
        "jobId": "6ea7ebc9-7ac5-4348-945d-ec7cd98a8bbb",
        "stockCount": 1,
        "products": [
          {
            "id": "product-id",
            "name": "INEX",
            "registrationNumber": null
          }
        ]
      }
    ]
  }
}
```

`jobProductLinks` e il riferimento affidabile per capire quali prodotti sono stati effettivamente associati a ciascun job nel bulk.

---

## Note

- **`productionUnitName`** puo essere `null` se il brogliaccio non specifica le unita produttive. In questo caso il frontend deve chiedere all'utente a quale UP associare il trattamento.
- **`registrationNumber`** e sempre `null` perche i brogliacci non contengono numeri di registrazione. Il frontend puo arricchirlo usando il nome del prodotto.
- I tempi di risposta sono circa **10-60 secondi per immagine** a seconda della complessita del brogliaccio.
- L'endpoint supporta il caricamento di **piu immagini** contemporaneamente, processate in sequenza.
