const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('shaderlabDesktop', {
  isElectron: true,
  platform: process.platform,
  electronVersion: process.versions.electron,
  chromeVersion: process.versions.chrome,
});
