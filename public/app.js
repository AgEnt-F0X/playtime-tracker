// ═══════════════════════════════════════════════════════
// PlayTime Tracker — Frontend Logic
// ═══════════════════════════════════════════════════════

let games = [];
let sessions = [];
let recentProcesses = [];
let activeSession = null;
let settings = {};
let playtimeChart = null;
let gameDetailChartInstance = null;
let elapsedInterval = null;
let dashSortMode = 'playtime'; // 'playtime' | 'recent'

// ── Boot ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initTitlebar();
    initTabs();
    initModal();
    initEditCoverModal();
    initScanButton();
    initAfkToggle();
    initCardResize();
    initSettingsUI();
    initDashSort();
    
    // Theme loader
    const savedTheme = localStorage.getItem('appTheme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    fetchAll();
    setInterval(fetchAll, 3000);
});

// ── AFK Toggle ───────────────────────────────────────
function initAfkToggle() {
    const btn = document.getElementById('afkToggleBtn');
    if (!btn) return;
    btn.style.display = 'none'; // Hidden until a session starts

    btn.addEventListener('click', async () => {
        try {
            // Try Electron IPC first, fallback to API
            if (window.electronAPI && window.electronAPI.toggleAfk) {
                window.electronAPI.toggleAfk();
            } else {
                await fetch('/api/afk/toggle', { method: 'POST' });
            }
            // Refresh immediately
            setTimeout(fetchAll, 200);
        } catch (e) {
            console.error('AFK toggle failed:', e);
        }
    });

    // Listen for global hotkey toggles from Electron
    if (window.electronAPI && window.electronAPI.onAfkStatusChanged) {
        window.electronAPI.onAfkStatusChanged(async (isAfk) => {
            // Sync the backend state
            const res = await fetch('/api/afk/status');
            const status = await res.json();
            if (status.manualAfk !== isAfk) {
                await fetch('/api/afk/toggle', { method: 'POST' });
            }
            fetchAll();
        });
    }
}

// ── Card Resize (Ctrl+Scroll) ────────────────────────
function initCardResize() {
    const CARD_MIN = 120;
    const CARD_MAX = 350;
    const STEP = 15;

    document.addEventListener('wheel', (e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();

        const root = document.documentElement;
        const current = parseInt(getComputedStyle(root).getPropertyValue('--card-size')) || 185;
        const next = e.deltaY < 0
            ? Math.min(current + STEP, CARD_MAX)
            : Math.max(current - STEP, CARD_MIN);
        
        root.style.setProperty('--card-size', next + 'px');
    }, { passive: false });
}

// ── Scan for Games Button ────────────────────────────
function initScanButton() {
    const btn = document.getElementById('scanGamesBtn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = '⏳ Scanning...';
        try {
            await fetch('/api/scan', { method: 'POST' });
            await fetchAll();
        } catch (e) {
            console.error('Scan failed:', e);
        }
        btn.disabled = false;
        btn.textContent = '🔍 Scan for Games';
    });
}

// ── Titlebar Window Controls ─────────────────────────
function initTitlebar() {
    const api = window.electronAPI;
    if (!api) return;
    document.getElementById('btn-minimize').addEventListener('click', () => api.minimizeWindow());
    document.getElementById('btn-maximize').addEventListener('click', () => api.maximizeWindow());
    document.getElementById('btn-close').addEventListener('click',    () => api.closeWindow());
}

// ── Tab Navigation ────────────────────────────────────
function initTabs() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            const targetContent = document.getElementById(`tab-${tab}`);
            if (targetContent) targetContent.classList.add('active');

            if (tab === 'sessions' || tab === 'history' || btn.id === 'nav-sessions' || btn.id === 'nav-history') {
                loadSessions();
            }
        });
    });
}

async function loadSessions() {
    try {
        const res = await fetch('/api/sessions');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        sessions = await res.json();
        renderSessions();
    } catch (e) {
        console.error('Failed to load sessions:', e);
        sessions = [];
        renderSessions();
    }
}

