# Fertilizer Plan — scheda tecnica — Part 2

[Back to the guide index](../FERTILIZER_PLAN_UNITS.md)

1. **Crea il CSV in `crop_req/<coltura>.csv`** con header IT standard. La
   `<coltura>` deve essere il `cropName` che si troverà in `ProductionCycle` o
   un suo alias normalizzabile.
2. **Aggiungi una colonna a `yield_crop.csv`**: header = `<coltura>` (stesso
   slug del filename), valore (riga 2) = resa di calibrazione in t/ha.
3. **Verifica la copertura**:
   ```bash
   npx tsx scripts/check-fertilizer-coverage.ts --out docs/fertilizer-coverage.md
   ```
   La nuova coltura deve apparire con ✅ in entrambe le colonne.
4. **Test**: il tool deve restituire `usedGenericFallback: false` per quella
   coltura. Eventualmente aggiungi un caso al test di integrazione.

---

## Procedure operative

### Generare un piano via tool (modalità test)

```bash
npm run test:integration -- --testPathPattern fertilizer-plan
```

Lo scenario simula azienda + campo + production unit pomodoro + 5 fertilizzanti.

### Rigenerare il report di copertura

```bash
npx tsx scripts/check-fertilizer-coverage.ts --out docs/fertilizer-coverage.md
```

Output: tabella con tutte le colture (yield_crop ∪ crop_req ∪ DB
ProductionCycle) e flag di copertura. Le righe `❌` ricadono sul fallback
generico.

### Aggiungere un nuovo fertilizzante prodotto

Inserire un `Product` in DB con:

- `category = 'FERTILIZER'`
- almeno uno dei campi `{nitrogen, phosphorus, potassium, magnesium, calcium,
sulfur, boron}` non-null (% massa)
- `unitOfFertilizer` opzionale (es. `"kg"`, `"L"`)

Il prodotto verrà raccolto automaticamente dal use case (`fertilizerProductIds`
omesso → tutti i FERTILIZER della company).

---

## Strategia di test

### Unit tests (jest, `npm test`)

| Suite                              | Cosa verifica                                                                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `header-normalizer.test.ts`        | Mapping di varianti IT/ES/EN dei nomi colonna → NutrientKey                                                                             |
| `plan-sanitizer.test.ts`           | `JSON.stringify(public)` non contiene mai `expectedPerHa`, `actualPerHa`, `yieldScaleUsed`, `resolvedCropFile`. `yieldScale` propagato. |
| `fertilizer-optimizer.test.ts`     | Linearità con `yieldScale`, infattibilità segnalata, settimane a richiesta zero                                                         |
| `crop-requirements-loader.test.ts` | Boron convertito da g/ha a kg/ha al parsing                                                                                             |
| `fertilizer-plan.tool.test.ts`     | Tool restituisce markdown table, scrive in working memory, rispetta privacy                                                             |

### Integration tests (jest+Postgres, `npm run test:integration`)

| Test                                                               | Scopo                                          |
| ------------------------------------------------------------------ | ---------------------------------------------- |
| `produces a feasible plan…`                                        | Smoke test: scenario azienda + 5 fertilizzanti |
| `auto-resolves fertilizers…`                                       | Default = tutti FERTILIZER della company       |
| `scales total doses proportionally…`                               | `yieldScale = actualYield/referenceYield`      |
| `keeps yieldScale = 1…`                                            | Determinismo del default                       |
| **`produces season totals within agronomic plausibility bounds…`** | **Catch regressions su unità/formula**         |
| **`halving the yieldScale halves the delivered nutrients…`**       | Linearità + range scalato                      |
| `returns a sanitized response with NO raw…`                        | Privacy end-to-end                             |
| `agent tool returns a markdown table…`                             | Rendering chat                                 |
| `falls back to the generic CSV…`                                   | Fallback per cropName ignote                   |
| `skips the unit and reports a reason…`                             | Skip se nessun fertilizzante valido            |

### Bande agronomiche di riferimento (pomodoro greenhouse)

| Nutriente | Min (kg/ha) | Max (kg/ha) |
| --------- | ----------: | ----------: |
| N         |         200 |        1500 |
| P2O5      |         100 |         800 |
| K2O       |         400 |        2500 |
| CaO       |         100 |        1500 |
| MgO       |          20 |         500 |

I limiti **upper** sono volutamente larghi: un piano oltre questi valori indica
un bug strutturale (formula invertita, doppio scaling, mismatch unità). I
limiti **lower** catturano underflow / scale eccessiva.

---

## Storico delle fasi

| Fase | Cosa                                                                                                                    | PR/Ref |
| ---- | ----------------------------------------------------------------------------------------------------------------------- | ------ |
| A    | Fix formula yield: `× yield × irrigation` → `× yieldScale × irrigation`. Doses ridotte di ~113× per il pomodoro.        | —      |
| B    | `actualYieldByUnitId` come input al use case + tool. yieldScale = `actualYield / referenceYield` calcolato server-side. | —      |
| C    | Schema input al tool (Zod) — accorpato in B.                                                                            | —      |
| D    | Boron uniformato a `% B` (era `g/kg`); CSV g/ha → kg/ha al parsing; types.ts documenta convenzione kg/ha.               | —      |
| E    | Bande agronomiche nei test di integrazione.                                                                             | —      |
| F    | `yieldScale` esposto in `PublicPlanResult` + colonna "Scale" nella tabella markdown.                                    | —      |
| G    | Questa documentazione.                                                                                                  | —      |
