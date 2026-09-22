# Output estrattori Fatture e DDT

Documentazione dell’output attuale degli endpoint di estrazione da fatture e DDT.

---

## 1. Estrattore DDT — `POST /products/bulk-from-ddt-to-product-list`

**Input:** fino a 10 file PDF (documenti di trasporto).

**Risposta HTTP 200:**

```json
{
  "status": "success",
  "data": {
    "suggestedProducts": [ ... ],
    "totalEntries": 42
  }
}
```

### Struttura di ogni elemento di `suggestedProducts`

Ogni elemento è un oggetto con i campi sotto. I prodotti sono **arricchiti** da `ProductRegistrationLookupService`: se il nome è riconosciuto nel dataset fitosanitari, `registrationNumber` e `administrativeStatus` possono essere valorizzati o corretti.

| Campo                   | Tipo           | Descrizione                                                                           |
| ----------------------- | -------------- | ------------------------------------------------------------------------------------- |
| `productName`           | string         | Nome prodotto normalizzato (es. da "ZYPAR [1 LT]" → "ZYPAR")                          |
| `productNameExtracted`  | string \| null | Nome così come estratto dal documento (prima della normalizzazione)                   |
| `registrationNumber`    | string \| null | Numero di registrazione (dall’estrazione o dal lookup fitosanitari)                   |
| `administrativeStatus`  | string \| null | Stato amministrativo (dal lookup, es. "Attivo")                                       |
| `productCategory`       | string         | Categoria: `"PHYTOSANITARY"` \| `"FERTILIZER"` \| `"OTHER"` (da DdtProductClassifier) |
| `quantity`              | number \| null | Quantità estratta                                                                     |
| `quantityUnitOfMeasure` | string \| null | Unità di misura (es. "LT", "KG", "TN", "Q")                                           |
| `quantityConverted`     | number \| null | Quantità convertita in unità canonica (kg o L) quando applicabile; vedi sotto         |
| `unitMeasureConverted`  | string \| null | Unità canonica dopo conversione (`kg` o `L`) o unità originale se non convertita      |
| `supplierName`          | string \| null | Ragione sociale fornitore                                                             |
| `supplierVat`           | string \| null | Partita IVA fornitore                                                                 |
| `ddtDate`               | string \| null | Data DDT in formato ISO (YYYY-MM-DD)                                                  |
| `orderNumber`           | string \| null | Numero ordine/documento                                                               |

**Nota:** non c’è raggruppamento: una riga DDT = un elemento in `suggestedProducts`. `totalEntries` è il numero di righe estratte (può essere maggiore del numero di prodotti se ci sono righe duplicate o stesso prodotto su più DDT).

---

## 2. Estrattore Fatture — `POST /products/bulk-from-invoice-to-product-list`

**Input:** fino a 10 file PDF o XML FatturaPA.

**Risposta HTTP 200:**

```json
{
  "status": "success",
  "data": {
    "suggestedProducts": [ ... ],
    "suggestedProductsWithStocks": [ ... ],
    "totalEntries": 28,
    "filesProcessed": 2,
    "filesWithErrors": [
      { "fileName": "fattura2.pdf", "error": "..." }
    ]
  }
}
```

- `filesWithErrors` è presente solo se almeno un file ha dato errore (gli altri possono essere stati processati).
- `suggestedProducts` e `suggestedProductsWithStocks` sono derivati dalle stesse entry; il secondo è una vista raggruppata per prodotto + fornitore.

### Struttura di ogni elemento di `suggestedProducts`

Stessa logica del DDT: una riga fattura = un elemento. Arricchimento con `ProductRegistrationLookupService`.

| Campo                   | Tipo           | Descrizione                                                                      |
| ----------------------- | -------------- | -------------------------------------------------------------------------------- |
| `productName`           | string         | Nome prodotto normalizzato                                                       |
| `productNameExtracted`  | string \| null | Nome così come estratto dal documento (prima della normalizzazione)              |
| `registrationNumber`    | string \| null | Numero di registrazione (da fattura o lookup)                                    |
| `administrativeStatus`  | string \| null | Stato amministrativo (da fattura XML o lookup)                                   |
| `productCategory`       | string         | `"PHYTOSANITARY"` \| `"FERTILIZER"` \| `"OTHER"`                                 |
| `quantity`              | number \| null | Quantità                                                                         |
| `quantityUnitOfMeasure` | string \| null | Unità di misura                                                                  |
| `quantityConverted`     | number \| null | Quantità convertita in unità canonica (kg o L) quando applicabile                |
| `unitMeasureConverted`  | string \| null | Unità canonica dopo conversione (`kg` o `L`) o unità originale se non convertita |
| `supplierName`          | string \| null | Fornitore                                                                        |
| `supplierVat`           | string \| null | P.IVA fornitore                                                                  |
| `invoiceNumber`         | string \| null | Numero fattura                                                                   |
| `invoiceDate`           | string \| null | Data fattura (ISO)                                                               |
| `invoiceDueDate`        | string \| null | Data scadenza fattura (ISO)                                                      |
| `unitPrice`             | number \| null | Prezzo unitario                                                                  |
| `totalPrice`            | number \| null | Prezzo totale riga                                                               |

