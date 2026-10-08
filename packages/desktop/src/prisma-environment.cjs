const fs = require('node:fs/promises');
const path = require('node:path');

/** Keep migration startup offline and preserve the signature of installed resources. */
module.exports = async function prismaEnvironment(runtimeDir) {
  const enginesDir = path.dirname(
    require.resolve('@prisma/engines/package.json', {
      paths: [path.join(runtimeDir, 'backend')],
    }),
  );
  const schemaEngines = (await fs.readdir(enginesDir)).filter(
    (name) => /^schema-engine-[\w.-]+$/.test(name) && !/\.(gz|sha256)$/.test(name),
  );
  if (schemaEngines.length !== 1) throw new Error('Expected exactly one bundled Prisma engine');
  return {
    PRISMA_SCHEMA_ENGINE_BINARY: path.join(enginesDir, schemaEngines[0]),
    JITI_FS_CACHE: 'false',
    CHECKPOINT_DISABLE: '1',
    PRISMA_HIDE_UPDATE_MESSAGE: '1',
  };
};
