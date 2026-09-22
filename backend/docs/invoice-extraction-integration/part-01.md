# Integrazione Frontend - Estrazione Dati da Fatture — Part 1

[Back to the guide index](../INVOICE_EXTRACTION_INTEGRATION.md)


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