// ── Data Fetching ─────────────────────────────────────
async function fetchAll() {
    try {
        const [gRes, sRes, pRes, aRes, setRes] = await Promise.all([
            fetch('/api/games'),
            fetch('/api/sessions'),
            fetch('/api/processes'),
            fetch('/api/active-session'),
            fetch('/api/settings')
        ]);
        games          = await gRes.json();
        sessions       = await sRes.json();
        recentProcesses = await pRes.json();
        activeSession  = aRes.ok ? await aRes.json() : null;
        settings       = await setRes.json();

        updateHeader();
        renderChart();
        renderTopGames();
        renderLibrary();
        renderSessions();
        renderRecentProcesses();
        renderArchivedGames();
    } catch (e) {
        console.warn('Fetch error:', e);
    }
}

// ── Header / Active Session ───────────────────────────
function updateHeader() {
    const totalMs = games.reduce((s, g) => s + (g.totalPlayTime || 0), 0);
    document.getElementById('totalPlaytimeVal').textContent = fmtDuration(totalMs);
    document.getElementById('trackedCount').textContent     = games.length;

    const dot      = document.getElementById('activeDot');
    const nameEl   = document.getElementById('activeGameText');
    const elapsed  = document.getElementById('activeElapsedText');
    const afkText  = document.getElementById('activeAfkText');
    const afkBtn   = document.getElementById('afkToggleBtn');

    clearInterval(elapsedInterval);

    if (activeSession) {
        const isIdle = activeSession.isIdle;
        const isManualAfk = activeSession.isManualAfk;

        // Dot state
        dot.classList.remove('active', 'afk');
        dot.classList.add(isIdle ? 'afk' : 'active');

        nameEl.textContent = `Playing: ${activeSession.gameName}`;
        
        const startMs = Date.now() - activeSession.elapsed;
        const idleOffset = activeSession.currentIdleTime || 0;
        
        elapsedInterval = setInterval(() => {
            const totalElapsed = Date.now() - startMs;
            elapsed.textContent = fmtDuration(totalElapsed);
            if (isIdle && idleOffset > 0) {
                afkText.textContent = `⏸ AFK ${fmtDuration(idleOffset + (Date.now() - startMs - activeSession.elapsed))}`;
            }
        }, 1000);
        elapsed.textContent = fmtDuration(activeSession.elapsed);

        if (isIdle) {
            const reason = isManualAfk ? 'manual' : 'idle';
            afkText.textContent = `⏸ AFK (${reason})`;
        } else {
            afkText.textContent = idleOffset > 0 ? `Active (${fmtDuration(idleOffset)} idle total)` : '';
        }

        // AFK button
        afkBtn.style.display = 'block';
        afkBtn.classList.toggle('active', isManualAfk);
        afkBtn.textContent = isManualAfk ? '▶ Resume' : '⏸ AFK';
    } else {
        dot.classList.remove('active', 'afk');
        nameEl.textContent = 'No active game';
        elapsed.textContent = '';
        afkText.textContent = '';
        afkBtn.style.display = 'none';
    }
}

