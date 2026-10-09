const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { spawn } = require('node:child_process');

(async () => {
  const directory = path.join(process.env.DATA_DIR || '/data', 'mcp');
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const keyFile = path.join(directory, 'oauth-key');
  try { await fs.writeFile(keyFile, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  const key = (await fs.readFile(keyFile, 'utf8')).trim();
  if (key.length < 32) throw new Error('Invalid persisted MCP encryption key');
  const child = spawn(process.execPath, [path.resolve(__dirname, '../../packages/mcp/dist/http.js')], {
    stdio: 'inherit', env: { ...process.env, MCP_DATA_DIR: directory, MCP_OAUTH_SIGNING_KEY: key },
  });
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
  child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', (code) => { process.exitCode = code || 0; });
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
