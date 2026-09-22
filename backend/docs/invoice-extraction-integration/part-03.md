# Integrazione Frontend - Estrazione Dati da Fatture — Part 3

[Back to the guide index](../INVOICE_EXTRACTION_INTEGRATION.md)

```vue
<template>
  <div class="invoice-uploader">
    <h2>Carica Fatture</h2>

    <div class="upload-section">
      <input
        type="file"
        multiple
        accept=".pdf,.xml"
        @change="handleFileChange"
        :disabled="loading"
      />

      <div v-if="files.length > 0" class="file-list">
        <p>File selezionati: {{ files.length }}</p>
        <ul>
          <li v-for="(file, idx) in files" :key="idx">
            {{ file.name }} ({{ (file.size / 1024).toFixed(2) }} KB)
          </li>
        </ul>
      </div>

      <button @click="handleUpload" :disabled="loading || files.length === 0">
        {{ loading ? 'Caricamento in corso...' : 'Carica e Estrai' }}
      </button>
    </div>

    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <div v-if="products.length > 0" class="products-table">
      <h3>Prodotti Estratti ({{ products.length }})</h3>
      <table>
        <!-- Table structure similar to React example -->
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import axios from 'axios';

interface InvoiceProduct {
  name: string;
  registrationNumber: string | null;
  category: 'PHYTOSANITARY' | 'FERTILIZER' | 'OTHER';
  quantity: number | null;
  quantityUnitOfMeasure: string | null;
  supplierName: string | null;
  supplierVat: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  unitPrice?: number | null;
  totalPrice?: number | null;
}

const files = ref<File[]>([]);
const loading = ref(false);
const products = ref<InvoiceProduct[]>([]);
const error = ref<string | null>(null);

const handleFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (target.files) {
    const fileList = Array.from(target.files);

    if (fileList.length > 10) {
      error.value = 'Massimo 10 file per upload';
      return;
    }

    const validFiles = fileList.filter(
      (file) =>
        file.type === 'application/pdf' ||
        file.type === 'application/xml' ||
        file.type === 'text/xml' ||
        file.name.endsWith('.xml'),
    );

    if (validFiles.length !== fileList.length) {
      error.value = 'Alcuni file non sono nel formato corretto (PDF o XML)';
      return;
    }

    files.value = validFiles;
    error.value = null;
  }
};

const handleUpload = async () => {
  if (files.value.length === 0) {
    error.value = 'Seleziona almeno un file';
    return;
  }

  loading.value = true;
  error.value = null;

  try {
    const formData = new FormData();
    files.value.forEach((file) => {
      formData.append('files[]', file);
    });

    const response = await axios.post('/api/products/bulk-from-invoice-to-product-list', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        Authorization: `Bearer ${localStorage.getItem('authToken')}`,
      },
    });

    products.value = response.data.data.products;
    files.value = [];
  } catch (err) {
    if (axios.isAxiosError(err)) {
      error.value = err.response?.data?.error?.message || 'Upload failed';
    } else {
      error.value = "Errore durante l'upload";
    }
  } finally {
    loading.value = false;
  }
};
</script>
```

## Differenze tra DDT e Fatture

### Campi Specifici

| Campo            | DDT             | Fatture         |
| ---------------- | --------------- | --------------- |
| Numero documento | `orderNumber`   | `invoiceNumber` |
| Data documento   | `ddtDate`       | `invoiceDate`   |
| Prezzo unitario  | Non disponibile | `unitPrice`     |
| Prezzo totale    | Non disponibile | `totalPrice`    |

### Endpoint

- DDT: `/api/products/bulk-from-ddt-to-product-list`
- Fatture: `/api/products/bulk-from-invoice-to-product-list`

## Formati File Supportati

### XML (FatturaPA)

- **Formato standard**: XML Schema FatturaPA v1.2
- **Estrazione**: Parsing diretto del XML, molto accurato
- **Campi estratti**: Tutti i campi disponibili nel XML
- **Performance**: Veloce (nessun uso di AI)

Esempio file supportato: `IT08567210961_yXQaA.xml`

### PDF

- **Formati**: PDF generici, anche scansionati
- **Estrazione**: Uso di AI (GPT-4) con OCR se necessario
- **Campi estratti**: Dipende dalla qualità del documento
- **Performance**: Più lento (richiede elaborazione AI)

### File Firmati Digitalmente (.p7m)

⚠️ **Nota**: I file `.xml.p7m` (firmati digitalmente) non sono ancora supportati nella versione corrente. Sarà necessario prima decrittografarli manualmente.

## Gestione Errori

### Errori Comuni

1. **File troppo grandi**: Ridurre dimensione o numero di file
2. **Formato non supportato**: Verificare che sia PDF o XML
3. **Testo non leggibile**: Per PDF scansionati, migliorare qualità scansione
4. **Token scaduto**: Rinnovare autenticazione

### Retry Logic

Si consiglia di implementare retry logic per errori temporanei (503, 429):

```typescript
async function uploadInvoicesWithRetry(files: File[], maxRetries = 3): Promise<InvoiceProduct[]> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await uploadInvoices(files);
    } catch (error) {
      if (attempt === maxRetries) throw error;

      // Retry solo per errori temporanei
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 503 || status === 429) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
          continue;
        }
      }
      throw error;
    }
  }
  throw new Error('Max retries reached');
}
```

## Best Practices

1. **Validazione Client-Side**: Validare formato e dimensione file prima dell'upload
2. **Progress Indicator**: Mostrare loader durante l'elaborazione (può richiedere 5-30 secondi)
3. **Batch Processing**: Per molti file, considerare upload in batch di 5-10 file
4. **Gestione Memoria**: Non caricare troppi file contemporaneamente
5. **Feedback Utente**: Mostrare chiaramente successo/errore per ogni file
6. **Caching**: Salvare risultati estratti per evitare ri-elaborazioni

## Testing

### Test con File di Esempio

Optional private fixtures can be supplied outside the repository through `SEMINAI_FIXTURES_DIR`.

- `IT08567210961_yXQaA.xml` - FatturaPA con 2 prodotti
- `CG-VE-2025-0270796.pdf` - Fattura PDF generica
- `ft_1-689_30062025.pdf` - Fattura PDF alternativa

### cURL Test

```bash
curl -X POST http://localhost:3000/api/products/bulk-from-invoice-to-product-list \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "files[]=@path/to/invoice.xml" \
  -F "files[]=@path/to/invoice.pdf"
```

## Performance

### Tempi di Elaborazione Medi

- **XML singolo**: 100-500ms
- **PDF singolo (con testo)**: 3-8 secondi
- **PDF singolo (scansionato/OCR)**: 10-30 secondi
- **Batch 10 file misti**: 30-120 secondi

### Limiti Rate

- Massimo 10 file per richiesta
- Consigliato: max 3 richieste simultanee per utente

## Troubleshooting

### Problema: "No products extracted"

**Possibili cause:**

- PDF non contiene testo estraibile (immagine)
- Formato fattura non riconosciuto
- Qualità scansione troppo bassa

**Soluzione:**
