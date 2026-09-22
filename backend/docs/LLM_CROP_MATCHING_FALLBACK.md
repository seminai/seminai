# LLM Crop Matching Fallback

## Problema risolto

Il matching meccanico basato su normalizzazione di stringhe è troppo rigido e può fallire anche quando un prodotto è effettivamente compatibile con una coltura. Ad esempio:

- Un'etichetta può indicare "Vite" ma la coltura è registrata come "Vitis vinifera"
- Un prodotto per "Pomacee" dovrebbe matchare con "Melo" ma la stringa non corrisponde
- Categorie generiche non vengono riconosciute

## Soluzione implementata

### Sistema a due livelli

1. **Matching meccanico** (veloce, gratuito)

   - Normalizzazione stringhe
   - Confronto token
   - Se trova match → usa quelli

2. **Fallback LLM** (solo se necessario)
   - Si attiva SOLO quando il matching meccanico non trova prodotti per una unità
   - Usa GPT-4o-mini (economico e veloce)
   - Valutazione semantica basata su:
     - Categorie botaniche
     - Sinonimi
     - Nomi scientifici vs comuni
     - Gruppi colturali (es. "Pomacee" include "Melo")

### Soglia di confidenza

Il sistema accetta solo match con **confidence >= 70%**:

- 90-100%: Match diretto o categoria ovvia
- 70-89%: Categoria generale o sinonimo
- <70%: Match rifiutato

## File modificati

### Nuovo file: `llmCropMatcher.ts`

Contiene:

- `llmMatchProductToCrop()`: Valuta singolo prodotto vs coltura
- `llmBatchMatchProductsToCrop()`: Batch matching per efficienza

### File modificato: `flowMatchCropTreatment.ts`

Logica aggiornata:

```typescript
// 1. Matching meccanico (come prima)
for (const product of products) {
  if (mechanicalMatch) {
    allowed.push(product);
  } else {
    unmatchedProducts.push(product);
  }
}

// 2. Fallback LLM (nuovo)
if (allowed.length === 0 && unmatchedProducts.length > 0) {
  const llmMatches = await llmBatchMatchProductsToCrop(...);
  // Aggiungi prodotti con confidence >= 70%
}
```

## Log attesi

### Caso 1: Match meccanico funziona

```
[MATCH] Unit abc123: Vitis vinifera/VITIS - unitCropKeys: ["vitis vinifera","vitis","vinifera"]
[MATCH] Product DISPERSS (1583) matched for unit abc123 - qty: 5
[MATCH] Unit abc123 matched 3 products (mechanical matching)
[MATCH] Unit abc123 final count: 3 products
```

### Caso 2: Fallback LLM attivato

```
[MATCH] Unit abc123: Vitis vinifera/VITIS - unitCropKeys: ["vitis vinifera","vitis","vinifera"]
[MATCH] Unit abc123 matched 0 products (mechanical matching)
[MATCH-FALLBACK] No mechanical matches for unit abc123, trying LLM semantic matching with 3 products...
[LLM-MATCH] Starting batch matching for 3 products against "Vitis vinifera"
[LLM-MATCH] Product "DISPERSS" vs Crop "Vitis vinifera": compatible=true, confidence=85%
[LLM-MATCH] Reason: Il prodotto è autorizzato per "Vite" che corrisponde a "Vitis vinifera"
[MATCH-FALLBACK] ✓ LLM matched DISPERSS (1583) with confidence 85%: Il prodotto è autorizzato per "Vite" che corrisponde a "Vitis vinifera"
[MATCH-FALLBACK] LLM semantic matching added 1 products for unit abc123
[MATCH] Unit abc123 final count: 1 products
```

## Costi

- **Matching meccanico**: $0 (sempre gratuito)
- **Fallback LLM**: Solo quando necessario
  - GPT-4o-mini: ~$0.15 per 1M token input, ~$0.60 per 1M token output
  - Costo medio per matching: ~$0.001-0.002
  - Si attiva solo per unità senza match meccanici

## Configurazione

Il sistema è **attivo di default** e non richiede configurazione. Per disabilitarlo (non consigliato):

```typescript
// In flowMatchCropTreatment.ts, commentare la sezione:
// if (allowed.length === 0 && unmatchedProducts.length > 0) { ... }
```

## Benefici

✅ **Riduce falsi negativi**: Prodotti compatibili non vengono più scartati  
✅ **Nessun impatto performance**: Si attiva solo quando necessario  
✅ **Costi contenuti**: Usa modello economico e solo in fallback  
✅ **Logging completo**: Tracciabilità di ogni decisione  
✅ **Spiegazioni**: Il sistema spiega perché ha matchato o rifiutato

## Testing

Per testare il fallback LLM:

1. Usa prodotti con etichette che hanno nomi generici (es. "Vite" invece di "Vitis vinifera")
2. Verifica nei log la sezione `[MATCH-FALLBACK]`
3. Controlla che i prodotti vengano matchati correttamente con confidence >= 70%
