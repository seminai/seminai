/** Owns the local services. Runs in the bundled Node runtime, outside Electron. */
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const prismaEnvironment = require('./prisma-environment.cjs');

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output = (output + chunk).slice(-12000);
    });
    child.stderr.on('data', (chunk) => {
      output = (output + chunk).slice(-12000);
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0
        ? resolve(output)
        : reject(
            Object.assign(new Error(`Service command failed (${code}): ${output}`), {
              exitCode: code,
            }),
          ),
    );
  });
}
async function freePort() {
  const socket = net.createServer();
  await new Promise((resolve, reject) => {
    socket.on('error', reject);
    socket.listen(0, '127.0.0.1', resolve);
  });
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}
async function exists(file) {
  return fs.access(file).then(
    () => true,
    () => false,
  );
}

class DesktopRuntime {
  constructor({ dataDir, runtimeDir, onLog = () => {}, onReconfigure }) {
    this.onReconfigure = onReconfigure;
    this.dataDir = dataDir;
    this.runtimeDir = runtimeDir;
    this.onLog = onLog;
  }
  async initialize() {
    await fs.mkdir(this.dataDir, { recursive: true, mode: 0o700 });
    const configPath = path.join(this.dataDir, 'desktop.json');
    this.config = (await exists(configPath))
      ? JSON.parse(await fs.readFile(configPath, 'utf8'))
      : {
          port: await freePort(),
          mcpPort: await freePort(),
          pgPort: await freePort(),
          password: randomBytes(32).toString('hex'),
          lan: false,
        };
    this.config.mcpPort ||= await freePort();
    await fs.writeFile(configPath, JSON.stringify(this.config), { mode: 0o600 });
    const platform = process.platform === 'win32' ? 'windows' : process.platform;
    this.binaries = await import(`@embedded-postgres/${platform}-${process.arch}`);
    const { default: EmbeddedPostgres } = await import('embedded-postgres');
    this.pg = new EmbeddedPostgres({
      databaseDir: path.join(this.dataDir, 'postgres'),
      user: 'seminai',
      password: this.config.password,
      port: this.config.pgPort,
      authMethod: 'scram-sha-256',
      persistent: true,
      initdbFlags: ['--encoding=UTF8', '--locale=C'],
      postgresFlags: ['-h', '127.0.0.1'],
      onLog: () => {},
      onError: () => this.onLog('Database error'),
    });
    const isNew = !(await exists(path.join(this.dataDir, 'postgres', 'PG_VERSION')));
    if (isNew) await this.pg.initialise();
    // Recover a supervisor crash without starting a second server over the same data.
    if (!isNew && (await exists(path.join(this.dataDir, 'postgres', 'postmaster.pid')))) {
      await this.stopDatabase();
    }
    await this.startDatabase();
    if (isNew) await this.createDatabase('seminai');
    this.env = {
      ...process.env,
      NODE_ENV: 'production',
      APP_MODE: 'all',
      RUNTIME_PROFILE: 'desktop',
      DATA_DIR: this.dataDir,
      STORAGE_DRIVER: 'local',
      ACCESS_MODE: 'lan',
      HOST: this.config.lan ? '0.0.0.0' : '127.0.0.1',
      PORT: String(this.config.port),
      DATABASE_URL: `postgresql://seminai:${this.config.password}@127.0.0.1:${this.config.pgPort}/seminai`,
      SPA_DIR: path.join(this.runtimeDir, 'frontend', 'dist'),
      BACKEND_ROOT: path.join(this.runtimeDir, 'backend'),
      TSX_TSCONFIG_PATH: path.join(this.runtimeDir, 'backend', 'tsconfig.json'),
      OTEL_SDK_DISABLED: 'true',
      ANALYTICS_ENABLED: 'false',
    };
    this.env.DIRECT_URL = this.env.DATABASE_URL;
    Object.assign(this.env, await prismaEnvironment(this.runtimeDir));
    // A desktop install never inherits cloud credentials or a developer database from its parent shell.
    for (const name of Object.keys(this.env)) {
      if (
        /^(LLM_|AI_|OLLAMA_|OPENAI_|OPENROUTER_|CLAUDE_|ANTHROPIC_|JWT_SECRET$|ENCRYPTION_SECRET$|SETUP_COMPLETED$|REDIS_URL$|QDRANT_|SMTP_|EMAIL_|POSTHOG_|LANGFUSE_|LANGCHAIN_)/.test(
          name,
        )
      )
        delete this.env[name];
    }
    // Always take a complete, stopped-cluster snapshot before deploying a changed migration set.
    const migrations = await fs.readdir(
      path.join(this.runtimeDir, 'backend', 'prisma', 'migrations'),
    );
    const revision = migrations
      .filter((name) => /^\d/.test(name))
      .sort()
      .join('\n');
    const stamp = path.join(this.dataDir, 'migration-revision');
    if (!isNew && (!(await exists(stamp)) || (await fs.readFile(stamp, 'utf8')) !== revision)) {
      await this.snapshot(path.join(this.dataDir, 'backups', `before-migration-${Date.now()}.zip`));
    }
    await run(
      process.execPath,
      [
        path.join(
          path.dirname(
            require.resolve('prisma/package.json', {
              paths: [path.join(this.runtimeDir, 'backend')],
            }),
          ),
          'build/index.js',
        ),
        'migrate',
        'deploy',
      ],
      { cwd: path.join(this.runtimeDir, 'backend'), env: this.env },
    );
    await fs.writeFile(stamp, revision);
    await this.startApi();
    return this.state();
  }
  state() {
    return {
      url: `http://127.0.0.1:${this.config.port}`,
      lan: this.config.lan,
      port: this.config.port,
      mcpUrl: `http://127.0.0.1:${this.config.mcpPort}/mcp`,
    };
  }
  async startApi() {
    this.api = spawn(
      process.execPath,
      [
        '--import',
        'tsx',
        '--import',
        './prisma-alias-register.mjs',
        'dist/infrastructure/runtime/main.js',
      ],
      {
        cwd: path.join(this.runtimeDir, 'backend'),
        env: this.env,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      },
    );
    this.api.stdout.on('data', (chunk) => this.onLog(String(chunk)));
    this.api.stderr.on('data', (chunk) => this.onLog(String(chunk)));
    this.api.on('error', (error) => this.onLog(error.message));
    this.api.on('message', (message) => {
      if (message === 'ai-settings-updated') this.onReconfigure?.();
    });
    for (let attempt = 0; attempt < 120; attempt++) {
      if (this.api.exitCode !== null)
        throw new Error(
          'Il servizio locale non è riuscito ad avviarsi. Consulta il registro desktop.',
        );
      if (
        await fetch(`${this.state().url}/health`, { signal: AbortSignal.timeout(1000) }).then(
          (r) => r.ok,
          () => false,
        )
      ) {
        await this.startMcp();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('Avvio del servizio locale scaduto');
  }
  async startMcp() {
    this.mcp = spawn(process.execPath, [path.join(this.runtimeDir, 'packages/mcp/dist/http.js')], {
      env: {
        ...process.env,
        PORT: String(this.config.mcpPort),
        MCP_HOST: this.config.lan ? '0.0.0.0' : '127.0.0.1',
        SEMINAI_API_BASE_URL: this.state().url,
        PUBLIC_BASE_URL: `http://127.0.0.1:${this.config.mcpPort}`,
        MCP_DATA_DIR: path.join(this.dataDir, 'mcp'),
        MCP_OAUTH_SIGNING_KEY: (
          await fs.readFile(path.join(this.dataDir, 'secrets/jwt'), 'utf8')
        ).trim(),
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    this.mcp.stdout.on('data', (chunk) => this.onLog(String(chunk)));
    this.mcp.stderr.on('data', (chunk) => this.onLog(String(chunk)));
    this.mcp.on('error', (error) => this.onLog(error.message));
    for (let attempt = 0; attempt < 60; attempt++) {
      if (this.mcp.exitCode !== null) throw new Error('Avvio del connettore MCP non riuscito');
      if (
        await fetch(`http://127.0.0.1:${this.config.mcpPort}/healthz`, {
          signal: AbortSignal.timeout(1000),
        }).then(
          (r) => r.ok,
          () => false,
        )
      )
        return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error('Avvio del connettore MCP scaduto');
  }
  async stopApi() {
    if (this.mcp && this.mcp.exitCode === null) {
      const exited = once(this.mcp, 'exit');
      this.mcp.kill();
      await exited;
      this.mcp = undefined;
    }

    if (!this.api || this.api.exitCode !== null) return;
    const child = this.api;
    const exited = once(child, 'exit');
    child.send('shutdown');
    const timeout = setTimeout(() => child.kill(), 32000);
    await exited;
    clearTimeout(timeout);
    this.api = undefined;
  }
  async createDatabase(name) {
    const client = this.pg.getPgClient('postgres', '127.0.0.1');
    await client.connect();
    try {
      await client.query(`CREATE DATABASE ${client.escapeIdentifier(name)}`);
    } finally {
      await client.end();
    }
  }
  async startDatabase() {
    return require('./database-process.cjs').startDatabase(this);
  }
  async stopDatabase() {
    return require('./database-process.cjs').stopDatabase(this);
  }
  async snapshot(destination) {
    const wasRunning = Boolean(this.api);
    await this.stopApi();
    await this.stopDatabase();
    try {
      const { saveSnapshot } = require('./snapshots.cjs');
      await saveSnapshot(this.dataDir, destination);
    } finally {
      await this.startDatabase();
      if (wasRunning) await this.startApi();
    }
  }
  async setLan(enabled) {
    if (typeof enabled !== 'boolean') throw new Error('Invalid LAN setting');
    await this.stopApi();
    this.config.lan = enabled;
    await fs.writeFile(path.join(this.dataDir, 'desktop.json'), JSON.stringify(this.config), {
      mode: 0o600,
    });
    this.env.HOST = enabled ? '0.0.0.0' : '127.0.0.1';
    await this.startApi();
    return this.state();
  }
  async stop() {
    await this.stopApi();
    if (this.databaseRunning) await this.stopDatabase();
  }
}
module.exports = { DesktopRuntime, run, freePort };
