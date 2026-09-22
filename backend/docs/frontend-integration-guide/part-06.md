# Guida Integrazione Frontend - Field Notes System — Part 6

[Back to the guide index](../FRONTEND_INTEGRATION_GUIDE.md)

```typescript
<template>
  <div class="field-notes-list">
    <div class="filters">
      <select v-model="filters.category">
        <option value="">Tutte le categorie</option>
        <option value="OPERATION">Operazioni</option>
        <option value="OBSERVATION">Osservazioni</option>
        <option value="MEASUREMENT">Misurazioni</option>
      </select>

      <select v-model="filters.status">
        <option value="">Tutti gli stati</option>
        <option value="PENDING">In attesa</option>
        <option value="PROCESSED">Processate</option>
      </select>

      <button @click="loadFieldNotes">🔄 Aggiorna</button>
    </div>

    <div v-if="loading">Caricamento...</div>

    <div v-else class="notes-grid">
      <div
        v-for="note in fieldNotes"
        :key="note.id"
        class="note-card"
        @click="openNote(note.id)"
      >
        <div class="note-header">
          <span class="category-badge">{{ note.category }}</span>
          <span class="status-badge" :class="note.status">
            {{ note.status }}
          </span>
        </div>

        <div class="note-content">
          {{ note.rawContent }}
        </div>

        <div class="note-metadata">
          <span v-if="note.fieldName">📍 {{ note.fieldName }}</span>
          <span v-if="note.productName">🧪 {{ note.productName }}</span>
          <span>📅 {{ formatDate(note.operationDate) }}</span>
        </div>

        <div v-if="note.attachments.length > 0" class="attachments">
          📎 {{ note.attachments.length }} allegati
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import type { FieldNote, FieldNoteCategory, FieldNoteStatus } from './types';

const fieldNotes = ref<FieldNote[]>([]);
const loading = ref(false);
const filters = reactive({
  category: '' as FieldNoteCategory | '',
  status: '' as FieldNoteStatus | ''
});

const loadFieldNotes = async () => {
  loading.value = true;

  const params = new URLSearchParams();
  if (filters.category) params.append('category', filters.category);
  if (filters.status) params.append('status', filters.status);

  try {
    const response = await fetch(
      `http://localhost:8081/field-notes?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      }
    );

    const result = await response.json();
    fieldNotes.value = result.data;
  } catch (error) {
    console.error('Error loading field notes:', error);
  } finally {
    loading.value = false;
  }
};

const openNote = (id: string) => {
  // Navigate to detail page
  window.location.href = `/field-notes/${id}`;
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('it-IT');
};

onMounted(() => {
  loadFieldNotes();
});
</script>
```

---

## Gestione Errori

### Codici di Errore

```typescript
interface ErrorResponse {
  status: 'error';
  message: string;
  code?: string;
}

// Codici comuni
const ERROR_CODES = {
  // 400
  MISSING_FIELDS: 'Campi obbligatori mancanti',
  INVALID_MESSAGE: 'Messaggio non valido',
  INVALID_THREAD_ID: 'ThreadId non valido',
  INVALID_FEEDBACK: 'Feedback non valido',

  // 401
  USER_NOT_AUTHENTICATED: 'Utente non autenticato',
  UNAUTHORIZED: 'Non autorizzato',

  // 403
  FORBIDDEN: 'Accesso negato',

  // 404
  NOT_FOUND: 'Risorsa non trovata',

  // 500
  AGENT_ERROR: "Errore interno dell'agent",
  INTERNAL_ERROR: 'Errore interno del server',
};
```

### Error Handler Universale

```typescript
async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      // Log to monitoring service
      console.error('API Error:', error.message);

      // Show user-friendly message
      if (error.message.includes('401')) {
        // Redirect to login
        window.location.href = '/login';
      } else {
        // Show toast notification
        alert(error.message);
      }
    }
    throw error;
  }
}

// Uso
try {
  const result = await apiRequest<{ status: string; data: FieldNote }>(
    'http://localhost:8081/field-notes/abc-123',
  );
  console.log(result.data);
} catch (error) {
  // Già gestito dall'handler
}
```

---

## Best Practices

### 1. Gestione ThreadId

```typescript
// ✅ CORRETTO: Crea nuovo thread per ogni conversazione
const createNewThread = () => `thread-${Date.now()}-${Math.random()}`;

// ✅ CORRETTO: Riutilizza thread per conversazioni continue
const getOrCreateThread = () => {
  let threadId = sessionStorage.getItem('current_thread_id');
  if (!threadId) {
    threadId = createNewThread();
    sessionStorage.setItem('current_thread_id', threadId);
  }
  return threadId;
};

// ❌ SBAGLIATO: Hardcode del threadId
const threadId = 'my-thread'; // NO!
```

### 2. Ottimizzazione Streaming

```typescript
// ✅ Debounce del rendering per performance
import { debounce } from 'lodash';

const updateThinking = debounce((content: string) => {
  setThinkingText(content);
}, 100); // Aggiorna max ogni 100ms

// Nell'evento 'token'
case 'token':
  thinkingBuffer += data.content;
  updateThinking(thinkingBuffer);
  break;
```

### 3. Caching e Offline
