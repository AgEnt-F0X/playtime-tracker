// ── Gamepad Navigation System (PS5 / Xbox Controller Full Support) ──

let isGamepadConnected = false;
let lastNavTime = 0;
const NAV_COOLDOWN = 190; // ms

function getFocusableElements() {
  const selector = 'button:not([disabled]):not([style*="display: none"]), a[href], input:not([disabled]), select:not([disabled]), [tabindex="0"], .game-card, .nav-item';
  return Array.from(document.querySelectorAll(selector)).filter(el => {
    return el.offsetParent !== null && window.getComputedStyle(el).visibility !== 'hidden';
  });
}

function findNearestElement(current, dx, dy, candidates) {
  if (!current) return candidates[0] || null;
  const currentRect = current.getBoundingClientRect();
  const cX = currentRect.left + currentRect.width / 2;
  const cY = currentRect.top + currentRect.height / 2;

  let best = null;
  let minDistance = Infinity;

  for (const el of candidates) {
    if (el === current) continue;
    const r = el.getBoundingClientRect();
    const eX = r.left + r.width / 2;
    const eY = r.top + r.height / 2;

    const diffX = eX - cX;
    const diffY = eY - cY;

    // Check if element is in the requested direction
    const inDirection = (dx > 0 && diffX > 15) ||
                        (dx < 0 && diffX < -15) ||
                        (dy > 0 && diffY > 15) ||
                        (dy < 0 && diffY < -15);

    if (inDirection) {
      // Euclidean distance with directional weight
      const distance = Math.hypot(diffX, diffY) + (dx !== 0 ? Math.abs(diffY) * 1.5 : Math.abs(diffX) * 1.5);
      if (distance < minDistance) {
        minDistance = distance;
        best = el;
      }
    }
  }

  return best;
}

export function setGamepadFocus(el) {
  document.querySelectorAll('[data-gamepad-focused="true"]').forEach(e => {
    e.removeAttribute('data-gamepad-focused');
  });
  if (el) {
    el.setAttribute('data-gamepad-focused', 'true');
    el.focus();
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

export function initGamepad(onButtonB, onButtonStart) {
  window.addEventListener('gamepadconnected', () => {
    isGamepadConnected = true;
    pollGamepadLoop();
  });

  window.addEventListener('gamepaddisconnected', () => {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    isGamepadConnected = Array.from(gamepads).some(gp => gp !== null);
  });

  function pollGamepadLoop() {
    if (!isGamepadConnected) return;

    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = gamepads.find(g => g !== null);

    if (gp) {
      const now = performance.now();
      const focusables = getFocusableElements();
      const current = document.querySelector('[data-gamepad-focused="true"]') || document.activeElement;

      // Stick / Dpad direction
      let dx = 0;
      let dy = 0;

      // D-Pad (12=Up, 13=Down, 14=Left, 15=Right)
      if (gp.buttons[12]?.pressed) dy = -1;
      if (gp.buttons[13]?.pressed) dy = 1;
      if (gp.buttons[14]?.pressed) dx = -1;
      if (gp.buttons[15]?.pressed) dx = 1;

      // Analog Stick (axes 0 & 1 with 0.4 deadzone)
      if (Math.abs(gp.axes[0]) > 0.4) dx = Math.sign(gp.axes[0]);
      if (Math.abs(gp.axes[1]) > 0.4) dy = Math.sign(gp.axes[1]);

      if ((dx !== 0 || dy !== 0) && now - lastNavTime > NAV_COOLDOWN) {
        lastNavTime = now;
        const next = findNearestElement(current, dx, dy, focusables);
        if (next) {
          setGamepadFocus(next);
        } else if (!current && focusables.length > 0) {
          setGamepadFocus(focusables[0]);
        }
      }

      // Button A (0) -> Click
      if (gp.buttons[0]?.pressed && now - lastNavTime > 250) {
        lastNavTime = now;
        if (current && typeof current.click === 'function') {
          current.click();
        }
      }

      // Button B (1) -> Back
      if (gp.buttons[1]?.pressed && now - lastNavTime > 250) {
        lastNavTime = now;
        if (typeof onButtonB === 'function') onButtonB();
      }

      // Button Start/Options (9) -> Command Palette
      if (gp.buttons[9]?.pressed && now - lastNavTime > 350) {
        lastNavTime = now;
        if (typeof onButtonStart === 'function') onButtonStart();
      }
    }

    requestAnimationFrame(pollGamepadLoop);
  }

  // Start polling in case gamepad was already connected before load
  const initialGps = navigator.getGamepads ? navigator.getGamepads() : [];
  if (Array.from(initialGps).some(g => g !== null)) {
    isGamepadConnected = true;
    pollGamepadLoop();
  }
}
