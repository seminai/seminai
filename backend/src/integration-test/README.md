# Test d'Integrazione

Questa directory contiene i **test d'integrazione** che usano un database PostgreSQL reale per testare i flussi completi dell'applicazione.

## Struttura

```
integration-test/
├── setup.ts                              # Configurazione Jest e setup/teardown del database
├── helpers.ts                            # Utility per creare/eliminare dati di test
├── auth.integration.test.ts              # Test d'integrazione per autenticazione
├── company.integration.test.ts           # Test d'integrazione per company
├── user-on-company.integration.test.ts   # Test d'integrazione per user-on-company
└── README.md                             # Questa guida
```

## Setup Iniziale

### 1. Crea un Database di Test

Crea un database PostgreSQL separato per i test:

```bash
createdb seminai_test
```

### 2. Configura le Variabili d'Ambiente

Crea un file `.env.test` nella root del progetto:

```bash
cp .env.test.example .env.test
```

Modifica `.env.test` con le credenziali del tuo database di test:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/seminai_test?schema=public"
```

### 3. Esegui le Migrazioni sul Database di Test

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/seminai_test?schema=public" npm run prisma:migrate
```

## Esecuzione dei Test

I test di integrazione sono divisi in **bucket** per costo, così al push giri solo ciò che serve e non aspetti ore.

### Bucket

- **FAST** — 23 file, solo DB/Prisma, no LLM, no OCR. Girano al pre-push. Tempo: 5–10 min.
- **LLM** — 22 file, chiamate a OpenAI/Anthropic/langchain. On-demand o via smart-select. Tempo: 2–15 min per file.
- **OCR** — 22 file, estrazione PDF/immagini/audio/CSV. On-demand o via smart-select. Tempo: 1–12 min per file.
- **EXTERNAL** — 1 file (`bdf`), chiama WS BDF reale. Solo manuale.

La lista esatta per bucket è in [scripts/test-buckets.cjs](../../scripts/test-buckets.cjs).

### Comandi

```bash
# Ambiente locale riproducibile per test: PostgreSQL + Redis dedicati
npm run test:env:reset

# Tutti gli unit test (veloci, sempre)
npm run test:unit

# FAST con ambiente test dedicato, migrazioni incluse
npm run test:int:fast:env

# Solo bucket FAST (integration DB-only, 5-10 min)
npm run test:int:fast

# Solo bucket LLM (integration con chiamate AI)
npm run test:int:llm

# Solo bucket OCR (integration con estrazione PDF/immagini)
npm run test:int:ocr

# Metriche qualita estrazione su dataset/user, con report JSON/Markdown in test-output
npm run test:int:quality

# Stesse metriche includendo i casi live OCR/LLM su PDF; richiede API key e rete
npm run test:int:quality:live

# Smart-selection: gira solo gli integration test che importano (anche transitivamente)
# i file sorgente che hai modificato rispetto a origin/main
npm run test:int:changed

# Tutto: unit + tutti gli integration
npm run test:all

# Tutta la suite integration (equivalente)
npm run test:int:all

# Tutta la suite integration con ambiente test dedicato
npm run test:int:all:env

# Singolo file / pattern
npm run test:integration -- --testPathPattern=dosage
```

### Ambiente test dedicato

`docker-compose.test.yml` avvia solo PostgreSQL e Redis su porte separate:

- PostgreSQL: `127.0.0.1:55432`, database `seminai_test`
- Redis: `127.0.0.1:56379`

Gli script `test:env:*` e `test:int:*:env` iniettano `DATABASE_URL`, `REDIS_URL` e credenziali email fittizie prima di Jest. In `NODE_ENV=test` il servizio email usa `jsonTransport`, quindi i test non inviano email reali anche se `.env` contiene credenziali Gmail. Questo evita collisioni con database locali, Redis locali o credenziali di sviluppo.

### Report qualita estrazione

`npm run test:int:quality` genera:

- `test-output/user-dataset-extraction-quality-report.json`
- `test-output/user-dataset-extraction-quality-report.md`

Il report contiene conteggi, completezza dei campi obbligatori, recall sui prodotti attesi e casi diagnostici per PDF/DDT. I casi live OCR/LLM restano disattivati nel comando standard per evitare costi, dipendenze di rete ed export dei PDF verso provider esterni; vengono eseguiti con `npm run test:int:quality:live` solo dopo approvazione esplicita.

### Strategia al `git push`

Il hook `.husky/pre-push` esegue in cascata:

1. `test:unit` — sempre, fallisce il push se qualcosa si rompe.
2. `test:int:fast` — sempre, copre i flussi DB critici.
3. `test:int:changed` — gira solo gli integration LLM/OCR che coprono i file che hai toccato (via `jest --findRelatedTests`).

### Bypass in emergenza

```bash
SKIP_TESTS=1 git push          # salta TUTTO (solo hotfix)
SKIP_INT_FAST=1 git push       # skip solo step 2
SKIP_INT_CHANGED=1 git push    # skip solo step 3
```

### Test unitari (con mock)

```bash
npm run test:unit
```

## Come Funzionano

1. **Setup**: Prima di ogni suite di test, viene creato un utente di test fisso con email `test@test.it`
2. **Esecuzione**: I test eseguono operazioni reali sul database
3. **Cleanup**: Dopo ogni test, i dati vengono puliti automaticamente
4. **Teardown**: Alla fine di tutti i test, l'utente di test viene eliminato completamente

## Utente di Test

Tutti i test usano un utente fisso:

- **Email**: `test@test.it`
- **Password**: `TestPassword123!`
- **Nome**: `Test User`

Questo utente viene creato/eliminato automaticamente durante i test.

## Vantaggi

✅ **Realistici**: Testano il comportamento reale con database PostgreSQL  
✅ **Automatizzati**: Setup e cleanup automatico  
✅ **Isolati**: Ogni test parte da uno stato pulito  
✅ **Veloci**: Database locale per velocità ottimale

## Best Practices

1. **Non committare `.env.test`**: Contiene credenziali sensibili
2. **Usa un database separato**: Mai usare il database di produzione o sviluppo
3. **Pulisci sempre**: Assicurati che ogni test pulisca i suoi dati
4. **Test isolati**: Ogni test deve essere indipendente dagli altri

## CI/CD

In CI conviene girare `test:int:all` (tutto in parallelo con più worker) perché la macchina è dedicata e non blocca lo sviluppatore. In locale la strategia a bucket + smart-select è la scelta corretta.

Esempio GitHub Actions:

```yaml
- name: Setup PostgreSQL
  uses: ikalnytskyi/action-setup-postgres@v4

- name: Run migrations
  run: npm run prisma:migrate
  env:
    DATABASE_URL: ${{ env.DATABASE_URL }}

- name: Run integration tests
  run: npm run test:int:all
```

## Come aggiungere un nuovo test di integrazione

1. Crea il file in `src/integration-test/<nome>.integration.test.ts`.
2. Aggiungi il nome (senza `.integration.test.ts`) al bucket corretto in [scripts/test-buckets.cjs](../../scripts/test-buckets.cjs):
   - `FAST` se usa solo DB/Prisma,
   - `LLM` se chiama modelli AI,
   - `OCR` se estrae da PDF/immagini/CSV/audio,
   - `EXTERNAL` se dipende da servizi esterni live.
3. Se un test è temporaneamente rotto, usa `it.skip(...)` con un commento `TODO(test-stability):` e una nota sul fix previsto — NON rimuovere il test.