// ── Formatting Helpers ────────────────────────────────
function fmtDuration(ms) {
    if (!ms || ms < 0) return '0m';
    const totalSecs = Math.floor(ms / 1000);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// Neon gradient placeholder for games without cover art
function getGradient(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    const h1 = Math.abs(hash % 360);
    const h2 = (h1 + 50) % 360;
    return `linear-gradient(145deg, hsl(${h1},65%,30%), hsl(${h2},75%,15%))`;
}

// ── Chart ─────────────────────────────────────────────
function renderChart() {
    const labels = [];
    const data   = [];
    let weekTotal = 0;

    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        labels.push(d.toLocaleDateString(undefined, { weekday: 'short' }));

        const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        const dayEnd   = dayStart + 86_400_000;

        const sum = sessions
            .filter(s => { const t = new Date(s.startTime).getTime(); return t >= dayStart && t < dayEnd; })
            .reduce((acc, s) => acc + s.duration, 0);

        data.push(parseFloat((sum / 3_600_000).toFixed(2)));
        weekTotal += sum;
    }

    document.getElementById('weeklyTotalLabel').textContent = `${fmtDuration(weekTotal)} this week`;

    const ctx = document.getElementById('playtimeChart').getContext('2d');

    if (playtimeChart) {
        playtimeChart.data.labels = labels;
        playtimeChart.data.datasets[0].data = data;
        playtimeChart.update('none');
        return;
    }

    const grad = ctx.createLinearGradient(0, 0, 0, 220);
    grad.addColorStop(0,   'rgba(124, 58, 237, 0.55)');
    grad.addColorStop(1,   'rgba(124, 58, 237, 0.0)');

    playtimeChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Hours',
                data,
                borderColor: '#7c3aed',
                backgroundColor: grad,
                borderWidth: 2.5,
                fill: true,
                tension: 0.45,
                pointBackgroundColor: '#10b981',
                pointBorderColor: '#10b981',
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ${ctx.parsed.y.toFixed(2)}h`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    ticks: { color: '#64748b', font: { size: 11 } }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#64748b', font: { size: 11 } }
                }
            }
        }
    });
}

// ── Top Games ─────────────────────────────────────────
function initDashSort() {
    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            dashSortMode = btn.dataset.sort;
            document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderTopGames();
        });
    });
}

function renderTopGames() {
    const list = document.getElementById('topGamesList');

    // Filter out archived games and ones never played for recently-played mode
    let filtered = [...games].filter(g => !g.archived);

    let sorted;
    if (dashSortMode === 'recent') {
        sorted = filtered
            .filter(g => g.lastPlayed)
            .sort((a, b) => new Date(b.lastPlayed) - new Date(a.lastPlayed))
            .slice(0, 8);
    } else {
        sorted = filtered
            .sort((a, b) => (b.totalPlayTime || 0) - (a.totalPlayTime || 0))
            .slice(0, 8);
    }
    const maxMs = sorted[0] ? (sorted[0].totalPlayTime || 1) : 1;

    list.innerHTML = '';
    if (!sorted.length) {
        list.innerHTML = '<div class="loading-text">No games tracked yet.</div>';
        return;
    }

    sorted.forEach((g, i) => {
        const pct = Math.round(((g.totalPlayTime || 0) / maxMs) * 100);
        const row = document.createElement('div');
        row.className = 'top-game-row';
        row.style.cursor = 'pointer';
        row.onclick = () => openGameDetails(g.id);

        let coverHtml = '';
        if (g.coverUrl) {
            coverHtml = `<img src="${g.coverUrl}" class="top-game-cover" onerror="this.style.display='none'" alt="">`;
        } else {
            coverHtml = `<div class="top-game-cover" style="background:${getGradient(g.name)};border-radius:6px;"></div>`;
        }

        const secondaryStat = dashSortMode === 'recent' && g.lastPlayed
            ? `<span class="top-game-sub"> · Last ${fmtDate(g.lastPlayed)}</span>`
            : '';

        row.innerHTML = `
            <span class="top-game-rank">#${i + 1}</span>
            ${coverHtml}
            <div class="top-game-info">
                <div class="top-game-name">${g.name}</div>
                <div class="top-game-time">${fmtDuration(g.totalPlayTime)}${secondaryStat}</div>
            </div>
            <div class="top-game-bar-wrap">
                <div class="top-game-bar-bg">
                    <div class="top-game-bar-fill" style="width:${pct}%"></div>
                </div>
            </div>
        `;
        list.appendChild(row);
    });
}

// ── Library ───────────────────────────────────────────
function renderLibrary() {
    const grid   = document.getElementById('gamesGrid');
    const empty  = document.getElementById('libraryEmpty');
    const badge  = document.getElementById('libraryCount');

    const activeGames = games.filter(g => !g.archived);
    badge.textContent = `${activeGames.length} game${activeGames.length !== 1 ? 's' : ''}`;

    // Remove existing cards (keep empty state element)
    [...grid.querySelectorAll('.game-card')].forEach(c => c.remove());

    if (!activeGames.length) {
        empty.style.display = 'flex';
        return;
    }
    empty.style.display = 'none';

    const sorted = [...activeGames].sort((a, b) => (b.lastPlayed || '') > (a.lastPlayed || '') ? 1 : -1);

    sorted.forEach(g => {
        const card = document.createElement('div');
        card.className = 'game-card';
        card.title = g.name;
        card.onclick = () => openGameDetails(g.id);

        const initials = g.name.substring(0,2).toUpperCase();
        const gradient = getGradient(g.name);
        const gradientFallback = `<div class="game-cover-gradient" style="background:${gradient}"><span class="game-cover-initials">${initials}</span></div>`;

        let coverHtml;
        if (g.coverUrl) {
            // Build cover with smart fallback chain
            coverHtml = `<img src="${g.coverUrl}" class="game-cover-img" alt="${g.name}"
                onerror="handleCoverError(this, '${g.coverUrl.replace(/'/g, "\\'")}', '${initials}')">`;
        } else {
            coverHtml = gradientFallback;
        }

        const lastPlayedText = g.lastPlayed ? `Last: ${fmtDate(g.lastPlayed)}` : 'Never played';
        const platformBadge = g.platform && g.platform !== 'Custom' ? `<span class="platform-badge">${g.platform}</span>` : '';

        card.innerHTML = `
            ${coverHtml}
            <div class="game-actions">
                <button class="game-action-btn edit" title="Edit cover art" onclick="openEditCover('${g.id}', event); event.stopPropagation();">✎</button>
                <button class="game-action-btn remove" title="Stop tracking" onclick="untrackGame('${g.id}', event); event.stopPropagation();">×</button>
            </div>
            <div class="game-info">
                <div class="game-title">${g.name} ${platformBadge}</div>
                <div class="game-playtime">${fmtDuration(g.totalPlayTime)}</div>
                <div class="game-last-played">${lastPlayedText}</div>
            </div>
        `;
        grid.appendChild(card);
    });
}

