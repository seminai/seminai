/** Run with the old Docker API stopped and its database still running. */
require('dotenv/config');
const path = require('node:path');
const { exportPortable } = require('../../packages/desktop/src/portable-data.cjs');
const destination = process.argv[2];
if (!destination || !process.env.DATABASE_URL)
  throw new Error(
    'Uso: node scripts/migration/export-desktop.cjs /percorso/dati.seminai (DATABASE_URL e DATA_DIR richiesti)',
  );
if (process.env.STORAGE_DRIVER && process.env.STORAGE_DRIVER !== 'local')
  throw new Error('Scarica prima gli allegati remoti nella cartella DATA_DIR/storage');
exportPortable({
  databaseUrl: process.env.DATABASE_URL,
  dataDir: process.env.DATA_DIR || path.resolve('data'),
  destination: path.resolve(destination),
  secrets: { jwt: process.env.JWT_SECRET, encryption: process.env.ENCRYPTION_SECRET },
})
  .then(() =>
    console.log('Archivio creato. Contiene dati e chiavi private: importalo dall’app Seminai.'),
  )
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
