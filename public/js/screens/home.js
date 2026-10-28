// ══════════════════════════════════════════════════════════
// SCREEN 1: HOME (Dashboard, Activity Motion Transitions)
// ══════════════════════════════════════════════════════════

import { store } from '../store.js';
import { fmtDuration, fmtRelative } from '../utils/fmt.js';
import { getArtUrl, getFallbackGradient, getInitials } from '../utils/art.js';
import { renderTimerRing } from '../components/timer-ring.js';
import { createGameCard } from '../components/game-card.js';
import { extractDominantColor, applyAccentColor } from '../utils/color.js';
import { navigate } from '../router.js';
import { api } from '../api.js';

let heroTimerInterval = null;
let currentSortMode = 'most-played'; // 'most-played' | 'recently-played'
let activeChartAnimations = [];
let activeListAnimations = [];
let activeTickerRafs = [];

export const homeScreen = {
  mount() {
    this.bindSortToggle();
    this.render();
  },

  bindSortToggle() {
    const mostBtn = document.getElementById('homeSegMostPlayed');
    const recentBtn = document.getElementById('homeSegRecentlyPlayed');
    if (!mostBtn || !recentBtn) return;

    window.addEventListener('resize', () => {
      const activeBtn = currentSortMode === 'most-played' ? mostBtn : recentBtn;
      updateSegThumb(activeBtn);
    });

    requestAnimationFrame(() => {
      const activeBtn = currentSortMode === 'most-played' ? mostBtn : recentBtn;
      updateSegThumb(activeBtn);
    });

    mostBtn.onclick = () => {
      if (currentSortMode === 'most-played') return;
      mostBtn.classList.add('active');
      recentBtn.classList.remove('active');
      currentSortMode = 'most-played';
      updateSegThumb(mostBtn);
      this.switchActivityView('most-played');
    };

    recentBtn.onclick = () => {
      if (currentSortMode === 'recently-played') return;
      recentBtn.classList.add('active');
      mostBtn.classList.remove('active');
      currentSortMode = 'recently-played';
      updateSegThumb(recentBtn);
      this.switchActivityView('recently-played');
    };
  },

  render() {
    const games = store.get('games') || [];
    const sessions = store.get('sessions') || [];
    const activeSession = store.get('activeSession');

    this.renderHero(activeSession, games);
    this.renderActivity(false); // initial render without exit animation
    this.renderCarousel(games);
    this.renderStatsStrip(sessions);
    this.updateBackdrop(activeSession, games);
  },

  updateBackdrop(activeSession, games) {
    const backdropEl = document.getElementById('heroBackdrop');
    const wallEl = document.getElementById('atmos');
    if (!backdropEl) return;

    let targetGame = null;
    if (activeSession && activeSession.gameId) {
      targetGame = games.find(g => g.id === activeSession.gameId);
    }

    if (targetGame) {
      const heroUrl = getArtUrl(targetGame, 'hero');
      backdropEl.style.backgroundImage = `url('${heroUrl}')`;
      backdropEl.style.opacity = '0.22';
      if (wallEl) wallEl.classList.add('dimmed');

      const settings = store.get('settings') || {};
      if (settings.accentMode !== 'fixed') {
        const coverUrl = getArtUrl(targetGame, 'cover');
        extractDominantColor(coverUrl).then(hex => {
          if (hex) applyAccentColor(hex);
        });
      }
    } else {
      backdropEl.style.opacity = '0';
      if (wallEl) wallEl.classList.remove('dimmed');
    }
  },

  renderHero(activeSession, games) {
    const heroCard = document.getElementById('homeHeroCard');
    if (!heroCard) return;

    if (heroTimerInterval) {
      clearInterval(heroTimerInterval);
      heroTimerInterval = null;
    }

    if (activeSession && activeSession.gameId) {
      const game = games.find(g => g.id === activeSession.gameId) || { name: activeSession.gameName || 'Active game' };
      const isIdle = activeSession.isIdle || activeSession.isManualAfk;
      const logoUrl = getArtUrl(game, 'logo');

      heroCard.innerHTML = `
        <div class="home-hero-info">
          <div class="hero-status-tag">
            <span class="pulsing-indicator" style="background:${isIdle ? 'var(--gold)' : 'var(--green)'}; box-shadow:0 0 6px ${isIdle ? 'var(--gold)' : 'var(--green)'};"></span>
            <span style="color:${isIdle ? 'var(--gold)' : 'var(--green)'};">${isIdle ? (activeSession.isManualAfk ? 'Manual AFK' : 'Idle detected') : 'Playing now'}</span>
          </div>
          ${logoUrl ? `<img src="${logoUrl}" alt="" style="max-height:60px; max-width:200px; object-fit:contain; margin-bottom:4px;" onerror="this.style.display='none'">` : ''}
          <h1 class="home-hero-title">${game.name}</h1>
          <div class="home-hero-meta">
            <span>Active: <strong style="color:var(--green);">${fmtDuration(activeSession.activeTime || 0)}</strong></span>
            <span>Idle: <strong style="color:var(--gold);">${fmtDuration(activeSession.currentIdleTime || 0)}</strong></span>
            <span>Lifetime: <strong>${fmtDuration(game.totalPlayTime || 0)}</strong></span>
          </div>
          <div class="home-hero-actions">
            <button class="btn btn-afk ${activeSession.isManualAfk ? 'active' : ''}" id="heroAfkToggleBtn">
              ${activeSession.isManualAfk ? 'Resume (Exit AFK)' : 'Pause (AFK)'}
            </button>
            <button class="btn btn-secondary" id="heroDetailBtn">Game details</button>
          </div>
        </div>
        <div class="home-hero-timer-side">
          <div id="heroTimerRingWrap"></div>
        </div>
      `;

      heroCard.querySelector('#heroAfkToggleBtn').addEventListener('click', async () => {
        await api.toggleAfk();
      });

      heroCard.querySelector('#heroDetailBtn').addEventListener('click', () => {
        navigate(`#game/${encodeURIComponent(game.id)}`);
      });

      const ringWrap = heroCard.querySelector('#heroTimerRingWrap');
      let liveActive = activeSession.activeTime || 0;
      let liveIdle = activeSession.currentIdleTime || 0;
      renderTimerRing(ringWrap, liveActive, liveIdle, isIdle);

      heroTimerInterval = setInterval(() => {
        const cur = store.get('activeSession');
        if (cur && cur.gameId === activeSession.gameId) {
          if (cur.isIdle || cur.isManualAfk) {
            liveIdle += 1000;
          } else {
            liveActive += 1000;
          }
          renderTimerRing(ringWrap, liveActive, liveIdle, cur.isIdle || cur.isManualAfk);
        }
      }, 1000);

    } else {
      const played = games.filter(g => g.lastPlayed && !g.archived);
      played.sort((a, b) => new Date(b.lastPlayed) - new Date(a.lastPlayed));
      const lastGame = played[0];

      heroCard.innerHTML = `
        <div class="home-hero-info">
          <div class="hero-status-tag">
            <span style="width:7px; height:7px; border-radius:50%; background:var(--text-tertiary);"></span>
            <span style="color:var(--text-tertiary);">Ready to track</span>
          </div>
          <h1 class="home-hero-title">No game active</h1>
          <div class="home-hero-meta">
            ${lastGame ? `Last played: <strong style="color:var(--text-primary);">${lastGame.name}</strong> (${fmtRelative(lastGame.lastPlayed)})` : 'Launch any game to track playtime automatically.'}
          </div>
          <div class="home-hero-actions">
            <button class="btn btn-primary" id="heroBrowseLibBtn">Browse library</button>
            <button class="btn btn-secondary" id="heroAddGameBtn">+ Add game</button>
          </div>
        </div>
        <div class="home-hero-timer-side">
          <div id="heroTimerRingWrap"></div>
        </div>
      `;

      heroCard.querySelector('#heroBrowseLibBtn').addEventListener('click', () => navigate('#library'));
      heroCard.querySelector('#heroAddGameBtn').addEventListener('click', () => {
        const modal = document.getElementById('addGameModal');
        if (modal) modal.classList.add('open');
      });

      renderTimerRing(heroCard.querySelector('#heroTimerRingWrap'), 0, 0, false);
    }
  },

  // ── Activity Section Motion Transitions (Chart & List) ──
  switchActivityView(newMode) {
    cancelInFlightAnimations();

    const chartContainer = document.getElementById('homeChartContainer');
    const subtitleEl = document.getElementById('homeActivitySubtitle');
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isPerfMode = document.documentElement.classList.contains('perf-mode') || document.body.classList.contains('perf-mode');

    // Subtitle crossfade
    if (subtitleEl) {
      const newSub = newMode === 'most-played'
        ? 'Top 8 games by total playtime'
        : '14-day activity breakdown by day';
      const anim = subtitleEl.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' });
      anim.onfinish = () => {
        subtitleEl.textContent = newSub;
        subtitleEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, fill: 'forwards' });
      };
      activeChartAnimations.push(anim);
    }

    // Chart two-phase transition
    const outgoingBars = Array.from(chartContainer ? chartContainer.querySelectorAll('rect.chart-fill') : []);
    const outgoingLabels = Array.from(chartContainer ? chartContainer.querySelectorAll('.chart-label, .chart-val, .activity-chart-title') : []);

    if (outgoingBars.length === 0 || prefersReducedMotion) {
      if (chartContainer && prefersReducedMotion) {
        chartContainer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100, fill: 'forwards' }).onfinish = () => {
          this.renderActivity(true);
          chartContainer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 100, fill: 'forwards' });
        };
      } else {
        this.renderActivity(true);
      }
      return;
    }

    // Phase 1: Outgoing bars shrink out (~140ms)
    // If newMode is 'recently-played', outgoing was 'most-played' (horizontal: scaleX)
    const wasHorizontal = newMode === 'recently-played';
    const shrinkKeyframes = wasHorizontal
      ? [{ transform: 'scaleX(1)', opacity: 1 }, { transform: 'scaleX(0)', opacity: 0 }]
      : [{ transform: 'scaleY(1)', opacity: 1 }, { transform: 'scaleY(0)', opacity: 0 }];

    const phase1Anims = [];

    outgoingBars.forEach(bar => {
      const anim = bar.animate(shrinkKeyframes, {
        duration: 140,
        easing: 'cubic-bezier(0.4, 0, 1, 1)',
        fill: 'forwards'
      });
      phase1Anims.push(anim);
      activeChartAnimations.push(anim);
    });

    outgoingLabels.forEach(label => {
      const anim = label.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 120,
        fill: 'forwards'
      });
      phase1Anims.push(anim);
      activeChartAnimations.push(anim);
    });

    Promise.all(phase1Anims.map(a => a.finished.catch(() => {}))).then(() => {
      this.renderActivity(true);
    });
  },

  renderActivity(animate = false) {
    const chartContainer = document.getElementById('homeChartContainer');
    const listContainer = document.getElementById('homeToggleListContainer');
    if (!chartContainer || !listContainer) return;

    const games = (store.get('games') || []).filter(g => !g.archived);
    const sessions = store.get('sessions') || [];
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isPerfMode = document.documentElement.classList.contains('perf-mode') || document.body.classList.contains('perf-mode');

    // 1. Render Chart Phase 2
    if (currentSortMode === 'most-played') {
      this.renderMostPlayedChart(chartContainer, games, animate, isPerfMode, prefersReducedMotion);
    } else {
      this.renderRecentlyPlayedChart(chartContainer, sessions, animate, isPerfMode, prefersReducedMotion);
    }

    // 2. Render List with FLIP Animation
    this.renderFLIPList(listContainer, games, sessions, animate, isPerfMode, prefersReducedMotion);
  },

  renderMostPlayedChart(container, games, animate, isPerfMode, prefersReducedMotion) {
    const sorted = [...games].sort((a, b) => (b.totalPlayTime || 0) - (a.totalPlayTime || 0)).slice(0, 8);
    const maxMs = sorted[0] ? (sorted[0].totalPlayTime || 1) : 1;

    const rowHeight = 26;
    const svgHeight = Math.max(180, sorted.length * rowHeight + 10);
    let barsSvg = '';

    sorted.forEach((g, idx) => {
      const y = idx * rowHeight + 4;
      const pct = Math.max(4, Math.round(((g.totalPlayTime || 0) / maxMs) * 100));
      const hoursStr = fmtDuration(g.totalPlayTime || 0);

      barsSvg += `
        <g class="chart-bar-group" data-id="${g.id}">
          <text class="chart-label" x="0" y="${y + 11}" fill="var(--text-primary)" font-size="10.5" font-weight="600">${idx + 1}. ${escapeXml(g.name)}</text>
          <rect class="chart-track" x="0" y="${y + 16}" width="100%" height="4" rx="2" fill="rgba(255, 255, 255, 0.05)"></rect>
          <rect class="chart-fill" x="0" y="${y + 16}" width="${pct}%" height="4" rx="2" fill="var(--accent)"></rect>
          <text class="chart-val" x="100%" y="${y + 11}" text-anchor="end" fill="var(--text-secondary)" font-size="10.5" font-variant-numeric="tabular-nums">${hoursStr}</text>
        </g>
      `;
    });

    container.innerHTML = `
      <div class="activity-chart-title">Playtime distribution</div>
      <div class="activity-chart-svg-wrap">
        <svg class="activity-chart-svg" viewBox="0 0 460 ${svgHeight}" preserveAspectRatio="none">
          ${barsSvg || '<text x="50%" y="40" text-anchor="middle" fill="var(--text-tertiary)" font-size="12">No games tracked yet</text>'}
        </svg>
      </div>
    `;

    container.querySelectorAll('.chart-bar-group').forEach(el => {
      el.onclick = () => navigate(`#game/${encodeURIComponent(el.dataset.id)}`);
    });

    if (animate && !prefersReducedMotion) {
      const titleEl = container.querySelector('.activity-chart-title');
      if (titleEl) {
        titleEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, fill: 'forwards' });
      }

      container.querySelectorAll('.chart-label, .chart-val').forEach(el => {
        const a = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: 'ease-out', fill: 'forwards' });
        activeChartAnimations.push(a);
      });

      // Staggered grow-in from left (~280ms)
      container.querySelectorAll('rect.chart-fill').forEach((rect, idx) => {
        const a = rect.animate([
          { transform: 'scaleX(0)', opacity: 0.2 },
          { transform: 'scaleX(1)', opacity: 1 }
        ], {
          duration: 280,
          delay: isPerfMode ? 0 : idx * 35,
          easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
          fill: 'forwards'
        });
        activeChartAnimations.push(a);
      });
    }
  },

  renderRecentlyPlayedChart(container, sessions, animate, isPerfMode, prefersReducedMotion) {
    const now = new Date();
    const dayData = [];

    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const start = d.getTime();
      const end = start + 86400000;

      let activeMs = 0;
      const playedGames = new Set();

      sessions.forEach(s => {
        const t = new Date(s.startTime).getTime();
        if (t >= start && t < end) {
          activeMs += (s.activeTime || s.duration || 0);
          if (s.gameId) playedGames.add(s.gameId);
        }
      });

      dayData.push({
        date: d,
        activeMs,
        totalHours: activeMs / 3600000,
        gamesCount: playedGames.size
      });
    }

    const maxDayHours = Math.max(1, ...dayData.map(d => d.totalHours));
    const chartHeight = 150;
    const barWidth = 18;
    const gap = 12;
    const totalW = 14 * (barWidth + gap) + 12;

    let barsSvg = '';
    dayData.forEach((d, idx) => {
      const x = idx * (barWidth + gap) + 8;
      const h = Math.max(d.totalHours > 0 ? 4 : 0, Math.round((d.totalHours / maxDayHours) * chartHeight));
      const y = chartHeight - h + 10;
      const dayLabel = idx === 13 ? 'Today' : d.date.toLocaleDateString(undefined, { weekday: 'narrow' });
      const dateStr = d.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

      barsSvg += `
        <g class="timeline-bar-group">
          <rect class="chart-track" x="${x}" y="10" width="${barWidth}" height="${chartHeight}" rx="3" fill="rgba(255, 255, 255, 0.04)"></rect>
          <rect class="chart-fill" x="${x}" y="${y}" width="${barWidth}" height="${h}" rx="3" fill="var(--accent)" opacity="0.9">
            <title>${dateStr}: ${d.totalHours.toFixed(1)}h (${d.gamesCount} games)</title>
          </rect>
          <text class="chart-label" x="${x + barWidth / 2}" y="${chartHeight + 25}" text-anchor="middle" fill="var(--text-tertiary)" font-size="9.5" font-variant-numeric="tabular-nums">${dayLabel}</text>
        </g>
      `;
    });

    container.innerHTML = `
      <div class="activity-chart-title">Active hours per day (14 days)</div>
      <div class="activity-chart-svg-wrap">
        <svg class="activity-chart-svg" viewBox="0 0 ${totalW} ${chartHeight + 35}">
          ${barsSvg}
        </svg>
      </div>
    `;

    if (animate && !prefersReducedMotion) {
      const titleEl = container.querySelector('.activity-chart-title');
      if (titleEl) {
        titleEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, fill: 'forwards' });
      }

      container.querySelectorAll('.chart-label').forEach(el => {
        const a = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: 'ease-out', fill: 'forwards' });
        activeChartAnimations.push(a);
      });

      // Staggered grow-in from bottom (~280ms)
      container.querySelectorAll('rect.chart-fill').forEach((rect, idx) => {
        const a = rect.animate([
          { transform: 'scaleY(0)', opacity: 0.2 },
          { transform: 'scaleY(1)', opacity: 1 }
        ], {
          duration: 280,
          delay: isPerfMode ? 0 : idx * 25,
          easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
          fill: 'forwards'
        });
        activeChartAnimations.push(a);
      });
    }
  },

  renderFLIPList(listContainer, games, sessions, animate, isPerfMode, prefersReducedMotion) {
    // 1. Record First positions
    const oldRects = new Map();
    listContainer.querySelectorAll('.top-game-row').forEach(row => {
      if (row.dataset.id) {
        oldRects.set(row.dataset.id, row.getBoundingClientRect());
      }
    });

    // 2. Determine target game dataset
    let targetGames = [];
    if (currentSortMode === 'most-played') {
      targetGames = [...games].sort((a, b) => (b.totalPlayTime || 0) - (a.totalPlayTime || 0)).slice(0, 8);
    } else {
      targetGames = [...games]
        .filter(g => g.lastPlayed)
        .sort((a, b) => new Date(b.lastPlayed) - new Date(a.lastPlayed))
        .slice(0, 8);
    }

    listContainer.innerHTML = '';

    if (!targetGames.length) {
      listContainer.innerHTML = '<div style="color:var(--text-tertiary); padding:16px; font-size:0.82rem;">No games recorded yet.</div>';
      return;
    }

    // 3. Render new elements with robust cover fallbacks
    targetGames.forEach((g, idx) => {
      const item = document.createElement('div');
      item.className = 'top-game-row';
      item.dataset.id = g.id;

      const coverUrl = getArtUrl(g, 'cover');
      const initials = getInitials(g.name);
      const gradient = getFallbackGradient(g.name);

      const rankHtml = currentSortMode === 'most-played'
        ? `<span class="top-game-rank">${idx + 1}</span>`
        : `<span class="top-game-rank"><span style="width:5px; height:5px; border-radius:50%; background:var(--green); display:inline-block;"></span></span>`;

      const metaText = currentSortMode === 'most-played'
        ? (g.platform || 'Custom')
        : fmtRelative(g.lastPlayed);

      item.innerHTML = `
        ${rankHtml}
        <div class="top-game-thumb-container">
          <div class="top-game-thumb-fallback" style="background:${gradient};">${initials}</div>
          ${coverUrl ? `
            <img class="top-game-thumb" src="${coverUrl}" alt="" loading="lazy" decoding="async"
              onerror="this.style.display='none';">
          ` : ''}
        </div>
        <div class="top-game-info">
          <div class="top-game-name">${g.name}</div>
          <div class="top-game-meta">${metaText}</div>
        </div>
        <div class="top-game-time" data-ms="${g.totalPlayTime || 0}">${fmtDuration(g.totalPlayTime || 0)}</div>
      `;

      item.onclick = () => navigate(`#game/${encodeURIComponent(g.id)}`);
      listContainer.appendChild(item);
    });

    if (!animate) return;

    // 4. Invert & Play FLIP
    const newRows = Array.from(listContainer.querySelectorAll('.top-game-row'));
    newRows.forEach((row, idx) => {
      const id = row.dataset.id;
      const oldRect = oldRects.get(id);

      if (prefersReducedMotion) {
        row.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 100, fill: 'forwards' });
        return;
      }

      if (oldRect) {
        // Staying row: smoothly slide to new position
        const newRect = row.getBoundingClientRect();
        const deltaY = oldRect.top - newRect.top;
        if (deltaY !== 0) {
          const anim = row.animate([
            { transform: `translateY(${deltaY}px)` },
            { transform: 'translateY(0)' }
          ], {
            duration: 280,
            easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
            fill: 'forwards'
          });
          activeListAnimations.push(anim);
        }
      } else {
        // Entering row: slide in with stagger
        const anim = row.animate([
          { opacity: 0, transform: 'translateY(12px)' },
          { opacity: 1, transform: 'translateY(0)' }
        ], {
          duration: 260,
          delay: isPerfMode ? 0 : idx * 30,
          easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
          fill: 'forwards'
        });
        activeListAnimations.push(anim);
      }

      // Value crossfade & count-up ticker (~400ms)
      const timeEl = row.querySelector('.top-game-time');
      if (timeEl) {
        const valAnim = timeEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, fill: 'forwards' });
        activeListAnimations.push(valAnim);

        const targetMs = Number(timeEl.dataset.ms || 0);
        if (targetMs > 0 && !prefersReducedMotion) {
          animateCountUp(timeEl, targetMs, 400);
        }
      }
    });
  },

  renderCarousel(games) {
    const container = document.getElementById('homeCarousel');
    if (!container) return;
    container.innerHTML = '';

    const activeGames = games.filter(g => !g.archived);
    activeGames.sort((a, b) => {
      if (a.lastPlayed && b.lastPlayed) {
        return new Date(b.lastPlayed) - new Date(a.lastPlayed);
      }
      return (b.totalPlayTime || 0) - (a.totalPlayTime || 0);
    });

    const displayGames = activeGames.slice(0, 8);
    if (displayGames.length === 0) {
      container.innerHTML = '<div style="color: var(--text-tertiary); padding: 18px 0; font-size: 0.82rem;">No games in library yet.</div>';
      return;
    }

    displayGames.forEach(game => {
      const card = createGameCard(game);
      container.appendChild(card);
    });
  },

  renderStatsStrip(sessions) {
    const todayValEl = document.getElementById('homeStatToday');
    const weekValEl = document.getElementById('homeStatWeek');
    const sessionsValEl = document.getElementById('homeStatSessions');
    const streakValEl = document.getElementById('homeStatStreak');

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStart = todayStart - 6 * 86400000;

    let todayMs = 0;
    let weekMs = 0;
    let todaySessionsCount = 0;
    const playedDaysSet = new Set();

    (sessions || []).forEach(s => {
      const time = new Date(s.startTime).getTime();
      const dur = s.activeTime || s.duration || 0;
      if (time >= todayStart) {
        todayMs += dur;
        todaySessionsCount++;
      }
      if (time >= weekStart) {
        weekMs += dur;
      }
      playedDaysSet.add(new Date(s.startTime).toDateString());
    });

    let streak = 0;
    let checkDate = new Date();
    while (playedDaysSet.has(checkDate.toDateString())) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }

    if (todayValEl) todayValEl.textContent = fmtDuration(todayMs);
    if (weekValEl) weekValEl.textContent = fmtDuration(weekMs);
    if (sessionsValEl) sessionsValEl.textContent = `${todaySessionsCount} session${todaySessionsCount === 1 ? '' : 's'}`;
    if (streakValEl) streakValEl.textContent = `${streak} day${streak === 1 ? '' : 's'}`;
  }
};

