# Field Note Agent - Guida Testing

## Test di Integrazione E2E con LLM Reale

Il file `src/integration-test/field-note-agent.integration.test.ts` contiene test completi end-to-end che effettuano chiamate reali all'API OpenAI GPT-4o.

### ⏱️ Tempi di Esecuzione

- **Singolo test**: ~30-60 secondi
- **Suite completa**: ~3-4 minuti
- **Timeout configurato**: 4 minuti (240000ms)

### 📋 Prerequisiti

1. **Variabili d'ambiente configurate:**

   ```bash
   OPENAI_API_KEY=sk-...          # Obbligatorio
   DATABASE_URL=postgresql://...  # Obbligatorio
   ```

2. **Database pronto:**

   ```bash
   npx prisma migrate dev
   ```

3. **Dipendenze installate:**
   ```bash
   npm install
   ```

### 🚀 Eseguire i Test

#### Esegui tutti i test del Field Note Agent:

```bash
npm run test:integration -- field-note-agent.integration.test.ts
```

#### Esegui un singolo test specifico:

```bash
npm run test:integration -- field-note-agent.integration.test.ts -t "dovrebbe classificare, cercare entità"
```

#### Watch mode (utile durante sviluppo):

```bash
npm run test:integration -- field-note-agent.integration.test.ts --watch
```

### 📊 Test Inclusi

#### 1. **Test Workflow Completo con LLM Reale**

##### Test: Nota di operazione con rame

```typescript
'ho dato 10 kg di rame nel campo vite ieri';
```

**Verifica:**

- ✅ Classificazione come OPERATION
- ✅ Riconoscimento prodotto "rame"
- ✅ Match con campo "campo vite"
- ✅ Salvataggio nel database con status PROCESSED

##### Test: Nota di osservazione con malattia

```typescript
'ho notato peronospora nel campo vite stamattina';
```

**Verifica:**

- ✅ Classificazione come OBSERVATION
- ✅ Riconoscimento malattia "peronospora"
- ✅ Match con campo
- ✅ Salvataggio corretto

##### Test: Reject e correzione

```typescript
// Prima: "ho trattato il campo con prodotto"
// Reject: "No, era rame bordolese, 15 kg nel campo vite"
```

**Verifica:**

- ✅ Gestione reject
- ✅ Riclassificazione con feedback
- ✅ Salvataggio con dati corretti

#### 2. **Test Gestione Stato e Conversazione**

Verifica che lo stato della conversazione sia mantenuto attraverso multiple interazioni.

#### 3. **Test Performance**

Verifica che la classificazione completi in meno di 30 secondi.

### 🔍 Output dei Test

Durante l'esecuzione vedrai output dettagliati:

```
🚀 Setup test environment...
✅ Test user created: abc-123...
✅ Test company created: def-456...
✅ Test warehouse created: ghi-789...
✅ Test field created: jkl-012 (campo vite)
✅ Test product created: mno-345 (Rame Bordolese) with 100kg stock
✅ Test environment ready!

🧪 Test: Nota di operazione con rame nel campo vite
📤 Step 1: Invio messaggio "ho dato 10 kg di rame nel campo vite ieri"
📥 Response 1 status: REQUIRES_APPROVAL
✅ Step 2: Approva classificazione
📥 Response 2 status: REQUIRES_APPROVAL
✅ Step 3: Approva ricerca campi/prodotti
📥 Response 3 status: COMPLETED
💾 Step final: Conferma salvataggio con "sì, salva"
📥 Response final status: COMPLETED
🔍 Verifica salvataggio nel database...
📊 Field notes trovate: 1
✅ Field note salvata: xyz-789
   - Categoria: OPERATION
   - Raw content: ho dato 10 kg di rame nel campo vite ieri
   - Campo collegato: campo vite
   - Prodotto collegato: Rame Bordolese
   - Status: PROCESSED
```

### 🧹 Cleanup Automatico

I test gestiscono automaticamente la pulizia:

- **`afterEach`**: Rimuove le field notes create
- **`afterAll`**: Rimuove tutti i dati di test (user, company, field, product, warehouse)

### 🐛 Troubleshooting

#### Test timeout dopo 4 minuti

**Causa:** LLM impiega troppo tempo o chiamata API fallisce

**Soluzione:**

```bash
# Aumenta il timeout nel file di test
jest.setTimeout(360000); // 6 minuti
```

#### Errore "OPENAI_API_KEY is required"

**Soluzione:**

```bash
# Verifica che la variabile sia configurata
echo $OPENAI_API_KEY

# O aggiungi al file .env
OPENAI_API_KEY=sk-your-key-here
```

#### Errori di connessione database

**Soluzione:**

```bash
# Verifica che il database sia attivo
npx prisma db push

# O ricrea il database
npx prisma migrate reset --force
```

#### Test fallisce su "Field notes trovate: 0"

**Causa:** L'agent non ha completato il salvataggio

**Debug:**

1. Controlla gli step intermedi nell'output
2. Verifica che tutti gli `approveAndExecute` siano stati chiamati
3. Controlla che il messaggio di conferma finale sia stato inviato

### 📈 Metriche e Costi

#### Costi OpenAI stimati per test completo:

- **Input tokens**: ~2,000-3,000 tokens
- **Output tokens**: ~1,500-2,500 tokens
- **Costo per test completo**: ~$0.05-$0.10 USD
- **Costo suite completa**: ~$0.20-$0.40 USD

#### Performance Target:

- ✅ Classificazione: < 30s
- ✅ Workflow completo: < 120s
- ✅ Suite completa: < 240s

### 🔄 CI/CD Integration

Per integrare in CI/CD pipeline:

```yaml
# .github/workflows/test-integration.yml
- name: Run Field Note Agent Tests
  run: npm run test:integration -- field-note-agent.integration.test.ts
  timeout-minutes: 6
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

### 📝 Best Practices

1. **Non eseguire in loop**: Ogni run consuma API credits
2. **Usa test specifici**: Esegui solo i test che stai debuggando
3. **Monitora i costi**: Traccia l'utilizzo OpenAI API
4. **Cache quando possibile**: Considera mock per test rapidi

### 🚦 Testing Strategy

```
┌─────────────────────────────────────────┐
│         Testing Pyramid                 │
├─────────────────────────────────────────┤
│  E2E (Slow, Expensive, LLM Real)       │  ← Questi test
│  - 3-5 test critici                     │
│  - Eseguiti prima del deploy            │
├─────────────────────────────────────────┤
│  Integration (Medium, Mock LLM)         │
│  - 10-20 test                           │
│  - Eseguiti su ogni PR                  │
├─────────────────────────────────────────┤
│  Unit (Fast, Isolated)                  │
│  - 100+ test                            │
│  - Eseguiti su ogni commit             │
└─────────────────────────────────────────┘
```

### 🎯 Prossimi Step

1. ✅ Esegui i test localmente
2. ✅ Verifica che passino tutti
3. ⏳ Integra in CI/CD
4. ⏳ Aggiungi test per attachment upload
5. ⏳ Aggiungi test per coordinate GPS
6. ⏳ Aggiungi test per multiple field notes

## Test Manuali con curl

Per test manuali rapidi senza Jest, vedi `FIELD_NOTE_AGENT_API.md`.
