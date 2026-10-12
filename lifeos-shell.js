(() => {
  'use strict';
  const frame = document.getElementById('site-content');
  const base = new URL('.', document.currentScript.src);
  const pages = ['index','anime','games','credits','downloads','islam','transit','login','lifeos','scanner','chat','vocadb','pokemon'];
  let themeObserver = null;
  let installPrompt = null;
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; });
  window.addEventListener('appinstalled', () => { installPrompt = null; frame.contentWindow.dispatchEvent(new Event('appinstalled')); });
  function route(value) {
    const url = new URL(value, location.href);
    if (url.pathname === base.pathname) url.pathname += 'index.html';
    if (url.origin !== base.origin || !pages.some(page => url.pathname === base.pathname + page + '.html')) throw new Error('navigate: unknown page');
    return url;
  }
  function syncTheme() {
    let selected = localStorage.getItem('theme') || 'miku';
    try {
      const child = frame.contentDocument;
      selected = child?.getElementById('dashboard') ? (child.getElementById('dashboard').classList.contains('teto-theme') ? 'teto' : 'miku') : (child?.documentElement.dataset.theme || selected);
      if (!child?.getElementById('dashboard')) {
        selected = window.LifeOSCore.read().preferences.theme || selected;
        if (child?.documentElement.dataset.theme !== selected) child?.defaultView?.Weebokage?.setTheme(selected, { silent: true });
      }
    } catch (_) { /* A restricted document cannot supply a theme. */ }
    document.documentElement.dataset.theme = selected;
  }
  function navigate(value, {replace = false} = {}) {
    const url = route(value);
    history[replace ? 'replaceState' : 'pushState']({lifeosShell:true},'',url.pathname + url.search + url.hash);
    frame.contentWindow.location.replace(url.href);
  }
  const bound = new WeakSet();
  function attach(child) {
    if (bound.has(child)) return;
    bound.add(child);
    child.addEventListener('click', event => {
      const anchor = event.target.closest('a[href]');
      if (!anchor || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return;
      let next; try { next = route(anchor.href); } catch (_) { return; }
      event.preventDefault(); navigate(next.href);
    });
    child.addEventListener('keydown', event => window.LifeOSTerminal?.handleGlobalKey(event),true);
    child.addEventListener('themechange',syncTheme);
  }
  window.LifeOSShell = {navigate,route,pages,syncTheme,attach,
    get hasInstallPrompt() { return Boolean(installPrompt); },
    async installApp() { const pending = installPrompt; if (!pending) return; installPrompt = null; await pending.prompt(); await pending.userChoice; }
  };
  window.addEventListener('popstate', () => { frame.contentWindow.location.replace(route(location.href).href); });
  window.addEventListener('lifeos-state-changed',syncTheme);
  window.addEventListener('storage',syncTheme);
  frame.addEventListener('load', () => {
    let child;
    try { child = frame.contentDocument; if (!child?.body) return; } catch (_) { return; }
    attach(child);
    const url = route(frame.contentWindow.location.href);
    history.replaceState({lifeosShell:true},'',url.pathname + url.search + url.hash);
    document.title = child.title || 'Weebokage // LifeOS';
    themeObserver?.disconnect();
    themeObserver = new MutationObserver(syncTheme);
    themeObserver.observe(child.documentElement,{attributes:true,attributeFilter:['data-theme']});
    const dashboard = child.getElementById('dashboard');
    if (dashboard) themeObserver.observe(dashboard,{attributes:true,attributeFilter:['class']});
    syncTheme();
  });
  const first = route(new URLSearchParams(location.search).get('route') || new URL('index.html',base).href);
  history.replaceState({lifeosShell:true},'',first.pathname + first.search + first.hash);
  // OAuth is processed once in the outer shell, never by the content document.
  const content = new URL(first.href);
  if (content.pathname.endsWith('/lifeos.html') && (content.searchParams.has('code') || content.searchParams.has('error'))) ['code','state','error','error_description'].forEach(key => content.searchParams.delete(key));
  frame.src = content.href;
})();
