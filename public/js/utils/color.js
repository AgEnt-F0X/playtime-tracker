// ── Dominant Color Extractor & Theme Recoloring ──

const colorCache = new Map();

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h * 360, s, l];
}

function hslToRgb(h, s, l) {
  h /= 360;
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function toHex(r, g, b) {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

export async function extractDominantColor(imgSrc) {
  if (!imgSrc) return null;
  if (colorCache.has(imgSrc)) return colorCache.get(imgSrc);

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, 32, 32);

        const imgData = ctx.getImageData(0, 0, 32, 32).data;
        let rTotal = 0, gTotal = 0, bTotal = 0, count = 0;

        for (let i = 0; i < imgData.length; i += 4) {
          const r = imgData[i];
          const g = imgData[i + 1];
          const b = imgData[i + 2];
          const a = imgData[i + 3];

          if (a < 128) continue;
          // Filter out near-black and near-white
          const brightness = (r * 299 + g * 587 + b * 114) / 1000;
          if (brightness < 30 || brightness > 235) continue;

          rTotal += r;
          gTotal += g;
          bTotal += b;
          count++;
        }

        if (count === 0) {
          const fallback = '#7c3aed';
          colorCache.set(imgSrc, fallback);
          return resolve(fallback);
        }

        const avgR = Math.round(rTotal / count);
        const avgG = Math.round(gTotal / count);
        const avgB = Math.round(bTotal / count);

        // Convert to HSL, boost saturation for gaming vibrancy
        let [h, s, l] = rgbToHsl(avgR, avgG, avgB);
        s = Math.max(s, 0.65); // Minimum 65% saturation
        l = Math.min(Math.max(l, 0.42), 0.58); // Balanced luminance

        const [rNorm, gNorm, bNorm] = hslToRgb(h, s, l);
        const hex = toHex(rNorm, gNorm, bNorm);
        colorCache.set(imgSrc, hex);
        resolve(hex);
      } catch (e) {
        resolve('#7c3aed');
      }
    };
    img.onerror = () => resolve('#7c3aed');
    img.src = imgSrc;
  });
}

export function applyAccentColor(hexColor) {
  if (!hexColor || !hexColor.startsWith('#')) return;
  const root = document.documentElement;
  root.style.setProperty('--accent', hexColor);

  // Compute lighter and glow variants
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);

  root.style.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.25)`);
  root.style.setProperty('--accent-glow-strong', `rgba(${r}, ${g}, ${b}, 0.6)`);

  // Tint lighter
  const [h, s, l] = rgbToHsl(r, g, b);
  const [lr, lg, lb] = hslToRgb(h, s, Math.min(0.78, l + 0.2));
  root.style.setProperty('--accent-light', toHex(lr, lg, lb));
}

export function resetDefaultAccent() {
  const root = document.documentElement;
  root.style.setProperty('--accent', '#7c3aed');
  root.style.setProperty('--accent-light', '#a78bfa');
  root.style.setProperty('--accent-glow', 'rgba(124, 58, 237, 0.25)');
  root.style.setProperty('--accent-glow-strong', 'rgba(124, 58, 237, 0.55)');
}
