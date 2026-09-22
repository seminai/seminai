# Dosage Agent Real-Time Log Streaming — Part 3

[Back to the guide index](../DOSAGE_AGENT_STREAMING.md)

```typescript
{
  mechanicalMatches: number;
  unmatchedProducts: number;
  unitId: string;
}
```

### `flows-timing`

```typescript
{
  phase: string;
  duration: number;
  memoryUsage?: string;
}
```

### `progress`

```typescript
{
  progress: number;
  phase: string;
}
```

### `label-extraction`

Eventi durante l'estrazione delle etichette dai PDF:

```typescript
{
  message: string; // Messaggio descrittivo
  metadata?: {
    chars?: number; // Caratteri del testo
    estimatedTokens?: number; // Token stimati
    model?: string; // Modello LLM usato
    chunksCount?: number; // Numero di chunk
    chunkIndex?: number; // Indice del chunk corrente
    totalChunks?: number; // Totale chunk
    dosaggiCount?: number; // Numero di dosaggi estratti
    sectionsCount?: number; // Numero di sezioni
    duration?: number; // Durata in ms
    partialsCount?: number; // Numero di parziali da unire
  }
}
```

Esempi di messaggi:

- `"Input: 12345 chars (~3086 tokens estimated)"`
- `"Using model: gpt-4o"`
- `"Extracted 46 dosaggio entries"`
- `"Extracting logical chunk 2/3 with gpt-4o"`
- `"Merging with model: gpt-4o"`
- `"WARNING: Only 4 dosaggi extracted - output might be incomplete!"`

## Supporto

Per problemi o domande, contattare il team di sviluppo.