// ── Segmented Control Sliding Thumb ──
function updateSegThumb(activeBtn) {
  const thumb = document.getElementById('homeSegThumb');
  if (!thumb || !activeBtn) return;
  const left = activeBtn.offsetLeft;
  const width = activeBtn.offsetWidth;
  thumb.style.transform = `translateX(${left - 3}px)`;
  thumb.style.width = `${width}px`;
}

// ── Number Ticker Count-Up Animation (~400ms) ──
function animateCountUp(el, targetMs, duration = 400) {
  const start = performance.now();
  function tick(now) {
    const elapsed = now - start;
    const progress = Math.min(1, elapsed / duration);
    // Ease-out quad
    const ease = 1 - (1 - progress) * (1 - progress);
    const curMs = Math.round(targetMs * ease);
    el.textContent = fmtDuration(curMs);
    if (progress < 1) {
      const id = requestAnimationFrame(tick);
      activeTickerRafs.push(id);
    } else {
      el.textContent = fmtDuration(targetMs);
    }
  }
  const id = requestAnimationFrame(tick);
  activeTickerRafs.push(id);
}

function cancelInFlightAnimations() {
  activeChartAnimations.forEach(a => {
    try { a.cancel(); } catch (_) {}
  });
  activeChartAnimations = [];

  activeListAnimations.forEach(a => {
    try { a.cancel(); } catch (_) {}
  });
  activeListAnimations = [];

  activeTickerRafs.forEach(id => cancelAnimationFrame(id));
  activeTickerRafs = [];
}

function escapeXml(str) {
  if (!str) return '';
  return str.replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}
