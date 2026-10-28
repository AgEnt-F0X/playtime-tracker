// ── Command Palette (Ctrl+K) Component ──

import { store } from '../store.js';
import { navigate } from '../router.js';
import { openModal, closeModal } from './modal.js';
import { api } from '../api.js';
import { toast } from './toast.js';

export function initCommandPalette() {
  const modalEl = document.getElementById('commandPaletteModal');
  const inputEl = document.getElementById('paletteSearchInput');
  const resultsEl = document.getElementById('paletteResults');

  if (!modalEl || !inputEl || !resultsEl) return;

  function getBaseCommands() {
    return [
      { id: 'nav-home', label: 'Go to dashboard', shortcut: '1', action: () => navigate('#home') },
      { id: 'nav-lib', label: 'Go to library', shortcut: '2', action: () => navigate('#library') },
      { id: 'nav-hist', label: 'Go to session history', shortcut: '3', action: () => navigate('#history') },
      { id: 'nav-stats', label: 'Go to analytics', shortcut: '4', action: () => navigate('#stats') },
      { id: 'nav-achieve', label: 'Go to achievements & goals', shortcut: '5', action: () => navigate('#achievements') },
      { id: 'nav-settings', label: 'Go to settings', shortcut: '6', action: () => navigate('#settings') },
      { id: 'act-add', label: 'Add game (processes or executable)', shortcut: 'N', action: () => openModal('addGameModal') },
      { id: 'act-scan', label: 'Scan for installed games', shortcut: 'S', action: async () => {
        toast.info('Scanning for games...');
        await api.scanGames();
        const games = await api.getGames();
        store.set('games', games);
        toast.success(`Scan complete (${games.length} total games)`);
      }},
      { id: 'act-afk', label: 'Toggle AFK mode', shortcut: 'Ctrl+Shift+F9', action: async () => {
        await api.toggleAfk();
      }},
      { id: 'act-overlay', label: 'Toggle mini session timer overlay', shortcut: 'O', action: () => {
        if (window.electronAPI && window.electronAPI.toggleMiniOverlay) {
          window.electronAPI.toggleMiniOverlay();
        } else {
          toast.info('Mini overlay is available in desktop app mode.');
        }
      }},
      { id: 'act-perf', label: 'Toggle performance mode', shortcut: 'P', action: () => {
        const isPerf = document.documentElement.classList.toggle('perf-mode');
        toast.info(`Performance mode ${isPerf ? 'enabled' : 'disabled'}`);
      }},
      { id: 'act-crt', label: 'Toggle CRT scanline overlay', shortcut: 'C', action: () => {
        const isCrt = document.body.classList.toggle('crt-enabled');
        toast.info(`CRT scanlines ${isCrt ? 'enabled' : 'disabled'}`);
      }}
    ];
  }

  function renderPaletteItems(items) {
    resultsEl.innerHTML = '';
    if (!items || items.length === 0) {
      resultsEl.innerHTML = '<div style="padding: 14px; text-align: center; color: var(--text-tertiary); font-size: 0.82rem;">No matching commands or games found.</div>';
      return;
    }

    items.forEach((item, index) => {
      const div = document.createElement('div');
      div.className = `palette-item ${index === 0 ? 'active' : ''}`;
      div.setAttribute('data-index', index);
      div.innerHTML = `
        <span style="font-weight: 500;">${item.label}</span>
        ${item.shortcut ? `<span class="palette-item-shortcut">${item.shortcut}</span>` : ''}
      `;
      div.addEventListener('click', () => {
        closeModal('commandPaletteModal');
        item.action();
      });
      resultsEl.appendChild(div);
    });
  }

  function updateFilter() {
    const query = inputEl.value.trim().toLowerCase();
    const base = getBaseCommands();
    const games = store.get('games') || [];

    // Add game navigation entries
    const gameItems = games.map(g => ({
      id: `game-${g.id}`,
      label: `Open game: ${g.name}`,
      shortcut: 'ENTER',
      action: () => navigate(`#game/${encodeURIComponent(g.id)}`)
    }));

    const all = [...base, ...gameItems];
    const filtered = query ? all.filter(c => c.label.toLowerCase().includes(query)) : all;
    renderPaletteItems(filtered.slice(0, 10));
  }

  inputEl.addEventListener('input', updateFilter);

  // Keyboard navigation within list
  inputEl.addEventListener('keydown', (e) => {
    const items = Array.from(resultsEl.querySelectorAll('.palette-item'));
    if (!items.length) return;

    let activeIdx = items.findIndex(el => el.classList.contains('active'));

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[activeIdx]?.classList.remove('active');
      activeIdx = (activeIdx + 1) % items.length;
      items[activeIdx]?.classList.add('active');
      items[activeIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[activeIdx]?.classList.remove('active');
      activeIdx = (activeIdx - 1 + items.length) % items.length;
      items[activeIdx]?.classList.add('active');
      items[activeIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      items[activeIdx]?.click();
    }
  });

  // Global Ctrl+K / Cmd+K
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (modalEl.classList.contains('open')) {
        closeModal('commandPaletteModal');
      } else {
        openModal('commandPaletteModal');
        inputEl.value = '';
        updateFilter();
        inputEl.focus();
      }
    }
  });
}
