// ══════════════════════════════════════════════════════════
// PLAYTIME TRACKER — Main Client Boot & Controller
// ══════════════════════════════════════════════════════════

import { store } from './store.js';
import { api } from './api.js';
import { initTitlebar } from './components/titlebar.js';
import { initModals, openModal, closeModal } from './components/modal.js';
import { initCommandPalette } from './components/command-palette.js';
import { initGamepad } from './utils/gamepad.js';
import { registerRoutes, initRouter, navigate, goBack } from './router.js';
import { toast } from './components/toast.js';
import { setupLazyImages } from './utils/art.js';
import { initAtmosphere, updateAtmosphere } from './utils/atmosphere.js';
import { fmtDuration } from './utils/fmt.js';

import { homeScreen } from './screens/home.js';
import { libraryScreen } from './screens/library.js';
import { historyScreen } from './screens/history.js';
import { gameDetailScreen } from './screens/game-detail.js';
import { statsScreen } from './screens/stats.js';
import { achievementsScreen } from './screens/achievements.js';
import { settingsScreen } from './screens/settings.js';

let pollInterval = null;
let isWindowFocused = true;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Initialize Window Titlebar & Controls
  initTitlebar();

  // 2. Initialize Atmosphere (Living art wall + quote line)
  initAtmosphere();

  // 3. Initialize Modals & Command Palette
  initModals();
  initCommandPalette();

  // 4. Register Screens with Hash Router (including Session History)
  registerRoutes({
    'home': homeScreen,
    'library': libraryScreen,
    'history': historyScreen,
    'game-detail': gameDetailScreen,
    'stats': statsScreen,
    'achievements': achievementsScreen,
    'settings': settingsScreen
  });

  // 5. Connect Sidebar Navigation Items
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const route = item.dataset.route;
      if (route) {
        if (route === 'history') {
          fetch('/api/sessions')
            .then(res => res.json())
            .then(data => {
              store.set('sessions', data);
              if (store.get('currentRoute') === 'history') {
                historyScreen.render();
              }
            })
            .catch(() => {});
        }
        navigate(`#${route}`);
      }
    });
  });

  // 6. Connect Gamepad Navigation
  initGamepad(
    () => goBack(),
    () => {
      const modal = document.getElementById('commandPaletteModal');
      if (modal) {
        modal.classList.contains('open') ? closeModal('commandPaletteModal') : openModal('commandPaletteModal');
      }
    }
  );

  // 7. Connect AFK IPC listener from Electron (Ctrl+Shift+F9)
  if (window.electronAPI && window.electronAPI.onAfkStatusChanged) {
    window.electronAPI.onAfkStatusChanged((isAfk) => {
      toast.info(isAfk ? 'Manual AFK activated (paused)' : 'Manual AFK deactivated');
      fetchActiveSessionOnly();
    });
  }

  // 8. Connect Add Game Modal UI
  initAddGameModal();

  // 9. Performance: Pause Timers & Polling on Hidden / Unfocused Window
  document.addEventListener('visibilitychange', () => {
    isWindowFocused = !document.hidden;
    if (document.hidden) {
      if (pollInterval) clearInterval(pollInterval);
    } else {
      startPollingLoop();
      fetchActiveSessionOnly();
    }
  });

  window.addEventListener('blur', () => { isWindowFocused = false; });
  window.addEventListener('focus', () => {
    isWindowFocused = true;
    fetchActiveSessionOnly();
  });

  // 10. Initial Data Fetch & Apply Preferences
  try {
    const data = await api.fetchAll();
    store.set('games', data.games);
    store.set('sessions', data.sessions);
    store.set('recentProcesses', data.processes);
    store.set('activeSession', data.activeSession);

    if (data.settings) {
      store.set('settings', data.settings);
      applySavedSettings(data.settings);
    }

    // Update living atmosphere art wall & sidebar status
    updateAtmosphere(data.games || [], data.activeSession);
    updateSidebarStatus(data.activeSession);
  } catch (e) {
    console.error('Failed to load initial data:', e);
  }

  // 11. Start Hash Router
  initRouter();

  // 12. Start Polling Loop (Active Game Session)
  startPollingLoop();

  // 13. Observe Lazy Images
  setupLazyImages();
});

