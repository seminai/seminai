# Setup Field Notes - Guida Completa — Part 2

[Back to the guide index](../FIELD_NOTES_SETUP.md)

```typescript
{
  "recognizedProducts": [
    {
      "name": "Prodotto X",
      "quantity": 10,
      "unit": "kg",
      "confidence": 0.95,
      "matchedProductId": "uuid-prodotto" // se trovato match
    }
  ],
  "recognizedField": {
    "name": "campo vite",
    "confidence": 0.88,
    "matchedFieldId": "uuid-campo"
  },
  "recognizedProductionUnit": {
    "name": "vigneto nord",
    "confidence": 0.75,
    "matchedProductionUnitId": "uuid-unit"
  },
  "recognizedOperation": {
    "type": "TREATMENT", // o FERTILIZATION, SEEDING
    "description": "applicazione prodotto",
    "confidence": 0.90
  },
  "recognizedObservations": [
    {
      "type": "disease",
      "name": "peronospora",
      "severity": "medium",
      "confidence": 0.85
    }
  ],
  "extractedQuantities": [
    {
      "value": 10,
      "unit": "kg",
      "context": "prodotto applicato"
    }
  ]
}
```

## Note Tecniche

### Performance

- Le query utilizzano indici su: `userId`, `category`, `status`, `operationDate`, `fieldId`, `productionUnitId`, `productId`, `[latitude, longitude]`
- `findNearbyFieldNotes` usa una query SQL raw con formula di Haversine (considera PostGIS per production)

### Validazioni

- Tutti i campi obbligatori sono validati nei use case
- Le date sono automaticamente convertite da string a Date nei controller
- I filtri sono opzionali e type-safe

### Testing

Per creare test:

1. Mock del repository (`PrismaFieldNoteRepository`)
2. Test dei use case con dati di esempio
3. Test di integrazione con database di test
4. Test E2E degli endpoint con Supertest

## Troubleshooting

### Errore: "Type 'FieldNote' is not assignable..."

Soluzione: Esegui `npx prisma generate` dopo la migration

### Errore: "Cannot find module '@prisma/client'"

Soluzione: Installa le dipendenze `npm install`

### Errore 401 Unauthorized

Soluzione: Verifica che il token JWT sia valido e presente nell'header `Authorization: Bearer <token>`

### Errore 403 Forbidden

Soluzione: L'utente sta cercando di accedere a una nota di un altro utente

## Checklist Completamento

- [x] Schema Prisma aggiornato
- [x] Entità dominio create
- [x] DTOs definiti
- [x] Repository interface e implementazione
- [x] Use cases implementati
- [x] Controller creato
- [x] Routes configurate
- [x] Documentazione API (JSDoc/Swagger)
- [x] Documentazione tecnica
- [ ] Migration eseguita (da fare)
- [ ] Test manuale API (da fare)
- [ ] Processamento AI (future)
- [ ] Analisi immagini (future)
- [ ] Test automatici (consigliato)

## Contatti e Supporto

Per domande o problemi, consulta:

- `docs/FIELD_NOTES.md` per documentazione API completa
- Codice sorgente con commenti JSDoc
- Architettura esagonale del progetto (`.cursor/rules/exagonal.mdc`)

Buon lavoro! 🚀
