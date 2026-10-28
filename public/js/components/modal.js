// ── Accessible Modal Manager ──

export function openModal(modalId) {
  const el = document.getElementById(modalId);
  if (!el) return;
  el.classList.add('open');
  const firstInput = el.querySelector('input, button:not(.btn-icon)');
  if (firstInput) firstInput.focus();
}

export function closeModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.remove('open');
}

export function initModals() {
  // Close modal when clicking on backdrop or buttons with data-close-modal
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) {
      e.target.classList.remove('open');
    }
    const closeBtn = e.target.closest('[data-close-modal]');
    if (closeBtn) {
      const modal = closeBtn.closest('.modal-backdrop');
      if (modal) modal.classList.remove('open');
    }
  });

  // Close active modal on Escape key
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const openModalEl = document.querySelector('.modal-backdrop.open');
      if (openModalEl) openModalEl.classList.remove('open');
    }
  });
}
