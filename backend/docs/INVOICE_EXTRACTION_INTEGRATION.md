# Integrazione Frontend - Estrazione Dati da Fatture

## Panoramica

Il servizio di estrazione dati da fatture permette di caricare file PDF o XML (FatturaPA) e ottenere un elenco strutturato di prodotti estratti automaticamente.

## Endpoint API

### POST `/api/products/bulk-from-invoice-to-product-list`

Carica una o più fatture (PDF o XML) e ottieni i prodotti estratti.

#### Autenticazione

Richiede autenticazione JWT. Includere il token nell'header:

```http
Authorization: Bearer <your_jwt_token>
```

#### Request

**Formato:** `multipart/form-data`

**Parametri:**

- `files[]` (array di file, obbligatorio): Uno o più file fattura
  - Formati supportati: `.pdf`, `.xml`
  - Dimensione massima: 10 file per richiesta
  - Tipi MIME accettati:
    - `application/pdf`
    - `application/xml`
    - `text/xml`

#### Response Success (200)

```json
{
  "success": true,
  "data": {
    "products": [
      {
        "name": "XANADU UPL GR.100",
        "registrationNumber": "12345",
        "category": "PHYTOSANITARY",
        "quantity": 3.0,
        "quantityUnitOfMeasure": "NR",
        "supplierName": "CONSORZI AGRARI D'ITALIA SPA",
        "supplierVat": "15386841009",
        "invoiceNumber": "250005V10041452",
        "invoiceDate": "2025-04-30",
        "unitPrice": 38.0,
        "totalPrice": 114.0
      },
      {
        "name": "CICLOPE x 1 lt",
        "registrationNumber": null,
        "category": "FERTILIZER",
        "quantity": 2.0,
        "quantityUnitOfMeasure": "LT",
        "supplierName": "CONSORZI AGRARI D'ITALIA SPA",
        "supplierVat": "15386841009",
        "invoiceNumber": "250005V10041452",
        "invoiceDate": "2025-04-30",
        "unitPrice": 45.0,
        "totalPrice": 90.0
      }
    ],
    "suggestedProductsWithStocks": [
      {
        "product": {
          "productName": "XANADU UPL GR.100",
          "registrationNumber": "12345",
          "productCategory": "PHYTOSANITARY",
          "administrativeStatus": "AUTORIZZATO"
        },
        "stocks": [
          {
            "quantity": 3.0,
            "quantityUnitOfMeasure": "NR",
            "supplierName": "CONSORZI AGRARI D'ITALIA SPA",
            "supplierVat": "15386841009",
            "invoiceNumber": "250005V10041452",
            "invoiceDate": "2025-04-30",
            "invoiceDueDate": null,
            "unitPrice": 38.0,
            "totalPrice": 114.0
          }
        ]
      }
    ],
    "totalEntries": 2,
    "filesProcessed": 1
  }
}
```

#### Response Error

**400 Bad Request** - Nessun file fornito o troppi file:

```json
{
  "success": false,
  "error": {
    "message": "No files provided",
    "code": "NO_FILES"
  }
}
```

**500 Internal Server Error** - Errore durante l'estrazione:

```json
{
  "success": false,
  "error": {
    "message": "Failed to extract invoice data: ...",
    "code": "INVOICE_EXTRACTION_ERROR"
  }
}
```

## Esempio di Integrazione Frontend

### React + Axios

```typescript
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

interface InvoiceExtractionResponse {
  success: boolean;
  data: {
    products: InvoiceProduct[];
    totalEntries: number;
    filesProcessed: number;
  };
}

async function uploadInvoices(files: File[]): Promise<InvoiceProduct[]> {
  const formData = new FormData();

  files.forEach((file) => {
    formData.append('files[]', file);
  });

  try {
    const response = await axios.post<InvoiceExtractionResponse>(
      '/api/products/bulk-from-invoice-to-product-list',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${getAuthToken()}`,
        },
      },
    );

    return response.data.data.products;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.error?.message || 'Upload failed');
    }
    throw error;
  }
}

// Funzione helper per ottenere il token
function getAuthToken(): string {
  return localStorage.getItem('authToken') || '';
}
```

### Componente React di Upload

```tsx
import React, { useState } from 'react';
import { uploadInvoices } from './api/invoices';

export const InvoiceUploader: React.FC = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<InvoiceProduct[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const fileList = Array.from(e.target.files);

      // Validazione: massimo 10 file
      if (fileList.length > 10) {
        setError('Massimo 10 file per upload');
        return;
      }

      // Validazione: solo PDF e XML
      const validFiles = fileList.filter(
        (file) =>
          file.type === 'application/pdf' ||
          file.type === 'application/xml' ||
          file.type === 'text/xml' ||
          file.name.endsWith('.xml'),
      );

      if (validFiles.length !== fileList.length) {
        setError('Alcuni file non sono nel formato corretto (PDF o XML)');
        return;
      }

      setFiles(validFiles);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      setError('Seleziona almeno un file');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const extractedProducts = await uploadInvoices(files);
      setProducts(extractedProducts);
      setFiles([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante l'upload");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="invoice-uploader">
      <h2>Carica Fatture</h2>

      <div className="upload-section">
        <input
          type="file"
          multiple
          accept=".pdf,.xml"
          onChange={handleFileChange}
          disabled={loading}
        />

        {files.length > 0 && (
          <div className="file-list">
            <p>File selezionati: {files.length}</p>
            <ul>
              {files.map((file, idx) => (
                <li key={idx}>
                  {file.name} ({(file.size / 1024).toFixed(2)} KB)
                </li>
              ))}
            </ul>
          </div>
        )}

        <button onClick={handleUpload} disabled={loading || files.length === 0}>
          {loading ? 'Caricamento in corso...' : 'Carica e Estrai'}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {products.length > 0 && (
        <div className="products-table">
          <h3>Prodotti Estratti ({products.length})</h3>
          <table>
            <thead>
              <tr>
                <th>Prodotto</th>
                <th>Categoria</th>
                <th>Quantità</th>
                <th>UM</th>
                <th>Fornitore</th>
                <th>N. Fattura</th>
                <th>Data</th>
                <th>Prezzo Unit.</th>
                <th>Totale</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product, idx) => (
                <tr key={idx}>
                  <td>{product.name}</td>
                  <td>
                    <span className={`badge ${product.category.toLowerCase()}`}>
                      {product.category}
                    </span>
                  </td>
                  <td>{product.quantity}</td>
                  <td>{product.quantityUnitOfMeasure}</td>
                  <td>{product.supplierName || '-'}</td>
                  <td>{product.invoiceNumber || '-'}</td>
                  <td>{product.invoiceDate || '-'}</td>
                  <td>{product.unitPrice ? `€${product.unitPrice.toFixed(2)}` : '-'}</td>
                  <td>{product.totalPrice ? `€${product.totalPrice.toFixed(2)}` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
```

### Vue 3 + Composition API

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

- Verificare qualità del PDF
- Provare con OCR esterno prima dell'upload
- Contattare supporto con esempio file

### Problema: "Authentication failed"

**Soluzione:**

```typescript
// Verificare token valido
const token = localStorage.getItem('authToken');
if (!token || isTokenExpired(token)) {
  await refreshToken();
}
```

### Problema: "Products incorrectly classified"

**Causa:** Il classifier potrebbe non riconoscere alcuni prodotti specifici.

**Soluzione:** I prodotti possono essere riclassificati manualmente nel frontend o nel database.

## Supporto

Per problemi o domande:

- Documentazione API: `/api/docs`
- Issues GitHub: [link al repo]
- Email: `support@seminai.com`
