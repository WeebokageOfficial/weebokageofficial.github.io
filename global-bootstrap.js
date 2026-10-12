// Direct URLs remain bookmarkable; only the outer document owns audio and the CLI.
(() => {
  'use strict';
  if (window.self !== window.top) {
    try { window.parent.LifeOSShell?.attach(document); } catch (_) { /* External embeds have no shell bridge. */ }
    return;
  }
  const shell = new URL('lifeos-shell.html', document.currentScript.src);
  shell.searchParams.set('route', location.pathname + location.search + location.hash);
  document.documentElement.style.visibility = 'hidden';
  location.replace(shell.href);
})();
