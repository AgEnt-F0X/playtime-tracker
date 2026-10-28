const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
    minimizeWindow: () => ipcRenderer.send('window-minimize'),
    maximizeWindow: () => ipcRenderer.send('window-maximize'),
    closeWindow: () => ipcRenderer.send('window-close'),
    
    // AFK
    getAfkStatus: () => ipcRenderer.invoke('get-afk-status'),
    toggleAfk: () => ipcRenderer.send('toggle-afk'),
    onAfkStatusChanged: (callback) => ipcRenderer.on('afk-status-changed', (event, isAfk) => callback(isAfk)),

    // Mini Overlay
    openMiniOverlay: () => ipcRenderer.send('open-mini-overlay'),
    closeMiniOverlay: () => ipcRenderer.send('close-mini-overlay'),
    toggleMiniOverlay: () => ipcRenderer.send('toggle-mini-overlay'),
    sendOverlayData: (data) => ipcRenderer.send('update-overlay-data', data),
    onMiniOverlayClosed: (callback) => ipcRenderer.on('mini-overlay-closed', () => callback()),
    onUpdateOverlayData: (callback) => ipcRenderer.on('update-overlay-data', (event, data) => callback(data))
});
