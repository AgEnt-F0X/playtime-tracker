// ══════════════════════════════════════════════════════════
// SCREEN 6: SETTINGS & PREFERENCES
// ══════════════════════════════════════════════════════════

import { store } from '../store.js';
import { api } from '../api.js';
import { applyAccentColor, resetDefaultAccent } from '../utils/color.js';
import { toast } from '../components/toast.js';

export const settingsScreen = {
  mount() {
    this.render();
  },

  render() {
    const settings = store.get('settings') || {};
    const games = store.get('games') || [];

    // Theme selector
    const themeSelect = document.getElementById('settingsThemeSelect');
    if (themeSelect) {
      themeSelect.value = settings.theme || 'dark';
      themeSelect.onchange = (e) => {
        const theme = e.target.value;
        document.documentElement.setAttribute('data-theme', theme);
        this.saveSetting('theme', theme);
      };
    }

    // Accent Mode
    const accentModeSelect = document.getElementById('settingsAccentModeSelect');
    const customAccentRow = document.getElementById('settingsCustomAccentRow');
    const customAccentInput = document.getElementById('settingsCustomAccentInput');

    if (accentModeSelect) {
      accentModeSelect.value = settings.accentMode || 'auto';
      if (customAccentRow) {
        customAccentRow.style.display = settings.accentMode === 'fixed' ? 'flex' : 'none';
      }
      accentModeSelect.onchange = (e) => {
        const mode = e.target.value;
        if (customAccentRow) {
          customAccentRow.style.display = mode === 'fixed' ? 'flex' : 'none';
        }
        if (mode === 'fixed') {
          applyAccentColor(settings.customAccent || '#7c3aed');
        } else {
          resetDefaultAccent();
        }
        this.saveSetting('accentMode', mode);
      };
    }

    if (customAccentInput) {
      customAccentInput.value = settings.customAccent || '#7c3aed';
      customAccentInput.oninput = (e) => {
        const val = e.target.value;
        applyAccentColor(val);
        this.saveSetting('customAccent', val);
      };
    }

    // Performance Mode Toggle
    const perfToggle = document.getElementById('settingsPerfModeToggle');
    if (perfToggle) {
      perfToggle.checked = Boolean(settings.performanceMode);
      perfToggle.onchange = (e) => {
        const val = e.target.checked;
        document.documentElement.classList.toggle('perf-mode', val);
        this.saveSetting('performanceMode', val);
        toast.info(`Performance mode ${val ? 'enabled' : 'disabled'}`);
      };
    }

    // CRT Scanline Toggle
    const crtToggle = document.getElementById('settingsCrtToggle');
    if (crtToggle) {
      crtToggle.checked = Boolean(settings.crtOverlay);
      crtToggle.onchange = (e) => {
        const val = e.target.checked;
        document.body.classList.toggle('crt-enabled', val);
        this.saveSetting('crtOverlay', val);
      };
    }

    // UI Sounds Toggle
    const soundToggle = document.getElementById('settingsSoundToggle');
    if (soundToggle) {
      soundToggle.checked = Boolean(settings.uiSounds);
      soundToggle.onchange = (e) => {
        const val = e.target.checked;
        this.saveSetting('uiSounds', val);
      };
    }

    // Count AFK Time Toggle
    const afkTimeToggle = document.getElementById('settingsCountAfkToggle');
    if (afkTimeToggle) {
      afkTimeToggle.checked = Boolean(settings.countAfkAsPlaytime);
      afkTimeToggle.onchange = (e) => {
        const val = e.target.checked;
        this.saveSetting('countAfkAsPlaytime', val);
      };
    }

    // Break reminder interval
    const breakInput = document.getElementById('settingsBreakMinsInput');
    if (breakInput) {
      breakInput.value = settings.breakReminderMins || 90;
      breakInput.onchange = (e) => {
        this.saveSetting('breakReminderMins', parseInt(e.target.value) || 90);
      };
    }

    // Steam Integration Keys
    const steamKeyInput = document.getElementById('settingsSteamApiKey');
    const steamIdInput = document.getElementById('settingsSteamId');
    const saveSteamBtn = document.getElementById('settingsSaveSteamBtn');
    const syncSteamBtn = document.getElementById('settingsSyncSteamBtn');

    if (steamKeyInput) steamKeyInput.value = settings.steamApiKey || '';
    if (steamIdInput) steamIdInput.value = settings.steamId || '';

    if (saveSteamBtn) {
      saveSteamBtn.onclick = async () => {
        await this.saveSetting('steamApiKey', steamKeyInput.value.trim());
        await this.saveSetting('steamId', steamIdInput.value.trim());
        toast.success('Steam credentials saved');
      };
    }

    if (syncSteamBtn) {
      syncSteamBtn.onclick = async () => {
        try {
          syncSteamBtn.disabled = true;
          syncSteamBtn.textContent = 'Syncing...';
          const res = await api.syncSteam();
          toast.success(`Synced playtime for ${res.syncCount || 0} Steam games!`);
          const updatedGames = await api.getGames();
          store.set('games', updatedGames);
        } catch (e) {
          toast.error(e.message || 'Steam sync failed. Check your API key and Steam ID.');
        } finally {
          syncSteamBtn.disabled = false;
          syncSteamBtn.textContent = 'Sync Steam Playtime';
        }
      };
    }

    // SteamGridDB Key
    const sgdbInput = document.getElementById('settingsSgdbKey');
    const saveSgdbBtn = document.getElementById('settingsSaveSgdbBtn');
    const testSgdbBtn = document.getElementById('settingsTestSgdbBtn');
    const statusSgdbEl = document.getElementById('settingsSgdbStatus');

    if (sgdbInput) sgdbInput.value = settings.steamGridDbKey || '';
    if (saveSgdbBtn) {
      saveSgdbBtn.onclick = async () => {
        await this.saveSetting('steamGridDbKey', sgdbInput.value.trim());
        toast.success('SteamGridDB API key saved');
      };
    }
    if (testSgdbBtn) {
      testSgdbBtn.onclick = async () => {
        const key = sgdbInput ? sgdbInput.value.trim() : '';
        if (!key) {
          if (statusSgdbEl) {
            statusSgdbEl.style.color = 'var(--text-tertiary)';
            statusSgdbEl.textContent = 'Please enter an API key to test.';
          }
          return;
        }

        if (statusSgdbEl) {
          statusSgdbEl.style.color = 'var(--text-secondary)';
          statusSgdbEl.textContent = 'Testing connection...';
        }
        testSgdbBtn.disabled = true;

        try {
          const res = await api.testSteamGridDB(key);
          if (res.ok) {
            if (statusSgdbEl) {
              statusSgdbEl.style.color = 'var(--green)';
              statusSgdbEl.textContent = '✓ ' + (res.message || 'Key verified successfully!');
            }
          } else {
            if (statusSgdbEl) {
              statusSgdbEl.style.color = res.status === 401 ? 'var(--red, #f87171)' : 'var(--gold, #fbbf24)';
              statusSgdbEl.textContent = '✗ ' + (res.message || 'Verification failed');
            }
          }
        } catch (e) {
          if (statusSgdbEl) {
            statusSgdbEl.style.color = 'var(--red, #f87171)';
            statusSgdbEl.textContent = '✗ Network error: ' + e.message;
          }
        } finally {
          testSgdbBtn.disabled = false;
        }
      };
    }

    // Clear Art Cache
    const clearArtBtn = document.getElementById('settingsClearArtBtn');
    if (clearArtBtn) {
      clearArtBtn.onclick = async () => {
        if (confirm('Clear all cached art thumbnails from disk?')) {
          await api.clearArtCache();
          toast.success('Art cache cleared');
        }
      };
    }

    // Render Archived Apps/Games List
    this.renderArchivedList(games);
  },

  renderArchivedList(games) {
    const listEl = document.getElementById('settingsArchivedList');
    if (!listEl) return;
    const archived = games.filter(g => g.archived);

    if (archived.length === 0) {
      listEl.innerHTML = '<div style="color:var(--text-dim); padding:10px 0;">No archived or untracked games.</div>';
      return;
    }

    listEl.innerHTML = '';
    archived.forEach(g => {
      const item = document.createElement('div');
      item.className = 'glass-card';
      item.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:10px 14px; margin-bottom:6px;';
      item.innerHTML = `
        <div>
          <strong>${g.name}</strong>
          <span style="font-size:0.75rem; color:var(--text-muted); margin-left:8px;">${g.platform || 'Custom'}</span>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-secondary btn-restore" style="padding:4px 10px; font-size:0.75rem;">Restore</button>
          <button class="btn btn-danger btn-del-perm" style="padding:4px 10px; font-size:0.75rem;">Delete</button>
        </div>
      `;

      item.querySelector('.btn-restore').onclick = async () => {
        await api.restoreGame(g.id);
        const updated = await api.getGames();
        store.set('games', updated);
        toast.success(`Restored ${g.name}`);
        this.render();
      };

      item.querySelector('.btn-del-perm').onclick = async () => {
        if (confirm(`Permanently remove ${g.name} and all its session records?`)) {
          await api.deleteGamePermanently(g.id);
          const updated = await api.getGames();
          store.set('games', updated);
          toast.info(`Deleted ${g.name}`);
          this.render();
        }
      };

      listEl.appendChild(item);
    });
  },

  async saveSetting(key, val) {
    const cur = store.get('settings') || {};
    const updated = { ...cur, [key]: val };
    store.set('settings', updated);
    await api.saveSettings(updated);
  }
};
