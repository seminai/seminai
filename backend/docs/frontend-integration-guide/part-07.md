# Guida Integrazione Frontend - Field Notes System — Part 7

[Back to the guide index](../FRONTEND_INTEGRATION_GUIDE.md)

```typescript
// Service Worker per cache
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/field-notes')) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return (
          response ||
          fetch(event.request).then((fetchResponse) => {
            return caches.open('field-notes-v1').then((cache) => {
              cache.put(event.request, fetchResponse.clone());
              return fetchResponse;
            });
          })
        );
      }),
    );
  }
});

// IndexedDB per note offline
import { openDB } from 'idb';

const dbPromise = openDB('field-notes-db', 1, {
  upgrade(db) {
    db.createObjectStore('pending-notes', { keyPath: 'id' });
  },
});

// Salva offline
async function savePendingNote(note: CreateFieldNoteRequest) {
  const db = await dbPromise;
  await db.add('pending-notes', {
    id: Date.now(),
    ...note,
    createdAt: new Date().toISOString(),
  });
}

// Sincronizza quando online
async function syncPendingNotes() {
  const db = await dbPromise;
  const pendingNotes = await db.getAll('pending-notes');

  for (const note of pendingNotes) {
    try {
      await createFieldNote(note);
      await db.delete('pending-notes', note.id);
    } catch (error) {
      console.error('Sync error:', error);
    }
  }
}
```

### 4. GPS Precision

```typescript
// Richiedi alta precisione per field notes
function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });
  });
}

// Uso
const position = await getCurrentPosition();
const fieldNote = {
  category: 'OPERATION',
  rawContent: input,
  latitude: position.coords.latitude,
  longitude: position.coords.longitude,
  altitude: position.coords.altitude || undefined,
  gpsAccuracy: position.coords.accuracy,
};
```

### 5. Upload Ottimizzato Attachments

```typescript
// Resize immagini prima dell'upload
async function resizeImage(file: File, maxWidth: number): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, maxWidth / img.width);

      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.9);
    };
    img.src = URL.createObjectURL(file);
  });
}

// Upload con progress
async function uploadAttachment(
  file: File,
  onProgress: (percent: number) => void,
): Promise<string> {
  // 1. Resize
  const resized = await resizeImage(file, 1920);

  // 2. Upload al tuo storage
  const formData = new FormData();
  formData.append('file', resized, file.name);

  const xhr = new XMLHttpRequest();

  return new Promise((resolve, reject) => {
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress((e.loaded / e.total) * 100);
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        const result = JSON.parse(xhr.responseText);
        resolve(result.url);
      } else {
        reject(new Error('Upload failed'));
      }
    };

    xhr.onerror = () => reject(new Error('Network error'));

    xhr.open('POST', 'http://localhost:8081/upload');
    xhr.setRequestHeader('Authorization', `Bearer ${localStorage.getItem('token')}`);
    xhr.send(formData);
  });
}
```

---

## Storico chat Agente Dosage (React)

Il frontend React (`seminai-fe-v3`) espone la pagina **Agente Dosage** (`/dosage-agent-chat`) con uno **storico delle chat** e la possibilità di aprire il **dettaglio** di una conversazione passata.

### Come funziona lo storico

- **API lista chat:** **GET** `/chats?category=DOSAGE_AGENT`
  Restituisce l’elenco delle chat dell’utente per l’agente dosage. Ogni elemento è un **riepilogo** (`ChatSummary`).

- **Hook:** `useChats("DOSAGE_AGENT")`
  Usa TanStack Query con chiave `["chats", "DOSAGE_AGENT"]` e chiama `chatsApiService.getChats({ category: "DOSAGE_AGENT" })`.

- **Sidebar cronologia:** il componente `ChatHistorySidebar` mostra la lista; ogni voce è un `ChatHistoryItem` con:
  - anteprima dell’ultimo messaggio (`lastMessage.content` troncato),
  - data (`updatedAt` formattata),
  - stato attivo se `chat.threadId === activeThreadId`,
  - azione elimina (con `useDeleteChat` e conferma).

### Come si aprono i dettagli di una chat

1. **Click su una voce** della cronologia chiama `onSelectChat(chat)`.
2. Il gestore **carica il dettaglio** con **GET** `/chats/:chatId`:
   - `chatsApiService.getChatDetail(chat.id)` restituisce un `ChatDetail` (id, threadId, category, modelName, temperature, metadata, createdAt, updatedAt, **messages**).
3. Con il dettaglio ricevuto:
   - si aggiorna il **threadId** in stato e in URL: `setSearchParams({ threadId: detail.threadId })`;
   - si caricano i messaggi nella chat: `loadMessages(detail.messages)` (conversione da `ChatMessage[]` al formato interno dell’hook `useDosageAgentChat`);
   - su mobile si chiude la sidebar (`setSidebarOpen(false)`).

**Tipi (frontend):**

- `ChatSummary`: `id`, `threadId`, `category`, `modelName`, `createdAt`, `updatedAt`, `lastMessage: { content, role, createdAt } | null`.
- `ChatDetail`: come sopra più `temperature`, `metadata`, `messages: ChatMessage[]`.
- `ChatMessage`: `id`, `role`, `content`, `contentBlocks`, `status`, `error`, `metadata`, `createdAt`.

L’eliminazione di una chat usa **DELETE** `/chats/:chatId` tramite `useDeleteChat` e invalida la cache `["chats"]`.

