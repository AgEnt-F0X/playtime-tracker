const express = require('express');
const fs = require('fs/promises');
const { existsSync, readdirSync, readFileSync, statSync, openSync, readSync, closeSync } = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const os = require('os');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const dbDir = path.join(os.homedir(), '.playtime-tracker');
const dbPath = path.join(dbDir, 'db.json');
const artDir = path.join(dbDir, 'art');

let db = { games: {}, sessions: [], recentProcesses: [], dismissed: [], settings: {} };

// ─── Database ──────────────────────────────────────────────────────────────

async function initDb() {
    if (!existsSync(dbDir)) {
        await fs.mkdir(dbDir, { recursive: true });
    }
    if (!existsSync(artDir)) {
        await fs.mkdir(artDir, { recursive: true });
    }
    if (existsSync(dbPath)) {
        try {
            const data = await fs.readFile(dbPath, 'utf8');
            db = JSON.parse(data);
            if (!db.games) db.games = {};
            if (!db.sessions) db.sessions = [];
            if (!db.recentProcesses) db.recentProcesses = [];
            if (!db.dismissed) db.dismissed = []; // IDs of auto-detected games user removed
            if (!db.settings) db.settings = {};
        } catch (e) {
            console.error('Error reading db:', e);
        }
    } else {
        await saveDb();
    }
    setInterval(saveDb, 30000);
}

async function saveDb() {
    try {
        await fs.writeFile(dbPath, JSON.stringify(db, null, 2), 'utf8');
    } catch (e) {
        console.error('Error saving db:', e);
    }
}

// ─── Settings API ──────────────────────────────────────────────────────────

app.get('/api/settings', (req, res) => {
    res.json(db.settings);
});

app.post('/api/settings', async (req, res) => {
    db.settings = { ...db.settings, ...req.body };
    await saveDb();
    res.json(db.settings);
});

// ─── VDF / ACF Parser ──────────────────────────────────────────────────────
// Valve's VDF/ACF format is a custom key-value text format, not JSON.
// We parse it into a nested object.

function parseVdf(text) {
    const result = {};
    const stack = [result];
    const lines = text.split('\n');
    for (const raw of lines) {
        const line = raw.trim();
        if (!line || line.startsWith('//')) continue;

        // Match key-value pair: "key"  "value"
        const kvMatch = line.match(/^"([^"]+)"\s+"([^"]*)"$/);
        if (kvMatch) {
            stack[stack.length - 1][kvMatch[1]] = kvMatch[2];
            continue;
        }
        // Match section header: "key"
        const secMatch = line.match(/^"([^"]+)"$/);
        if (secMatch) {
            const obj = {};
            stack[stack.length - 1][secMatch[1]] = obj;
            stack.push(obj);
            continue;
        }
        if (line === '{') continue;
        if (line === '}') {
            if (stack.length > 1) stack.pop();
            continue;
        }
    }
    return result;
}

// ─── Auto-Detection: Steam ─────────────────────────────────────────────────

const STEAM_NON_GAME_APPIDS = new Set([
    '228980',  // Steamworks Common Redistributables
    '1070560', // Steam Linux Runtime
    '1391110', // Steam Linux Runtime - Soldier
    '1493710', // Proton Experimental
    '1887720', // Proton 8
    '2180100', // Proton 9
    '2348590', // Proton 9
]);

function findSteamLibraryPaths() {
    const steamPaths = [
        path.join('C:', 'Program Files (x86)', 'Steam'),
        path.join('C:', 'Program Files', 'Steam'),
        path.join(os.homedir(), '.steam', 'steam'),
    ];

    const libraryPaths = [];

    for (const steamPath of steamPaths) {
        const vdfPath = path.join(steamPath, 'steamapps', 'libraryfolders.vdf');
        if (!existsSync(vdfPath)) continue;
        try {
            const text = readFileSync(vdfPath, 'utf8');
            const parsed = parseVdf(text);
            const folders = parsed.libraryfolders || parsed.LibraryFolders || {};
            for (const key of Object.keys(folders)) {
                if (typeof folders[key] === 'object' && folders[key].path) {
                    libraryPaths.push(folders[key].path.replace(/\\\\/g, '\\'));
                }
            }
        } catch (e) {
            console.error('Error parsing libraryfolders.vdf:', e.message);
        }
    }
    return libraryPaths;
}

function scanSteamGames() {
    const games = [];
    const libraryPaths = findSteamLibraryPaths();

    for (const libPath of libraryPaths) {
        const appsDir = path.join(libPath, 'steamapps');
        if (!existsSync(appsDir)) continue;

        let files;
        try { files = readdirSync(appsDir); } catch { continue; }

        for (const file of files) {
            if (!file.startsWith('appmanifest_') || !file.endsWith('.acf')) continue;
            try {
                const text = readFileSync(path.join(appsDir, file), 'utf8');
                const parsed = parseVdf(text);
                const state = parsed.AppState || {};
                const appId = state.appid;
                const name = state.name;
                const installDir = state.installdir;

                if (!appId || !name || STEAM_NON_GAME_APPIDS.has(appId)) continue;

                const fullInstallPath = path.join(appsDir, 'common', installDir);
                games.push({
                    appId,
                    name,
                    installPath: fullInstallPath,
                    platform: 'Steam'
                });
            } catch (e) {
                console.error(`Error reading ${file}:`, e.message);
            }
        }
    }
    return games;
}

// ─── Auto-Detection: Epic Games ────────────────────────────────────────────

