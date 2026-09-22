# Integrazione Frontend - Estrazione Dati da Fatture — Part 2

[Back to the guide index](../INVOICE_EXTRACTION_INTEGRATION.md)

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
