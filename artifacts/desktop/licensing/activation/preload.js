const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('__activationIpc', {
  submit: (licenseText) => ipcRenderer.invoke('licensing:activate:submit', licenseText)
});