function scanEpicGames() {
    const games = [];
    const manifestDir = path.join('C:', 'ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
    if (!existsSync(manifestDir)) return games;

    let files;
    try { files = readdirSync(manifestDir); } catch { return games; }

    for (const file of files) {
        if (!file.endsWith('.item')) continue;
        try {
            const text = readFileSync(path.join(manifestDir, file), 'utf8');
            const manifest = JSON.parse(text);
            if (manifest.DisplayName && manifest.InstallLocation) {
                const exeName = manifest.LaunchExecutable || '';
                games.push({
                    name: manifest.DisplayName,
                    installPath: manifest.InstallLocation,
                    exePath: exeName ? path.join(manifest.InstallLocation, exeName) : '',
                    platform: 'Epic'
                });
            }
        } catch (e) {
            console.error(`Error reading Epic manifest ${file}:`, e.message);
        }
    }
    return games;
}

// ─── Auto-Detection: Windows Registry ──────────────────────────────────────

// Patterns that indicate this is NOT a game
const REGISTRY_IGNORE_PATTERNS = [
    // Hardware & drivers
    /nvidia/i, /intel/i, /realtek/i, /amd\s/i, /driver/i, /physx/i, /shader/i,
    // System / Microsoft / Frameworks
    /microsoft/i, /visual\s*c\+\+/i, /\.net/i, /directx/i, /vulkan/i,
    /redistribut/i, /runtime/i, /framework/i, /^windows/i,
    // Utilities
    /^7-zip/i, /^git$/i, /^node/i, /^python/i, /^java\s/i, /^ruby/i, /^go\s/i, /^rust/i,
    /vlc/i, /notepad/i, /winrar/i, /^vim/i, /^curl/i, /^wget/i,
    // Browsers
    /chrome/i, /firefox/i, /edge/i, /brave/i, /opera/i, /zen\s*browser/i, /vivaldi/i, /safari/i,
    // IDEs & Dev tools
    /visual\s*studio/i, /^vs\s/i, /^vs$/i, /jetbrains/i, /^code$/i, /android\s*studio/i,
    // Communication
    /discord/i, /slack/i, /zoom/i, /teams/i, /telegram/i, /skype/i, /whatsapp/i,
    // Launchers (already scanned separately)
    /steam\s*client/i, /^epic\s*games/i, /^gog\s*galaxy/i, /^ubisoft/i, /^ea\s*app/i,
    // Office / Productivity
    /calculator/i, /^calc$/i, /office/i, /word$/i, /excel/i, /outlook/i, /powershell/i,
    /onenote/i, /powerpoint/i, /access/i, /publisher/i,
    /foxit/i, /adobe/i, /acrobat/i, /pdf/i, /reader/i,
    /wondershare/i, /filmora/i, /camtasia/i, /obs\s/i,
    // System customization & widgets
    /rainmeter/i, /wallpaper/i, /lively/i, /winaero/i, /powertoys/i,
    // AI / ML / server tools
    /ollama/i, /docker/i, /kubernetes/i, /terraform/i, /ansible/i, /vagrant/i,
    // Generic non-game keywords
    /update/i, /helper/i, /service/i, /plugin/i, /extension/i,
    /sdk/i, /cli$/i, /daemon/i, /agent/i, /telemetry/i, /container/i, /watchdog/i,
    /audio/i, /sound/i, /nvcpl/i, /backend$/i,
    /installer/i, /setup/i, /uninstall/i, /cleaner/i, /optimizer/i,
    /backup/i, /sync/i, /cloud/i, /vpn/i, /antivirus/i, /malware/i, /security/i,
    /printer/i, /scanner/i, /monitor/i, /diagnostic/i,
    /version\s*\d/i, /build\s*\d/i   // Entries with version numbers in the name (e.g. "Ollama version 0.30.8")
];

function scanRegistryGames() {
    const games = [];
    const scriptPath = path.join(__dirname, '_scan_reg.ps1');

    // Write a small PowerShell script to scan the registry properly
    const psScript = `
$results = @()
$paths = @(
    'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
    'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
    'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)
foreach ($p in $paths) {
    try {
        Get-ItemProperty $p -ErrorAction SilentlyContinue | Where-Object {
            $_.InstallLocation -and $_.DisplayName
        } | ForEach-Object {
            $results += [PSCustomObject]@{
                DisplayName = $_.DisplayName
                InstallLocation = $_.InstallLocation
                DisplayIcon = if ($_.DisplayIcon) { $_.DisplayIcon } else { "" }
            }
        }
    } catch {}
}
$results | ConvertTo-Json -Compress
`;

    try {
        require('fs').writeFileSync(scriptPath, psScript, 'utf8');
        const output = execSync(`powershell -ExecutionPolicy Bypass -File "${scriptPath}"`, {
            encoding: 'utf8',
            timeout: 15000,
            windowsHide: true
        });
        try { require('fs').unlinkSync(scriptPath); } catch {}

        let entries;
        try { entries = JSON.parse(output); } catch { return games; }
        if (!Array.isArray(entries)) entries = [entries];

        for (const entry of entries) {
            if (!entry.DisplayName || !entry.InstallLocation) continue;

            // Skip entries that are already detected by Steam or Epic
            const installLoc = entry.InstallLocation.toLowerCase();
            if (installLoc.includes('steamapps') || installLoc.includes('epic games')) continue;

            // Skip non-game software
            const name = entry.DisplayName;
            if (REGISTRY_IGNORE_PATTERNS.some(pat => pat.test(name))) continue;

            // Try to find an exe in the install path
            let exePath = '';
            if (entry.DisplayIcon && entry.DisplayIcon.endsWith('.exe')) {
                exePath = entry.DisplayIcon.split(',')[0]; // DisplayIcon can be "path.exe,0"
            }

            games.push({
                name,
                installPath: entry.InstallLocation,
                exePath,
                platform: 'Registry'
            });
        }
    } catch (e) {
        console.error('Registry scan error:', e.message);
    }

    return games;
}

// ─── Cover Art Fetching ────────────────────────────────────────────────────

async function fetchCoverUrl(gameName, steamAppId) {
    // If we have a Steam AppID, try the portrait capsules first, then header
    if (steamAppId) {
        const portrait2x = `https://cdn.cloudflare.steamstatic.com/steam/apps/${steamAppId}/library_600x900_2x.jpg`;
        const portrait1x = `https://cdn.cloudflare.steamstatic.com/steam/apps/${steamAppId}/library_600x900.jpg`;
        try {
            const res = await fetch(portrait2x, { method: 'HEAD' });
            if (res.ok) return portrait2x;
        } catch {}
        try {
            const res1 = await fetch(portrait1x, { method: 'HEAD' });
            if (res1.ok) return portrait1x;
        } catch {}
        // Fallback to header (available for nearly all Steam games)
        return `https://cdn.cloudflare.steamstatic.com/steam/apps/${steamAppId}/header.jpg`;
    }

    // No AppID — search by name on Steam
    try {
        const searchRes = await fetch(
            `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(gameName)}&l=english&cc=US`
        );
        const data = await searchRes.json();
        if (data && data.items && data.items.length > 0) {
            const appId = data.items[0].id;
            // Try portrait first
            const portrait2x = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900_2x.jpg`;
            const portrait1x = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`;
            try {
                const headRes = await fetch(portrait2x, { method: 'HEAD' });
                if (headRes.ok) return portrait2x;
            } catch {}
            try {
                const headRes1 = await fetch(portrait1x, { method: 'HEAD' });
                if (headRes1.ok) return portrait1x;
            } catch {}
            return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`;
        }
    } catch {}

    // Steam didn't find cover — fallback to SteamGridDB if key configured
    const sgdbKey = db.settings && db.settings.steamGridDbKey ? db.settings.steamGridDbKey.trim() : null;
    if (sgdbKey && gameName) {
        try {
            const _fetch = typeof fetch === 'function' ? fetch : (await import('node-fetch')).default;
            const sr = await _fetch(`https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(gameName)}`, {
                headers: { 'Authorization': `Bearer ${sgdbKey}` }
            });
            if (sr.ok) {
                const sd = await sr.json();
                if (sd.success && sd.data && sd.data.length > 0) {
                    const gameId = sd.data[0].id;
                    const gr = await _fetch(`https://www.steamgriddb.com/api/v2/grids/game/${gameId}?dimensions=600x900`, {
                        headers: { 'Authorization': `Bearer ${sgdbKey}` }
                    });
                    if (gr.ok) {
                        const gd = await gr.json();
                        if (gd.success && gd.data && gd.data.length > 0 && gd.data[0].url) {
                            return gd.data[0].url;
                        }
                    }
                }
            }
        } catch (e) {}
    }

    return '';
}

