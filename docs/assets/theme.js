// Light/dark theme. Colors come from light-dark() in CSS, so the OS preference
// already works with no JS; this only records an explicit override on <html>
// (data-theme), which every page reads back on load.
(function () {
  const root = document.documentElement;
  const STORAGE_KEY = 'paidextension-theme';

  let stored = null;
  try {
    stored = window.localStorage.getItem(STORAGE_KEY);
  } catch (_err) {
    // Storage can be blocked; the OS preference still applies.
  }
  if (stored === 'light' || stored === 'dark') root.dataset.theme = stored;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireToggle);
  } else {
    wireToggle();
  }

  function isDark() {
    if (root.dataset.theme) return root.dataset.theme === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function paintToggle(toggle) {
    const dark = isDark();
    toggle.setAttribute('aria-pressed', String(dark));
    toggle.setAttribute('title', dark ? 'Switch to light mode' : 'Switch to dark mode');
    toggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  }

  function wireToggle() {
    const toggle = document.getElementById('theme-toggle');
    if (!toggle) return;

    toggle.addEventListener('click', () => {
      const next = isDark() ? 'light' : 'dark';
      const apply = () => { root.dataset.theme = next; };
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (document.startViewTransition && !reduce) {
        // Circular reveal from the toggle; effects.css reads these.
        const box = toggle.getBoundingClientRect();
        const x = box.left + box.width / 2;
        const y = box.top + box.height / 2;
        root.style.setProperty('--vt-x', x + 'px');
        root.style.setProperty('--vt-y', y + 'px');
        root.style.setProperty('--vt-r', Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)) + 'px');
        document.startViewTransition(apply);
      } else {
        apply();
      }
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch (_err) {
        // Nothing to do — the toggle still applies for this page view.
      }
      paintToggle(toggle);
    });

    paintToggle(toggle);
  }
})();
