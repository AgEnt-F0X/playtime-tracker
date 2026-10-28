// ── Art Resolution & Lazy Loading Helper ──

export function getArtUrl(game, type = 'cover') {
  if (!game) return '';
  // If game has an ID, use our high-speed cached art server endpoint
  if (game.id) {
    return `/api/art/${encodeURIComponent(game.id)}?type=${type}`;
  }
  return game.coverUrl || '';
}

export function getFallbackGradient(name) {
  if (!name) return 'linear-gradient(145deg, #181a24, #242838)';
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h1 = Math.abs(hash % 360);
  const h2 = (h1 + 45) % 360;
  return `linear-gradient(145deg, hsl(${h1}, 42%, 18%), hsl(${h2}, 48%, 11%))`;
}

export function getInitials(name) {
  if (!name) return '?';
  // Try to clean out common junk words
  const clean = name.replace(/[^\w\s]/gi, ' ').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  if (parts.length === 1 && parts[0].length >= 2) {
    // If PascalCase or single word, check for camelCase capitals, e.g. "DevilMayCry" -> "DM"
    const caps = parts[0].match(/[A-Z]/g);
    if (caps && caps.length >= 2) {
      return (caps[0] + caps[1]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/**
 * Returns safe HTML for a cover with a tinted initial + title fallback.
 * The fallback is placed directly behind the image so there is zero broken-image flash.
 */
export function getCoverElementHtml(game, { imgClass = '', fallbackClass = '', showTitle = false } = {}) {
  const coverUrl = getArtUrl(game, 'cover');
  const gradient = getFallbackGradient(game ? game.name : '');
  const initials = getInitials(game ? game.name : '');
  const safeName = escapeHtml(game ? game.name : '');

  return `
    <div class="cover-fallback-base ${fallbackClass}" style="background:${gradient}">
      <span class="fallback-initial">${initials}</span>
      ${showTitle ? `<span class="fallback-name">${safeName}</span>` : ''}
    </div>
    ${coverUrl ? `
      <img class="${imgClass}" src="${coverUrl}" alt="" loading="lazy" decoding="async"
        onerror="this.style.display='none';">
    ` : ''}
  `;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// IntersectionObserver for lazy loading images
let imageObserver = null;

export function setupLazyImages(container = document) {
  if (!imageObserver && 'IntersectionObserver' in window) {
    imageObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          const src = img.dataset.src;
          if (src) {
            img.src = src;
            img.removeAttribute('data-src');
          }
          observer.unobserve(img);
        }
      });
    }, { rootMargin: '100px 0px' });
  }

  const lazyImgs = container.querySelectorAll('img[data-src]');
  lazyImgs.forEach(img => {
    if (imageObserver) {
      imageObserver.observe(img);
    } else {
      img.src = img.dataset.src;
    }
  });
}
