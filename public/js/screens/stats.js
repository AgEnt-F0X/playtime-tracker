// ══════════════════════════════════════════════════════════
// SCREEN 4: STATS & ANALYTICS (Pure SVG/Canvas — Zero Chart Libs)
// ══════════════════════════════════════════════════════════

import { store } from '../store.js';
import { fmtDuration } from '../utils/fmt.js';
import { toast } from '../components/toast.js';

export const statsScreen = {
  mount() {
    this.render();
  },

  render() {
    const games = store.get('games') || [];
    const sessions = store.get('sessions') || [];

    this.renderCalendarHeatmap(sessions);
    this.renderWeeklyBarChart(sessions);
    this.renderTimeOfDayRadial(sessions);
    this.renderPlatformDonut(games);
    this.renderYearWrapped(games, sessions);
  },

  // 1. GitHub-Style 52-Week Calendar Heatmap (Pure SVG)
  renderCalendarHeatmap(sessions) {
    const container = document.getElementById('statsCalendarHeatmap');
    if (!container) return;

    const dayHours = new Map();
    sessions.forEach(s => {
      const key = new Date(s.startTime).toISOString().slice(0, 10);
      const hours = (s.activeTime || s.duration || 0) / 3600000;
      dayHours.set(key, (dayHours.get(key) || 0) + hours);
    });

    const cellSize = 11;
    const cellGap = 3;
    const step = cellSize + cellGap;

    const today = new Date();
    // 52 weeks ago
    const startDate = new Date();
    startDate.setDate(today.getDate() - 52 * 7);

    let rectsSvg = '';
    let cur = new Date(startDate);

    for (let w = 0; w < 53; w++) {
      for (let d = 0; d < 7; d++) {
        if (cur > today) break;
        const key = cur.toISOString().slice(0, 10);
        const hours = dayHours.get(key) || 0;

        let color = 'rgba(255, 255, 255, 0.05)';
        if (hours > 0) {
          if (hours >= 4) color = 'var(--accent)';
          else if (hours >= 2) color = 'var(--accent-light)';
          else color = 'rgba(94, 124, 226, 0.4)';
        }

        const x = w * step;
        const y = d * step;
        rectsSvg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="2" fill="${color}">
          <title>${key}: ${hours.toFixed(1)} hrs</title>
        </rect>`;
        cur.setDate(cur.getDate() + 1);
      }
    }

    container.innerHTML = `
      <svg class="calendar-heatmap-svg" viewBox="0 0 ${53 * step} ${7 * step}">
        ${rectsSvg}
      </svg>
    `;
  },

  // 2. Weekly Bar Chart (Last 7 Days)
  renderWeeklyBarChart(sessions) {
    const container = document.getElementById('statsWeeklyChart');
    if (!container) return;

    const labels = [];
    const activeHours = [];
    const idleHours = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      labels.push(d.toLocaleDateString(undefined, { weekday: 'short' }));

      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const dayEnd = dayStart + 86400000;

      let aSum = 0;
      let iSum = 0;
      sessions.forEach(s => {
        const t = new Date(s.startTime).getTime();
        if (t >= dayStart && t < dayEnd) {
          aSum += (s.activeTime || s.duration || 0);
          iSum += (s.idleTime || 0);
        }
      });
      activeHours.push(aSum / 3600000);
      idleHours.push(iSum / 3600000);
    }

    const maxVal = Math.max(1, ...activeHours.map((a, idx) => a + idleHours[idx]));
    const chartHeight = 140;
    const barWidth = 30;
    const gap = 20;

    let barsSvg = '';
    labels.forEach((label, idx) => {
      const a = activeHours[idx];
      const idl = idleHours[idx];
      const aHeight = (a / maxVal) * chartHeight;
      const iHeight = (idl / maxVal) * chartHeight;

      const x = idx * (barWidth + gap) + 15;
      const aY = chartHeight - aHeight;
      const iY = aY - iHeight;

      barsSvg += `
        <!-- Active Bar -->
        <rect x="${x}" y="${aY}" width="${barWidth}" height="${aHeight}" rx="3" fill="var(--accent)" opacity="0.9">
          <title>${label}: Active ${a.toFixed(1)}h</title>
        </rect>
        <!-- Idle Bar Stack -->
        <rect x="${x}" y="${iY}" width="${barWidth}" height="${iHeight}" rx="3" fill="var(--gold)" opacity="0.8">
          <title>${label}: Idle ${idl.toFixed(1)}h</title>
        </rect>
        <!-- Weekday label -->
        <text x="${x + barWidth / 2}" y="${chartHeight + 18}" text-anchor="middle" fill="var(--text-tertiary)" font-size="11" font-weight="500">
          ${label}
        </text>
      `;
    });

    container.innerHTML = `
      <svg viewBox="0 0 ${7 * (barWidth + gap) + 30} ${chartHeight + 30}" style="width:100%; height:180px;">
        ${barsSvg}
      </svg>
    `;
  },

  // 3. Time-Of-Day Radial Polar Chart (24h Clock Breakdown)
  renderTimeOfDayRadial(sessions) {
    const container = document.getElementById('statsTimeOfDayRadial');
    if (!container) return;

    const hourCounts = new Array(24).fill(0);
    sessions.forEach(s => {
      const h = new Date(s.startTime).getHours();
      hourCounts[h] += (s.activeTime || s.duration || 0);
    });

    const maxCount = Math.max(1, ...hourCounts);
    const cx = 100, cy = 100, maxRadius = 80, innerRadius = 24;

    let paths = '';
    for (let h = 0; h < 24; h++) {
      const angleStart = (h / 24) * 2 * Math.PI - Math.PI / 2;
      const angleEnd = ((h + 1) / 24) * 2 * Math.PI - Math.PI / 2;
      const r = innerRadius + (hourCounts[h] / maxCount) * (maxRadius - innerRadius);

      const x1 = cx + innerRadius * Math.cos(angleStart);
      const y1 = cy + innerRadius * Math.sin(angleStart);
      const x2 = cx + r * Math.cos(angleStart);
      const y2 = cy + r * Math.sin(angleStart);
      const x3 = cx + r * Math.cos(angleEnd);
      const y3 = cy + r * Math.sin(angleEnd);
      const x4 = cx + innerRadius * Math.cos(angleEnd);
      const y4 = cy + innerRadius * Math.sin(angleEnd);

      const intensity = hourCounts[h] / maxCount;
      const color = intensity > 0.6 ? 'var(--accent)' : (intensity > 0.2 ? 'var(--accent-light)' : 'rgba(255, 255, 255, 0.06)');

      paths += `<path d="M ${x1} ${y1} L ${x2} ${y2} A ${r} ${r} 0 0 1 ${x3} ${y3} L ${x4} ${y4} Z" fill="${color}">
        <title>${h}:00 - ${h+1}:00: ${fmtDuration(hourCounts[h])}</title>
      </path>`;
    }

    container.innerHTML = `
      <svg class="radial-chart-svg" viewBox="0 0 200 200">
        ${paths}
        <circle cx="${cx}" cy="${cy}" r="${innerRadius - 4}" fill="var(--bg-surface)" stroke="var(--border-subtle)"></circle>
        <text x="${cx}" y="${cy + 4}" text-anchor="middle" fill="var(--text-tertiary)" font-size="9" font-weight="600">24H</text>
      </svg>
    `;
  },

  // 4. Platform Donut Chart
  renderPlatformDonut(games) {
    const container = document.getElementById('statsPlatformDonut');
    if (!container) return;

    let steamCount = 0, epicCount = 0, customCount = 0;
    games.forEach(g => {
      const p = (g.platform || '').toLowerCase();
      if (p === 'steam') steamCount++;
      else if (p === 'epic') epicCount++;
      else customCount++;
    });

    const total = games.length || 1;
    const r = 40, cx = 60, cy = 60;
    const circum = 2 * Math.PI * r;

    const steamDash = (steamCount / total) * circum;
    const epicDash = (epicCount / total) * circum;
    const customDash = (customCount / total) * circum;

    container.innerHTML = `
      <div style="display:flex; align-items:center; gap:24px;">
        <svg width="120" height="120" viewBox="0 0 120 120">
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#60a5fa" stroke-width="12"
            stroke-dasharray="${steamDash} ${circum}" stroke-dashoffset="0"></circle>
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#fb7185" stroke-width="12"
            stroke-dasharray="${epicDash} ${circum}" stroke-dashoffset="-${steamDash}"></circle>
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#a78bfa" stroke-width="12"
            stroke-dasharray="${customDash} ${circum}" stroke-dashoffset="-${steamDash + epicDash}"></circle>
        </svg>
        <div style="display:flex; flex-direction:column; gap:8px; font-size:0.82rem;">
          <div style="display:flex; align-items:center; gap:6px;"><span style="width:8px; height:8px; border-radius:50%; background:#60a5fa;"></span> Steam (${steamCount})</div>
          <div style="display:flex; align-items:center; gap:6px;"><span style="width:8px; height:8px; border-radius:50%; background:#fb7185;"></span> Epic Games (${epicCount})</div>
          <div style="display:flex; align-items:center; gap:6px;"><span style="width:8px; height:8px; border-radius:50%; background:#a78bfa;"></span> Custom (${customCount})</div>
        </div>
      </div>
    `;
  },

  // 5. Shareable Year Wrapped Card (With Canvas PNG Export)
  renderYearWrapped(games, sessions) {
    const container = document.getElementById('statsYearWrappedWrap');
    if (!container) return;

    let totalMs = 0;
    sessions.forEach(s => totalMs += (s.activeTime || s.duration || 0));

    const sortedGames = [...games].sort((a, b) => (b.totalPlayTime || 0) - (a.totalPlayTime || 0));
    const topGame = sortedGames[0] || { name: 'None yet' };

    container.innerHTML = `
      <div class="year-wrapped-card" id="yearWrappedCard">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="font-weight:700; font-size:1.1rem; color:var(--text-primary); letter-spacing:-0.2px;">Year in gaming</div>
          <div style="font-size:0.78rem; color:var(--text-tertiary); font-variant-numeric:tabular-nums;">${new Date().getFullYear()} summary</div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; margin: 12px 0;">
          <div>
            <div style="font-size:0.72rem; color:var(--text-tertiary); font-weight:500;">Most played game</div>
            <div style="font-size:1.3rem; font-weight:700; color:var(--text-primary); margin-top:2px;">${topGame.name}</div>
            <div style="color:var(--accent); font-size:0.85rem; font-variant-numeric:tabular-nums;">${fmtDuration(topGame.totalPlayTime || 0)}</div>
          </div>
          <div>
            <div style="font-size:0.72rem; color:var(--text-tertiary); font-weight:500;">Total active time</div>
            <div style="font-size:1.3rem; font-weight:700; color:var(--green); margin-top:2px; font-variant-numeric:tabular-nums;">${fmtDuration(totalMs)}</div>
            <div style="color:var(--text-secondary); font-size:0.85rem;">Across ${games.length} games</div>
          </div>
        </div>
        <div style="display:flex; justify-content:flex-end;">
          <button class="btn btn-secondary" id="exportWrappedBtn" style="font-size:0.8rem;">
            Export card as PNG
          </button>
        </div>
      </div>
    `;

    const exportBtn = container.querySelector('#exportWrappedBtn');
    if (exportBtn) {
      exportBtn.onclick = () => this.exportWrappedToPng(topGame.name, fmtDuration(topGame.totalPlayTime || 0), fmtDuration(totalMs), games.length);
    }
  },

  exportWrappedToPng(topGameName, topGameHours, totalHours, totalGamesCount) {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 450;
    const ctx = canvas.getContext('2d');

    // Background Gradient
    const grad = ctx.createLinearGradient(0, 0, 800, 450);
    grad.addColorStop(0, '#13151b');
    grad.addColorStop(1, '#0c0d12');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 800, 450);

    // Border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 2;
    ctx.strokeRect(16, 16, 768, 418);

    // Title
    ctx.fillStyle = '#f1f3f7';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('Year in Gaming', 48, 64);

    ctx.fillStyle = '#9096a6';
    ctx.font = '14px sans-serif';
    ctx.fillText(`${new Date().getFullYear()} Desktop Playtime Summary`, 48, 92);

    // Top Game
    ctx.fillStyle = '#9096a6';
    ctx.font = '500 13px sans-serif';
    ctx.fillText('MOST PLAYED GAME', 48, 165);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(topGameName, 48, 205);

    ctx.fillStyle = '#5e7ce2';
    ctx.font = '20px sans-serif';
    ctx.fillText(topGameHours, 48, 238);

    // Total Playtime
    ctx.fillStyle = '#9096a6';
    ctx.font = '500 13px sans-serif';
    ctx.fillText('TOTAL TIME LOGGED', 440, 165);

    ctx.fillStyle = '#22c55e';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(totalHours, 440, 205);

    ctx.fillStyle = '#9096a6';
    ctx.font = '16px sans-serif';
    ctx.fillText(`Across ${totalGamesCount} tracked games`, 440, 238);

    // Footer
    ctx.fillStyle = '#585e6f';
    ctx.font = '13px sans-serif';
    ctx.fillText('PlayTime Tracker for Windows', 48, 395);

    // Trigger download
    const link = document.createElement('a');
    link.download = `playtime-wrapped-${new Date().getFullYear()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast.success('Year Wrapped exported to PNG');
  }
};
