# Field Notes API — Part 2

[Back to the guide index](../FIELD_NOTES.md)

```json
{
  "status": "success",
  "data": {
    "stats": {
      "totalNotes": 45,
      "byStatus": {
        "PENDING": 5,
        "PROCESSING": 2,
        "PROCESSED": 30,
        "FAILED": 3,
        "MANUALLY_REVIEWED": 5
      }
    }
  }
}
```

## Flusso di Utilizzo

### 1. Creazione Field Note da Mobile/Web

```javascript
// L'utente crea una nota dal campo
const fieldNote = await api.post('/field-notes', {
  category: 'OPERATION',
  rawContent: 'ho dato 10 kg di prodotto X nel campo vite',
  latitude: navigator.geolocation.latitude,
  longitude: navigator.geolocation.longitude,
  operationDate: new Date(),
});
// Status iniziale: PENDING
```

### 2. Processamento AI (Future Implementation)

```javascript
// Il sistema processa la nota in background
// - Estrae prodotti menzionati
// - Identifica il campo dalle coordinate GPS
// - Riconosce quantità e unità di misura
// - Assegna confidence score

// Dopo il processamento, status diventa: PROCESSED
// extractedData contiene:
{
  "recognizedProducts": [
    {
      "name": "prodotto X",
      "quantity": 10,
      "unit": "kg",
      "confidence": 0.95
    }
  ],
  "recognizedField": {
    "name": "campo vite",
    "confidence": 0.88
  }
}
```

### 3. Revisione Manuale (se necessario)

```javascript
// Se confidence < 0.8 o status === FAILED
// L'utente può rivedere e correggere
await api.put(`/field-notes/${id}`, {
  status: 'MANUALLY_REVIEWED',
  fieldId: 'campo-corretto-id',
  productId: 'prodotto-corretto-id',
  notes: 'Corretto manualmente',
});
```

### 4. Conversione in Job (Optional)

```javascript
// Una field note può essere convertita in un Job formale
// per il registro trattamenti/quaderno di campagna
await api.post('/jobs', {
  fieldNoteId: fieldNote.id,
  // ... altri dati necessari per il Job
});
```

## Prossimi Sviluppi

1. **AI Integration**

   - Implementare servizio di estrazione dati con LLM
   - Fuzzy matching per riconoscimento prodotti
   - Query geospaziali per matching campi

2. **Image Analysis**

   - Analisi foto per riconoscimento malattie/parassiti
   - OCR per etichette prodotti
   - Estrazione metadati EXIF

3. **Workflow Automation**

   - Conversione automatica field notes → Jobs
   - Notifiche per note che richiedono attenzione
   - Suggerimenti basati su pattern

4. **Mobile App Features**
   - Modalità offline
   - Registrazione vocale → text
   - Upload foto in background

## Sicurezza

- Tutte le API richiedono autenticazione (`ensureAuthenticated`)
- Gli utenti possono accedere solo alle proprie field notes
- Le operazioni di update/delete verificano ownership
- I file allegati dovrebbero essere caricati su storage sicuro (S3, Google Cloud Storage)

## Migration

Per applicare lo schema al database:

```bash
# Genera la migration
npx prisma migrate dev --name add_field_notes

# Applica in produzione
npx prisma migrate deploy
```

## Testing

```typescript
// Esempio test CreateFieldNoteUseCase
describe('CreateFieldNoteUseCase', () => {
  it('should create a field note with valid data', async () => {
    const useCase = new CreateFieldNoteUseCase(mockRepository);
    const result = await useCase.execute('user-123', {
      category: 'OPERATION',
      rawContent: 'Test note',
      latitude: 45.464211,
      longitude: 9.191383,
    });

    expect(result.category).toBe('OPERATION');
    expect(result.status).toBe('PENDING');
  });
});
```