// Smart cover art error handler — tries header.jpg fallback before gradient
function handleCoverError(img, originalUrl, initials) {
    // If the original was a portrait (library_600x900), try header.jpg
    if (originalUrl.includes('library_600x900')) {
        const headerUrl = originalUrl.replace('library_600x900_2x.jpg', 'header.jpg');
        img.onerror = function() {
            // Header also failed — show gradient
            const grad = getGradient(initials);
            img.parentNode.innerHTML = `<div class="game-cover-gradient" style="background:${grad}"><span class="game-cover-initials">${initials}</span></div>`;
        };
        img.src = headerUrl;
    } else {
        // Not a Steam URL — show gradient immediately
        const grad = getGradient(initials);
        img.parentNode.innerHTML = `<div class="game-cover-gradient" style="background:${grad}"><span class="game-cover-initials">${initials}</span></div>`;
    }
}

// ── Sessions ──────────────────────────────────────────
function renderSessions() {
    const tbody = document.getElementById('sessionsList');
    const empty = document.getElementById('sessionsEmpty');
    const badge = document.getElementById('sessionsCount');

    if (badge) {
        badge.textContent = `${sessions.length} session${sessions.length !== 1 ? 's' : ''}`;
    }

    if (tbody) tbody.innerHTML = '';
    if (!sessions || !sessions.length) {
        if (empty) {
            empty.style.display = 'flex';
            const msgEl = empty.querySelector('p');
            if (msgEl) msgEl.textContent = 'No sessions found';
        } else if (tbody) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 24px; color: var(--text-dim);">No sessions found</td></tr>';
        }
        return;
    }
    if (empty) empty.style.display = 'none';

    sessions.slice(0, 200).forEach(s => {
        const game = games.find(g => g.id === s.gameId);
        const activeTime = s.activeTime != null ? s.activeTime : s.duration;
        const idleTime = s.idleTime || 0;
        const idleStyle = idleTime > 0 ? 'color: var(--yellow)' : 'color: var(--text-dim)';
        
        const startDateObj = new Date(s.startTime);
        const endDateObj = new Date(s.endTime);
        const spansDays = startDateObj.toDateString() !== endDateObj.toDateString();
        const endTimeStr = spansDays ? `${fmtDate(s.endTime)} ${fmtTime(s.endTime)}` : fmtTime(s.endTime);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="session-game">${game ? game.name : '<em style="color:var(--text-dim)">Unknown</em>'}</td>
            <td>${fmtDate(s.startTime)}</td>
            <td>${fmtTime(s.startTime)}</td>
            <td>${endTimeStr}</td>
            <td class="session-duration">${fmtDuration(s.duration)}</td>
            <td style="color: var(--green)">${fmtDuration(activeTime)}</td>
            <td style="${idleStyle}">${fmtDuration(idleTime)}</td>
            <td style="text-align: right;">
                <button class="session-action-btn edit" onclick="openEditSession('${s.id}')">Edit</button>
                <button class="session-action-btn delete" onclick="deleteSession('${s.id}')">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ── Recent Processes ──────────────────────────────────
function renderRecentProcesses() {
    const list = document.getElementById('recentProcessesList');
    if (!list) return;

    const untracked = recentProcesses.filter(p => {
        const pName = (p.processName || '').toLowerCase().replace(/\.exe$/i, '');
        return !games.some(g => {
            const gName = (g.processName || '').toLowerCase().replace(/\.exe$/i, '');
            return gName === pName || (g.exePath && g.exePath.toLowerCase() === (p.path || '').toLowerCase());
        });
    });

    if (!untracked.length) {
        list.innerHTML = '<div class="loading-text">No new processes detected. Launch a game to see it here.</div>';
        return;
    }

    list.innerHTML = '';
    untracked.slice(0, 15).forEach(p => {
        const title   = (p.title && p.title.length < 60 && p.title !== p.processName) ? p.title : p.processName;
        const safePName = (p.processName || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const safePath  = (p.path || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const safeTitle = title.replace(/'/g, "\\'").replace(/"/g, '&quot;');

        const div = document.createElement('div');
        div.className = 'process-item';
        div.innerHTML = `
            <div class="process-item-info">
                <div class="process-name">${title}</div>
                <div class="process-path" title="${p.path || ''}">${p.path || 'Unknown path'}</div>
            </div>
            <button class="btn-secondary process-track-btn"
                onclick="prefillModal('${safePName}','${safePath}','${safeTitle}')">
                Track
            </button>
        `;
        list.appendChild(div);
    });
}

// ── Untrack / Edit Cover ──────────────────────────────
async function untrackGame(id, e) {
    e.stopPropagation();
    if (!confirm('Stop tracking this game? Your session history will be preserved.')) return;
    await fetch('/api/games/untrack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    });
    fetchAll();
}

function openEditCover(id, e) {
    e.stopPropagation();
    const game = games.find(g => g.id === id);
    if (!game) return;
    document.getElementById('editGameId').value = id;
    document.getElementById('editCoverUrl').value = game.coverUrl || '';
    const preview = document.getElementById('editCoverPreview');
    if (game.coverUrl) {
        preview.style.backgroundImage = `url(${game.coverUrl})`;
        preview.querySelector('.cover-placeholder-text').style.display = 'none';
    } else {
        preview.style.backgroundImage = 'none';
        preview.querySelector('.cover-placeholder-text').style.display = '';
    }
    document.getElementById('editCoverModal').classList.add('active');
}

function initEditCoverModal() {
    document.getElementById('editCoverUrl').addEventListener('input', e => {
        const url = e.target.value;
        const preview = document.getElementById('editCoverPreview');
        if (url) {
            preview.style.backgroundImage = `url(${url})`;
            preview.querySelector('.cover-placeholder-text').style.display = 'none';
        } else {
            preview.style.backgroundImage = 'none';
            preview.querySelector('.cover-placeholder-text').style.display = '';
        }
    });

    document.getElementById('saveEditCoverBtn').addEventListener('click', async () => {
        const id  = document.getElementById('editGameId').value;
        const url = document.getElementById('editCoverUrl').value.trim();
        await fetch('/api/games/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, coverUrl: url })
        });
        closeModal('editCoverModal');
        fetchAll();
    });
}

// ── Add Game Modal ────────────────────────────────────
function initModal() {
    document.getElementById('addGameBtn').addEventListener('click', () => {
        clearModal();
        fetchAll(); // refresh processes
        document.getElementById('addGameModal').classList.add('active');
    });

    // Browse button → Electron native dialog
    document.getElementById('browseBtn').addEventListener('click', async () => {
        const btn = document.getElementById('browseBtn');
        btn.disabled = true;
        btn.textContent = 'Opening...';
        try {
            const api = window.electronAPI;
            if (!api) throw new Error('Not running in Electron');
            const filePath = await api.openFileDialog();
            if (filePath) {
                document.getElementById('gamePathInput').value = filePath;
                const fileName = filePath.split('\\').pop();
                const processName = fileName.replace(/\.exe$/i, '');
                document.getElementById('processNameInput').value = processName;
                if (!document.getElementById('gameTitleInput').value) {
                    document.getElementById('gameTitleInput').value = processName;
                    triggerCoverSearch(processName);
                }
            }
        } catch (err) {
            console.error('Browse error:', err);
        }
        btn.disabled = false;
        btn.textContent = 'Browse...';
    });

    // Auto cover art search when title is typed
    let searchTimer = null;
    document.getElementById('gameTitleInput').addEventListener('input', e => {
        clearTimeout(searchTimer);
        const val = e.target.value.trim();
        if (val.length > 2) {
            searchTimer = setTimeout(() => triggerCoverSearch(val), 700);
        }
    });

    // Cover URL preview
    document.getElementById('coverUrlInput').addEventListener('input', e => {
        updateCoverPreview('coverPreview', e.target.value);
    });

    // Save button
    document.getElementById('saveGameBtn').addEventListener('click', saveGame);
}

async function triggerCoverSearch(title) {
    const status = document.getElementById('coverSearchStatus');
    status.textContent = 'Searching for cover art...';
    try {
        const res  = await fetch(`/api/cover-search?q=${encodeURIComponent(title)}`);
        const data = await res.json();
        if (data.coverUrl) {
            document.getElementById('coverUrlInput').value = data.coverUrl;
            updateCoverPreview('coverPreview', data.coverUrl);
            status.textContent = '✓ Cover art found on Steam';
        } else {
            status.textContent = 'No cover found – you can paste a URL manually.';
        }
    } catch (e) {
        status.textContent = '';
    }
}

function updateCoverPreview(previewId, url) {
    const box = document.getElementById(previewId);
    if (!box) return;
    const placeholder = box.querySelector('.cover-placeholder-text');
    if (url) {
        box.style.backgroundImage = `url(${url})`;
        if (placeholder) placeholder.style.display = 'none';
    } else {
        box.style.backgroundImage = 'none';
        if (placeholder) placeholder.style.display = '';
    }
}

async function saveGame() {
    const name        = document.getElementById('gameTitleInput').value.trim();
    const exePath     = document.getElementById('gamePathInput').value.trim();
    const processName = document.getElementById('processNameInput').value.trim();
    const coverUrl    = document.getElementById('coverUrlInput').value.trim();

    if (!name) { alert('Please enter a game title.'); return; }
    if (!processName && !exePath) {
        alert('Please provide either a process name or browse to the game executable.');
        return;
    }

    await fetch('/api/games/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, processName, exePath, coverUrl })
    });

    closeModal('addGameModal');
    fetchAll();
}

function prefillModal(processName, filePath, title) {
    clearModal();
    document.getElementById('gameTitleInput').value   = title || processName;
    document.getElementById('gamePathInput').value    = filePath || '';
    document.getElementById('processNameInput').value = processName || '';
    if (title) triggerCoverSearch(title);
}

function clearModal() {
    document.getElementById('gameTitleInput').value   = '';
    document.getElementById('gamePathInput').value    = '';
    document.getElementById('processNameInput').value = '';
    document.getElementById('coverUrlInput').value    = '';
    document.getElementById('coverSearchStatus').textContent = '';
    updateCoverPreview('coverPreview', '');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
        if (e.target === overlay) overlay.classList.remove('active');
    });
});

