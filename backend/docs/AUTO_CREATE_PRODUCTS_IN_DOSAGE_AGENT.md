# Auto-creazione Prodotti nel Dosage Agent

## Problema risolto

Quando il dosage agent trova prodotti dalle etichette SIAN ma questi non esistono nel database del magazzino dell'azienda, il sistema ora:

1. **Crea automaticamente il prodotto** nel warehouse dell'azienda
2. **Aggiunge stock iniziale** se specificato nell'input
3. **Crea il job** con movimento di stock negativo

Prima di questa modifica, il sistema generava warning e saltava i job per prodotti non trovati:

```
[FLOWS] fillTheJob warning: Product not found for registrationNumber=16690 name=KESTREL
```

## Come funziona

### 1. Ricerca prodotto esistente

Il sistema cerca prima il prodotto nel database usando:

- `registrationNumber` (prioritario)
- `name` (fallback se registrationNumber non disponibile)
- `companyId` per limitare la ricerca al warehouse dell'azienda

```typescript
const product = await prisma.product.findFirst({
  where: {
    registrationNumber: params.registrationNumber,
    warehouse: { companyId: params.companyId },
  },
});
```

### 2. Creazione automatica se non trovato

Se il prodotto non esiste, il sistema lo crea utilizzando **CreateProductUseCase** (riuso del codice esistente):

```typescript
await createProductUseCase.execute({
  warehouseId: params.warehouseId,
  name: params.name,
  sku: `SKU-${params.registrationNumber}`,
  category: ProductCategory.PESTICIDE,
  type: 'Fitosanitario',
  registrationNumber: params.registrationNumber,
  stock: params.initialStock
    ? {
        quantity: params.initialStock.quantity,
        unitOfMeasureQuantity: params.initialStock.unitOfMeasure,
        price: 0,
        unitOfMeasurePrice: 'EUR',
        type: 'IN', // Stock iniziale
      }
    : null,
});
```

### 3. Aggiunta stock iniziale

Se nell'input del dosage agent è specificata la `quantity` del prodotto:

```json
{
  "products": [
    {
      "productName": "KESTREL",
      "registrationNumber": "16690",
      "quantity": 10,
      "quantityUnitOfMeasure": "kg"
    }
  ]
}
```

Il sistema crea automaticamente:

- **Prodotto** nel warehouse
- **Stock IN** di `+10 kg` (movimento di carico iniziale)

### 4. Creazione job con stock OUT

Dopo aver garantito l'esistenza del prodotto, il sistema crea il job con movimento di stock negativo:

```
Stock IN:  +10 kg  (carico iniziale)
Stock OUT: -3 kg   (job di trattamento)
Balance:   7 kg    (rimanenza)
```

## Log attesi

### Prima (prodotto non trovato)

```
[FLOWS] fillTheJob warning: Product not found for registrationNumber=16690 name=KESTREL
```

### Dopo (prodotto auto-creato)

```
[FILL-JOB] Product not found, creating: KESTREL (reg: 16690)
[FILL-JOB] Product created: KESTREL (ID: abc-123-def) with initial stock: 10 kg
[FILL-JOB] Job created for product KESTREL: -3 kg
```

## Componenti riutilizzati

Il sistema riutilizza **use case esistenti** per garantire coerenza:

### CreateProductUseCase

- Crea il prodotto con validazioni standard
- Gestisce opzionalmente lo stock iniziale
- Path: `src/application/use-cases/product/CreateProductUseCase.ts`

### CreateJobUseCase

- Crea il job con stock negativo
- Path: `src/application/use-cases/job/CreateJobUseCase.ts`

### Repository utilizzati

- `PrismaProductRepository` - gestione prodotti
- `PrismaStockRepository` - gestione stock
- `PrismaWarehouseRepository` - ricerca warehouse
- `PrismaJobRepository` - creazione job

## Flusso completo

