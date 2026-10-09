# Connettore MCP di Seminai

Il connettore legge i dati interni di Seminai e salva proposte da confermare nell’app.
Non richiede un provider AI configurato dentro Seminai. Image Line/QDC rimane
un’integrazione distinta dell’app, non esposta da questi strumenti.

## Strumenti disponibili

- `seminai_get_connection`: identità e azienda autorizzata.
- `seminai_read_farm`: prodotti e giacenze, magazzini, appezzamenti, colture, attività e movimenti.
- `seminai_propose_operation`: proposta di carico, scarico o attività con consumi; non registra movimenti.
- `seminai_get_operation_status`: stato e identificativi risultanti dopo la conferma.

Le ricerche sono paginate a 100 risultati. Usare `offset` per proseguire e `search`
per restringere i prodotti. Una chiave di idempotenza identifica la stessa proposta
anche dopo un retry. Se giacenze o proposta cambiano, l’utente deve rivederla.

Il connettore non espone approvazione, rifiuto o scritture QDC. `confirm=true` non
sostituisce la conferma in Seminai. Un’autorizzazione MCP non autentica alle API ordinarie.

## Claude Desktop

Installa `seminai-mcp-1.0.1.mcpb` dalla release. Indica l’URL dell’istanza, anche se
Seminai gira con Docker, e autorizza nel browser l’accesso alla singola azienda.
Non copiare il JWT di login. Le connessioni sono revocabili nelle integrazioni di Seminai.
L’istanza deve essere accesa quando Claude usa gli strumenti.

## Versione web Docker: Streamable HTTP e OAuth

Il profilo opzionale `mcp` usa la stessa immagine del server:

```sh
docker compose --profile mcp up -d --build --wait
```

L’endpoint locale è `http://localhost:8080/mcp`. Le impostazioni `.env` sono
`SEMINAI_MCP_PORT` e `MCP_PUBLIC_BASE_URL`. Il servizio parla con l’API sulla rete
interna Docker; chiavi e autorizzazioni OAuth persistono in `data/app/mcp/`.

Per un client cloud esporre il connettore tramite HTTPS e impostare il suo URL pubblico,
oppure usare il Secure MCP Tunnel con le autorizzazioni richieste da OpenAI. Non basta
fornire a ChatGPT un URL localhost. L’autorizzazione OAuth richiede login, consenso e
selezione dell’azienda; il backend ricontrolla identità, appartenenza e revoca.

L’app desktop include la configurazione guidata del client Secure MCP Tunnel.
Le verifiche reali con account Claude/ChatGPT restano distinte dai test SDK automatici.

## Esecuzione e sviluppo senza Docker

Dalla root del monorepo, con Node 22:

```sh
npm ci
npm run build --workspace @seminai/mcp-connector
npm run test:unit --workspace @seminai/mcp-connector
npm run package:mcpb --workspace @seminai/mcp-connector
```

Entrypoint: `dist/desktop.js` per associazione MCPB, `dist/cli.js` per stdio con
un’autorizzazione già emessa, `dist/http.js` per HTTP/OAuth.

HTTP standalone richiede `SEMINAI_API_BASE_URL`, `PUBLIC_BASE_URL`,
`MCP_OAUTH_SIGNING_KEY`, `MCP_DATA_DIR`, `MCP_HOST` e `PORT`.
Conservare chiave e directory OAuth privatamente e usare un solo processo per directory.
Il bind predefinito è localhost; nel container il wrapper abilita il bind interno.
