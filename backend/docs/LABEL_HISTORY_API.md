# API Storico Etichette (Label History) - Documentazione

Base URL: `http://localhost:8081`

**Nota**: Tutti gli endpoint richiedono autenticazione tramite Bearer token nell'header `Authorization: Bearer <token>` e ruolo **ADMIN** o **LABEL_MANAGER**.

---

## 📋 Panoramica

Il sistema di storico etichette traccia automaticamente ogni modifica ai dati di una `LabelExtraction`. Ogni entry di storico contiene:

- **Chi** ha fatto la modifica (userId, nome utente, foto profilo)
- **Quando** è stata fatta (createdAt)
- **Cosa** è cambiato (elenco modifiche campo per campo con valore precedente e nuovo)
- **Snapshot completo** dello stato precedente dell'etichetta (per rollback)

### Operazioni tracciate automaticamente

| Operazione         | Endpoint                                | Descrizione                               |
| ------------------ | --------------------------------------- | ----------------------------------------- |
| Modifica manuale   | `PUT /labels/:id`                       | Modifica diretta dei campi dell'etichetta |
| Verifica           | `POST /labels/verify-label/:id`         | Cambio stato di verifica                  |
| Ri-estrazione      | `POST /labels/update-label/:id`         | Ri-estrazione da rawText esistente        |
| Estrazione Mistral | `POST /labels/extract-with-mistral/:id` | Ri-estrazione con Mistral                 |
| Estrazione GPT     | `POST /labels/extract-with-gpt/:id`     | Ri-estrazione con GPT-4o Vision           |

---

## 📖 ENDPOINT

### 1. Ottieni storico di un'etichetta

```bash
curl -X GET http://localhost:8081/labels/{labelExtractionId}/history \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Parametri path**:

| Campo               | Tipo            | Obbligatorio | Descrizione              |
| ------------------- | --------------- | ------------ | ------------------------ |
| `labelExtractionId` | `string` (UUID) | Sì           | ID della LabelExtraction |

**Risposta (200 OK)**:

```json
{
  "status": "success",
  "data": [
    {
      "id": "a1b2c3d4-...",
      "labelExtractionId": "e5f6g7h8-...",
      "userId": "u1v2w3x4-...",
      "userName": "Mario Rossi",
      "userProfilePictureUrl": "https://example.com/photo.jpg",
      "changes": [
        {
          "field": "label.dosaggi_dettagliati",
          "oldValue": [{"coltura": "Vite", "dose_massima": 500}],
          "newValue": [{"coltura": "Vite", "dose_massima": 750}]
        },
        {
          "field": "label.prodotto",
          "oldValue": "PRODOTTO X",
          "newValue": "PRODOTTO X GOLD"
        },
        {
          "field": "extractionConfidence",
          "oldValue": 65,
          "newValue": 85
        }
      ],
      "previousSnapshot": {
        "productName": "PRODOTTO X",
        "registrationNumber": "12345",
        "sourceUrl": "https://...",
        "category": "FITO",
        "label": { "...snapshot completo..." },
        "rawText": "...",
        "extractionConfidence": 65,
        "isVerified": false,
        "extractedFields": ["prodotto", "categoria"],
        "errors": [],
        "qualityExtraction": [0.8, 0.9]
      },
      "createdAt": "2026-02-27T10:30:00.000Z"
    },
    {
      "id": "b2c3d4e5-...",
      "labelExtractionId": "e5f6g7h8-...",
      "userId": "u1v2w3x4-...",
      "userName": "Mario Rossi",
      "userProfilePictureUrl": "https://example.com/photo.jpg",
      "changes": [
        {
          "field": "isVerified",
          "oldValue": false,
          "newValue": true
        }
      ],
      "previousSnapshot": { "..." },
      "createdAt": "2026-02-27T09:15:00.000Z"
    }
  ]
}
```

Le entry sono ordinate per data decrescente (la modifica più recente per prima).

---

### 2. Rollback di un'etichetta a uno stato precedente

Ripristina un'etichetta allo stato catturato in una entry di storico. Il rollback stesso viene registrato come nuova entry di storico.

```bash
curl -X POST http://localhost:8081/labels/rollback/{historyId} \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Parametri path**:

| Campo       | Tipo            | Obbligatorio | Descrizione                                   |
| ----------- | --------------- | ------------ | --------------------------------------------- |
| `historyId` | `string` (UUID) | Sì           | ID della entry di storico a cui fare rollback |

**Risposta (200 OK)**:

```json
{
  "status": "success",
  "data": {
    "id": "e5f6g7h8-...",
    "productName": "PRODOTTO X",
    "registrationNumber": "12345",
    "sourceUrl": "https://...",
    "category": "FITO",
    "label": { "...dati ripristinati..." },
    "rawText": "...",
    "extractionConfidence": 65,
    "isVerified": false,
    "extractedFields": ["prodotto", "categoria"],
    "errors": [],
    "qualityExtraction": [0.8, 0.9],
    "createdAt": "2026-02-20T08:00:00.000Z",
    "updatedAt": "2026-02-27T11:00:00.000Z"
  }
}
```

