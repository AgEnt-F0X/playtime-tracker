// ── Atmosphere: Living Game Art Wall & Titlebar Game Quote ──
// Displays a curated drifting wall of legendary games (uncoupled from local library)

const POPULAR_STEAM_APP_IDS = [
  // Classic Valve & Source Era
  10,      // Counter-Strike
  70,      // Half-Life
  220,     // Half-Life 2
  240,     // Counter-Strike: Source
  400,     // Portal
  420,     // Half-Life 2: Episode Two
  550,     // Left 4 Dead 2
  570,     // Dota 2
  620,     // Portal 2
  730,     // Counter-Strike 2
  // RPG, Souls & Open World Masterpieces
  292030,  // The Witcher 3: Wild Hunt
  374320,  // DARK SOULS III
  489830,  // The Elder Scrolls V: Skyrim Special Edition
  570940,  // DARK SOULS: REMASTERED
  814380,  // Sekiro: Shadows Die Twice
  1086940, // Baldur's Gate 3
  1091500, // Cyberpunk 2077
  1174180, // Red Dead Redemption 2
  1245620, // ELDEN RING
  2358720, // Black Myth: Wukong
  // Survival, Sandbox & Simulators
  105600,  // Terraria
  211820,  // Starbound
  221100,  // DayZ
  242760,  // The Forest
  252490,  // Rust
  264710,  // Subnautica
  413150,  // Stardew Valley
  526870,  // Satisfactory
  892970,  // Valheim
  1248130, // Farming Simulator 22
  1326470, // Sons Of The Forest
  1623730, // Palworld
  // Horror, Narrative & Action-Adventure
  383870,  // Firewatch
  418370,  // Resident Evil 7 Biohazard
  883710,  // Resident Evil 2 Remake
  952060,  // Resident Evil 3 Remake
  1151640, // Horizon Zero Dawn Complete Edition
  1190460, // DEATH STRANDING DIRECTOR'S CUT
  1817070, // Marvel’s Spider-Man Remastered
  1817190, // Marvel's Spider-Man: Miles Morales
  2050650, // Resident Evil 4 Remake
  // Fast Action, Shooters & Co-op
  218620,  // PAYDAY 2
  230410,  // Warframe
  239140,  // Dying Light
  311210,  // Call of Duty: Black Ops III
  359550,  // Tom Clancy's Rainbow Six Siege
  377160,  // Fallout 4
  379720,  // DOOM (2016)
  381210,  // Dead by Daylight
  546560,  // Half-Life: Alyx
  553850,  // HELLDIVERS 2
  582010,  // Monster Hunter: World
  782330,  // DOOM Eternal
  976730,  // Halo: The Master Chief Collection
  1172470, // Apex Legends
  1172620, // Sea of Thieves
  1426210, // It Takes Two
  1446780, // MONSTER HUNTER RISE
  1887720, // ARMORED CORE VI FIRES OF RUBICON
  // Roguelikes, Indie Gems & Strategy
  250900,  // The Binding of Isaac: Rebirth
  289070,  // Sid Meier’s Civilization VI
  322330,  // Don't Starve Together
  367520,  // Hollow Knight
  391540,  // Undertale
  435150,  // Divinity: Original Sin 2
  632360,  // Risk of Rain 2
  646570,  // Slay the Spire
  945360,  // Among Us
  960090,  // Bloons TD 6
  1145360, // Hades
  1466860, // Age of Empires IV
  1551360, // Forza Horizon 5
  1716740, // Starfield
  1794680, // Vampire Survivors
  1868140, // DAVE THE DIVER
  2379780, // Balatro
  // Fighting & Competitive
  1203220, // NARAKA: BLADEPOINT
  1364780, // Street Fighter 6
  2420510  // TEKKEN 8
];

const QUOTES = [
  ['The cake is a lie.', 'Portal'],
  ["It's dangerous to go alone! Take this.", 'The Legend of Zelda'],
  ['War. War never changes.', 'Fallout'],
  ['Stay a while and listen.', 'Deckard Cain, Diablo'],
  ['Nothing is true, everything is permitted.', "Assassin's Creed"],
  ['Would you kindly?', 'Atlas, BioShock'],
  ['A man chooses, a slave obeys.', 'Andrew Ryan, BioShock'],
  ['Praise the sun!', 'Solaire, Dark Souls'],
  ['Hey! Listen!', 'Navi, Ocarina of Time'],
  ['Do a barrel roll!', 'Peppy Hare, Star Fox 64'],
  ['Rise and shine, Mr. Freeman.', 'G-Man, Half-Life 2'],
  ["Hey, you. You're finally awake.", 'Ralof, Skyrim'],
  ['I took an arrow in the knee.', 'Guard, Skyrim'],
  ['Thank you Mario! But our Princess is in another castle!', 'Toad, Super Mario Bros.'],
  ["Where's everyone going? Bingo?", 'Leon, Resident Evil 4'],
  ["What're ya buyin'?", 'The Merchant, Resident Evil 4'],
  ['Kept you waiting, huh?', 'Snake, Metal Gear Solid'],
  ["Let's rock, baby.", 'Dante, Devil May Cry'],
  ['Get over here!', 'Scorpion, Mortal Kombat'],
  ['You must construct additional pylons.', 'StarCraft']
];

