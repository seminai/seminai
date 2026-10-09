const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, shell, session } = require('electron');
app.setName('Seminai');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const { createWriteStream } = require('node:fs');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
let window,
  tray,
  worker,
  state,
  tunnel,
  quitting = false;
const requests = new Map();
const runtimeDir = app.isPackaged
  ? path.join(process.resourcesPath, 'runtime')
  : path.resolve(__dirname, '../../..');
if (process.env.SEMINAI_DESKTOP_DATA_DIR)
  app.setPath('userData', path.join(process.env.SEMINAI_DESKTOP_DATA_DIR, 'electron-profile'));
const dataDir = process.env.SEMINAI_DESKTOP_DATA_DIR || path.join(app.getPath('userData'), 'data');
const icon = app.isPackaged
  ? path.join(process.resourcesPath, 'logo.png')
  : path.join(runtimeDir, 'frontend/public/logo.png');
function command(command, value) {
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    requests.set(id, { resolve, reject });
    worker.send({ id, command, value });
  });
}
async function publishDiscovery() {
  const folder = path.join(os.homedir(), '.seminai');
  await fs.mkdir(folder, { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(folder, 'desktop.json'), JSON.stringify({ url: state.url }), {
    mode: 0o600,
  });
}
function showWindow() {
  if (window) {
    window.show();
    window.focus();
    return;
  }
  window = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 360,
    minHeight: 500,
    icon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== state.url) event.preventDefault();
  });
  window.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      window.hide();
    }
  });
  window.on('closed', () => {
    window = undefined;
  });
  void window.loadURL(state.url);
}
async function requireAdmin(event) {
  if (
    event.sender !== window?.webContents ||
    event.senderFrame !== window.webContents.mainFrame ||
    new URL(event.senderFrame.url).origin !== state.url
  )
    throw new Error('Origine non autorizzata');
  const cookies = await session.defaultSession.cookies.get({ url: state.url, name: 'auth_token' });
  const response = await fetch(`${state.url}/farm/desktop-admin`, {
    headers: { cookie: cookies.map((c) => `${c.name}=${c.value}`).join('; ') },
  });
  if (!response.ok) throw new Error('Accedi come amministratore di Seminai');
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}
function localAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && !i.internal && i.family === 'IPv4')
    .map((i) => `http://${i.address}:${state.port}`);
}
ipcMain.handle('seminai:desktop', async (event, action, value) => {
  const cookie = await requireAdmin(event);
  if (action === 'tunnel-state') return tunnel.status();
  if (action === 'tunnel-save') {
    let token, connectionId;
    const previous = await tunnel.load().catch(() => null);
    if (
      value?.enabled &&
      (!/^tunnel_[a-zA-Z0-9]+$/.test(value.tunnelId) ||
        typeof value.apiKey !== 'string' ||
        !value.apiKey.trim())
    )
      throw new Error('Completa ID tunnel e chiave runtime OpenAI');
    if (value?.enabled) {
      const response = await fetch(`${state.url}/farm/connections`, {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ companyId: value.companyId, name: 'ChatGPT Secure MCP Tunnel' }),
      });
      if (!response.ok) throw new Error('Azienda non autorizzata');
      const connection = (await response.json()).data;
      token = connection.token;
      connectionId = connection.id;
    }
    const result = await tunnel.save({ ...value, token, connectionId });
    if (previous?.connectionId)
      await fetch(`${state.url}/farm/connections/${encodeURIComponent(previous.connectionId)}`, {
        method: 'DELETE',
        headers: { cookie },
      });
    return result;
  }
  if (action === 'state')
    return { ...state, addresses: state.lan ? localAddresses() : [], version: app.getVersion() };
  if (action === 'lan') {
    state = await command('lan', value);
    await publishDiscovery();
    return { ...state, addresses: state.lan ? localAddresses() : [] };
  }
  if (action === 'backup' || action === 'export-portable') {
    const selected = await dialog.showSaveDialog(window, {
      title: 'Salva backup — contiene dati e chiavi di recupero',
      defaultPath: `Seminai-${new Date().toISOString().slice(0, 10)}.${action === 'backup' ? 'zip' : 'seminai'}`,
      filters: [{ name: 'Dati Seminai', extensions: [action === 'backup' ? 'zip' : 'seminai'] }],
    });
    if (!selected.canceled && selected.filePath) await command(action, selected.filePath);
    return { canceled: selected.canceled };
  }
  if (action === 'restore' || action === 'import-portable') {
    const selected = await dialog.showOpenDialog(window, {
      title: 'Ripristina backup Seminai',
      properties: ['openFile'],
      filters: [{ name: 'Dati Seminai', extensions: [action === 'restore' ? 'zip' : 'seminai'] }],
    });
    if (selected.canceled) return { canceled: true };
    const confirmation = await dialog.showMessageBox(window, {
      type: 'warning',
      message: 'Sostituire i dati con questo backup?',
      detail: 'Prima del ripristino viene salvata una copia completa dei dati attuali.',
      buttons: ['Annulla', 'Ripristina'],
      cancelId: 0,
      defaultId: 0,
    });
    if (confirmation.response !== 1) return { canceled: true };
    await tunnel?.stop();
    state = await command(action, selected.filePaths[0]);
    await publishDiscovery();
    await window.loadURL(state.url);
    return { canceled: false };
  }
  if (action === 'claude') {
    const bundle = app.isPackaged
      ? path.join(process.resourcesPath, 'seminai.mcpb')
      : path.join(runtimeDir, 'packages/mcp/seminai-mcp-1.0.1.mcpb');
    const error = await shell.openPath(bundle);
    if (error) throw new Error(error);
    return true;
  }
  if (action === 'updates') {
    await shell.openExternal('https://github.com/seminai/seminai/releases');
    return true;
  }
  throw new Error('Comando non supportato');
});
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => state && showWindow());
  app
    .whenReady()
    .then(async () => {
      await fs.mkdir(path.join(dataDir, 'logs'), { recursive: true, mode: 0o700 });
      // Rotate the local runtime log each launch; no credentials are sent to the renderer.
      const log = createWriteStream(path.join(dataDir, 'logs', 'desktop.log'), {
        flags: 'w',
        mode: 0o600,
      });
      const node = app.isPackaged
        ? path.join(runtimeDir, process.platform === 'win32' ? 'node.exe' : 'node')
        : require.resolve(process.platform === 'win32' ? 'node/bin/node.exe' : 'node/bin/node');
      const entry = app.isPackaged
        ? path.join(runtimeDir, 'desktop/runtime-worker.cjs')
        : path.join(__dirname, 'runtime-worker.cjs');
      worker = spawn(node, [entry], {
        env: { ...process.env, SEMINAI_DATA_DIR: dataDir, SEMINAI_RUNTIME_DIR: runtimeDir },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      });
      worker.stdout.pipe(log);
      worker.stderr.pipe(log);
      worker.on('message', ({ id, result, error }) => {
        const request = requests.get(id);
        if (!request) return;
        requests.delete(id);
        error ? request.reject(new Error(error)) : request.resolve(result);
      });
      worker.on('exit', () => {
        for (const request of requests.values())
          request.reject(new Error('Servizio desktop arrestato'));
        requests.clear();
        if (!quitting)
          dialog.showErrorBox(
            'Seminai',
            'Il servizio si è arrestato. Riavvia Seminai; i dati restano nella cartella applicativa.',
          );
      });
      state = await command('start');
      await publishDiscovery();
      const { SeminaiTunnel } = require('./tunnel.cjs');
      tunnel = new SeminaiTunnel({
        dataDir,
        runtimeDir: app.isPackaged ? runtimeDir : path.join(runtimeDir, 'packages/desktop/stage'),
        node,
        apiUrl: state.url,
      });
      await tunnel.start();
      session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
        callback(false),
      );
      tray = new Tray(icon);
      tray.setToolTip('Seminai — servizio attivo');
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: 'Apri Seminai', click: showWindow },
          { label: 'Esci da Seminai', click: () => app.quit() },
        ]),
      );
      tray.on('double-click', showWindow);
      showWindow();
    })
    .catch((error) => {
      dialog.showErrorBox('Avvio di Seminai non riuscito', String(error.message));
      app.quit();
    });
  app.on('window-all-closed', () => {});
  app.on('activate', () => state && showWindow());
  app.on('before-quit', (event) => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    if (!worker?.connected) return app.exit();
    (async () => {
      await tunnel?.stop();
      await command('stop');
    })().finally(() => {
      worker.disconnect();
      app.exit();
    });
  });
}
