# Fields Availability API

## Endpoint

**GET** `/fields/availability`

Questo endpoint restituisce tutti i campi dell'utente autenticato raggruppati per azienda, mostrando solo i campi che hanno area disponibile (non completamente occupata da unità produttive) nell'intervallo temporale specificato.

## Autenticazione

Richiede autenticazione tramite:

- Bearer Token (header `Authorization: Bearer <token>`)
- Cookie HttpOnly `auth_token` (impostato automaticamente dal backend al login)

## Parametri Query (opzionali)

| Parametro | Tipo              | Default                | Descrizione                                                   |
| --------- | ----------------- | ---------------------- | ------------------------------------------------------------- |
| `startAt` | ISO 8601 DateTime | Data corrente          | Data di inizio del periodo per il calcolo della disponibilità |
| `endAt`   | ISO 8601 DateTime | Data corrente + 1 anno | Data di fine del periodo per il calcolo della disponibilità   |

## Risposta

### Struttura

```json
{
  "status": "success",
  "data": {
    "companies": [
      {
        "companyId": "uuid-azienda",
        "companyName": "Nome Azienda",
        "fields": [
          {
            "id": "uuid-campo",
            "name": "Nome Campo",
            "sauHa": 10.5,
            "areaOccupied": 3.2,
            "areaAvailable": 7.3,
            "coordinates": [lat, lon],
            "latitude": 45.123,
            "longitude": 11.456,
            "polygon": { ... },
            "gisHa": 10.8,
            "ph": 7.2,
            "nitrogen": 120,
            "phosphorus": 45,
            "potassium": 200,
            "calcium": 1500,
            "magnesium": 180,
            "soilType": "Argilloso",
            "uso": "Seminativo",
            "qualita": "Prima",
            "superficieCatastaleMq": 105000,
            "sezione": "A",
            "foglio": "12",
            "particella": "345",
            "subalterno": "1",
            "nation": "Italia",
            "region": "Veneto",
            "city": "Verona",
            "address": "Via Roma 1",
            "cap": "37100",
            "variazioneMq": null,
            "inizioConduzione": "2020-01-01T00:00:00.000Z",
            "fineConduzione": null,
            "createdAt": "2024-01-01T00:00:00.000Z",
            "updatedAt": "2024-01-15T00:00:00.000Z"
          }
        ]
      }
    ]
  }
}
```

### Campi Chiave

- **`sauHa`**: Superficie Agricola Utilizzabile in ettari (totale disponibile del campo), risolta con fallback su `gisHa`/`superficieCatastaleMq` quando non impostata direttamente
- **`areaOccupied`**: Area già occupata da unità produttive nel periodo specificato (in ettari)
- **`areaAvailable`**: Area ancora disponibile per nuove unità produttive (in ettari)
  - Calcolata come: `areaAvailable = sauHa - areaOccupied`
- **`inizioConduzione` / `fineConduzione`**: periodo di conduzione del campo come salvato a DB (possono essere `null`); nel calcolo di disponibilità, se `null`, viene applicato internamente un default di 1 gennaio – 31 dicembre dell'anno corrente

## Logica di Filtraggio

L'endpoint restituisce solo i campi che soddisfano **tutti** i seguenti criteri:

1. **Hanno una superficie utilizzabile risolvibile**: usa `sauHa`; se assente, ricade su `gisHa`, poi su `superficieCatastaleMq / 10000`. Se nessuno di questi valori è disponibile, il campo viene escluso
2. **Il periodo `[startAt, endAt]` si sovrappone al periodo di conduzione del campo**: `inizioConduzione <= endAt AND fineConduzione >= startAt`. Se `inizioConduzione`/`fineConduzione` non sono impostate sul campo, viene applicato un default di 1 gennaio – 31 dicembre dell'anno corrente prima del confronto
3. **Hanno area disponibile > 0**: I campi completamente occupati (in base alle unità produttive sovrapposte) vengono esclusi
4. **Appartengono ad un'azienda**: I campi senza azienda associata vengono esclusi
5. **L'utente è membro dell'azienda**: Solo le aziende di cui l'utente è membro vengono considerate

## Calcolo dell'Area Occupata

