// ── Interactive Pixel Mascot Controller ──

export const mascot = {
  currentState: 'idle',

  setState(state, customMessage = null) {
    this.currentState = state;
    const states = ['idle', 'playing', 'afk', 'warning', 'celebrate'];

    states.forEach(s => {
      const g = document.getElementById(`mascot-state-${s}`);
      if (g) {
        g.style.display = (s === state) ? 'inline' : 'none';
      }
    });

    const bubbleEl = document.getElementById('mascotBubble');
    if (bubbleEl) {
      if (customMessage) {
        bubbleEl.textContent = customMessage;
      } else {
        const defaults = {
          idle: 'Ready to game!',
          playing: 'Gaming in progress...',
          afk: 'AFK / Taking a nap zzz',
          warning: '3h+ played! Drink water & stretch!',
          celebrate: 'Awesome achievement unlocked!'
        };
        bubbleEl.textContent = defaults[state] || 'Ready!';
      }
    }
  },

  updateFromSession(activeSession) {
    if (!activeSession) {
      this.setState('idle', 'Select a game to play!');
      return;
    }

    if (activeSession.isIdle || activeSession.isManualAfk) {
      this.setState('afk');
      return;
    }

    const elapsedMs = activeSession.elapsed || 0;
    const threeHoursMs = 3 * 60 * 60 * 1000;

    if (elapsedMs > threeHoursMs) {
      this.setState('warning', '3h+ gaming session! Drink water!');
    } else {
      this.setState('playing', `Playing ${activeSession.gameName || 'Game'}`);
    }
  }
};