### Struttura di ogni elemento di `suggestedProductsWithStocks`

Raggruppamento per (nome prodotto normalizzato + partita IVA fornitore). Ogni elemento ha un **prodotto** e un array di **stock** (righe fattura accorpate).

| Campo                            | Tipo           | Descrizione                                                       |
| -------------------------------- | -------------- | ----------------------------------------------------------------- |
| `product`                        | object         |                                                                   |
| `product.productName`            | string         | Nome ufficiale normalizzato                                       |
| `product.productNameExtracted`   | string \| null | Nome estratto dal documento (prima della normalizzazione)         |
| `product.registrationNumber`     | string \| null |                                                                   |
| `product.productCategory`        | string         |                                                                   |
| `product.administrativeStatus`   | string \| null |                                                                   |
| `stocks`                         | array          | Una o più righe di “stock” per quel prodotto/fornitore            |
| `stocks[].quantity`              | number \| null | Quantità (convertita da pezzi a U.M. reale se applicabile)        |
| `stocks[].quantityUnitOfMeasure` | string \| null | U.M.                                                              |
| `stocks[].quantityConverted`     | number \| null | Quantità convertita in unità canonica (kg o L) quando applicabile |
| `stocks[].unitMeasureConverted`  | string \| null | Unità canonica dopo conversione (`kg` o `L`) o unità originale    |
| `stocks[].supplierName`          | string \| null |                                                                   |
| `stocks[].supplierVat`           | string \| null |                                                                   |
| `stocks[].invoiceNumber`         | string \| null |                                                                   |
| `stocks[].invoiceDate`           | string \| null |                                                                   |
| `stocks[].invoiceDueDate`        | string \| null |                                                                   |
| `stocks[].unitPrice`             | number \| null |                                                                   |
| `stocks[].totalPrice`            | number \| null |                                                                   |
| `stocks[].notes`                 | string \| null | Nome originale se diverso dal normalizzato                        |
| `stocks[].packagingInfo`         | string \| null | Info confezione (es. "[1 LT]") se estratte dal nome               |

### Conversione quantità (`quantityConverted` / `unitMeasureConverted`)

Quando l'unità di misura è riconosciuta, la quantità viene convertita in un'unità canonica:

- **Peso → kg:** `kg`, `t`, `tn`, `ton`, `tonnellate`, `tm` (1 t = 1000 kg), `q`, `quintali`, `q.le`, `ql` (1 q = 100 kg), `g`, `gr` (1 g = 0,001 kg).
- **Volume → L:** `l`, `lt`, `litri` (1 L), `ml` (1 ml = 0,001 L).

Se l'unità non è tra quelle elencate, `quantityConverted` e `unitMeasureConverted` coincidono con quantità e unità originali (nessuna conversione). Se quantità o unità sono mancanti, i campi convertiti possono essere null.

---

## 3. Utilizzo per il salvataggio — `POST /products/create-or-update-bulk`

Il payload per creare/aggiornare prodotti e stock non è identico all’output degli estrattori. Il client deve mappare:

- **Da DDT:** ogni `suggestedProduct` → un item con `name`, `registrationNumber`, `category`, e (opzionale) `stock` con `quantity`, `unitOfMeasureQuantity`, `ddtCode` (es. da `orderNumber`), `ddtDate`, ecc. `ddtCode` non è nell’output DDT attuale (c’è solo `orderNumber`).
- **Da Fatture:** `suggestedProductsWithStocks` è già vicino al modello bulk: ogni `product` + ogni elemento di `stocks` va mappato in un singolo item con `stock` (e `invoiceCode`, `invoiceDate`, `invoiceDueDate` dove disponibili).

L'oggetto `stock` nel bulk può includere (opzionali) **productNameAsOnDocument**, **quantityConverted**, **unitMeasureConverted**: se inviati vengono persistiti in DB; altrimenti il backend calcola quantityConverted/unitMeasureConverted dalla conversione in unità canonica.

Riferimento contratto bulk: `ProductWithStockInput` in `CreateOrUpdateProductsAndStocksBulkUseCase` e route `POST /products/create-or-update-bulk`.
