// ── SVG Live Timer Ring (Active vs Idle Arc Rendering) ──

import { fmtDigitalTime } from '../utils/fmt.js';

export function renderTimerRing(containerEl, activeMs, idleMs, isIdle = false) {
  if (!containerEl) return;

  const totalMs = (activeMs || 0) + (idleMs || 0);
  const radius = 54;
  const circumference = 2 * Math.PI * radius; // ~339.292

  let activeDash = 0;
  let idleDash = 0;

  if (totalMs > 0) {
    const activePct = Math.min(1, activeMs / totalMs);
    const idlePct = Math.min(1, idleMs / totalMs);
    activeDash = activePct * circumference;
    idleDash = idlePct * circumference;
  }

  containerEl.innerHTML = `
    <div class="timer-ring-container">
      <svg class="timer-ring-svg" viewBox="0 0 120 120">
        <!-- Background Circle -->
        <circle class="timer-ring-bg" cx="60" cy="60" r="${radius}"></circle>

        <!-- Active Playtime Arc (Green) -->
        <circle class="timer-ring-active" cx="60" cy="60" r="${radius}"
          stroke-dasharray="${activeDash.toFixed(1)} ${circumference.toFixed(1)}"
          stroke-dashoffset="0"></circle>

        <!-- Idle/AFK Playtime Arc (Amber) -->
        <circle class="timer-ring-idle" cx="60" cy="60" r="${radius}"
          stroke-dasharray="${idleDash.toFixed(1)} ${circumference.toFixed(1)}"
          stroke-dashoffset="-${activeDash.toFixed(1)}"></circle>
      </svg>
      <div class="timer-ring-center">
        <div class="timer-ring-time" id="heroTimerDigits">${fmtDigitalTime(activeMs)}</div>
        <div class="timer-ring-label" id="heroTimerLabel">${isIdle ? 'AFK / IDLE' : 'ACTIVE PLAY'}</div>
      </div>
    </div>
  `;
}
