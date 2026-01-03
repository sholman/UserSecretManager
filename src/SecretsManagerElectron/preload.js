const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFolder: () => ipcRenderer.invoke('open-folder'),
  scanDirectory: (dirPath) => ipcRenderer.invoke('scan-directory', dirPath),
  loadSecrets: (secretsFilePath) => ipcRenderer.invoke('load-secrets', secretsFilePath),
  saveSecrets: (secretsFilePath, content) => ipcRenderer.invoke('save-secrets', secretsFilePath, content),
  saveLocalSettings: (filePath, content) => ipcRenderer.invoke('save-local-settings', filePath, content),
  loadAppSettings: (filePath) => ipcRenderer.invoke('load-appsettings', filePath)
});
