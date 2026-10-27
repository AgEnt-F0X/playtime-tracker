const { app, BrowserWindow, ipcMain, dialog, globalShortcut, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { startServer } = require('./server');

let mainWindow;
let tray;
let isAfk = false;

// ─── Create Tray Icons (Programmatic) ─────────────────
function createTrayIcon(color) {
    // Create a 16x16 icon programmatically
    const canvas = nativeImage.createEmpty();
    // We'll use simple colored PNG data inline
    // Green = playing, Yellow = AFK
    const size = 16;
    const img = nativeImage.createFromBuffer(
        createColoredIcon(color === 'green' ? [16, 185, 129] : [250, 204, 21]),
        { width: size, height: size }
    );
    return img;
}

function createColoredIcon(rgb) {
    const size = 16;
    const buf = Buffer.alloc(size * size * 4);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const idx = (y * size + x) * 4;
            // Draw a circle
            const cx = 7.5, cy = 7.5, r = 6;
            const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
            if (dist <= r) {
                buf[idx] = rgb[0];     // R
                buf[idx + 1] = rgb[1]; // G
                buf[idx + 2] = rgb[2]; // B
                buf[idx + 3] = 255;    // A
            } else if (dist <= r + 1) {
                // Anti-aliased edge
                const alpha = Math.max(0, Math.min(255, Math.round((r + 1 - dist) * 255)));
                buf[idx] = rgb[0];
                buf[idx + 1] = rgb[1];
                buf[idx + 2] = rgb[2];
                buf[idx + 3] = alpha;
            } else {
                buf[idx + 3] = 0; // Transparent
            }
        }
    }
    return buf;
}

function updateTray() {
    if (!tray) return;
    const icon = createTrayIcon(isAfk ? 'yellow' : 'green');
    tray.setImage(icon);
    tray.setToolTip(isAfk ? 'PlayTime Tracker — AFK' : 'PlayTime Tracker — Active');
    
    const contextMenu = Menu.buildFromTemplate([
        { 
            label: isAfk ? '▶ Resume Playing' : '⏸ Set AFK',
            click: () => toggleAfk()
        },
        { type: 'separator' },
        { label: 'Show Window', click: () => { 
            if (!mainWindow || mainWindow.isDestroyed()) {
                createWindow();
            } else {
                mainWindow.show(); 
                mainWindow.focus(); 
            }
        } },
        { type: 'separator' },
        { label: 'Quit PlayTime Tracker', click: () => {
            app.isQuitting = true;
            app.quit();
        }}
    ]);
    tray.setContextMenu(contextMenu);
}

function toggleAfk() {
    isAfk = !isAfk;
    updateTray();
    
    // Notify renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('afk-status-changed', isAfk);
    }
    
    console.log(isAfk ? '⏸ Manual AFK activated' : '▶ Manual AFK deactivated');
}

// ─── Window Management ─────────────────────────────────
function createWindow() {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
        return;
    }

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 750,
        minWidth: 900,
        minHeight: 600,
        frame: false,
        titleBarStyle: 'hidden',
        backgroundColor: '#0d0f14',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        show: false
    });

    mainWindow.loadURL('http://localhost:3000');
    mainWindow.once('ready-to-show', () => mainWindow.show());

    let hasShownTrayHint = false;
    mainWindow.on('close', (e) => {
        if (!app.isQuitting) {
            e.preventDefault();
            // Extreme memory optimization: completely destroy the renderer
            mainWindow.destroy();
            mainWindow = null;

            if (!hasShownTrayHint) {
                hasShownTrayHint = true;
                if (tray) tray.displayBalloon({
                    iconType: 'info',
                    title: 'PlayTime Tracker',
                    content: 'Visuals unloaded to save memory. Still tracking in the background. Right-click the tray icon to quit.'
                });
            }
        }
    });
}

// ─── App Ready ───────────────────────────────────────
app.whenReady().then(async () => {
    await startServer();
    createWindow();

    // ── System Tray ──
    const icon = createTrayIcon('green');
    tray = new Tray(icon);
    updateTray();
    
    tray.on('click', () => {
        createWindow();
    });

    // ── Global Hotkey: Ctrl+Shift+F9 to toggle AFK ──
    globalShortcut.register('Ctrl+Shift+F9', () => {
        toggleAfk();
    });
});

// ── IPC Handlers ────────────────────────────────────
ipcMain.handle('open-file-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Select Game Executable',
        filters: [
            { name: 'Executables', extensions: ['exe'] },
            { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
});

ipcMain.handle('get-afk-status', () => isAfk);
ipcMain.on('toggle-afk', () => toggleAfk());

// Window controls
ipcMain.on('window-minimize', () => mainWindow && mainWindow.minimize());
ipcMain.on('window-maximize', () => {
    if (!mainWindow) return;
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on('window-close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.close(); // Triggers the 'close' event handler which destroys it
    }
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});

// Don't quit when all windows are closed — we live in the tray
app.on('window-all-closed', () => {
    // intentionally empty — app stays alive in system tray
});
