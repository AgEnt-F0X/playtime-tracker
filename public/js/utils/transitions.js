// ── Screen Transitions & Micro-Interactions ──

export async function transitionScreen(changeScreenCallback) {
  if (document.startViewTransition && !document.documentElement.classList.contains('perf-mode')) {
    await document.startViewTransition(() => {
      changeScreenCallback();
    }).finished;
  } else {
    changeScreenCallback();
  }
}

export function countUp(element, targetNumber, duration = 750, formatter = null) {
  if (!element) return;
  const start = 0;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Smooth ease-out curve
    const easeOut = 1 - Math.pow(1 - progress, 3);
    const current = Math.floor(start + (targetNumber - start) * easeOut);

    element.textContent = formatter ? formatter(current) : current;

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      element.textContent = formatter ? formatter(targetNumber) : targetNumber;
    }
  }

  requestAnimationFrame(update);
}
