# Integrazione Frontend - Estrazione Dati da Fatture — Part 4

[Back to the guide index](../INVOICE_EXTRACTION_INTEGRATION.md)

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
