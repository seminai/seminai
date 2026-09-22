# Sales module — Anagrafica, Ordini, DDT con scarico magazzino

Modulo gestionale per una piccola azienda vitivinicola/agricola: trasforma rapidamente
gli ordini cliente in **DDT** (Documento di Trasporto) con **scarico automatico del magazzino**.

```
cliente → ordine → verifica giacenza → conferma ordine → genera DDT → scarico magazzino (atomico)
```

## Riuso del magazzino esistente

Il magazzino NON è duplicato: si riusa `Warehouse → Product → Stock`.
`Stock` è già il registro `inventory_movements` (campo `type` IN/OUT). Convenzione canonica
(`calculateAggregatedStock`):

- **IN**: `quantity > 0`, `type = 'IN'`.
- **OUT**: `quantity < 0`, `type = 'OUT'` (gli OUT da job non verificati non contano).
- `disponibile = Σ(IN) + Σ(OUT)` (OUT è negativo).

Lo **scarico** DDT crea una riga `Stock` OUT con quantità negativa, lo **storno** (annullamento)
una riga IN compensativa; entrambe collegate al DDT via `Stock.deliveryNoteId`.
`Product` è stato esteso con i campi vendita opzionali: `vintage`, `unitPrice`, `vatRate`,
`unitOfMeasure`, `isActive`.

## Modelli (Prisma)

- `BusinessPartner` — anagrafica unica cliente/fornitore (`type = CUSTOMER | SUPPLIER`), scoping su `Company`.
- `SalesOrder` + `SalesOrderItem` — ordine cliente (totali calcolati, non stoccati).
- `DeliveryNote` + `DeliveryNoteItem` — DDT con numerazione progressiva `@@unique([companyId, year, number])`,
  `customerSnapshot` (Json) e snapshot prodotto per riga → i documenti generati restano immutabili.
- `ProformaInvoice` + `ProformaInvoiceItem` — proforma (documento **non fiscale**): stessa numerazione progressiva
  e snapshot del DDT ma **nessun movimento di magazzino** e **nessun cambio di stato ordine** (`ProformaInvoice.orderId`
  è il collegamento; nessun FK su `SalesOrder`).

## Regole di business

- DDT generabile solo da ordine `CONFIRMED`; dati cliente obbligatori (ragione sociale, P.IVA **o** CF, indirizzo consegna).
- Proforma generabile da ordine `DRAFT` **o** `CONFIRMED` (dati cliente: ragione sociale + P.IVA/CF). Non tocca magazzino né stato ordine.
- **Atomicità**: generazione e annullamento usano `prisma.$transaction`. La disponibilità è ri-validata
  dentro la transazione: se insufficiente lancia `INSUFFICIENT_STOCK` e **nessuna giacenza viene modificata**.
- Numerazione progressiva per azienda/anno con retry su conflitto (`P2002`).
- Annullamento idempotente (un DDT già `CANCELLED` non viene toccato) con storno/rientro magazzino.

## API REST

| Metodo         | Path                                   | Descrizione                                                      |
| -------------- | -------------------------------------- | ---------------------------------------------------------------- |
| GET/POST/PATCH | `/business-partners`                   | Anagrafica cliente/fornitore (`?type=CUSTOMER\|SUPPLIER`, `?q=`) |
| GET/POST       | `/orders`                              | Lista / crea ordine                                              |
| POST           | `/orders/:id/confirm`                  | Conferma (valida disponibilità)                                  |
| POST           | `/orders/:id/generate-proforma`        | Genera proforma (non fiscale, no magazzino)                      |
| POST           | `/orders/:id/generate-ddt`             | Genera DDT (scarico atomico)                                     |
| GET            | `/ddt`, `/ddt/:id`                     | Lista / dettaglio DDT                                            |
| GET            | `/ddt/:id/print`                       | Documento stampabile (HTML)                                      |
| POST           | `/ddt/:id/cancel`                      | Annulla con storno magazzino                                     |
| GET            | `/proforma/:id`, `/proforma/:id/print` | Dettaglio / documento stampabile (HTML)                          |

Prodotti: `GET/POST/PATCH /products` (estesi con i campi vendita).

## Tool agente (`dosage_agent_react`)

Categoria `SALES` nel `tool-registry` (bundle FULL, gating `userId`). I tool con scrittura persistente
hanno risk score 35 → passano dall'**approval gate** esistente (UI di approvazione FE invariata):

- write (approvazione): `create_business_partner`, `create_sales_order`, `confirm_sales_order`, `generate_proforma`, `generate_ddt`, `cancel_ddt`, `import_sales_order_from_template`
- read: `search_business_partners`, `list_sales_orders`, `check_product_availability`, `get_ddt`, `preview_order_template`

## Frontend

- "Aggiungi → Cliente / Fornitore" (form manuale, riuso pattern `CompanySingleForm`).
- Sezione **Vendite** nella dashboard azienda + route `sales-{companyId}`: liste read-only di
  clienti/fornitori, ordini e DDT, con stampa/annullamento DDT.
- Hook TanStack Query in `src/hooks/use-sales.ts` (su `customFetch`).

## Setup / verifica

```bash
# Backend
npx prisma migrate dev --name add_sales_module   # crea la migration
npx prisma generate
npm run build && npm test                         # unit (incl. sales-module.test.ts)
npm run test:integration                          # DB reale: sales-ddt.integration.test.ts

# Frontend
npm run api:generate   # opzionale: rigenera hook Orval dallo swagger aggiornato
npm run build
```

> Nota: gli hook FE del modulo usano `customFetch` direttamente, quindi non richiedono la
> rigenerazione Orval per funzionare/compilare.

## Related docs

- [Farmer Commercial Roadmap](./feature/farmer_roadmap.md) — inbox-first roadmap for the commercial
  farmer persona (order → proforma → DDT → shipping → payments); planned extensions beyond this module.