L'area occupata viene calcolata sommando le aree di tutte le unità produttive che:

- Sono allocate sul campo
- Hanno un range temporale che si sovrappone con il periodo `[startAt, endAt]`

Due periodi si sovrappongono se:

```
productionUnit.startDate <= endAt AND productionUnit.endDate >= startAt
```

## Esempi di Utilizzo

### Esempio 1: Disponibilità per l'anno corrente (default)

```bash
curl -X GET \
  'https://api.example.com/fields/availability' \
  -H 'Authorization: Bearer your_token_here'
```

### Esempio 2: Disponibilità per un periodo specifico

```bash
curl -X GET \
  'https://api.example.com/fields/availability?startAt=2025-03-01T00:00:00.000Z&endAt=2025-09-30T23:59:59.999Z' \
  -H 'Authorization: Bearer your_token_here'
```

### Esempio 3: Disponibilità per i prossimi 6 mesi

```bash
# Calcolare le date nel client
START_DATE=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
END_DATE=$(date -u -d "+6 months" +"%Y-%m-%dT%H:%M:%S.000Z")

curl -X GET \
  "https://api.example.com/fields/availability?startAt=${START_DATE}&endAt=${END_DATE}" \
  -H 'Authorization: Bearer your_token_here'
```

## Casi d'Uso

### Pianificazione Nuove Colture

Prima di creare una nuova unità produttiva, verificare quali campi hanno spazio disponibile:

```javascript
// Recupera campi disponibili per il periodo di coltivazione
const response = await fetch('/fields/availability?startAt=2025-04-01&endAt=2025-10-31', {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});

const {
  data: { companies },
} = await response.json();

// Trova il campo con più area disponibile
companies.forEach((company) => {
  console.log(`Azienda: ${company.companyName}`);
  company.fields.forEach((field) => {
    console.log(`  - ${field.name}: ${field.areaAvailable} ha disponibili`);
  });
});
```

### Rotazione Colturale

Verificare quando un campo sarà nuovamente disponibile:

```javascript
// Verifica disponibilità in periodi diversi
const periods = [
  { start: '2025-01-01', end: '2025-06-30' },
  { start: '2025-07-01', end: '2025-12-31' },
];

for (const period of periods) {
  const response = await fetch(`/fields/availability?startAt=${period.start}&endAt=${period.end}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const {
    data: { companies },
  } = await response.json();
  console.log(`Periodo ${period.start} - ${period.end}:`);
  console.log(`Campi disponibili: ${companies.reduce((sum, c) => sum + c.fields.length, 0)}`);
}
```

## Note Importanti

1. **Performance**: Per utenti con molti campi e unità produttive, la query può richiedere alcuni secondi. Considera di implementare caching lato client.

2. **Precisione Decimale**: I calcoli dell'area usano aritmetica floating-point. Per confronti di uguaglianza, usa una tolleranza (es. `1e-6`).

3. **Fuso Orario**: Tutte le date devono essere in formato ISO 8601 UTC.

4. **Campi senza Azienda**: I campi non associati ad un'azienda (`companyId = null`) vengono sempre esclusi dal risultato.

## Codici di Risposta

| Codice | Descrizione                                          |
| ------ | ---------------------------------------------------- |
| 200    | Success - Restituisce la lista dei campi disponibili |
| 401    | Unauthorized - Token mancante o non valido           |
| 500    | Internal Server Error - Errore del server            |

## Architettura

La funzionalità segue l'architettura esagonale del progetto:

- **Route**: `src/infrastructure/http/routes/field.routes.ts`
- **Controller**: `src/infrastructure/http/controllers/FieldController.ts` → `listAvailabilityByCompanies()`
- **Use Case**: `src/application/use-cases/field/GetFieldsAvailabilityUseCase.ts`
- **Repository**:
  - `IFieldRepository.findManyByUserId()` - Recupera campi dell'utente
  - `IProductionUnitRepository.sumAreaByFieldAndOverlappingRange()` - Calcola area occupata

## Testing

I test d'integrazione si trovano in:

- `src/integration-test/field.integration.test.ts` → sezione "Field Availability"

Per eseguire i test:

```bash
npm run test:integration -- field.integration.test.ts
```
