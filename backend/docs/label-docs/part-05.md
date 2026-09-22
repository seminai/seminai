# Documentazione — Sezione Etichette — Part 5

[Back to the guide index](../LABEL_DOCS.md)

- Tool backend `search_product_label_database` ("Ricerca etichette prodotto")
- Nessun endpoint frontend dedicato — è un tool dell'agente lato server

### Dataset locale fitosanitari (`src/services/fitosanitariRegistry.ts`)

- Carica `/datasets/fitosanitari/fts_06062025.json` (dataset statico)
- Usato in DosageManager, Job, NewOperation per cercare prodotti fitosanitari autorizzati
- **Non** usato per estrazione etichette né nella pagina `/new-label`

---

## 9. Note e limitazioni attuali

| Nota                      | Dettaglio                                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `productLabelsApiService` | `GET /labels/by-product` definito ma non collegato a nessuna UI                                                   |
| `LabelJobsTable`          | Organism in `src/components/organism/LabelJobsTable.tsx` esiste ma `New.tsx` reimplementa la stessa logica inline |
| Route disciplinari        | Click su riga disciplinario naviga a `/disciplinari/:id` ma la route non è definita in `App.tsx`                  |
| `Detail.tsx`              | File > 2000 righe — candidato a split in componenti/hook dedicati                                                 |
| Filtri lista              | Solo filtri generici `EditableTable`, nessun filtro business (es. solo non verificate, per categoria)             |
| Autocomplete registro     | Assente in `/new-label` — l'utente deve conoscere nome e numero registrazione                                     |
| Limite PDF                | Validazione pagine (~6 max) solo server-side                                                                      |

---