```
1. Start Dosage Agent Job
   ↓
2. Match prodotti con colture (flowMatchCropTreatment)
   ↓
3. Calcola dosaggi ottimali (flowOptimizeDosageLinearFunc)
   ↓
4. Fill the Job (fillTheJob.ts)
   ├─ Per ogni unità produttiva:
   │  ├─ Trova company dell'unità
   │  ├─ Cerca warehouse della company
   │  │  ├─ Se esiste → usa quello
   │  │  └─ Se non esiste:
   │  │     └─ Crea warehouse di default "Magazzino Principale"
   │  │
   │  └─ Per ogni prodotto:
   │     ├─ Cerca prodotto nel DB
   │     │  ├─ Se esiste → usa quello
   │     │  └─ Se non esiste:
   │     │     ├─ Crea prodotto con CreateProductUseCase
   │     │     └─ Aggiungi stock iniziale (se specificato)
   │     └─ Crea job con stock OUT
   └─ Return jobs creati
```

## Vantaggi

✅ **Zero configurazione manuale**: Prodotti creati automaticamente  
✅ **Riuso codice**: Usa use case e repository esistenti  
✅ **Stock tracking**: Bilancio corretto con IN + OUT  
✅ **Tracciabilità**: Log chiari di ogni operazione  
✅ **Fallback robusto**: Warning se impossibile creare (es. warehouse mancante)

## Gestione automatica warehouse

Se l'azienda **non ha warehouse**, il sistema ne crea automaticamente uno di default:

```typescript
const defaultWarehouse = await prisma.warehouse.create({
  data: {
    companyId,
    name: 'Magazzino Principale',
    address: 'N/A',
    sezione: 'N/A',
    foglio: 'N/A',
    particella: 'N/A',
  },
});
```

**Log atteso:**

```
[FILL-JOB] No warehouse found for company abc-123, creating default warehouse...
[FILL-JOB] Default warehouse created: warehouse-id-xyz
[FILL-JOB] Product not found, creating: KESTREL (reg: 16690)
[FILL-JOB] Product created: KESTREL with initial stock: 10 kg
```

## Limitazioni

⚠️ **Categoria default**: I prodotti creati hanno categoria `PESTICIDE` di default  
⚠️ **Price zero**: Lo stock iniziale ha prezzo 0 (può essere aggiornato manualmente dopo)  
⚠️ **Warehouse default**: Il warehouse auto-creato ha dati catastali placeholder ('N/A')

## Testing

Per testare la funzionalità:

1. **Setup**: Azienda con warehouse ma senza prodotti specifici
2. **Input**: Dosage agent con prodotti non esistenti ma con quantity
3. **Verifica**:
   - Prodotto creato nel warehouse
   - Stock IN iniziale registrato
   - Job creato con stock OUT
   - Balance corretto

```bash
# Esempio test
POST /dosage-agent/start-job
{
  "products": [{
    "productName": "NUOVO_PRODOTTO",
    "registrationNumber": "99999",
    "quantity": 20,
    "quantityUnitOfMeasure": "L"
  }],
  "unitOfProduction": [...]
}

# Verificare:
# 1. Prodotto creato in Product table
# 2. Stock +20 L in Stock table
# 3. Job creato con stock -X L
```

## Codice modificato

### File principale: `fillTheJob.ts`

**Modifiche principali:**

1. Aggiunti repository: Product, Warehouse, Field, ProductionUnit
2. Importato `CreateProductUseCase`
3. `resolveProduct` → `findOrCreateProduct`
4. Metadata include `warehouseId`
5. Passaggio `initialStock` dalla quantity dell'input

**Linee chiave:**

- L128-174: `resolveProductionUnitMetadata` - trova warehouse
- L176-284: `findOrCreateProduct` - logica find-or-create
- L317-343: Estrazione initial stock e chiamata find-or-create

## Integrazione con altri sistemi

Questo sistema si integra con:

- **LLM Crop Matching** - fallback semantico per matching colture
- **Label Extraction** - cache etichette da SIAN
- **Linear Programming** - ottimizzazione dosaggi
- **Stock Management** - tracciamento movimenti magazzino