// ── Settings & Archiving ──────────────────────────────
function initSettingsUI() {
    const saveBtn = document.getElementById('saveSettingsBtn');
    const syncBtn = document.getElementById('syncSteamBtn');
    const themeSelect = document.getElementById('themeSelect');

    if (themeSelect) {
        themeSelect.value = localStorage.getItem('appTheme') || 'dark';
        themeSelect.addEventListener('change', (e) => {
            const theme = e.target.value;
            document.documentElement.setAttribute('data-theme', theme);
            localStorage.setItem('appTheme', theme);
        });
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const steamApiKey = document.getElementById('steamApiKeyInput').value.trim();
            const steamId = document.getElementById('steamIdInput').value.trim();
            saveBtn.textContent = 'Saving...';
            await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ steamApiKey, steamId })
            });
            setTimeout(() => { saveBtn.textContent = 'Save Keys'; }, 500);
            fetchAll();
        });
    }

    if (syncBtn) {
        syncBtn.addEventListener('click', async () => {
            syncBtn.disabled = true;
            syncBtn.textContent = 'Syncing...';
            const statusEl = document.getElementById('steamSyncStatus');
            try {
                const res = await fetch('/api/sync/steam', { method: 'POST' });
                const data = await res.json();
                if (data.success) {
                    statusEl.textContent = `Sync successful! Updated ${data.syncCount} games.`;
                    statusEl.style.color = 'var(--green)';
                } else {
                    throw new Error(data.error);
                }
            } catch (e) {
                statusEl.textContent = `Error: ${e.message}`;
                statusEl.style.color = 'var(--red)';
            }
            syncBtn.disabled = false;
            syncBtn.textContent = 'Sync Steam Playtime';
            fetchAll();
        });
    }

    // Populate inputs initially if we have settings
    setTimeout(() => {
        if (settings.steamApiKey) document.getElementById('steamApiKeyInput').value = settings.steamApiKey;
        if (settings.steamId) document.getElementById('steamIdInput').value = settings.steamId;
    }, 500);
}