// ─── Master Scan Orchestrator ──────────────────────────────────────────────

async function scanAndAddGames() {
    console.log('🔍 Scanning for installed games...');

    const steamGames = scanSteamGames();
    const epicGames = scanEpicGames();
    const registryGames = scanRegistryGames();

    console.log(`   Found: ${steamGames.length} Steam, ${epicGames.length} Epic, ${registryGames.length} Registry`);

    const allDetected = [...steamGames, ...epicGames, ...registryGames];
    let added = 0;

    for (const detected of allDetected) {
        // Build a stable key so we don't duplicate on re-scans
        const stableId = `auto_${detected.platform}_${(detected.appId || detected.name).replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;

        const isHelper = (filename) => {
            const lower = filename.toLowerCase();
            const helpers = [
                'crash', 'report', 'install', 'setup', 'unins', 'config', 'tool', 
                'launch', 'update', 'patch', 'download', 'helper', 'message', 
                'touchup', 'redist', 'register', 'activation', 'login', 'server', 'workshop'
            ];
            return helpers.some(h => lower.includes(h));
        };

        // Find the main executable for process-name matching
        let processName = '';
        let exePath = detected.exePath || '';
        if (detected.exePath && existsSync(detected.exePath)) {
            processName = path.basename(detected.exePath).replace(/\.exe$/i, '');
        } else if (detected.installPath && existsSync(detected.installPath)) {
            // Try to find the most likely game exe in the install folder
            try {
                const files = readdirSync(detected.installPath);
                const exes = files.filter(f => f.endsWith('.exe'));
                
                // Filter out common launcher/helper helper apps if there are other choices
                const gameExes = exes.filter(e => !isHelper(e));
                const candidateExes = gameExes.length > 0 ? gameExes : exes;

                const nameLower = detected.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                
                // Initials, e.g. "Resident Evil 4" -> "re4"
                const initials = detected.name.toLowerCase()
                    .split(/[\s\-_]+/)
                    .map(w => w[0])
                    .join('')
                    .replace(/[^a-z0-9]/g, '');

                let bestMatch = candidateExes.find(e => {
                    const eLower = e.toLowerCase().replace('.exe', '').replace(/[^a-z0-9]/g, '');
                    return eLower === nameLower ||
                           eLower === initials ||
                           eLower.includes(nameLower) ||
                           nameLower.includes(eLower) ||
                           (initials.length >= 2 && eLower.includes(initials)) ||
                           (initials.length >= 2 && initials.includes(eLower));
                });

                // Fallback to the largest executable (main game exes are typically much larger)
                if (!bestMatch && candidateExes.length > 0) {
                    try {
                        const sizes = candidateExes.map(e => {
                            const stat = statSync(path.join(detected.installPath, e));
                            return { name: e, size: stat.size };
                        });
                        sizes.sort((a, b) => b.size - a.size);
                        bestMatch = sizes[0].name;
                    } catch {
                        bestMatch = candidateExes[0];
                    }
                }

                const chosenExe = bestMatch || '';
                if (chosenExe) {
                    processName = chosenExe.replace(/\.exe$/i, '');
                    exePath = path.join(detected.installPath, chosenExe);
                    detected.exePath = exePath;
                }
            } catch {}
        }

        // If already in DB, perform a repair check if it currently points to a helper
        if (db.games[stableId]) {
            const existing = db.games[stableId];
            const needsRepair = !existing.processName || 
                                isHelper(existing.processName) ||
                                (processName && existing.processName !== processName.toLowerCase() && isHelper(existing.processName));
            if (needsRepair && processName) {
                console.log(`   🛠 Repaired game process: ${existing.name} (${existing.processName} -> ${processName.toLowerCase()})`);
                existing.processName = processName.toLowerCase();
                existing.exePath = exePath;
                added++;
            }
            continue;
        }

        if (db.dismissed.includes(stableId)) continue;

        // Fetch cover art (async, in the background)
        let coverUrl = '';
        try {
            coverUrl = await fetchCoverUrl(detected.name, detected.appId || null);
        } catch {}

        db.games[stableId] = {
            id: stableId,
            name: detected.name,
            processName: processName.toLowerCase(),
            exePath: detected.exePath || '',
            platform: detected.platform,
            totalPlayTime: 0,
            lastPlayed: null,
            coverUrl
        };
        added++;
        console.log(`   ✓ Added: ${detected.name} [${detected.platform}]`);
    }

    if (added > 0) await saveDb();
    console.log(`🎮 Scan complete. ${added} new game(s) added.`);
}

// ─── API Endpoints ─────────────────────────────────────────────────────────

app.get('/api/games', (req, res) => res.json(Object.values(db.games)));

app.get('/api/sessions', (req, res) => {
    const sorted = [...db.sessions].sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    res.json(sorted);
});

app.get('/api/processes', (req, res) => {
    const sorted = [...db.recentProcesses].sort((a, b) => b.timestamp - a.timestamp);
    res.json(sorted.slice(0, 30));
});


function isValidCachedImage(filePath) {
    if (!existsSync(filePath)) return false;
    try {
        const stat = statSync(filePath);
        if (stat.size < 100) return false;
        const buf = Buffer.alloc(16);
        const fd = openSync(filePath, 'r');
        readSync(fd, buf, 0, 16, 0);
        closeSync(fd);
        // JPEG magic bytes (FF D8 FF)
        const isJpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
        // PNG magic bytes (89 50 4E 47)
        const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
        // WEBP magic bytes (RIFF .... WEBP)
        const isWebp = buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP';
        // HTML error check
        const textPrefix = buf.toString('utf8').trim().toLowerCase();
        if (textPrefix.startsWith('<!doc') || textPrefix.startsWith('<html') || textPrefix.startsWith('<?xml')) {
            return false;
        }
        return isJpg || isPng || isWebp;
    } catch {
        return false;
    }
}

async function downloadAndCacheArt(url, targetPath) {
    try {
        const _fetch = typeof fetch === 'function' ? fetch : (await import('node-fetch')).default;
        const res = await _fetch(url, { method: 'GET' });
        if (!res.ok) return false;
        const contentType = res.headers.get('content-type') || '';
        if (contentType.toLowerCase().includes('text/html')) return false;

        const arrayBuffer = await res.arrayBuffer();
        const buf = Buffer.from(arrayBuffer);
        if (buf.length < 100) return false;

        const textPrefix = buf.slice(0, 30).toString('utf8').trim().toLowerCase();
        if (textPrefix.startsWith('<!doc') || textPrefix.startsWith('<html') || textPrefix.startsWith('<?xml')) {
            return false;
        }

        await fs.writeFile(targetPath, buf);
        return true;
    } catch (e) {
        return false;
    }
}

// ─── Art Cache & Lookup Endpoints ─────────────────────────────────────────

app.get('/api/art/:gameId', async (req, res) => {
    const { gameId } = req.params;
    const type = req.query.type || 'cover'; // 'hero' | 'logo' | 'cover'
    const game = db.games[gameId];
    if (!game) return res.status(404).json({ error: 'Game not found' });

    const ext = type === 'logo' ? 'png' : 'jpg';
    const cachedFile = path.join(artDir, `${gameId}_${type}.${ext}`);
    if (existsSync(cachedFile)) {
        if (isValidCachedImage(cachedFile)) {
            return res.sendFile(cachedFile);
        }
        // Corrupt/zero-byte cached file: delete and refetch
        try { await fs.unlink(cachedFile).catch(() => {}); } catch {}
    }

    let appId = null;
    if (gameId.toLowerCase().startsWith('auto_steam_')) {
        appId = gameId.replace(/^auto_steam_/i, '');
    } else if (game.coverUrl) {
        const m = game.coverUrl.match(/\/apps\/(\d+)\//);
        if (m) appId = m[1];
    }

    const candidateUrls = [];
    if (appId) {
        if (type === 'hero') {
            candidateUrls.push(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_hero.jpg`);
            candidateUrls.push(`https://steamcdn-a.akamaihd.net/steam/apps/${appId}/library_hero.jpg`);
            candidateUrls.push(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`);
        } else if (type === 'logo') {
            candidateUrls.push(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/logo.png`);
            candidateUrls.push(`https://steamcdn-a.akamaihd.net/steam/apps/${appId}/logo.png`);
        } else {
            if (game.coverUrl) candidateUrls.push(game.coverUrl);
            candidateUrls.push(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900_2x.jpg`);
            candidateUrls.push(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`);
            candidateUrls.push(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`);
        }
    } else {
        if (type === 'cover' && game.coverUrl) {
            candidateUrls.push(game.coverUrl);
        }
    }

    const sgdbKey = db.settings && db.settings.steamGridDbKey ? db.settings.steamGridDbKey.trim() : null;
    if (sgdbKey) {
        try {
            const _fetch = typeof fetch === 'function' ? fetch : (await import('node-fetch')).default;
            let sgdbGameId = null;
            if (appId) {
                const r = await _fetch(`https://www.steamgriddb.com/api/v2/games/steam/${appId}`, {
                    headers: { 'Authorization': `Bearer ${sgdbKey}` }
                });
                if (r.ok) {
                    const d = await r.json();
                    if (d.success && d.data) sgdbGameId = d.data.id;
                }
            }
            if (!sgdbGameId && game.name) {
                const r = await _fetch(`https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(game.name)}`, {
                    headers: { 'Authorization': `Bearer ${sgdbKey}` }
                });
                if (r.ok) {
                    const d = await r.json();
                    if (d.success && d.data && d.data.length > 0) sgdbGameId = d.data[0].id;
                }
            }
            if (sgdbGameId) {
                const endpointMap = {
                    hero: `https://www.steamgriddb.com/api/v2/heroes/game/${sgdbGameId}`,
                    logo: `https://www.steamgriddb.com/api/v2/logos/game/${sgdbGameId}`,
                    cover: `https://www.steamgriddb.com/api/v2/grids/game/${sgdbGameId}?dimensions=600x900`
                };
                const sgdbEndpoint = endpointMap[type] || endpointMap.cover;
                const r = await _fetch(sgdbEndpoint, {
                    headers: { 'Authorization': `Bearer ${sgdbKey}` }
                });
                if (r.ok) {
                    const d = await r.json();
                    if (d.success && d.data && d.data.length > 0 && d.data[0].url) {
                        candidateUrls.push(d.data[0].url);
                    }
                }
            }
        } catch (e) {
            console.error('SGDB art error:', e.message);
        }
    }

    for (const url of candidateUrls) {
        const success = await downloadAndCacheArt(url, cachedFile);
        if (success && isValidCachedImage(cachedFile)) {
            return res.sendFile(cachedFile);
        }
    }

    if (type === 'cover' && game.coverUrl) {
        return res.redirect(game.coverUrl);
    }

    return res.status(404).json({ error: 'Art not found' });
});

