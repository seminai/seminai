const fs = require('node:fs/promises');
const path = require('node:path');
const { createCipheriv, createDecipheriv, createHash, randomBytes } = require('node:crypto');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
/** Only configured by an authenticated desktop administrator; credentials never enter command arguments. */
class SeminaiTunnel {
  constructor({ dataDir, runtimeDir, node, apiUrl }) {
    Object.assign(this, { dataDir, runtimeDir, node, apiUrl });
  }
  async key() {
    return createHash('sha256')
      .update(await fs.readFile(path.join(this.dataDir, 'secrets/encryption')))
      .digest();
  }
  async load() {
    let data;
    try {
      data = await fs.readFile(path.join(this.dataDir, 'tunnel.bin'));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
    const cipher = createDecipheriv('aes-256-gcm', await this.key(), data.subarray(0, 12));
    cipher.setAuthTag(data.subarray(12, 28));
    return JSON.parse(Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString());
  }
  async save(value) {
    await this.stop();
    if (!value.enabled) {
      await fs.rm(path.join(this.dataDir, 'tunnel.bin'), { force: true });
      return this.status();
    }
    if (
      !/^tunnel_[a-zA-Z0-9]+$/.test(value.tunnelId) ||
      typeof value.apiKey !== 'string' ||
      !value.apiKey.trim() ||
      !value.token?.startsWith('sem_mcp_')
    )
      throw new Error('Completa ID tunnel, chiave di esecuzione e azienda autorizzata');
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', await this.key(), nonce);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    await fs.writeFile(
      path.join(this.dataDir, 'tunnel.bin'),
      Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]),
      { mode: 0o600 },
    );
    await this.start();
    return this.status();
  }
  async start() {
    const config = await this.load().catch(() => null);
    if (!config?.enabled) return;
    const folder = path.join(this.dataDir, 'tunnel');
    await fs.mkdir(folder, { recursive: true, mode: 0o700 });
    const executable = path.join(
      this.runtimeDir,
      'tunnel',
      process.platform === 'win32' ? 'tunnel-client.exe' : 'tunnel-client',
    );
    const command = [this.node, path.join(this.runtimeDir, 'packages/mcp/dist/cli.js')]
      .map((value) => JSON.stringify(value))
      .join(' ');
    const profile = {
      config_version: 1,
      control_plane: {
        base_url: 'https://api.openai.com',
        tunnel_id: config.tunnelId,
        api_key: 'env:CONTROL_PLANE_API_KEY',
      },
      health: { listen_addr: '127.0.0.1:0', url_file: path.join(folder, 'health-url') },
      admin_ui: { open_browser: false },
      log: { level: 'warn', format: 'json' },
      mcp: { commands: [{ channel: 'main', command }] },
    };
    // JSON is a YAML subset understood by the official tunnel client.
    const profileFile = path.join(folder, 'seminai.yaml');
    await fs.writeFile(profileFile, JSON.stringify(profile), { mode: 0o600 });
    this.process = spawn(executable, ['run', '--config', profileFile], {
      env: {
        ...process.env,
        CONTROL_PLANE_API_KEY: config.apiKey,
        SEMINAI_API_BASE_URL: this.apiUrl,
        SEMINAI_API_TOKEN: config.token,
      },
      stdio: 'ignore',
    });
    this.process.on('error', () => {
      this.failed = true;
    });
    this.process.on('exit', () => {
      this.process = undefined;
    });
  }
  async status() {
    const config = await this.load().catch(() => null);
    let ready = false;
    if (this.process) {
      const url = await fs
        .readFile(path.join(this.dataDir, 'tunnel/health-url'), 'utf8')
        .catch(() => '');
      if (/^http:\/\/127\.0\.0\.1:\d+\/?$/.test(url.trim()))
        ready = await fetch(`${url.trim().replace(/\/$/, '')}/readyz`, {
          signal: AbortSignal.timeout(1500),
        }).then(
          (r) => r.ok,
          () => false,
        );
    }
    return {
      configured: Boolean(config),
      running: Boolean(this.process),
      ready,
      tunnelId: config?.tunnelId || '',
      message: ready
        ? 'Tunnel collegato'
        : this.process
          ? 'Collegamento in corso: verifica permessi Read + Use, chiave runtime e workspace associato in OpenAI.'
          : 'Tunnel non attivo',
    };
  }
  async stop() {
    if (!this.process) return;
    const child = this.process;
    const exited = once(child, 'exit');
    child.kill();
    await exited;
    this.process = undefined;
  }
}
module.exports = { SeminaiTunnel };