---

## Workspace e selezione ambiente

L’applicazione supporta un **workspace** (ambiente) selezionabile: l’utente può lavorare nell’**ambiente predefinito Seminai** oppure in un **workspace** (azienda/organizzazione) di cui è membro.

### Ruolo del workspace

- **Contesto:** molte API (es. agente dosage, job, field notes) usano il workspace selezionato per filtrare dati (aziende, unità produttive, prodotti) e per il multi-tenant.
- **Agente Dosage:** alla chat viene passato `workspaceId: currentWorkspace?.id` (da `useWorkspaceContext()`); se è `null` si usa l’ambiente predefinito.

### Dove si seleziona l’ambiente

- **WorkspaceSwitcher** (sidebar desktop e header mobile): dropdown che mostra:

  - **Workspace in uso:** nome corrente (o “Seminai” se nessun workspace) e sottotitolo “Ambiente predefinito” quando è Seminai.
  - **Impostazioni:** link a `/workspace/settings` se c’è un workspace selezionato.
  - **I tuoi workspace:** lista di tutti i workspace disponibili + voce “Seminai” (ambiente predefinito). Click su una voce:
    - **Seminai** → `exitWorkspace()` (torna all’ambiente predefinito);
    - **Workspace** → `selectWorkspace(ws.id)`.
  - **Crea Workspace** → navigazione a `/new-workspace`.

- **WorkspaceContext** (`useWorkspaceContext()`):
  - `currentWorkspace`: workspace attuale o `null` (Seminai).
  - `workspaces`: lista workspace dell’utente (da **GET** `/workspaces` o equivalente).
  - `selectWorkspace(workspaceId)`: imposta il workspace e persiste in `localStorage` (chiave scoped per utente).
  - `exitWorkspace()`: deseleziona il workspace (ritorno a Seminai).

### Persistenza e tema

- L’ID del workspace selezionato è salvato in **localStorage** (chiave tipo `seminai_current_workspace_id`, con scope per userId) e ripristinato al caricamento.
- Il tema (colori primari/secondari/accent del workspace) viene applicato al documento tramite variabili CSS; quando si cambia workspace, il tema si aggiorna di conseguenza.

Per integrare una nuova funzionalità “aware” del workspace, usare `useWorkspaceContext()` e, dove richiesto dall’API, inviare `workspaceId: currentWorkspace?.id` (o `null` per Seminai).

---

## Impostazioni Workspace (Settings)

La pagina **Impostazioni Workspace** consente di gestire nome, aspetto, membri, regole e (per i proprietari) l’eliminazione del workspace. È accessibile solo quando è selezionato un workspace (non in “Seminai” predefinito).

### Accesso e routing

- **URL:** `/workspace/settings` (tab “Generale”) oppure `/workspace/settings/:section` per una sezione specifica.
- **Parametro:** `section` può essere `general` (default), `appearance`, `members`, `rules`, `danger`.
- Se non c’è un workspace selezionato (`currentWorkspace === null`), la pagina mostra un messaggio e un pulsante per tornare alla dashboard; le impostazioni non sono disponibili per l’ambiente predefinito Seminai.

### Tab e navigazione

| Tab             | Value URL           | Contenuto                                                 |
| --------------- | ------------------- | --------------------------------------------------------- |
| Generale        | `general` o assente | Nome, slug, descrizione, logo                             |
| Aspetto         | `appearance`        | Colori (primario, secondario, accent)                     |
| Membri          | `members`           | Lista membri, inviti, ruoli, invita/rimuovi               |
| Regole          | `rules`             | Lista regole, filtri, crea/modifica/elimina, assegnazioni |
| Zona Pericolosa | `danger`            | Elimina workspace                                         |

Il cambio tab aggiorna l’URL: `general` → `/workspace/settings`, le altre → `/workspace/settings/<section>`.

### 1. Generale

- **Campi:** Nome workspace, Slug (identificatore per URL), Descrizione.
- **Logo:** upload immagine (PNG/JPG/GIF/WebP, max 5MB); anteprima e rimozione. Il backend può estrarre colori dal logo (opzionale).
- **API:**
  - **PUT** `/workspaces/:workspaceId` — body: `{ name?, slug?, description?, logoUrl? }` (per rimuovere logo si invia `logoUrl: null` o `""`).
  - **Upload logo:** di solito un endpoint dedicato tipo **POST** `/workspaces/:workspaceId/logo` con `multipart/form-data`; il frontend usa `useUploadWorkspaceLogo()` dopo aver salvato i dati generali.
- **Hook:** `useUpdateWorkspace`, `useUploadWorkspaceLogo`; dati letti da `useWorkspaceContext().currentWorkspace`.

### 2. Aspetto

- **Colori:** primario, secondario, accent. Preset (es. Verde, Blu, Viola, Rosa, Arancione, Teal) oppure colori personalizzati (picker + hex).
- **Anteprima:** i colori vengono applicati in tempo reale alle variabili CSS del tema (es. `--workspace-primary`, `--palette-*`).
- **API:** **PUT** `/workspaces/:workspaceId` con body `{ primaryColor, secondaryColor, accentColor }`.
- **Hook:** `useUpdateWorkspace`; i valori correnti sono in `currentWorkspace.primaryColor`, `secondaryColor`, `accentColor`.

### 3. Membri
