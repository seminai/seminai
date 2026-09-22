# Chat History API

API per gestire lo storico delle conversazioni con gli agenti AI.

## Endpoints

### GET /chats

Restituisce la lista delle chat dell'utente autenticato.

**Query Parameters:**
| Parametro | Tipo | Obbligatorio | Descrizione |
|-----------|------|--------------|-------------|
| `category` | string | No | Filtra per categoria: `DOSAGE_AGENT` o `JOB_VERIFICATION_AGENT` |

**Response:**

```json
{
  "status": "success",
  "data": [
    {
      "id": "uuid-chat",
      "threadId": "thread-123",
      "category": "DOSAGE_AGENT",
      "modelName": "gpt-4o",
      "createdAt": "2024-01-15T10:00:00.000Z",
      "updatedAt": "2024-01-15T12:30:00.000Z",
      "lastMessage": {
        "content": "Ultimo messaggio della chat...",
        "role": "ASSISTANT",
        "createdAt": "2024-01-15T12:30:00.000Z"
      }
    }
  ]
}
```

**Esempio:**

```typescript
// Tutte le chat
const response = await fetch('/api/chats', {
  headers: { Authorization: `Bearer ${token}` },
});

// Solo chat del Dosage Agent
const response = await fetch('/api/chats?category=DOSAGE_AGENT', {
  headers: { Authorization: `Bearer ${token}` },
});
```

---

### GET /chats/:id

Restituisce il dettaglio di una chat con tutti i messaggi.

**Path Parameters:**
| Parametro | Tipo | Descrizione |
|-----------|------|-------------|
| `id` | string | ID della chat |

**Response:**

```json
{
  "status": "success",
  "data": {
    "id": "uuid-chat",
    "threadId": "thread-123",
    "category": "DOSAGE_AGENT",
    "modelName": "gpt-4o",
    "temperature": 0,
    "metadata": null,
    "createdAt": "2024-01-15T10:00:00.000Z",
    "updatedAt": "2024-01-15T12:30:00.000Z",
    "messages": [
      {
        "id": "uuid-msg-1",
        "role": "USER",
        "content": "Qual è il dosaggio per il glifosato?",
        "contentBlocks": null,
        "status": null,
        "error": null,
        "metadata": null,
        "createdAt": "2024-01-15T10:00:00.000Z"
      },
      {
        "id": "uuid-msg-2",
        "role": "ASSISTANT",
        "content": "Il dosaggio del glifosato dipende dalla coltura...",
        "contentBlocks": null,
        "status": "COMPLETED",
        "error": null,
        "metadata": { "sources": [...] },
        "createdAt": "2024-01-15T10:00:05.000Z"
      }
    ]
  }
}
```

**Esempio:**

```typescript
const chatId = 'uuid-chat';
const response = await fetch(`/api/chats/${chatId}`, {
  headers: { Authorization: `Bearer ${token}` },
});
```

---

### DELETE /chats/:id

Elimina una chat e tutti i suoi messaggi.

**Path Parameters:**
| Parametro | Tipo | Descrizione |
|-----------|------|-------------|
| `id` | string | ID della chat |

**Response:**

```json
{
  "status": "success",
  "message": "Chat deleted successfully"
}
```

**Esempio:**

```typescript
const chatId = 'uuid-chat';
const response = await fetch(`/api/chats/${chatId}`, {
  method: 'DELETE',
  headers: { Authorization: `Bearer ${token}` },
});
```

---

## Errori

| Codice | Messaggio                | Descrizione                           |
| ------ | ------------------------ | ------------------------------------- |
| 401    | `USER_NOT_AUTHENTICATED` | Token mancante o non valido           |
| 403    | `CHAT_ACCESS_DENIED`     | L'utente non ha accesso a questa chat |
| 404    | `CHAT_NOT_FOUND`         | Chat non trovata                      |

---

## Categorie disponibili

| Categoria                | Descrizione                                          |
| ------------------------ | ---------------------------------------------------- |
| `DOSAGE_AGENT`           | Chat con l'agente per il calcolo dosaggi fitofarmaci |
| `JOB_VERIFICATION_AGENT` | Chat con l'agente per la verifica delle lavorazioni  |

---

## Integrazione Frontend

```typescript
// hooks/useChats.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function useChats(category?: string) {
  const url = category ? `/api/chats?category=${category}` : '/api/chats';

  return useQuery({
    queryKey: ['chats', category],
    queryFn: () => fetch(url).then((res) => res.json()),
  });
}

export function useChat(id: string) {
  return useQuery({
    queryKey: ['chat', id],
    queryFn: () => fetch(`/api/chats/${id}`).then((res) => res.json()),
    enabled: !!id,
  });
}

export function useDeleteChat() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => fetch(`/api/chats/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chats'] });
    },
  });
}
```
