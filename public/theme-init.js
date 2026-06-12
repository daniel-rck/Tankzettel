// Apply the persisted theme before first paint (external file so the
// worker's CSP can stay `script-src 'self'` without inline hashes).
(() => {
  try {
    const t = localStorage.getItem("theme");
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  } catch {}
})();
