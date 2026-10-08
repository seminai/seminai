const { readdir } = require('node:fs/promises');
const path = require('node:path');

/** Electron Builder signs app.asar.unpacked; our PostgreSQL/Node live in extraResources. */
module.exports = async function signRuntime(context) {
  if (process.env.SEMINAI_SIGNING !== 'true' || context.electronPlatformName !== 'win32') return;
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile() && /\.(exe|dll|node)$/i.test(entry.name)) {
        if (!await context.packager.signIf(file)) throw new Error(`Unsigned runtime file: ${file}`);
      }
    }
  }
  await visit(path.join(context.appOutDir, 'resources/runtime'));
};
