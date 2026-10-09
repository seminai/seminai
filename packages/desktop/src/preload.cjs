const { contextBridge, ipcRenderer } = require('electron');
const actions = new Set([
  'state',
  'lan',
  'backup',
  'restore',
  'claude',
  'export-portable',
  'import-portable',
  'updates',
  'tunnel-state',
  'tunnel-save',
]);
contextBridge.exposeInMainWorld('seminaiDesktop', {
  invoke: (action, value) => {
    if (!actions.has(action)) return Promise.reject(new Error('Comando non supportato'));
    return ipcRenderer.invoke('seminai:desktop', action, value);
  },
});