app.delete('/api/art/cache', async (req, res) => {
    try {
        if (existsSync(artDir)) {
            const files = readdirSync(artDir);
            for (const file of files) {
                await fs.unlink(path.join(artDir, file)).catch(() => {});
            }
        }
        res.json({ success: true, message: 'Art cache cleared' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/art/clear-cache', async (req, res) => {
    try {
        if (existsSync(artDir)) {
            const files = readdirSync(artDir);
            for (const file of files) {
                await fs.unlink(path.join(artDir, file)).catch(() => {});
            }
        }
        res.json({ success: true, message: 'Art cache cleared' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/steamgriddb/test', async (req, res) => {
    let key = (req.body && req.body.key !== undefined) ? req.body.key : (db.settings && db.settings.steamGridDbKey);
    key = typeof key === 'string' ? key.trim() : '';

    if (!key) {
        return res.json({ ok: false, status: 400, message: 'No API key provided. Please enter a SteamGridDB API key.' });
    }

    try {
        const _fetch = typeof fetch === 'function' ? fetch : (await import('node-fetch')).default;
        // Test against known game: The Witcher 3 (Steam AppID 292030) with 8s timeout
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        let response;
        try {
            response = await _fetch('https://www.steamgriddb.com/api/v2/games/steam/292030', {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${key}` },
                signal: controller.signal
            });
        } finally {
            clearTimeout(timeout);
        }

        if (response.status === 200) {
            const data = await response.json();
            if (data && data.success) {
                return res.json({ ok: true, status: 200, message: 'Valid API key! Successfully connected to SteamGridDB.' });
            } else {
                const errMsg = data && data.errors ? data.errors.join(', ') : 'Unknown response';
                return res.json({ ok: false, status: response.status, message: `SteamGridDB error: ${errMsg}` });
            }
        } else if (response.status === 401 || response.status === 403) {
            return res.json({ ok: false, status: 401, message: 'Invalid API key (401 Unauthorized). Please check your key on steamgriddb.com.' });
        } else {
            return res.json({ ok: false, status: response.status, message: `SteamGridDB returned HTTP ${response.status} (${response.statusText})` });
        }
    } catch (e) {
        return res.json({ ok: false, status: 500, message: `Network error connecting to SteamGridDB: ${e.message}` });
    }
});

app.get('/api/steamgriddb/search', async (req, res) => {
    const term = req.query.term || req.query.q;
    const sgdbKey = db.settings && db.settings.steamGridDbKey ? db.settings.steamGridDbKey.trim() : null;
    if (!term) return res.json({ results: [] });
    if (!sgdbKey) return res.json({ results: [], message: 'SteamGridDB key not set' });

    try {
        const _fetch = typeof fetch === 'function' ? fetch : (await import('node-fetch')).default;
        const r = await _fetch(`https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(term)}`, {
            headers: { 'Authorization': `Bearer ${sgdbKey}` }
        });
        if (!r.ok) return res.json({ results: [] });
        const d = await r.json();
        if (!d.success || !d.data) return res.json({ results: [] });

        const results = [];
        for (const item of d.data.slice(0, 4)) {
            const gRes = await _fetch(`https://www.steamgriddb.com/api/v2/grids/game/${item.id}?dimensions=600x900`, {
                headers: { 'Authorization': `Bearer ${sgdbKey}` }
            });
            let grids = [];
            if (gRes.ok) {
                const gd = await gRes.json();
                if (gd.success && gd.data) grids = gd.data.slice(0, 4).map(g => g.url);
            }
            results.push({ id: item.id, name: item.name, grids });
        }
        res.json({ results });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Cover art search via Steam + SteamGridDB
app.get('/api/cover-search', async (req, res) => {
    const term = req.query.term || req.query.q;
    if (!term) return res.json({ coverUrl: null, results: [] });
    try {
        const coverUrl = await fetchCoverUrl(term);
        const results = coverUrl ? [{ url: coverUrl, source: 'Steam' }] : [];

        const sgdbKey = db.settings && db.settings.steamGridDbKey ? db.settings.steamGridDbKey.trim() : null;
        if (sgdbKey) {
            try {
                const _fetch = typeof fetch === 'function' ? fetch : (await import('node-fetch')).default;
                const sr = await _fetch(`https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(term)}`, {
                    headers: { 'Authorization': `Bearer ${sgdbKey}` }
                });
                if (sr.ok) {
                    const sd = await sr.json();
                    if (sd.success && sd.data && sd.data.length > 0) {
                        const gameId = sd.data[0].id;
                        const gr = await _fetch(`https://www.steamgriddb.com/api/v2/grids/game/${gameId}?dimensions=600x900`, {
                            headers: { 'Authorization': `Bearer ${sgdbKey}` }
                        });
                        if (gr.ok) {
                            const gd = await gr.json();
                            if (gd.success && gd.data) {
                                for (const grid of gd.data.slice(0, 4)) {
                                    if (grid.url) results.push({ url: grid.url, source: 'SteamGridDB' });
                                }
                            }
                        }
                    }
                }
            } catch (err) {}
        }

        return res.json({ coverUrl: coverUrl || (results[0] ? results[0].url : null), results });
    } catch (e) {
        res.json({ coverUrl: null, results: [] });
    }
});

// Manual re-scan endpoint
app.post('/api/scan', async (req, res) => {
    await scanAndAddGames();
    res.json({ success: true, games: Object.values(db.games).length });
});

app.post('/api/games/track', async (req, res) => {
    const { name, processName, exePath, coverUrl } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const id = 'game_' + Date.now();
    const cleanProcessName = processName ? processName.toLowerCase().replace(/\.exe$/i, '') : '';

    db.games[id] = {
        id, name,
        processName: cleanProcessName,
        exePath: exePath || '',
        platform: 'Custom',
        totalPlayTime: 0,
        lastPlayed: null,
        coverUrl: coverUrl || ''
    };
    await saveDb();
    res.json(db.games[id]);
});

app.post('/api/games/update', async (req, res) => {
    const { id, coverUrl, name } = req.body;
    if (!db.games[id]) return res.status(404).json({ error: 'Game not found' });
    if (coverUrl !== undefined) db.games[id].coverUrl = coverUrl;
    if (name !== undefined) db.games[id].name = name;
    await saveDb();
    res.json(db.games[id]);
});

app.post('/api/games/untrack', async (req, res) => {
    const { id } = req.body;
    if (db.games[id]) {
        if (id.startsWith('auto_')) {
            if (!db.dismissed.includes(id)) {
                db.dismissed.push(id);
            }
        }
        db.games[id].archived = true;
        await saveDb();
    }
    res.json({ success: true });
});

app.post('/api/games/restore', async (req, res) => {
    const { id } = req.body;
    if (db.games[id]) {
        db.games[id].archived = false;
        
        // Remove from dismissed if restored
        db.dismissed = db.dismissed.filter(d => d !== id);
        await saveDb();
    }
    res.json({ success: true });
});

app.post('/api/games/delete-permanently', async (req, res) => {
    const { id } = req.body;
    if (db.games[id]) {
        delete db.games[id];
        // Also delete sessions
        db.sessions = db.sessions.filter(s => s.gameId !== id);
        await saveDb();
    }
    res.json({ success: true });
});

app.post('/api/sessions/update', async (req, res) => {
    const { id, startTime, endTime, duration, activeTime, idleTime } = req.body;
    const session = db.sessions.find(s => s.id === id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    
    // Reverse the old session duration from the game total
    const game = db.games[session.gameId];
    if (game) {
        game.totalPlayTime = Math.max(0, game.totalPlayTime - session.duration);
    }
    
    // Update session
    if (startTime !== undefined) session.startTime = startTime;
    if (endTime !== undefined) session.endTime = endTime;
    if (duration !== undefined) session.duration = duration;
    if (activeTime !== undefined) session.activeTime = activeTime;
    if (idleTime !== undefined) session.idleTime = idleTime;
    
    // Add the new session duration
    if (game) {
        game.totalPlayTime += session.duration;
    }
    
    await saveDb();
    res.json(session);
});

app.post('/api/sessions/delete', async (req, res) => {
    const { id } = req.body;
    const sessionIndex = db.sessions.findIndex(s => s.id === id);
    if (sessionIndex !== -1) {
        const session = db.sessions[sessionIndex];
        const game = db.games[session.gameId];
        if (game) {
            game.totalPlayTime = Math.max(0, game.totalPlayTime - session.duration);
        }
        db.sessions.splice(sessionIndex, 1);
        await saveDb();
    }
    res.json({ success: true });
});

app.post('/api/sync/steam', async (req, res) => {
    const { steamApiKey, steamId } = db.settings;
    if (!steamApiKey || !steamId) {
        return res.status(400).json({ error: 'Steam API Key or Steam ID is missing in settings' });
    }
    
    try {
        const fetch = (await import('node-fetch')).default;
        const response = await fetch(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${steamApiKey}&steamid=${steamId}&include_played_free_games=1`);
        if (!response.ok) throw new Error('Failed to fetch from Steam API');
        const data = await response.json();
        
        if (data.response && data.response.games) {
            let syncCount = 0;
            for (const steamGame of data.response.games) {
                const autoId = 'auto_steam_' + steamGame.appid;
                if (db.games[autoId]) {
                    db.games[autoId].steamPlaytime = steamGame.playtime_forever * 60 * 1000; // Convert mins to ms
                    syncCount++;
                }
            }
            await saveDb();
            return res.json({ success: true, syncCount });
        } else {
            throw new Error('Invalid response from Steam API');
        }
    } catch (e) {
        console.error('Steam sync error:', e);
        return res.status(500).json({ error: e.message });
    }
});

// ─── AFK State ─────────────────────────────────────────────────────────────

const IDLE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes auto-idle
let manualAfk = false;
let currentlyIdle = false; // true when auto-idle OR manual AFK
let idleStartedAt = null;  // when idle period began

app.get('/api/afk/status', (req, res) => {
    res.json({ manualAfk, autoIdle: currentlyIdle && !manualAfk, isIdle: currentlyIdle || manualAfk });
});

app.post('/api/afk/toggle', (req, res) => {
    manualAfk = !manualAfk;
    if (manualAfk && !idleStartedAt) {
        idleStartedAt = Date.now();
    } else if (!manualAfk && idleStartedAt && activeSession) {
        // Returning from manual AFK — accumulate idle time
        activeSession.idleTime += (Date.now() - idleStartedAt);
        idleStartedAt = null;
    }
    currentlyIdle = manualAfk;
    console.log(manualAfk ? '⏸ Manual AFK activated' : '▶ Manual AFK deactivated');
    res.json({ manualAfk, isIdle: currentlyIdle || manualAfk });
});

// ─── Session Tracking ──────────────────────────────────────────────────────

let activeSession = null;

// ── Check if a PID is still alive ────────────────────
function isProcessRunning(pid) {
    if (!pid || pid === 0) return false;
    try {
        // process.kill(pid, 0) on Windows checks process existence without sending a signal
        process.kill(pid, 0);
        return true;
    } catch (e) {
        // EPERM = process exists but we have no permission to signal it (still running)
        // ESRCH = process does not exist
        return e.code === 'EPERM';
    }
}

function handleTrackerUpdate(data) {
    if (!data.processName) return;

    const processNameLower = data.processName.toLowerCase().replace(/\.exe$/i, '');

    const ignoreList = new Set([
        'explorer', 'searchui', 'searchapp', 'startmenuexperiencehost',
        'systemidleprocess', 'system', 'registry', 'smss', 'csrss',
        'wininit', 'services', 'lsass', 'svchost', 'taskmgr', 'taskhostw',
        'tracker', 'powershell', 'cmd', 'conhost',
        'chrome', 'msedge', 'firefox', 'brave', 'opera',
        'code', 'devenv', 'rider', 'idea64', 'webstorm64',
        'discord', 'slack', 'teams', 'zoom', 'skype',
        'steam', 'steamwebhelper', 'epicgameslauncher',
        'nvidia share', 'nvcontainer', 'rtkngui64', 'igcc',
        'applicationframehost', 'shellexperiencehost', 'runtimebroker',
        'lockapp', 'logonui', 'dwm', 'fontdrvhost', 'textinputhost',
        'node', 'electron', 'playtimetracker'
    ]);

    if (!ignoreList.has(processNameLower)) {
        const existingIdx = db.recentProcesses.findIndex(
            p => p.processName.toLowerCase().replace(/\.exe$/i, '') === processNameLower
        );
        const entry = { ...data, timestamp: Date.now() };
        if (existingIdx > -1) {
            db.recentProcesses[existingIdx] = entry;
        } else {
            db.recentProcesses.push(entry);
        }
        if (db.recentProcesses.length > 100) {
            db.recentProcesses.sort((a, b) => b.timestamp - a.timestamp);
            db.recentProcesses = db.recentProcesses.slice(0, 100);
        }
    }

    // ── Auto-idle detection from tracker's idleMs ──
    const idleMs = data.idleMs || 0;

    if (!manualAfk) {
        if (idleMs >= IDLE_THRESHOLD_MS && !currentlyIdle) {
            // Transition to auto-idle
            currentlyIdle = true;
            idleStartedAt = Date.now() - idleMs; // backdate to when idle actually started
        } else if (idleMs < IDLE_THRESHOLD_MS && currentlyIdle && !manualAfk) {
            // Returned from auto-idle
            if (idleStartedAt && activeSession) {
                activeSession.idleTime += (Date.now() - idleStartedAt);
            }
            currentlyIdle = false;
            idleStartedAt = null;
        }
    }

    // Match against tracked games
    let matchedGame = null;
    for (const game of Object.values(db.games)) {
        if (game.processName && processNameLower === game.processName.toLowerCase().replace(/\.exe$/i, '')) {
            matchedGame = game;
            break;
        }
        if (game.exePath && data.path) {
            if (game.exePath.toLowerCase() === data.path.toLowerCase()) {
                matchedGame = game;
                break;
            }
        }
    }

    if (matchedGame) {
        if (!activeSession) {
            console.log(`▶ Session started: ${matchedGame.name}`);
            activeSession = {
                gameId: matchedGame.id,
                startTime: Date.now(),
                pid: data.pid,
                idleTime: 0
            };
        } else if (activeSession.gameId !== matchedGame.id) {
            // A DIFFERENT tracked game just came to foreground — switch sessions
            endSession();
            console.log(`▶ Session started: ${matchedGame.name}`);
            activeSession = {
                gameId: matchedGame.id,
                startTime: Date.now(),
                pid: data.pid,
                idleTime: 0
            };
        }
        // else: same game still in foreground, nothing to do
    } else {
        // A non-game window is in the foreground.
        // Only end the session if the game process has ACTUALLY exited.
        // This handles alt-tab: if the user switches to Discord/browser while
        // the game is still running, the session should stay alive.
        if (activeSession && !isProcessRunning(activeSession.pid)) {
            console.log(`⚠ Game process ${activeSession.pid} no longer running — ending session.`);
            endSession();
        }
        // else: game is still running in background, keep the session alive
    }
}

async function endSession() {
    if (!activeSession) return;
    const duration = Date.now() - activeSession.startTime;

    // If currently idle, finalize the idle period
    if (idleStartedAt) {
        activeSession.idleTime += (Date.now() - idleStartedAt);
        idleStartedAt = null;
        currentlyIdle = manualAfk; // Keep manual AFK if set
    }

    if (duration > 10000) {
        const idleTime = Math.min(activeSession.idleTime, duration);
        const activeTime = duration - idleTime;

        db.sessions.push({
            id: 'sess_' + Date.now(),
            gameId: activeSession.gameId,
            startTime: new Date(activeSession.startTime).toISOString(),
            endTime: new Date().toISOString(),
            duration,
            activeTime,
            idleTime
        });
        const countAfk = Boolean(db.settings && db.settings.countAfkAsPlaytime);
        const playTimeToAdd = countAfk ? duration : activeTime;

        if (db.games[activeSession.gameId]) {
            db.games[activeSession.gameId].totalPlayTime += playTimeToAdd;
            db.games[activeSession.gameId].lastPlayed = new Date().toISOString();
        }
        await saveDb();
        console.log(`■ Session ended: ${activeSession.gameId} (${Math.round(duration / 1000)}s total, ${Math.round(activeTime / 1000)}s active, ${Math.round(idleTime / 1000)}s idle)`);
    }
    activeSession = null;
}

app.get('/api/active-session', (req, res) => {
    if (!activeSession) return res.json(null);
    const game = db.games[activeSession.gameId];
    const elapsed = Date.now() - activeSession.startTime;
    let currentIdleTime = activeSession.idleTime;
    if (idleStartedAt) currentIdleTime += (Date.now() - idleStartedAt);

    res.json({
        ...activeSession,
        gameName: game ? game.name : 'Unknown',
        elapsed,
        activeTime: elapsed - currentIdleTime,
        currentIdleTime,
        isIdle: currentlyIdle || manualAfk,
        isManualAfk: manualAfk
    });
});

// ─── Tracker Process ───────────────────────────────────────────────────────

function startTracker() {
    const trackerPath = path.join(__dirname, 'tracker.exe');
    if (!existsSync(trackerPath)) {
        console.error('tracker.exe not found!');
        return;
    }
    const child = spawn(trackerPath, [], { stdio: ['ignore', 'pipe', 'pipe'] });

    let buffer = '';
    child.stdout.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('{')) {
                try { handleTrackerUpdate(JSON.parse(trimmed)); } catch {}
            }
        }
    });

    child.on('close', code => {
        console.log(`Tracker exited (code ${code}). Restarting in 3s...`);
        setTimeout(startTracker, 3000);
    });

    // ── Watchdog: periodically check if the active game process died ──
    // This catches the case where the user closes the game while it's NOT
    // the foreground window (e.g. they close it from the taskbar).
    const watchdog = setInterval(() => {
        if (activeSession && !isProcessRunning(activeSession.pid)) {
            console.log(`⚠ Watchdog: Game process ${activeSession.pid} gone — ending session.`);
            endSession();
        }
    }, 5000); // Check every 5 seconds

    child.on('close', () => clearInterval(watchdog));
}

// ─── Server Start ──────────────────────────────────────────────────────────

async function startServer() {
    await initDb();
    return new Promise((resolve, reject) => {
        const server = app.listen(PORT, '127.0.0.1', async () => {
            console.log(`Backend running on http://localhost:${PORT}`);
            startTracker();

            // Auto-scan for installed games on startup
            try {
                await scanAndAddGames();
            } catch (e) {
                console.error('Auto-scan error:', e.message);
            }

            resolve();
        });

        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.warn(`Port ${PORT} is already in use by another instance.`);
                resolve();
            } else {
                reject(err);
            }
        });
    });
}

module.exports = { startServer, endSession, saveDb };