function renderArchivedGames() {
    const list = document.getElementById('archivedGamesList');
    if (!list) return;

    const archived = games.filter(g => g.archived);
    if (!archived.length) {
        list.innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem;">No archived games.</div>';
        return;
    }

    list.innerHTML = '';
    archived.forEach(g => {
        const item = document.createElement('div');
        item.className = 'archived-item';
        item.innerHTML = `
            <div class="archived-item-name">${g.name}</div>
            <div class="archived-item-actions">
                <button class="session-action-btn" onclick="restoreGame('${g.id}')">Restore</button>
                <button class="session-action-btn delete" onclick="deleteGamePermanently('${g.id}')">Delete Permanently</button>
            </div>
        `;
        list.appendChild(item);
    });
}

async function restoreGame(id) {
    await fetch('/api/games/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    });
    fetchAll();
}

async function deleteGamePermanently(id) {
    if (!confirm('Are you sure you want to PERMANENTLY delete this game and ALL its history? This cannot be undone.')) return;
    await fetch('/api/games/delete-permanently', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    });
    fetchAll();
}

// ── Session Editing ───────────────────────────────────
// Helper to get local ISO string for datetime-local inputs
function toLocalISOString(dateString) {
    const date = new Date(dateString);
    const tzOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - tzOffset).toISOString().slice(0, 19);
}

