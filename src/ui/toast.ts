/** Friendly non-technical toasts. Technical detail goes to the debug panel/console. */
export function toast(msg: string, ms = 2600): void {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  window.clearTimeout((toast as unknown as { _t?: number })._t);
  (toast as unknown as { _t?: number })._t = window.setTimeout(() => el?.classList.remove('show'), ms);
}
