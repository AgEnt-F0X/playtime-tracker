// ══════════════════════════════════════════════════════════
// SCREEN 2: LIBRARY (Game Library, Filtering, Sorting)
// ══════════════════════════════════════════════════════════

import { store } from '../store.js';
import { createGameCard } from '../components/game-card.js';
import { fmtDuration, fmtRelative } from '../utils/fmt.js';
import { openModal } from '../components/modal.js';
import { navigate } from '../router.js';

let currentFilter = 'all'; // 'all' | 'steam' | 'epic' | 'custom'
let currentSort = 'recent'; // 'recent' | 'longest' | 'alpha'
let currentView = 'grid'; // 'grid' | 'list'
let searchQuery = '';
let showArchived = false;

export const libraryScreen = {
  mount() {
    this.bindToolbar();
    this.render();
  },

  bindToolbar() {
    const searchInput = document.getElementById('libSearchInput');
    const sortSelect = document.getElementById('libSortSelect');
    const viewGridBtn = document.getElementById('libViewGridBtn');
    const viewListBtn = document.getElementById('libViewListBtn');
    const addGameBtn = document.getElementById('libAddGameBtn');
    const showArchivedBtn = document.getElementById('libShowArchivedBtn');

    if (searchInput) {
      searchInput.oninput = (e) => {
        searchQuery = e.target.value.trim().toLowerCase();
        this.render();
      };
    }

    if (sortSelect) {
      sortSelect.onchange = (e) => {
        currentSort = e.target.value;
        this.render();
      };
    }

    if (viewGridBtn && viewListBtn) {
      viewGridBtn.onclick = () => {
        currentView = 'grid';
        viewGridBtn.classList.add('active');
        viewListBtn.classList.remove('active');
        this.render();
      };
      viewListBtn.onclick = () => {
        currentView = 'list';
        viewListBtn.classList.add('active');
        viewGridBtn.classList.remove('active');
        this.render();
      };
    }

    if (addGameBtn) {
      addGameBtn.onclick = () => openModal('addGameModal');
    }

    if (showArchivedBtn) {
      showArchivedBtn.onclick = () => {
        showArchived = !showArchived;
        showArchivedBtn.classList.toggle('active', showArchived);
        showArchivedBtn.textContent = showArchived ? 'Hide archived' : 'Show archived';
        this.render();
      };
    }

    // Filter Chips
    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.onclick = () => {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentFilter = chip.dataset.filter || 'all';
        this.render();
      };
    });
  },

  render() {
    const games = store.get('games') || [];
    const container = document.getElementById('libraryGamesContainer');
    const countBadge = document.getElementById('libraryCountBadge');
    if (!container) return;

    // Filter by archived
    let list = games.filter(g => showArchived ? true : !g.archived);

    // Filter by platform
    if (currentFilter !== 'all') {
      list = list.filter(g => (g.platform || '').toLowerCase() === currentFilter);
    }

    // Filter by search query
    if (searchQuery) {
      list = list.filter(g => g.name.toLowerCase().includes(searchQuery));
    }

    // Sort
    list.sort((a, b) => {
      if (currentSort === 'longest') {
        return (b.totalPlayTime || 0) - (a.totalPlayTime || 0);
      }
      if (currentSort === 'alpha') {
        return a.name.localeCompare(b.name);
      }
      // 'recent'
      const timeA = a.lastPlayed ? new Date(a.lastPlayed).getTime() : 0;
      const timeB = b.lastPlayed ? new Date(b.lastPlayed).getTime() : 0;
      return timeB - timeA;
    });

    if (countBadge) {
      countBadge.textContent = `${list.length} game${list.length === 1 ? '' : 's'}`;
    }

    container.innerHTML = '';

    if (list.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 48px 24px; text-align: center; color: var(--text-tertiary);">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin: 0 auto 12px; color: var(--text-tertiary);">
            <rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/>
            <rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>
          </svg>
          <h3 style="font-size: 0.95rem; font-weight: 600; color: var(--text-secondary);">No games found</h3>
          <p style="color: var(--text-tertiary); font-size: 0.8rem; margin-top: 4px;">Try clearing search filters or track a new game.</p>
        </div>
      `;
      return;
    }

    if (currentView === 'grid') {
      container.className = 'games-grid';
      list.forEach(game => {
        const card = createGameCard(game);
        container.appendChild(card);
      });
    } else {
      container.className = 'games-list';
      list.forEach(game => {
        const row = document.createElement('div');
        row.className = 'game-list-row';
        row.innerHTML = `
          <div class="game-list-info">
            <div class="game-list-title">${game.name}</div>
            <div class="game-list-meta">
              Last played: ${fmtRelative(game.lastPlayed)} · Platform: ${game.platform || 'Custom'}
            </div>
          </div>
          <div class="game-list-playtime">
            ${fmtDuration(game.totalPlayTime || 0)}
          </div>
        `;
        row.onclick = () => navigate(`#game/${encodeURIComponent(game.id)}`);
        container.appendChild(row);
      });
    }
  }
};
