// ── Game Card Component ──

import { fmtDuration } from '../utils/fmt.js';
import { getArtUrl, getFallbackGradient, getInitials } from '../utils/art.js';
import { navigate } from '../router.js';

export function createGameCard(game) {
  const wrap = document.createElement('div');
  wrap.className = 'game-card-wrap';

  const card = document.createElement('div');
  card.className = 'game-card';
  card.setAttribute('tabindex', '0');
  card.setAttribute('data-focusable', 'true');
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `${game.name}, ${fmtDuration(game.totalPlayTime)} played`);

  const coverUrl = getArtUrl(game, 'cover');
  const initials = getInitials(game.name);
  const gradient = getFallbackGradient(game.name);
  const platform = (game.platform || 'Custom').toLowerCase();

  card.innerHTML = `
    <div class="game-card-gradient-fallback" style="background:${gradient}">
      <span class="game-card-fallback-initials">${initials}</span>
    </div>
    ${coverUrl ? `
      <img class="game-card-img" src="${coverUrl}" alt="" loading="lazy" decoding="async"
        onerror="this.style.display='none';">
    ` : ''}
    <div class="game-card-overlay">
      <div class="game-card-title">${escapeHtml(game.name)}</div>
      <div class="game-card-meta">
        <span class="game-card-playtime">${fmtDuration(game.totalPlayTime, true)}</span>
        <span class="platform-pill ${platform}">${game.platform || 'Game'}</span>
      </div>
    </div>
  `;

  // Click & Enter Key Navigation
  const openDetail = () => navigate(`#game/${encodeURIComponent(game.id)}`);
  card.addEventListener('click', openDetail);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openDetail();
    }
  });

  wrap.appendChild(card);
  return wrap;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