**Risposta (404 Not Found)**:

```json
{
  "status": "error",
  "message": "History entry or label not found",
  "code": "NOT_FOUND"
}
```

---

## 🔧 Integrazione Frontend

### Visualizzare lo storico nel dettaglio di un'etichetta

```typescript
interface LabelFieldChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

interface LabelHistoryEntry {
  id: string;
  labelExtractionId: string;
  userId: string;
  userName: string;
  userProfilePictureUrl: string | null;
  changes: LabelFieldChange[];
  previousSnapshot: Record<string, unknown>;
  createdAt: string;
}

// Fetch storico
async function getLabelHistory(labelId: string, token: string): Promise<LabelHistoryEntry[]> {
  const response = await fetch(`${BASE_URL}/labels/${labelId}/history`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  return result.data;
}

// Rollback a uno stato precedente
async function rollbackLabel(historyId: string, token: string) {
  const response = await fetch(`${BASE_URL}/labels/rollback/${historyId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.json();
}
```

### Esempio componente React

```tsx
function LabelHistoryPanel({ labelId }: { labelId: string }) {
  const [history, setHistory] = useState<LabelHistoryEntry[]>([]);

  useEffect(() => {
    getLabelHistory(labelId, token).then(setHistory);
  }, [labelId]);

  const handleRollback = async (historyId: string) => {
    if (!confirm('Sei sicuro di voler ripristinare questa versione?')) return;
    await rollbackLabel(historyId, token);
    // Ricaricare dettaglio etichetta e storico
  };

  return (
    <div>
      <h3>Storico modifiche</h3>
      {history.map((entry) => (
        <div key={entry.id}>
          <div>
            {entry.userProfilePictureUrl && (
              <img src={entry.userProfilePictureUrl} alt={entry.userName} />
            )}
            <span>{entry.userName}</span>
            <span>{new Date(entry.createdAt).toLocaleString('it-IT')}</span>
          </div>
          <ul>
            {entry.changes.map((change, i) => (
              <li key={i}>
                <strong>{change.field}</strong>: modificato
              </li>
            ))}
          </ul>
          <button onClick={() => handleRollback(entry.id)}>Ripristina questa versione</button>
        </div>
      ))}
    </div>
  );
}
```

---

## 📊 Struttura dati

### Modello Prisma `LabelHistory`

| Campo               | Tipo            | Descrizione                                 |
| ------------------- | --------------- | ------------------------------------------- |
| `id`                | `String` (UUID) | ID univoco della entry                      |
| `labelExtractionId` | `String` (UUID) | FK → LabelExtraction                        |
| `userId`            | `String` (UUID) | FK → User (chi ha fatto la modifica)        |
| `changes`           | `Json`          | Array di `{ field, oldValue, newValue }`    |
| `previousSnapshot`  | `Json`          | Snapshot completo pre-modifica per rollback |
| `createdAt`         | `DateTime`      | Data della modifica                         |

### Formato campo `changes`

Ogni elemento dell'array descrive un singolo campo modificato:

```json
{
  "field": "label.dosaggi_dettagliati",
  "oldValue": [
    /* valore precedente */
  ],
  "newValue": [
    /* nuovo valore */
  ]
}
```

Per il campo `label` (JSON complesso), le modifiche vengono tracciate a livello dei sotto-campi:

| Field name                  | Descrizione                  |
| --------------------------- | ---------------------------- |
| `label.prodotto`            | Nome prodotto                |
| `label.categoria`           | Categoria (es. "Fungicida")  |
| `label.principio_attivo`    | Principio attivo             |
| `label.dosaggi_dettagliati` | Array dosaggi per coltura    |
| `label.colture_target`      | Colture target               |
| `label.malattie`            | Malattie/patogeni            |
| `productName`               | Nome prodotto (campo record) |
| `registrationNumber`        | Numero registrazione         |
| `extractionConfidence`      | Confidenza estrazione        |
| `isVerified`                | Stato di verifica            |
| `rawText`                   | Testo raw estratto           |
| `category`                  | Categoria (FITO/FERTILIZER)  |

### Campo `previousSnapshot`

Contiene lo stato completo dell'etichetta **prima** della modifica. Include tutti i campi della `LabelExtraction` eccetto `id`, `createdAt` e `updatedAt`. Viene utilizzato dalla funzione di rollback per ripristinare lo stato precedente.

---

## 🔄 Flusso di rollback

1. L'utente visualizza lo storico di un'etichetta
2. Seleziona una entry di storico e clicca "Ripristina"
3. Il sistema:
   - Legge lo stato corrente dell'etichetta
   - Salva lo stato corrente come **nuova entry di storico** (così il rollback è tracciato e reversibile)
   - Applica il `previousSnapshot` della entry selezionata per ripristinare i dati
4. L'etichetta torna allo stato che aveva **prima** della modifica registrata in quella entry

> **Nota**: Il rollback è reversibile. Poiché il rollback stesso viene registrato nello storico, è possibile fare un ulteriore rollback per tornare allo stato pre-rollback.
