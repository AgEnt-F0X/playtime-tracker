// ══════════════════════════════════════════════════════════
// SCREEN 3: GAME DETAIL (Hero, Heatmap, Sessions, Art Picker)
// ══════════════════════════════════════════════════════════

import { store } from '../store.js';
import { api } from '../api.js';
import { fmtDuration, fmtDate, fmtTime } from '../utils/fmt.js';
import { getArtUrl } from '../utils/art.js';
import { renderSessionRows, initSessionEditor } from '../components/session-table.js';
import { openModal, closeModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { navigate } from '../router.js';

let currentGame = null;

export const gameDetailScreen = {
  mount(gameId) {
    if (!gameId) {
      navigate('#library');
      return;
    }
    const games = store.get('games') || [];
    currentGame = games.find(g => g.id === gameId);

    if (!currentGame) {
      toast.error('Game not found in library');
      navigate('#library');
      return;
    }

    this.render();
    initSessionEditor(() => this.render());
  },

  render() {
    if (!currentGame) return;

    const sessions = (store.get('sessions') || []).filter(s => s.gameId === currentGame.id);
    const heroBannerEl = document.getElementById('detailHeroBanner');
    const titleEl = document.getElementById('detailGameTitle');
    const logoEl = document.getElementById('detailGameLogo');
    const sessionsTbody = document.getElementById('detailSessionsList');

    const heroUrl = getArtUrl(currentGame, 'hero');
    const logoUrl = getArtUrl(currentGame, 'logo');

    if (heroBannerEl) {
      heroBannerEl.style.backgroundImage = heroUrl ? `url('${heroUrl}')` : '';
    }

    if (titleEl) titleEl.textContent = currentGame.name;

    if (logoEl) {
      if (logoUrl) {
        logoEl.src = logoUrl;
        logoEl.style.display = 'block';
        logoEl.onerror = () => { logoEl.style.display = 'none'; };
      } else {
        logoEl.style.display = 'none';
      }
    }

    // Stats calculations
    let totalActiveMs = 0;
    let totalIdleMs = 0;
    sessions.forEach(s => {
      totalActiveMs += (s.activeTime || s.duration || 0);
      totalIdleMs += (s.idleTime || 0);
    });

    const statTrackerEl = document.getElementById('detailStatTracker');
    const statActiveEl = document.getElementById('detailStatActive');
    const statSteamEl = document.getElementById('detailStatSteam');
    const statCombinedEl = document.getElementById('detailStatCombined');
    const statLastEl = document.getElementById('detailStatLast');

    if (statTrackerEl) statTrackerEl.textContent = fmtDuration(currentGame.totalPlayTime || 0);
    if (statActiveEl) statActiveEl.textContent = fmtDuration(totalActiveMs);
    if (statSteamEl) {
      statSteamEl.textContent = currentGame.steamPlaytime ? fmtDuration(currentGame.steamPlaytime) : '--';
    }
    if (statCombinedEl) {
      const combined = (currentGame.totalPlayTime || 0) + (currentGame.steamPlaytime || 0);
      statCombinedEl.textContent = fmtDuration(combined);
    }
    if (statLastEl) statLastEl.textContent = fmtDate(currentGame.lastPlayed);

    // Render 30-Day Activity Heatmap
    this.renderHeatmap(sessions);

    // Render sessions table
    if (sessionsTbody) {
      renderSessionRows(sessionsTbody, sessions, [currentGame]);
    }

    // Action Buttons
    const backBtn = document.getElementById('detailBackBtn');
    if (backBtn) backBtn.onclick = () => navigate('#library');

    const changeArtBtn = document.getElementById('detailChangeArtBtn');
    if (changeArtBtn) changeArtBtn.onclick = () => this.openArtPicker();

    const untrackBtn = document.getElementById('detailUntrackBtn');
    if (untrackBtn) {
      untrackBtn.onclick = async () => {
        if (confirm(`Untrack ${currentGame.name}? It will be hidden from library but playtime is preserved.`)) {
          await api.untrackGame(currentGame.id);
          const nextGames = await api.getGames();
          store.set('games', nextGames);
          toast.info(`${currentGame.name} untracked`);
          navigate('#library');
        }
      };
    }
  },

  renderHeatmap(sessions) {
    const grid = document.getElementById('detailHeatmapGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const dayHoursMap = new Map();
    sessions.forEach(s => {
      const dateKey = new Date(s.startTime).toISOString().slice(0, 10);
      const hours = (s.activeTime || s.duration || 0) / 3600000;
      dayHoursMap.set(dateKey, (dayHoursMap.get(dateKey) || 0) + hours);
    });

    // 30 days back from today
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().slice(0, 10);
      const hours = dayHoursMap.get(dateKey) || 0;

      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';
      cell.title = `${dateKey}: ${hours.toFixed(1)} hrs`;

      // Intensity level 0 - 4
      if (hours > 0) {
        if (hours >= 4) cell.style.background = 'var(--accent)';
        else if (hours >= 2) cell.style.background = 'var(--accent-light)';
        else cell.style.background = 'var(--accent-glow-strong)';
      }

      grid.appendChild(cell);
    }
  },

  async openArtPicker() {
    if (!currentGame) return;
    const modal = document.getElementById('artPickerModal');
    const input = document.getElementById('artPickerUrlInput');
    const preview = document.getElementById('artPickerPreview');
    const resultsContainer = document.getElementById('artPickerResults');
    const saveBtn = document.getElementById('artPickerSaveBtn');

    if (input) input.value = currentGame.coverUrl || '';
    if (preview) {
      preview.style.backgroundImage = currentGame.coverUrl ? `url('${currentGame.coverUrl}')` : '';
    }

    if (input && preview) {
      input.oninput = () => {
        preview.style.backgroundImage = `url('${input.value}')`;
      };
    }

    // Load available alternative art options
    if (resultsContainer) {
      resultsContainer.innerHTML = '<div style="color:var(--text-dim); padding:12px;">Searching art candidates...</div>';
      try {
        const data = await api.searchCovers(currentGame.name);
        resultsContainer.innerHTML = '';
        const results = data.results || (data.coverUrl ? [{ url: data.coverUrl, source: 'Steam' }] : []);

        if (results.length === 0) {
          resultsContainer.innerHTML = '<div style="color:var(--text-dim);">No remote art candidates found. You can paste any image URL above.</div>';
        } else {
          results.forEach(res => {
            const thumb = document.createElement('div');
            thumb.className = 'cover-thumb-option';
            thumb.style.cssText = `
              position: relative; width: 84px; height: 118px; border-radius: 6px; cursor: pointer;
              background-size: cover; background-position: center; border: 1px solid var(--border-subtle);
              overflow: hidden; transition: transform 0.15s, border-color 0.15s; background-image: url('${res.url}');
            `;
            const badge = document.createElement('div');
            badge.className = `art-source-badge ${res.source === 'SteamGridDB' ? 'badge-sgdb' : 'badge-steam'}`;
            badge.textContent = res.source || 'Online';
            thumb.appendChild(badge);
            thumb.title = `Source: ${res.source || 'Online'}`;
            thumb.onclick = () => {
              input.value = res.url;
              preview.style.backgroundImage = `url('${res.url}')`;
            };
            resultsContainer.appendChild(thumb);
          });
        }
      } catch (e) {
        resultsContainer.innerHTML = '<div style="color:var(--text-dim);">Could not fetch art options.</div>';
      }
    }

    if (saveBtn) {
      saveBtn.onclick = async () => {
        const newCoverUrl = input.value.trim();
        await api.updateGame({ id: currentGame.id, coverUrl: newCoverUrl });
        currentGame.coverUrl = newCoverUrl;

        const games = await api.getGames();
        store.set('games', games);
        closeModal('artPickerModal');
        toast.success('Cover art updated!');
        this.render();
      };
    }

    openModal('artPickerModal');
  }
};
