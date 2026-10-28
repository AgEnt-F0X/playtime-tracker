// ── API Client Layer ──

async function request(url, options = {}) {
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return await res.json();
  } catch (e) {
    console.error(`API Error on ${url}:`, e);
    throw e;
  }
}

export const api = {
  getGames: () => request('/api/games'),
  getSessions: () => request('/api/sessions'),
  getProcesses: () => request('/api/processes'),
  getActiveSession: () => request('/api/active-session'),
  getSettings: () => request('/api/settings'),
  saveSettings: (settings) => request('/api/settings', { method: 'POST', body: JSON.stringify(settings) }),

  scanGames: () => request('/api/scan', { method: 'POST' }),
  trackGame: (data) => request('/api/games/track', { method: 'POST', body: JSON.stringify(data) }),
  updateGame: (data) => request('/api/games/update', { method: 'POST', body: JSON.stringify(data) }),
  untrackGame: (id) => request('/api/games/untrack', { method: 'POST', body: JSON.stringify({ id }) }),
  restoreGame: (id) => request('/api/games/restore', { method: 'POST', body: JSON.stringify({ id }) }),
  deleteGamePermanently: (id) => request('/api/games/delete-permanently', { method: 'POST', body: JSON.stringify({ id }) }),

  updateSession: (data) => request('/api/sessions/update', { method: 'POST', body: JSON.stringify(data) }),
  deleteSession: (id) => request('/api/sessions/delete', { method: 'POST', body: JSON.stringify({ id }) }),

  syncSteam: () => request('/api/sync/steam', { method: 'POST' }),
  toggleAfk: () => request('/api/afk/toggle', { method: 'POST' }),

  searchCovers: (term) => request(`/api/cover-search?term=${encodeURIComponent(term)}`),
  searchSteamGridDB: (term) => request(`/api/steamgriddb/search?term=${encodeURIComponent(term)}`),
  testSteamGridDB: (key) => request('/api/steamgriddb/test', { method: 'POST', body: JSON.stringify({ key }) }),
  clearArtCache: () => request('/api/art/cache', { method: 'DELETE' }),

  async fetchAll() {
    const [games, sessions, processes, activeSession, settings] = await Promise.all([
      this.getGames().catch(() => []),
      this.getSessions().catch(() => []),
      this.getProcesses().catch(() => []),
      this.getActiveSession().catch(() => null),
      this.getSettings().catch(() => ({}))
    ]);
    return { games, sessions, processes, activeSession, settings };
  }
};