function applySavedSettings(settings) {
  if (settings.theme) {
    document.documentElement.setAttribute('data-theme', settings.theme);
  }
  if (settings.performanceMode) {
    document.documentElement.classList.add('perf-mode');
  }
  if (settings.crtOverlay) {
    document.body.classList.add('crt-enabled');
  }
}

function startPollingLoop() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(async () => {
    if (!isWindowFocused) return;
    await fetchActiveSessionOnly();
  }, 2500);
}

async function fetchActiveSessionOnly() {
  try {
    const activeSession = await api.getActiveSession();
    const prev = store.get('activeSession');
    store.set('activeSession', activeSession);

    // If session ended, refresh games & sessions list
    if (prev && !activeSession) {
      const [games, sessions] = await Promise.all([api.getGames(), api.getSessions()]);
      store.set('games', games);
      store.set('sessions', sessions);
    }

    // Update living backdrop & art wall state
    updateAtmosphere(store.get('games') || [], activeSession);
    updateSidebarStatus(activeSession);

    // Refresh active screen if necessary
    const curRoute = store.get('currentRoute');
    if (curRoute === 'home') {
      homeScreen.render();
    } else if (curRoute === 'history') {
      historyScreen.render();
    }
  } catch (e) {}
}

function updateSidebarStatus(activeSession) {
  const dot = document.getElementById('sidebarStatusDot');
  const title = document.getElementById('sidebarStatusTitle');
  const sub = document.getElementById('sidebarStatusSub');
  if (!dot || !title || !sub) return;

  if (!activeSession) {
    dot.className = 'status-dot';
    title.textContent = 'Idle';
    sub.textContent = 'Ready to track';
    return;
  }

  if (activeSession.isIdle || activeSession.isManualAfk) {
    dot.className = 'status-dot afk';
    title.textContent = 'Paused (AFK)';
    sub.textContent = activeSession.gameName || 'Game';
  } else {
    dot.className = 'status-dot active';
    title.textContent = 'Now playing';
    const durStr = fmtDuration(activeSession.activeTime || activeSession.elapsed || 0);
    sub.textContent = `${activeSession.gameName || 'Game'} · ${durStr}`;
  }
}

