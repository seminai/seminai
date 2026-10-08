# Backup e ripristino della versione web

I dati risiedono in `./data` (o `SEMINAI_DATA_DIR`). Un backup comprende un dump logico
PostgreSQL, allegati locali e chiavi necessarie a recuperare le impostazioni cifrate.
Non viene copiato il database fisico mentre è in esecuzione. Cache e code Redis non
sono incluse: completa i lavori in corso prima di un ripristino.

## Creare un backup

Su qualsiasi sistema, anche PowerShell:

```sh
docker compose stop app
docker compose run --rm --no-deps app node /app/scripts/deploy/server-backup.cjs
docker compose start app
```

Su macOS/Linux è disponibile anche `sh scripts/deploy/backup.sh`.
Il comando stampa il percorso dell’archivio, per esempio
`/data/backups/seminai-<timestamp>.tar.gz`, corrispondente a `data/app/backups/` sull’host.
Copialo su un altro dispositivo: include segreti e va conservato privatamente.

## Ripristinare

Metti l’archivio in `data/app/backups/`. Arresta i processi che scrivono e usa il nome esatto:

```sh
docker compose stop app
docker compose up -d --wait postgres redis
docker compose run --rm --no-deps app node /app/scripts/deploy/server-restore.cjs /data/backups/seminai-<timestamp>.tar.gz
docker compose up -d --wait
```

Il ripristino sostituisce i dati correnti, dopo averne salvato una copia di recupero.
Se il comando fallisce, lascia l’app ferma e conserva il backup di recupero indicato.
Su macOS/Linux: `sh scripts/deploy/restore.sh /data/backups/seminai-<timestamp>.tar.gz`.

Il nuovo formato contiene `manifest.json`, `database.dump` e `app/`. Gli archivi della
precedente procedura, che copiava anche le directory PostgreSQL/Redis, non si importano
con questo comando: ripristinali nella precedente versione e usa l’esportazione portabile
per trasferire i dati. Non importare un dump di una versione più recente in un’app più vecchia.

Gli aggiornamenti creano automaticamente un backup prima di applicare nuove migrazioni.
Per i backup dell’app desktop e gli archivi portabili `.seminai`, vedi la
[guida desktop](releases/1.0.1.md).
