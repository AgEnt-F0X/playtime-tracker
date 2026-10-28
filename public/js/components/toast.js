// ── Toast Notification System ──

import { playSound } from '../utils/audio.js';
import { store } from '../store.js';

let container = null;

function getContainer() {
  if (!container) {
    container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
  }
  return container;
}

export function showToast(message, type = 'info', duration = 3500) {
  const c = getContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const iconMap = {
    success: '✓',
    info: 'ℹ',
    warning: '⚠',
    error: '✕'
  };

  toast.innerHTML = `
    <span style="font-size: 1.1rem; font-weight: bold;">${iconMap[type] || '•'}</span>
    <span style="flex: 1; font-weight: 500;">${message}</span>
  `;

  c.appendChild(toast);

  // Trigger enter animation
  requestAnimationFrame(() => toast.classList.add('show'));

  const settings = store.get('settings') || {};
  if (settings.uiSounds) playSound(type === 'success' ? 'badge' : 'click', true);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

export const toast = {
  success: (msg, dur) => showToast(msg, 'success', dur),
  info: (msg, dur) => showToast(msg, 'info', dur),
  warning: (msg, dur) => showToast(msg, 'warning', dur),
  error: (msg, dur) => showToast(msg, 'error', dur)
};
