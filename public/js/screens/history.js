// ══════════════════════════════════════════════════════════
// SCREEN: SESSION HISTORY (Grouped by Day, Filters, Edit/Delete)
// ══════════════════════════════════════════════════════════

import { store } from '../store.js';
import { api } from '../api.js';
import { fmtDuration, fmtDate, fmtTime } from '../utils/fmt.js';
import { getArtUrl, getFallbackGradient, getInitials } from '../utils/art.js';
import { openEditSessionModal, initSessionEditor } from '../components/session-table.js';
import { toast } from '../components/toast.js';

let filterGameId = 'all';
let filterDateRange = 'all';
let searchQuery = '';
let displayLimit = 200;

export const historyScreen = {
  async mount() {
    this.bindFilters();
    try {
      const res = await fetch('/api/sessions');
      if (res.ok) {
        const data = await res.json();
        store.set('sessions', data);
      }
    } catch (e) {
      console.error('Failed to fetch /api/sessions:', e);
      store.set('sessions', []);
    }
    this.render();
    initSessionEditor(() => this.render());
  },

  bindFilters() {
    const gameSelect = document.getElementById('historyGameFilter');
    const dateSelect = document.getElementById('historyDateFilter');
    const searchInput = document.getElementById('historySearchInput');

    if (gameSelect) {
      // Populate game options
      const games = store.get('games') || [];
      const currentVal = gameSelect.value || 'all';
      gameSelect.innerHTML = '<option value="all">All games</option>';
      const sortedGames = [...games].sort((a, b) => a.name.localeCompare(b.name));
      sortedGames.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.id;
        opt.textContent = g.name;
        gameSelect.appendChild(opt);
      });
      gameSelect.value = currentVal;
      gameSelect.onchange = (e) => {
        filterGameId = e.target.value;
        this.render();
      };
    }

    if (dateSelect) {
      dateSelect.onchange = (e) => {
        filterDateRange = e.target.value;
        this.render();
      };
    }

    if (searchInput) {
      searchInput.oninput = (e) => {
        searchQuery = e.target.value.trim().toLowerCase();
        this.render();
      };
    }
  },

  filterSessions(sessions, gamesMap) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const sevenDaysAgo = todayStart - 6 * 86400000;
    const thirtyDaysAgo = todayStart - 29 * 86400000;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    return (sessions || []).filter(s => {
      // 1. Game filter
      if (filterGameId !== 'all' && s.gameId !== filterGameId) {
        return false;
      }

      const game = gamesMap.get(s.gameId);
      const gameName = game ? game.name.toLowerCase() : '';

      // 2. Search query filter
      if (searchQuery && !gameName.includes(searchQuery)) {
        return false;
      }

      // 3. Date range filter
      if (filterDateRange !== 'all') {
        const time = new Date(s.startTime).getTime();
        if (filterDateRange === 'today' && time < todayStart) return false;
        if (filterDateRange === '7d' && time < sevenDaysAgo) return false;
        if (filterDateRange === '30d' && time < thirtyDaysAgo) return false;
        if (filterDateRange === 'month' && time < monthStart) return false;
      }

      return true;
    });
  },

  render() {
    const games = store.get('games') || [];
    const allSessions = store.get('sessions') || [];
    const container = document.getElementById('historyDaysContainer');
    const summaryBadge = document.getElementById('historySummaryBadge');
    if (!container) return;

    const gamesMap = new Map(games.map(g => [g.id, g]));
    const filtered = this.filterSessions(allSessions, gamesMap);

    // Summary calculation
    let totalMs = 0;
    filtered.forEach(s => { totalMs += (s.activeTime || s.duration || 0); });
    if (summaryBadge) {
      summaryBadge.textContent = `${filtered.length} session${filtered.length === 1 ? '' : 's'} · ${fmtDuration(totalMs)}`;
    }

    container.innerHTML = '';

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state-card">
          <p style="color: var(--text-secondary); font-size: 0.95rem;">No sessions found</p>
          <p style="color: var(--text-tertiary); font-size: 0.82rem; margin-top: 4px;">Play a game or clear the filter criteria above.</p>
        </div>
      `;
      return;
    }

    // Limit to displayLimit (default 200)
    const limited = filtered.slice(0, displayLimit);

    // Group by Calendar Day
    const dayGroups = new Map();
    limited.forEach(s => {
      const date = new Date(s.startTime);
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      if (!dayGroups.has(dateKey)) {
        dayGroups.set(dateKey, {
          date,
          sessions: [],
          totalDuration: 0,
          totalActive: 0
        });
      }
      const group = dayGroups.get(dateKey);
      group.sessions.push(s);
      group.totalDuration += (s.duration || 0);
      group.totalActive += (s.activeTime || s.duration || 0);
    });

    const now = new Date();
    const todayStr = now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();

    dayGroups.forEach((group) => {
      const dayWrapper = document.createElement('div');
      dayWrapper.className = 'history-day-group';

      let dayTitle = group.date.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });

      if (group.date.toDateString() === todayStr) {
        dayTitle = 'Today';
      } else if (group.date.toDateString() === yesterdayStr) {
        dayTitle = 'Yesterday';
      }

      dayWrapper.innerHTML = `
        <div class="history-day-header">
          <div class="history-day-title">${dayTitle}</div>
          <div class="history-day-summary">
            ${group.sessions.length} session${group.sessions.length === 1 ? '' : 's'} · ${fmtDuration(group.totalActive)} active
          </div>
        </div>
        <div class="history-table-wrapper">
          <table class="session-history-table">
            <thead>
              <tr>
                <th style="width: 28%;">Game</th>
                <th style="width: 14%;">Started</th>
                <th style="width: 14%;">Ended</th>
                <th style="width: 14%;">Total</th>
                <th style="width: 14%;">Active</th>
                <th style="width: 10%;">Idle</th>
                <th style="width: 6%; text-align: right;"></th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      `;

      const tbody = dayWrapper.querySelector('tbody');

      group.sessions.forEach(s => {
        const game = gamesMap.get(s.gameId);
        const gameName = game ? game.name : 'Unknown Game';
        const coverUrl = game ? getArtUrl(game, 'cover') : '';
        const initials = getInitials(gameName);
        const gradient = getFallbackGradient(gameName);

        const startDate = new Date(s.startTime);
        const endDate = new Date(s.endTime);
        const rollover = startDate.toDateString() !== endDate.toDateString();

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>
            <div class="table-game-cell">
              <div class="table-game-thumb-container" style="position:relative; width:26px; height:36px; border-radius:3px; overflow:hidden; flex-shrink:0;">
                <div class="table-game-thumb-fallback" style="background:${gradient}; width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:0.65rem; font-weight:700; color:rgba(255,255,255,0.7);">${initials}</div>
                ${coverUrl ? `
                  <img class="table-game-thumb" src="${coverUrl}" alt="" loading="lazy" decoding="async"
                    style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover;"
                    onerror="this.style.display='none';">
                ` : ''}
              </div>
              <span class="table-game-name">${gameName}</span>
            </div>
          </td>
          <td class="cell-time">${fmtTime(s.startTime)}</td>
          <td class="cell-time">
            ${fmtTime(s.endTime)}
            ${rollover ? '<span class="rollover-pill">+1d</span>' : ''}
          </td>
          <td class="cell-duration">${fmtDuration(s.duration)}</td>
          <td class="cell-active">${fmtDuration(s.activeTime || s.duration)}</td>
          <td class="cell-idle">${s.idleTime ? fmtDuration(s.idleTime) : '—'}</td>
          <td style="text-align: right;">
            <div class="table-actions">
              <button class="action-btn edit-btn" title="Edit session" data-id="${s.id}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                </svg>
              </button>
              <button class="action-btn delete-btn" title="Delete session" data-id="${s.id}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            </div>
          </td>
        `;

        // Edit
        tr.querySelector('.edit-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          openEditSessionModal(s);
        });

        // Delete
        tr.querySelector('.delete-btn').addEventListener('click', async (e) => {
          e.stopPropagation();
          if (confirm(`Delete this ${fmtDuration(s.duration)} session for ${gameName}?`)) {
            try {
              await api.deleteSession(s.id);
              const updated = (store.get('sessions') || []).filter(item => item.id !== s.id);
              store.set('sessions', updated);
              const updatedGames = await api.getGames();
              store.set('games', updatedGames);
              toast.success('Session deleted');
              this.render();
            } catch (err) {
              toast.error('Failed to delete session');
            }
          }
        });

        tbody.appendChild(tr);
      });

      container.appendChild(dayWrapper);
    });

    // "Show More" Button if capped
    if (filtered.length > displayLimit) {
      const showMoreWrap = document.createElement('div');
      showMoreWrap.style.cssText = 'display:flex; justify-content:center; padding: 24px 0;';
      const showMoreBtn = document.createElement('button');
      showMoreBtn.className = 'btn btn-secondary';
      showMoreBtn.textContent = `Show more sessions (${displayLimit} of ${filtered.length})`;
      showMoreBtn.onclick = () => {
        displayLimit += 100;
        this.render();
      };
      showMoreWrap.appendChild(showMoreBtn);
      container.appendChild(showMoreWrap);
    }
  }
};
