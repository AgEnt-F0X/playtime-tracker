// ── Session History Table & Modal Editor Component ──

import { fmtDuration, fmtDate, fmtTime } from '../utils/fmt.js';
import { openModal, closeModal } from './modal.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { toast } from './toast.js';

function toLocalISOString(dateString) {
  const date = new Date(dateString);
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 19);
}

export function renderSessionRows(tbodyEl, sessions, games) {
  if (!tbodyEl) return;
  tbodyEl.innerHTML = '';

  const gameMap = new Map((games || []).map(g => [g.id, g]));

  if (!sessions || sessions.length === 0) {
    tbodyEl.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 24px; color: var(--text-tertiary); font-size: 0.82rem;">
          No sessions recorded yet.
        </td>
      </tr>
    `;
    return;
  }

  sessions.forEach(s => {
    const game = gameMap.get(s.gameId);
    const gameName = game ? game.name : 'Unknown app';
    const tr = document.createElement('tr');
    tr.className = 'history-row';

    const startDate = new Date(s.startTime);
    const endDate = new Date(s.endTime);
    const rollover = startDate.toDateString() !== endDate.toDateString();

    tr.innerHTML = `
      <td style="font-weight: 600; color: var(--text-primary);">${gameName}</td>
      <td style="color: var(--text-secondary); font-size:0.8rem;">${fmtDate(s.startTime)}</td>
      <td class="time-num">${fmtTime(s.startTime)}</td>
      <td class="time-num">
        ${fmtTime(s.endTime)} ${rollover ? `<span class="rollover-pill">+1d</span>` : ''}
      </td>
      <td class="time-num" style="font-weight: 600; color: var(--text-primary);">
        ${fmtDuration(s.duration)}
      </td>
      <td class="time-num" style="color: var(--green);">${fmtDuration(s.activeTime || s.duration)}</td>
      <td class="time-num" style="color: var(--gold);">${fmtDuration(s.idleTime || 0)}</td>
      <td style="text-align: right; white-space: nowrap;">
        <button class="btn-table-action btn-edit-session" title="Edit session" data-id="${s.id}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
          </svg>
        </button>
        <button class="btn-table-action delete btn-del-session" title="Delete session" data-id="${s.id}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
          </svg>
        </button>
      </td>
    `;

    // Edit button handler
    tr.querySelector('.btn-edit-session').addEventListener('click', () => {
      openEditSessionModal(s);
    });

    // Delete button handler
    tr.querySelector('.btn-del-session').addEventListener('click', async () => {
      if (confirm(`Delete this ${fmtDuration(s.duration)} session for ${gameName}?`)) {
        try {
          await api.deleteSession(s.id);
          const nextSessions = (store.get('sessions') || []).filter(item => item.id !== s.id);
          store.set('sessions', nextSessions);
          toast.success('Session deleted');
        } catch (e) {
          toast.error('Failed to delete session');
        }
      }
    });

    tbodyEl.appendChild(tr);
  });
}

export function openEditSessionModal(session) {
  const modal = document.getElementById('editSessionModal');
  if (!modal) return;

  const idInput = document.getElementById('editSessionId');
  const startInput = document.getElementById('editSessionStart');
  const endInput = document.getElementById('editSessionEnd');
  const totalMinsInput = document.getElementById('editSessionTotalMins');
  const idleMinsInput = document.getElementById('editSessionIdleMins');

  idInput.value = session.id;
  startInput.value = toLocalISOString(session.startTime);
  endInput.value = toLocalISOString(session.endTime);
  totalMinsInput.value = Math.round((session.duration || 0) / 60000);
  idleMinsInput.value = Math.round((session.idleTime || 0) / 60000);

  // Auto recalculate duration on datetime change
  const calcDuration = () => {
    const s = new Date(startInput.value);
    const e = new Date(endInput.value);
    if (!isNaN(s.getTime()) && !isNaN(e.getTime()) && e >= s) {
      totalMinsInput.value = Math.round((e - s) / 60000);
    }
  };

  startInput.onchange = calcDuration;
  endInput.onchange = calcDuration;

  totalMinsInput.oninput = () => {
    const s = new Date(startInput.value);
    const mins = parseFloat(totalMinsInput.value) || 0;
    if (!isNaN(s.getTime()) && mins >= 0) {
      const e = new Date(s.getTime() + mins * 60000);
      endInput.value = toLocalISOString(e);
    }
  };

  openModal('editSessionModal');
}

export function initSessionEditor(onSaveCallback) {
  const saveBtn = document.getElementById('saveSessionBtn');
  if (!saveBtn) return;

  saveBtn.addEventListener('click', async () => {
    const id = document.getElementById('editSessionId').value;
    const startVal = document.getElementById('editSessionStart').value;
    const endVal = document.getElementById('editSessionEnd').value;
    const totalMins = parseFloat(document.getElementById('editSessionTotalMins').value) || 0;
    const idleMins = parseFloat(document.getElementById('editSessionIdleMins').value) || 0;

    const startTime = new Date(startVal).toISOString();
    const endTime = new Date(endVal).toISOString();
    const duration = totalMins * 60000;
    const idleTime = idleMins * 60000;
    const activeTime = Math.max(0, duration - idleTime);

    try {
      await api.updateSession({
        id,
        startTime,
        endTime,
        duration,
        activeTime,
        idleTime
      });

      const updatedSessions = await api.getSessions();
      store.set('sessions', updatedSessions);

      closeModal('editSessionModal');
      toast.success('Session updated');

      if (typeof onSaveCallback === 'function') {
        onSaveCallback();
      }
    } catch (e) {
      toast.error('Failed to update session');
    }
  });
}