function openEditSession(id) {
    const session = sessions.find(s => s.id === id);
    if (!session) return;

    document.getElementById('editSessionId').value = session.id;
    
    // Set native datetime-local inputs using local time
    document.getElementById('editSessionStart').value = toLocalISOString(session.startTime);
    document.getElementById('editSessionEnd').value = toLocalISOString(session.endTime);

    document.getElementById('editSessionTotalMins').value = Math.round(session.duration / 60000);
    document.getElementById('editSessionIdleMins').value = Math.round((session.idleTime || 0) / 60000);

    document.getElementById('editSessionModal').classList.add('active');
}

// Auto-calculate duration when dates change
function updateDurationFromDates() {
    const startVal = document.getElementById('editSessionStart').value;
    const endVal = document.getElementById('editSessionEnd').value;
    if (startVal && endVal) {
        const start = new Date(startVal).getTime();
        const end = new Date(endVal).getTime();
        if (end > start) {
            document.getElementById('editSessionTotalMins').value = Math.round((end - start) / 60000);
        }
    }
}

document.getElementById('editSessionStart')?.addEventListener('change', updateDurationFromDates);
document.getElementById('editSessionEnd')?.addEventListener('change', updateDurationFromDates);

// Auto-calculate end date when duration changes
document.getElementById('editSessionTotalMins')?.addEventListener('input', () => {
    const startVal = document.getElementById('editSessionStart').value;
    const totalMins = parseInt(document.getElementById('editSessionTotalMins').value) || 0;
    if (startVal) {
        const start = new Date(startVal).getTime();
        const end = start + (totalMins * 60000);
        document.getElementById('editSessionEnd').value = toLocalISOString(new Date(end).toISOString());
    }
});

