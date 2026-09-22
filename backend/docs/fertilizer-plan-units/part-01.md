# Fertilizer Plan — scheda tecnica — Part 1

[Back to the guide index](../FERTILIZER_PLAN_UNITS.md)


Riferimento ingegneristico per chi tocca il tool `fertilizer_plan` o il dataset
`dataset/fertilizer_plan/`. Documenta unità di misura, formula matematica,
privacy boundary e procedure operative.

---

## Indice

1. [Panoramica](#panoramica)
2. [Architettura e layering](#architettura-e-layering)
3. [Convenzione di unità di misura](#convenzione-di-unità-di-misura)
4. [Formula matematica](#formula-matematica)
5. [Privacy boundary](#privacy-boundary)
6. [Formato CSV del dataset](#formato-csv-del-dataset)
7. [Aggiungere una nuova coltura](#aggiungere-una-nuova-coltura)
8. [Procedure operative](#procedure-operative)
9. [Strategia di test](#strategia-di-test)

---

## Panoramica

Il tool `fertilizer_plan` calcola il **piano di fertilizzazione minimo in kg/ha**
che soddisfa il fabbisogno nutritivo di una coltura, dato un mix di prodotti
`FERTILIZER` con composizione nota. Il problema è risolto come **programma
lineare** (libreria `yalps`) per ogni settimana del ciclo colturale.

L'agente conversazionale invoca il tool e riceve solo l'output sanificato
(dosi + delta% + scale factor). I dati grezzi del dataset (curve di richiesta
nutritiva e rese di calibrazione) sono dati **privati e altamente competitivi**
e non lasciano mai il backend.

---

## Architettura e layering

Strict hexagonal — il sanitizer vive nel **domain** così la privacy boundary è
un invariante architetturale (un componente di livello superiore non può
importarsi via i loaders senza passare dal sanitizer).

```
src/domain/entities/fertilizer-plan/
├── types.ts                  # Branded types + NutrientKey + convenzioni unità
├── header-normalizer.ts      # Mapping IT/ES/EN dei nomi colonna → NutrientKey
├── nutrient-comparison.ts    # Δ% builder (puro)
└── plan-sanitizer.ts         # SOLO funnel autorizzato Private→Public

src/application/use-cases/fertilizer/
└── ComputeFertilizerPlanUseCase.ts   # Orchestratore (Prisma + loaders + optimizer + sanitizer)

src/infrastructure/services/fertilizer/
├── crop-requirements-loader.ts   # csv-parse + cache module-level
├── yield-loader.ts               # parser yield_crop.csv + cache
├── filename-resolver.ts          # cropName → CSV file (con normalizeCropName)
├── solver-constraints.ts         # Build YALPS Model
└── fertilizer-optimizer.ts       # solve() → PrivatePlanResult

src/infrastructure/services/agents/dosage_agent_react/tools/
└── fertilizer-plan.tool.ts       # Zod schema + working memory + markdown table

dataset/fertilizer_plan/
├── crop_req/                     # 36 CSV per coltura + generico.csv (fallback)
└── yield_crop.csv                # Resa di calibrazione per ciascuna coltura

docs/
├── FERTILIZER_PLAN_UNITS.md      # questo file
└── fertilizer-coverage.md        # report copertura colture (rigenerabile)
```

**Regola di import** (enforce via ESLint `no-restricted-imports`):

```
src/infrastructure/services/agents/**  ❌  src/infrastructure/services/fertilizer/**
src/infrastructure/services/agents/**  ❌  src/domain/entities/fertilizer-plan/plan-sanitizer
```

Il tool layer importa solo `ComputeFertilizerPlanUseCase` e i tipi pubblici da
`fertilizer-plan/types`.

---

## Convenzione di unità di misura

| Layer                                                                             | Tipo           | Unità                            | Note                                        |
| --------------------------------------------------------------------------------- | -------------- | -------------------------------- | ------------------------------------------- |
| `Product.{nitrogen,phosphorus,potassium,magnesium,calcium,sulfur,boron}` (Prisma) | Float?         | **% massa rispetto al prodotto** | dopo Fase D, anche boro è in % (era `g/kg`) |
| `FertilizerInput.{nitrogen,...,boron}` (domain)                                   | number         | **% massa rispetto al prodotto** | rispecchia il modello Prisma                |
| `CropRequirementWeek.{N,P2O5,K2O,MgO,CaO,B}` (domain)                             | number         | **kg/ha (settimana)**            | aggregato dalle righe giornaliere del CSV   |
| `expectedPerHa[k]`, `actualPerHa[k]` (private)                                    | number         | **kg/ha**                        | tutti i nutrienti                           |
| `totalDoses[fertilizerId]` (public)                                               | number         | **kg/ha (somma stagionale)**     | quantità di prodotto da applicare           |
| `deltaPercents[k]` (public)                                                       | number \| null | **percentuale adimensionale**    | `null` se richiesta = 0                     |
| `yieldScale` (public)                                                             | number         | **adimensionale**                | `actualYield / referenceYield`              |
| `actualYieldByUnitId[unitId]` (input)                                             | number         | **t/ha**                         | resa attesa fornita dall'utente             |
| `irrigation` (input)                                                              | number         | **adimensionale**                | moltiplicatore correttivo (default 1)       |

**Conversioni a parsing time** (gestite in `crop-requirements-loader.ts`):

- Boron: il CSV ha `B Grammi/Ha` (g/ha/giorno). Il loader divide per `1000` →
  kg/ha, allineandosi con macro N/P/K.
- Decimali europei: `0,9628` (virgola) → `0.9628` (punto) tramite
  `parseEuFloat`.

---

## Formula matematica

### Per ogni settimana del ciclo

Per ogni nutriente `k ∈ {N, P2O5, K2O, MgO, CaO}`:

```
expectedPerHa[k] = csvWeeklyDemand[k] × yieldScale × irrigation × soilFactor[k]
```

dove:

- `csvWeeklyDemand[k]` = somma giornaliera dei valori CSV nella settimana (kg/ha)
- `yieldScale = actualYield / referenceYield` (1.0 se l'utente non passa una resa)
- `irrigation` = correttivo utente (1.0 di default)
- `soilFactor[k]` = correttivo agronomico (1.0 di default; non ancora popolato
  dai dati `Field.{nitrogen,phosphorus,...}`)

### Programma lineare (YALPS)

Variabili: `xᵢ` = dose del fertilizzante `i` in kg/ha. Una variabile per ogni
prodotto `FERTILIZER` con almeno un nutriente non-null.

Modello:

```
minimize    Σ xᵢ                       (somma totale di prodotto in kg/ha)
subject to  Σ (cᵢₖ / 100) × xᵢ  ≥  expectedPerHa[k]    ∀ k ∈ SOLVER_NUTRIENTS
            xᵢ  ≥  0                                  ∀ i
```

dove `cᵢₖ` è la composizione % del nutriente `k` nel fertilizzante `i`.

`SOLVER_NUTRIENTS` = `{N, P2O5, K2O, MgO, CaO}`. Il boron è tracciato ma non
vincolato (mantenere il programma piccolo e feasible).

### Dosi totali stagionali

```
totalDoses[i] = Σweek perWeek[w].doses[i]
```

`actualPerHa[k]` per settimana è ricostruito a posteriori per costruire i
`deltaPercents[k] = (actualPerHa[k] − expectedPerHa[k]) / expectedPerHa[k] × 100`.

---

## Privacy boundary

I dati di richiesta nutritiva e di resa di calibrazione sono **proprietari**:
non devono mai pervenire al LLM né essere esposti via API. Tre meccanismi
indipendenti garantiscono il vincolo.

### 1. Branded types (compile-time)

```typescript
// types.ts
interface PrivatePlanResult { __brand: 'private'; expectedPerHa, actualPerHa, … }
interface PublicPlanResult  { __brand: 'public';  totalDoses, deltaPercents, yieldScale }
```

Il tipo `PrivatePlanResult` non può essere passato accidentalmente come
`PublicPlanResult` — TypeScript blocca la conversione strutturale grazie al brand.

### 2. Sanitizer come funnel unico

`plan-sanitizer.ts` è l'**unico** modulo che converte `PrivatePlanResult →
PublicPlanResult`. Strappa: `expectedPerHa`, `actualPerHa`, `resolvedCropFile`,
`yieldScaleUsed` (rinominato in `yieldScale`), il riferimento al CSV. Calcola
`deltaPercents` (percentuale, non rivela il valore assoluto).

### 3. ESLint `no-restricted-imports`

`.eslintrc.cjs` blocca al tool layer (`src/infrastructure/services/agents/**`):

- import diretto di `services/fertilizer/**` (loaders, optimizer)
- import diretto di `plan-sanitizer` (deve essere invocato solo nel use case)

### Cosa è esposto e cosa no

| Dato                                                 | Esposto al LLM/utente? | Note                                               |
| ---------------------------------------------------- | :--------------------: | -------------------------------------------------- |
| Curve giornaliere di richiesta nutritiva             |           ❌           | dataset privato                                    |
| `referenceYield` (yield di calibrazione CSV)         |           ❌           | mai propagato fuori dal use case                   |
| `expectedPerHa[k]` per settimana                     |           ❌           | strappato dal sanitizer                            |
| `actualPerHa[k]` per settimana                       |           ❌           | idem                                               |
| `resolvedCropFile` (path del CSV usato)              |           ❌           | strappato                                          |
| `yieldScale` (rapporto `actualYield/referenceYield`) |           ✅           | adimensionale; vedi nota\*                         |
| `deltaPercents[k]` per settimana                     |           ✅           | percentuale, non invertibile senza l'assoluto      |
| `totalDoses[fertilizerId]`                           |           ✅           | dose raccomandata kg/ha                            |
| `usedGenericFallback` (boolean)                      |           ✅           | trasparenza: il LLM sa se ha usato il CSV generico |

\* **Nota su `yieldScale`**: se l'utente passa esplicitamente la propria
`actualYield`, può ricavare `referenceYield = actualYield / yieldScale`. Questo
è un leak _bounded_ (solo per la coltura interrogata, non enumerabile). Per un
profilo privacy più stringente in futuro, sostituire con un boolean
`scaledByUser`.

---

## Formato CSV del dataset

### File `dataset/fertilizer_plan/crop_req/<coltura>.csv`

- **Naming**: `<crop>.csv` snake_case lowercase IT (es. `pomodoro.csv`,
  `cavolo.csv`). Niente `+`, `&`, parentesi.
- **Delimiter**: punto e virgola `;`
- **Decimal**: virgola `,` (formato europeo)
- **Encoding**: UTF-8 (header con `Grammi`, `Rapporto`)

Header standard (11 colonne):

```
Giorni Dopo Semina;Settimana;N;P2O5;K2O;MgO;CaO;B Grammi/Ha;Rapporto N:K …;Rapporto Ca:Mg …;Rapporto K:Ca …
```

Le colonne `Rapporto …` sono ignorate dal parser (non sono nutrienti).

Esempio (`pomodoro.csv`):

```
Giorni Dopo Semina;Settimana;N;P2O5;K2O;MgO;CaO;B Grammi/Ha;Rapporto N:K N/(K2O/3.36);Rapporto Ca:Mg (1:0.5-0.25) (CaO/1.39)/MgO;Rapporto K:Ca (0.35-1:1) (CaO/1.19)/K2O
1;1;0,9628;0,6524;1,6287;0,2787;0,9696;5,0926;1,9877;0,4000;0,5000
```

### File `dataset/fertilizer_plan/yield_crop.csv`

Riga 1: nomi colture (devono **matchare i filename** in `crop_req/` dopo
`normalizeCropName`).

Riga 2+: rese in t/ha. Il loader prende solo riga 2 come riferimento.

Decimal: punto `.` (NB: diverso dai CSV crop_req che usano virgola).

### Backward compatibility

Il `header-normalizer.ts` riconosce ancora gli header storici spagnoli/inglesi
(`Día Después Siembra`, `Relation N:K`, `B Gram/Ha`, ecc.) — un nuovo CSV in
formato legacy verrà comunque parsato.

---

## Aggiungere una nuova coltura
