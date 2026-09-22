# Implementazione Frontend - API Macchine (Machines) — Part 2

[Back to the guide index](../MACHINES_FRONTEND_IMPLEMENTATION.md)

```typescript
const ONE_YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

type DueStatus = 'ok' | 'expiring' | 'expired';

function getDueStatus(
  lastDate: string | null,
  reminderDays: number | null,
  periodMs: number = ONE_YEAR_MS,
): { status: DueStatus; daysUntilDue: number | null; dueDate: Date | null } {
  if (!lastDate || reminderDays == null) {
    return { status: 'ok', daysUntilDue: null, dueDate: null };
  }

  const last = new Date(lastDate).getTime();
  const dueDate = new Date(last + periodMs);
  const now = Date.now();
  const dueTime = dueDate.getTime();
  const daysUntilDue = Math.round((dueTime - now) / (24 * 60 * 60 * 1000));

  if (daysUntilDue > reminderDays) return { status: 'ok', daysUntilDue, dueDate };
  if (daysUntilDue >= 0) return { status: 'expiring', daysUntilDue, dueDate };
  return { status: 'expired', daysUntilDue, dueDate };
}

// Uso per una macchina
const revision = getDueStatus(machine.lastPositiveRevisionDate, machine.revisionReminderDays);
if (revision.status === 'expiring') {
  // Mostra: "Revisione scade tra X giorni"
}
if (revision.status === 'expired') {
  // Mostra: "Revisione scaduta da X giorni"
}
```

Ripeti la stessa logica per `functionalControlDate` + `functionalControlReminderDays` e `calibrationDate` + `calibrationReminderDays`. Se la periodicità non è 1 anno, passa `periodMs` diverso (es. 2 anni).

---

## Esempi UI e form

### Form creazione / modifica

- **Campi obbligatori:** Nome, Identificativo, Azienda (in bulk: `companyId` per ogni riga).
- **Campi opzionali:**
  - Data ultima revisione
  - Data ultimo controllo funzionale
  - Data ultima taratura
  - Numero giorni preavviso revisione
  - Numero giorni preavviso taratura
  - Numero giorni preavviso controllo funzionale

Per le date usa un input `type="date"` o un date picker e invia in ISO 8601 (es. `toISOString()`). Per i giorni usa `type="number"` (min ≥ 0 se vuoi evitare valori negativi).

### Lista macchine

- Tabella o card con: Nome, Identificativo, ultime date (revisione, controllo funzionale, taratura) e colonne “Scadenza revisione”, “Scadenza controllo”, “Scadenza taratura”.
- Per ogni riga calcola lo stato con `getDueStatus` (o equivalente) e mostra badge:
  - Verde: ok
  - Giallo: in scadenza (entro i ReminderDays)
  - Rosso: scaduto

### Dettaglio macchina

- Mostra tutti i campi della `MachineDTO` e, per revisione / controllo / taratura, data scadenza calcolata e messaggio (es. “Scade il 15/06/2025” o “Scaduta da 10 giorni”).

---

## Gestione errori

| Status | Significato                                                                                                                                                               |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | Dati mancanti o non validi (es. `machines` assente o vuoto, campi obbligatori mancanti). Body tipico: `{ "status": "error", "message": "...", "code": "MISSING_FIELDS" }` |
| 401    | Non autenticato                                                                                                                                                           |
| 403    | Ruolo insufficiente sull’azienda                                                                                                                                          |
| 404    | Macchina non trovata (solo PUT `/machines/:id`)                                                                                                                           |

Gestire in frontend: messaggio utente per 400/404, redirect o banner per 401/403.

---

## Riepilogo checklist frontend

1. Tipi TypeScript per `MachineDTO`, create e update.
2. Chiamate API: GET lista per company, POST bulk, PUT singola, DELETE bulk.
3. Form creazione/modifica con tutti i campi (date + reminder days).
4. Calcolo scadenze e stati (ok / in scadenza / scaduto) per revisione, controllo funzionale e taratura.
5. UI: badge o indicatori in lista e in dettaglio in base agli stati.
6. Gestione errori e ruoli (ADMIN/EDITOR per scrivere, VIEWER per sola lettura).