document.getElementById('saveSessionBtn')?.addEventListener('click', async () => {
    const id = document.getElementById('editSessionId').value;
    const startInput = document.getElementById('editSessionStart').value;
    const endInput = document.getElementById('editSessionEnd').value;
    const totalMins = parseInt(document.getElementById('editSessionTotalMins').value) || 0;
    const idleMins = parseInt(document.getElementById('editSessionIdleMins').value) || 0;

    const startTime = new Date(startInput).toISOString();
    const endTime = new Date(endInput).toISOString();
    const durationMs = totalMins * 60000;
    const idleMs = idleMins * 60000;
    const activeMs = Math.max(0, durationMs - idleMs);

    await fetch('/api/sessions/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            id,
            startTime,
            endTime,
            duration: durationMs,
            activeTime: activeMs,
            idleTime: idleMs
        })
    });

    closeModal('editSessionModal');
    fetchAll();
});

async function deleteSession(id) {
    if (!confirm('Delete this session? This will subtract from the game\'s total playtime.')) return;
    await fetch('/api/sessions/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    });
    fetchAll();
}

// ── Game Details & Individual Graphs ──────────────────
function openGameDetails(id) {
    const game = games.find(g => g.id === id);
    if (!game) return;

    document.getElementById('detailsGameTitle').textContent = game.name;
    document.getElementById('detailsTrackerTime').textContent = fmtDuration(game.totalPlayTime);
    
    let combinedMs = game.totalPlayTime || 0;
    if (game.steamPlaytime != null) {
        document.getElementById('detailsSteamTime').textContent = fmtDuration(game.steamPlaytime);
        combinedMs = Math.max(game.totalPlayTime || 0, game.steamPlaytime);
        document.getElementById('detailsCombinedTime').textContent = fmtDuration(combinedMs);
    } else {
        document.getElementById('detailsSteamTime').textContent = '--';
        document.getElementById('detailsCombinedTime').textContent = '--';
    }

    renderGameDetailChart(game.id);
    document.getElementById('gameDetailsModal').classList.add('active');
}

function renderGameDetailChart(gameId) {
    const canvas = document.getElementById('gameDetailChart');
    if (!canvas) return;

    if (gameDetailChartInstance) {
        gameDetailChartInstance.destroy();
    }

    const gameSessions = sessions.filter(s => s.gameId === gameId);
    
    // Group by day for last 14 days
    const days = 14;
    const now = new Date();
    now.setHours(0,0,0,0);
    const dayData = new Array(days).fill(0);
    const labels = new Array(days).fill('');

    for (let i = 0; i < days; i++) {
        const d = new Date(now.getTime() - (days - 1 - i) * 86400000);
        labels[i] = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    gameSessions.forEach(s => {
        const d = new Date(s.startTime);
        d.setHours(0,0,0,0);
        const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
        if (diffDays >= 0 && diffDays < days) {
            dayData[days - 1 - diffDays] += (s.duration || 0) / (1000 * 60 * 60); // in hours
        }
    });

    const ctx = canvas.getContext('2d');
    gameDetailChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Hours Played',
                data: dayData,
                backgroundColor: 'rgba(124, 58, 237, 0.7)',
                borderRadius: 4,
                hoverBackgroundColor: 'rgba(167, 139, 250, 1)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(ctx) { return ctx.raw.toFixed(1) + ' hrs'; }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: '#64748b' },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                x: {
                    ticks: { color: '#64748b', maxRotation: 45, minRotation: 45 },
                    grid: { display: false }
                }
            }
        }
    });
}
