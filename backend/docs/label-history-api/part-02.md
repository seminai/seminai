# API Storico Etichette (Label History) - Documentazione — Part 2

[Back to the guide index](../LABEL_HISTORY_API.md)

| Campo               | Tipo            | Descrizione                                 |
| ------------------- | --------------- | ------------------------------------------- |
| `id`                | `String` (UUID) | ID univoco della entry                      |
| `labelExtractionId` | `String` (UUID) | FK → LabelExtraction                        |
| `userId`            | `String` (UUID) | FK → User (chi ha fatto la modifica)        |
| `changes`           | `Json`          | Array di `{ field, oldValue, newValue }`    |
| `previousSnapshot`  | `Json`          | Snapshot completo pre-modifica per rollback |
| `createdAt`         | `DateTime`      | Data della modifica                         |

### Formato campo `changes`

Ogni elemento dell'array descrive un singolo campo modificato:

```json
{
  "field": "label.dosaggi_dettagliati",
  "oldValue": [
    /* valore precedente */
  ],
  "newValue": [
    /* nuovo valore */
  ]
}
```

Per il campo `label` (JSON complesso), le modifiche vengono tracciate a livello dei sotto-campi:

| Field name                  | Descrizione                  |
| --------------------------- | ---------------------------- |
| `label.prodotto`            | Nome prodotto                |
| `label.categoria`           | Categoria (es. "Fungicida")  |
| `label.principio_attivo`    | Principio attivo             |
| `label.dosaggi_dettagliati` | Array dosaggi per coltura    |
| `label.colture_target`      | Colture target               |
| `label.malattie`            | Malattie/patogeni            |
| `productName`               | Nome prodotto (campo record) |
| `registrationNumber`        | Numero registrazione         |
| `extractionConfidence`      | Confidenza estrazione        |
| `isVerified`                | Stato di verifica            |
| `rawText`                   | Testo raw estratto           |
| `category`                  | Categoria (FITO/FERTILIZER)  |

### Campo `previousSnapshot`

Contiene lo stato completo dell'etichetta **prima** della modifica. Include tutti i campi della `LabelExtraction` eccetto `id`, `createdAt` e `updatedAt`. Viene utilizzato dalla funzione di rollback per ripristinare lo stato precedente.

---

## 🔄 Flusso di rollback

1. L'utente visualizza lo storico di un'etichetta
2. Seleziona una entry di storico e clicca "Ripristina"
3. Il sistema:
   - Legge lo stato corrente dell'etichetta
   - Salva lo stato corrente come **nuova entry di storico** (così il rollback è tracciato e reversibile)
   - Applica il `previousSnapshot` della entry selezionata per ripristinare i dati
4. L'etichetta torna allo stato che aveva **prima** della modifica registrata in quella entry

> **Nota**: Il rollback è reversibile. Poiché il rollback stesso viene registrato nello storico, è possibile fare un ulteriore rollback per tornare allo stato pre-rollback.
