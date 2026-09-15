/**
 * Toast notification helper.
 * Mirrors the legacy flash() function from app.js.
 */

const $ = (selector: string): HTMLElement | null =>
  document.querySelector(selector);

declare global {
  interface Window {
    toastTimer?: ReturnType<typeof setTimeout>;
  }
}

export function flash(message: string): void {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
}