function initAddGameModal() {
  const modal = document.getElementById('addGameModal');
  if (!modal) return;

  const browseBtn = document.getElementById('addGameBrowseBtn');
  const exeInput = document.getElementById('addGamePathInput');
  const titleInput = document.getElementById('addGameTitleInput');
  const procInput = document.getElementById('addGameProcInput');
  const coverInput = document.getElementById('addGameCoverInput');
  const coverPreview = document.getElementById('addGameCoverPreview');
  const saveBtn = document.getElementById('addGameSaveBtn');

  const tabProc = document.getElementById('addGameTabProc');
  const tabManual = document.getElementById('addGameTabManual');
  const secProc = document.getElementById('addGameSecProc');
  const secManual = document.getElementById('addGameSecManual');

  if (tabProc && tabManual && secProc && secManual) {
    tabProc.onclick = () => {
      tabProc.classList.add('active');
      tabManual.classList.remove('active');
      secProc.style.display = 'block';
      secManual.style.display = 'none';
      loadProcessesIntoModal();
    };
    tabManual.onclick = () => {
      tabManual.classList.add('active');
      tabProc.classList.remove('active');
      secManual.style.display = 'block';
      secProc.style.display = 'none';
    };
  }

  // Browse executable button
  if (browseBtn && window.electronAPI && window.electronAPI.openFileDialog) {
    browseBtn.onclick = async () => {
      const filePath = await window.electronAPI.openFileDialog();
      if (filePath) {
        exeInput.value = filePath;
        const filename = filePath.split(/[\\/]/).pop().replace(/\.exe$/i, '');
        if (!procInput.value) procInput.value = filename;
        if (!titleInput.value) {
          titleInput.value = filename;
          triggerCoverSearch(filename);
        }
      }
    };
  }

  // Debounced Cover Search on typing Game Title
  let searchTimeout = null;
  if (titleInput) {
    titleInput.oninput = () => {
      clearTimeout(searchTimeout);
      const name = titleInput.value.trim();
      if (name.length >= 3) {
        searchTimeout = setTimeout(() => triggerCoverSearch(name), 400);
      }
    };
  }

  async function triggerCoverSearch(name) {
    const statusEl = document.getElementById('addGameCoverStatus');
    if (statusEl) statusEl.textContent = 'Searching cover art...';
    try {
      const data = await api.searchCovers(name);
      if (data && data.coverUrl) {
        coverInput.value = data.coverUrl;
        if (coverPreview) coverPreview.style.backgroundImage = `url('${data.coverUrl}')`;
        if (statusEl) statusEl.textContent = 'Found cover art!';
      } else {
        if (statusEl) statusEl.textContent = 'No cover found online (you can paste a link).';
      }
    } catch (e) {
      if (statusEl) statusEl.textContent = '';
    }
  }

  if (coverInput && coverPreview) {
    coverInput.oninput = () => {
      coverPreview.style.backgroundImage = coverInput.value ? `url('${coverInput.value}')` : '';
    };
  }

  if (saveBtn) {
    saveBtn.onclick = async () => {
      const name = titleInput.value.trim();
      const processName = procInput.value.trim();
      const exePath = exeInput.value.trim();
      const coverUrl = coverInput.value.trim();

      if (!name) {
        toast.error('Game title is required');
        return;
      }

      try {
        await api.trackGame({ name, processName, exePath, coverUrl });
        const games = await api.getGames();
        store.set('games', games);
        closeModal('addGameModal');
        toast.success(`Tracking started for ${name}!`);

        // Reset form
        titleInput.value = '';
        procInput.value = '';
        exeInput.value = '';
        coverInput.value = '';
        if (coverPreview) coverPreview.style.backgroundImage = '';
      } catch (e) {
        toast.error('Failed to track game: ' + e.message);
      }
    };
  }

  // Load Recent Processes list
  async function loadProcessesIntoModal() {
    const listEl = document.getElementById('addGameProcessesList');
    if (!listEl) return;
    listEl.innerHTML = '<div style="color:var(--text-tertiary); padding:12px;">Loading active processes...</div>';

    try {
      const processes = await api.getProcesses();
      listEl.innerHTML = '';
      if (!processes || processes.length === 0) {
        listEl.innerHTML = '<div style="color:var(--text-tertiary); padding:12px;">No active game processes detected recently.</div>';
        return;
      }

      processes.forEach(proc => {
        const item = document.createElement('div');
        item.className = 'glass-card';
        item.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:8px 12px; margin-bottom:4px;';
        item.innerHTML = `
          <div style="min-width:0; flex:1;">
            <div style="font-weight:600; font-size:0.86rem; color:var(--text-primary);">${proc.title || proc.processName}</div>
            <div style="font-size:0.72rem; color:var(--text-tertiary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              ${proc.processName}.exe · ${proc.path || ''}
            </div>
          </div>
          <button class="btn btn-primary btn-track-proc" style="padding:4px 10px; font-size:0.75rem;">+ Track</button>
        `;

        item.querySelector('.btn-track-proc').onclick = async () => {
          const gameName = proc.title || proc.processName;
          await api.trackGame({
            name: gameName,
            processName: proc.processName,
            exePath: proc.path || '',
            coverUrl: ''
          });
          const games = await api.getGames();
          store.set('games', games);
          closeModal('addGameModal');
          toast.success(`Tracking added for ${gameName}`);
        };

        listEl.appendChild(item);
      });
    } catch (e) {
      listEl.innerHTML = '<div style="color:var(--text-tertiary);">Failed to fetch processes.</div>';
    }
  }
}
