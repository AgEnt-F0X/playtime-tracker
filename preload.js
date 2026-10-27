const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
    minimizeWindow: () => ipcRenderer.send('window-minimize'),
    maximizeWindow: () => ipcRenderer.send('window-maximize'),
    closeWindow: () => ipcRenderer.send('window-close'),
    
    // AFK
    getAfkStatus: () => ipcRenderer.invoke('get-afk-status'),
    toggleAfk: () => ipcRenderer.send('toggle-afk'),
    onAfkStatusChanged: (callback) => ipcRenderer.on('afk-status-changed', (event, isAfk) => callback(isAfk))
});