let wallEl = null;
let quoteEl = null;
let quoteTimer = null;
let lastQuoteIdx = -1;
let wallBuilt = false;
let replacementPool = [];

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function initAtmosphere() {
  const mode = localStorage.getItem('atmosMode') || 'animated';
  if (mode === 'off') return;

  // 1. Create or bind #atmos element
  wallEl = document.getElementById('atmos');
  if (!wallEl) {
    wallEl = document.createElement('div');
    wallEl.id = 'atmos';
    wallEl.setAttribute('aria-hidden', 'true');
    document.body.prepend(wallEl);
  }

  if (mode === 'static') {
    wallEl.classList.add('static');
  } else {
    wallEl.classList.remove('static');
  }

  // Pause animations when window is hidden
  document.addEventListener('visibilitychange', () => {
    if (wallEl) wallEl.classList.toggle('paused', document.hidden);
  });
  if (wallEl && document.hidden) {
    wallEl.classList.add('paused');
  }

  // 2. Setup Quote Line in Titlebar
  quoteEl = document.getElementById('atmosQuote');
  if (!quoteEl) {
    quoteEl = document.createElement('div');
    quoteEl.id = 'atmosQuote';
    quoteEl.className = 'atmos-quote';
    const titlebar = document.getElementById('titlebar');
    const controls = titlebar?.querySelector('.titlebar-controls');
    if (controls) {
      titlebar.insertBefore(quoteEl, controls);
    } else if (titlebar) {
      titlebar.appendChild(quoteEl);
    }
  }

  window.addEventListener('online', () => {
    if (!wallBuilt) buildAtmosphereWall();
    startQuoteRotation();
  });
  window.addEventListener('offline', () => {
    if (quoteEl) quoteEl.hidden = true;
  });

  // Build the art wall using popular curated Steam titles
  buildAtmosphereWall();
  startQuoteRotation();
}

function buildAtmosphereWall() {
  if (!wallEl) return;
  const isPerfMode = document.documentElement.classList.contains('perf-mode');
  const mode = localStorage.getItem('atmosMode') || 'animated';

  if (isPerfMode || mode === 'off') {
    wallEl.style.display = 'none';
    return;
  }
  wallEl.style.display = '';

  // Offline fallback: do not flood failed requests if offline
  if (!navigator.onLine) {
    return;
  }

  const shuffled = shuffle(POPULAR_STEAM_APP_IDS);
  const wallGames = shuffled.slice(0, 24);
  replacementPool = shuffled.slice(24);

  wallEl.replaceChildren();

  const inner = document.createElement('div');
  inner.className = 'wall';
  const COLS = 5;
  const PER_COL = 5;

  for (let c = 0; c < COLS; c++) {
    const col = document.createElement('div');
    col.className = 'col';
    col.style.setProperty('--dur', `${75 + c * 13}s`);

    const colIds = Array.from({ length: PER_COL }, (_, i) => wallGames[(c * 4 + i) % wallGames.length]);
    // Duplicate for a seamless infinite drift loop
    [...colIds, ...colIds].forEach(appId => {
      const img = new Image();
      img.decoding = 'async';
      img.loading = 'lazy';
      img.alt = '';
      img.onerror = () => {
        if (replacementPool.length > 0) {
          const nextId = replacementPool.shift();
          img.src = `https://cdn.cloudflare.steamstatic.com/steam/apps/${nextId}/library_600x900.jpg`;
        } else {
          img.remove();
        }
      };
      img.src = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`;
      col.appendChild(img);
    });

    inner.appendChild(col);
  }

  wallEl.appendChild(inner);
  wallBuilt = true;
}

export function updateAtmosphere(games, activeSession) {
  if (!wallEl) return;
  const isPerfMode = document.documentElement.classList.contains('perf-mode');
  const mode = localStorage.getItem('atmosMode') || 'animated';

  if (isPerfMode || mode === 'off') {
    wallEl.style.display = 'none';
    return;
  }
  wallEl.style.display = '';

  // Dim the wall when a game is actively running
  if (activeSession && activeSession.gameId) {
    wallEl.classList.add('dimmed');
  } else {
    wallEl.classList.remove('dimmed');
  }

  // If wall hasn't built yet (e.g. came back online), build it
  if (!wallBuilt && navigator.onLine) {
    buildAtmosphereWall();
  }
}

function startQuoteRotation() {
  if (!quoteEl) return;
  if (!navigator.onLine) {
    quoteEl.hidden = true;
    return;
  }

  clearInterval(quoteTimer);
  showNextQuote();
  quoteTimer = setInterval(() => {
    if (!document.hidden && navigator.onLine) {
      showNextQuote();
    }
  }, 45000);
}

function showNextQuote() {
  if (!quoteEl || !navigator.onLine) {
    if (quoteEl) quoteEl.hidden = true;
    return;
  }

  let nextIdx;
  do {
    nextIdx = Math.floor(Math.random() * QUOTES.length);
  } while (nextIdx === lastQuoteIdx && QUOTES.length > 1);
  lastQuoteIdx = nextIdx;

  quoteEl.classList.add('hide');

  setTimeout(() => {
    const [quoteText, quoteSource] = QUOTES[nextIdx];
    const qEl = document.createElement('q');
    qEl.textContent = quoteText;
    const byEl = document.createElement('small');
    byEl.textContent = quoteSource;

    quoteEl.replaceChildren(qEl, byEl);
    quoteEl.hidden = false;
    quoteEl.classList.remove('hide');
  }, 600);
}
