// ── Client Hash Router With View Transitions ──

import { store } from './store.js';
import { transitionScreen } from './utils/transitions.js';
import { playSound } from './utils/audio.js';

let routes = {};

export function registerRoutes(screenMap) {
  routes = screenMap;
}

export function navigate(hash) {
  if (!hash.startsWith('#')) hash = '#' + hash;
  if (window.location.hash === hash) {
    handleRouteChange();
  } else {
    window.location.hash = hash;
  }
}

export function goBack() {
  const current = window.location.hash || '#home';
  if (current.startsWith('#game/')) {
    navigate('#library');
  } else if (current !== '#home') {
    navigate('#home');
  }
}

export async function handleRouteChange() {
  const hash = window.location.hash.slice(1) || 'home';
  let routeName = hash;
  let param = null;

  if (hash.startsWith('game/')) {
    routeName = 'game-detail';
    param = decodeURIComponent(hash.slice(5));
  }

  const renderScreen = () => {
    // Hide all screens
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));

    // Update Sidebar active state
    document.querySelectorAll('.nav-item').forEach(item => {
      const target = item.dataset.route;
      if (target === routeName || (routeName === 'game-detail' && target === 'library')) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    const screenEl = document.getElementById(`screen-${routeName}`);
    if (screenEl) {
      screenEl.classList.add('active');
    }

    store.set('currentRoute', routeName);
    store.set('selectedGameId', param);

    // Call screen mount handler if defined
    if (routes[routeName] && typeof routes[routeName].mount === 'function') {
      routes[routeName].mount(param);
    }
  };

  await transitionScreen(renderScreen);

  const settings = store.get('settings') || {};
  if (settings.uiSounds) playSound('click', true);
}

export function initRouter() {
  window.addEventListener('hashchange', handleRouteChange);
  // Initial route
  handleRouteChange();
}
