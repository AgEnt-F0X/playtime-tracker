// ── Reactive Application Mini-Store (Zero Framework, <40 Lines) ──

const state = {
  games: [],
  sessions: [],
  recentProcesses: [],
  activeSession: null,
  settings: {
    theme: 'dark',
    accentMode: 'auto', // 'auto' | 'fixed'
    customAccent: '#7c3aed',
    performanceMode: false,
    crtOverlay: false,
    uiSounds: false,
    countAfkAsPlaytime: false,
    steamGridDbKey: '',
    steamApiKey: '',
    steamId: '',
    dailyGoalMins: 120,
    weeklyGoalHours: 15,
    breakReminderMins: 90
  },
  currentRoute: 'home',
  selectedGameId: null
};

const subscribers = new Map();

export const store = {
  get(key) {
    return state[key];
  },

  set(key, value) {
    state[key] = value;
    const callbacks = subscribers.get(key) || [];
    callbacks.forEach(cb => {
      try { cb(value); } catch (e) { console.error('Store subscriber error:', e); }
    });
  },

  update(key, updaterFn) {
    const next = updaterFn(state[key]);
    this.set(key, next);
  },

  subscribe(key, callback) {
    if (!subscribers.has(key)) {
      subscribers.set(key, []);
    }
    subscribers.get(key).push(callback);
    return () => {
      const list = subscribers.get(key) || [];
      const idx = list.indexOf(callback);
      if (idx !== -1) list.splice(idx, 1);
    };
  }
};
