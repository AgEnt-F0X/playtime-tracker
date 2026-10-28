// ══════════════════════════════════════════════════════════
// SCREEN 5: ACHIEVEMENTS, XP & DIGITAL WELLBEING GOALS
// ══════════════════════════════════════════════════════════

import { store } from '../store.js';
import { fmtDuration } from '../utils/fmt.js';
import { toast } from '../components/toast.js';

export const achievementsScreen = {
  mount() {
    this.render();
  },

  render() {
    const games = store.get('games') || [];
    const sessions = store.get('sessions') || [];
    const settings = store.get('settings') || {};

    // 1. Calculate XP & Level
    let totalActiveMs = 0;
    sessions.forEach(s => totalActiveMs += (s.activeTime || s.duration || 0));
    const totalActiveMins = Math.floor(totalActiveMs / 60000);

    // Level formula: Level = floor(sqrt(mins / 60)) + 1
    const currentLevel = Math.floor(Math.sqrt(totalActiveMins / 60)) + 1;
    const minsForCurrentLevel = Math.pow(currentLevel - 1, 2) * 60;
    const minsForNextLevel = Math.pow(currentLevel, 2) * 60;
    const levelRange = minsForNextLevel - minsForCurrentLevel;
    const progressInLevel = totalActiveMins - minsForCurrentLevel;
    const progressPct = Math.min(100, Math.max(0, Math.round((progressInLevel / (levelRange || 1)) * 100)));

    const levelBadgeEl = document.getElementById('achieveLevelBadge');
    const xpCountEl = document.getElementById('achieveXpCount');
    const xpBarFillEl = document.getElementById('achieveXpBarFill');

    if (levelBadgeEl) levelBadgeEl.textContent = `LVL ${currentLevel}`;
    if (xpCountEl) xpCountEl.textContent = `${totalActiveMins.toLocaleString()} XP (${progressPct}% to Level ${currentLevel + 1})`;
    if (xpBarFillEl) xpBarFillEl.style.width = `${progressPct}%`;

    // 2. Evaluate 6 Badges
    this.renderBadges(games, sessions, totalActiveMs);

    // 3. Render Daily & Weekly Goals Progress Rings
    this.renderGoals(sessions, settings);
  },

  renderBadges(games, sessions, totalActiveMs) {
    const container = document.getElementById('achieveBadgesGrid');
    if (!container) return;

    // Condition evaluations
    const hasNightOwl = sessions.some(s => {
      const endH = new Date(s.endTime).getHours();
      return endH >= 0 && endH <= 4;
    });

    const hasMarathoner = sessions.some(s => (s.duration || 0) >= 5 * 3600000);
    const has100Hours = totalActiveMs >= 100 * 3600000;
    const hasExplorer = games.filter(g => g.totalPlayTime > 0).length >= 10;

    // Consecutive streak calculation
    const daysSet = new Set(sessions.map(s => new Date(s.startTime).toDateString()));
    let maxStreak = 0;
    let curStreak = 0;
    let d = new Date();
    for (let i = 0; i < 365; i++) {
      if (daysSet.has(d.toDateString())) {
        curStreak++;
        if (curStreak > maxStreak) maxStreak = curStreak;
      } else {
        curStreak = 0;
      }
      d.setDate(d.getDate() - 1);
    }
    const hasStreakMaster = maxStreak >= 7;

    // Variety pack: 3+ games in 1 day
    const dayGameMap = new Map();
    sessions.forEach(s => {
      const day = new Date(s.startTime).toDateString();
      if (!dayGameMap.has(day)) dayGameMap.set(day, new Set());
      dayGameMap.get(day).add(s.gameId);
    });
    const hasVarietyPack = Array.from(dayGameMap.values()).some(set => set.size >= 3);

    const badges = [
      {
        id: 'night-owl',
        name: 'Night Owl',
        desc: 'Played a gaming session ending between 12 AM and 4 AM',
        icon: '/assets/badges/night-owl.svg',
        unlocked: hasNightOwl
      },
      {
        id: 'marathoner',
        name: 'Marathoner',
        desc: 'Completed a single marathon gaming session of 5+ hours',
        icon: '/assets/badges/marathoner.svg',
        unlocked: hasMarathoner
      },
      {
        id: 'hundred-hours',
        name: '100-Hour Club',
        desc: 'Accumulated over 100 active hours across your gaming library',
        icon: '/assets/badges/hundred-hours.svg',
        unlocked: has100Hours
      },
      {
        id: 'explorer',
        name: 'Explorer',
        desc: 'Tracked and played at least 10 different games',
        icon: '/assets/badges/explorer.svg',
        unlocked: hasExplorer
      },
      {
        id: 'streak-master',
        name: 'Streak Master',
        desc: 'Achieved a 7-day consecutive daily gaming streak',
        icon: '/assets/badges/streak-master.svg',
        unlocked: hasStreakMaster
      },
      {
        id: 'variety-pack',
        name: 'Variety Pack',
        desc: 'Played 3 or more distinct games in a single calendar day',
        icon: '/assets/badges/variety-pack.svg',
        unlocked: hasVarietyPack
      }
    ];

    container.innerHTML = '';
    badges.forEach(b => {
      const card = document.createElement('div');
      card.className = `glass-card badge-card ${b.unlocked ? 'unlocked' : 'locked'}`;
      card.innerHTML = `
        <img class="badge-card-icon" src="${b.icon}" alt="${b.name}">
        <div style="flex: 1;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong style="color: ${b.unlocked ? 'var(--text)' : 'var(--text-muted)'}; font-size: 1rem;">${b.name}</strong>
            <span style="font-size:0.7rem; font-weight:700; color:${b.unlocked ? 'var(--green)' : 'var(--text-dim)'};">
              ${b.unlocked ? 'Unlocked' : 'Locked'}
            </span>
          </div>
          <p style="font-size: 0.78rem; color: var(--text-dim); margin-top: 4px;">${b.desc}</p>
        </div>
      `;
      container.appendChild(card);
    });
  },

  renderGoals(sessions, settings) {
    const dailyTargetMins = settings.dailyGoalMins || 120;
    const weeklyTargetHours = settings.weeklyGoalHours || 15;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStart = todayStart - 6 * 86400000;

    let todayMins = 0;
    let weekHours = 0;

    sessions.forEach(s => {
      const t = new Date(s.startTime).getTime();
      const dur = s.activeTime || s.duration || 0;
      if (t >= todayStart) todayMins += Math.floor(dur / 60000);
      if (t >= weekStart) weekHours += (dur / 3600000);
    });

    const dailyPct = Math.min(100, Math.round((todayMins / dailyTargetMins) * 100));
    const weeklyPct = Math.min(100, Math.round((weekHours / weeklyTargetHours) * 100));

    const dailyLabelEl = document.getElementById('goalDailyProgress');
    const weeklyLabelEl = document.getElementById('goalWeeklyProgress');
    const dailyBarEl = document.getElementById('goalDailyBarFill');
    const weeklyBarEl = document.getElementById('goalWeeklyBarFill');

    if (dailyLabelEl) dailyLabelEl.textContent = `${todayMins}m / ${dailyTargetMins}m (${dailyPct}%)`;
    if (weeklyLabelEl) weeklyLabelEl.textContent = `${weekHours.toFixed(1)}h / ${weeklyTargetHours}h (${weeklyPct}%)`;
    if (dailyBarEl) dailyBarEl.style.width = `${dailyPct}%`;
    if (weeklyBarEl) weeklyBarEl.style.width = `${weeklyPct}%`;
  }
};
