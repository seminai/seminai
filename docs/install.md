# Versione web con Docker

Seminai si può usare interamente nel browser, senza installare l’app desktop.
App e web hanno le stesse funzioni di quaderno, appezzamenti, prodotti e magazzino.
L’AI è facoltativa; le nuove installazioni partono con AI disattivata.

## Avvio

Installa Docker Desktop con Compose v2 su Windows/macOS, oppure Docker Engine e
Compose v2 su Linux. Scarica il sorgente della versione desiderata, estrailo e apri
un terminale nella cartella contenente `compose.yaml`.

```sh
docker compose up -d --build --wait
```

Funziona anche da PowerShell su Windows; non è richiesto uno script shell.
Apri <http://localhost:8081/setup>, crea l’amministratore locale e l’azienda.
Il primo build scarica dipendenze e immagini; poi il quaderno manuale non richiede Internet.
Mappe, provider AI e altri servizi esterni richiedono la relativa connessione.

Compose avvia `app`, PostgreSQL 16 e Redis 7. Database e Redis non espongono porte
sul computer. I dati e le chiavi di cifratura restano in `./data`, fuori dai container.
Non cancellare questa cartella durante gli aggiornamenti.

```sh
docker compose ps
docker compose logs --tail 100 app
docker compose down
docker compose up -d --wait
```

`down` non elimina i dati nelle cartelle persistenti. Un solo server conserva i dati:
l’accesso da un secondo browser non crea una copia o sincronizzazione offline.

## Telefono, tablet e altri computer

Copia `.env.example` in `.env` (facoltativo per l’uso solo locale). Per la LAN:

```dotenv
SEMINAI_BIND_HOST=0.0.0.0
SEMINAI_PORT=8081
PUBLIC_BASE_URL=http://192.168.1.50:8081
ACCESS_MODE=lan
```

Sostituisci l’indirizzo con quello del tuo server, consenti la porta nella rete privata
del firewall e applica con `docker compose up -d --wait`. Accedi da ogni dispositivo
con l’account dell’istanza. Il server e Docker devono rimanere accesi.

Per pubblicare su Internet usa un reverse proxy HTTPS, il relativo `PUBLIC_BASE_URL`
e `ACCESS_MODE=public`. La modalità LAN non configura automaticamente un servizio HTTPS.

## AI facoltativa

Configura provider e modello in Impostazioni → Integrazioni → Intelligenza artificiale.
Non copiare il vecchio `backend/.env.example` nella root: contiene variabili per lo sviluppo.
Non impostare `LLM_GATEWAY` nel Compose di base: sovrascriverebbe il provider scelto nell’app.
Dopo aver cambiato la configurazione AI del server, riavvia `docker compose restart app`.

Per Ollama puoi usare il profilo `docker compose --profile ollama up -d` e configurare
l’endpoint `http://ollama:11434`; scarica separatamente il modello desiderato. Se Ollama
è installato sul computer host, l’endpoint è `http://host.docker.internal:11434`.
L’assenza del provider non impedisce il lavoro manuale.

## MCP facoltativo

Per Claude Desktop puoi usare il pacchetto MCPB e associarlo all’URL dell’istanza web.
Per Streamable HTTP/OAuth avvia `docker compose --profile mcp up -d --wait`: l’endpoint
locale è `http://localhost:8080/mcp`. Per client cloud serve HTTPS o un tunnel configurato.
Vedi la [guida MCP](../packages/mcp/README.md). Nessun connettore può confermare i movimenti.

## Aggiornamenti e backup

Prima di aggiornare conserva un backup esterno. Scarica il nuovo sorgente mantenendo
`.env` e `data/`, poi:

```sh
docker compose build app
docker compose up -d --wait
```

Quando trova nuove migrazioni, il container crea prima un dump PostgreSQL e una copia
di allegati e chiavi sotto `data/app/backups/`. Un errore nel backup impedisce la migrazione.
Vedi [backup e ripristino](backup.md) per salvataggi manuali e recupero.

Per spostare i dati dalla versione Docker all’app usa l’archivio portabile descritto nella
[guida desktop](releases/1.0.1.md); non copiare direttamente i file fisici PostgreSQL tra piattaforme.

## Verifica per manutentori

```sh
docker build -t seminai:web-candidate .
node scripts/deploy/web-smoke.mjs
```

La prova usa container, porta e cartelle temporanei separati; non modifica un’istanza esistente.
La CI la esegue su Linux x64 e ARM64. Questo non sostituisce i collaudi su ogni NAS o host.
