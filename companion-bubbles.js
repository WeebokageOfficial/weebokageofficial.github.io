(() => {
  'use strict';
  const bubble = document.querySelector('[data-companion-surface]');
  if (!bubble || !window.Weebokage) return;
  const line = bubble.querySelector('.companion-line');
  const source = bubble.querySelector('.companion-source');
  const button = bubble.querySelector('.companion-reroll');
  let version = 0, scheduled, previous = '', lastChoice = -1, authKnown = false;
  const user = () => window.firebase?.auth?.().currentUser;
  const theme = () => document.documentElement.dataset.theme === 'teto' ? 'teto' : 'miku';
  function fallback() {
    const master = user() ? 'Master, ' : '';
    const lines = theme() === 'teto' ? [
      `${master}you finally showed up! I was just checking the systems. Definitely not waiting for you.`,
      `${master}pick something interesting. A superior chimera has standards, you know!`,
      `${master}welcome aboard. Bring your best ideas; I’ll bring the attitude. And maybe a baguette.`
    ] : [
      `${master}welcome! What shall we create together today?`,
      `${master}I’m happy you’re here. One little idea can become a whole new melody.`,
      `${master}take a breath and make yourself at home. We can explore at your own pace.`
    ];
    let choice = Math.floor(Math.random() * lines.length);
    if (choice === lastChoice) choice = (choice + 1) % lines.length;
    lastChoice = choice;
    line.textContent = lines[choice];
    source.textContent = `${theme().toUpperCase()} // LOCAL`;
  }
  async function greet() {
    const current = ++version, selected = theme();
    fallback();
    button.disabled = true;
    bubble.setAttribute('aria-busy', 'true');
    try {
      const response = await Weebokage.apiFetch('/lifeos/quote', {
        method: 'POST', timeout: 15000,
        body: JSON.stringify({tab: selected === 'teto' ? 'teto' : 'lifestyle', surface: bubble.dataset.companionSurface, previous})
      });
      const data = await response.json();
      if (current !== version) return;
      if (typeof data.quote !== 'string' || !data.quote.trim() || data.quote.length > 500) throw new Error('Invalid greeting');
      line.textContent = previous = data.quote.trim();
      source.textContent = `${selected.toUpperCase()} // GROQ`;
    } catch (_) { /* The personality-aware local greeting stays visible when offline. */ }
    finally {
      if (current === version) { button.disabled = false; bubble.removeAttribute('aria-busy'); }
    }
  }
  function schedule() {
    ++version; // Immediately invalidate responses belonging to a previous theme or account.
    clearTimeout(scheduled);
    fallback();
    scheduled = setTimeout(greet, 250);
  }
  button.addEventListener('click', schedule);
  document.addEventListener('themechange', schedule);
  window.addEventListener('online', schedule);
  try {
    Weebokage.initFirebase();
    firebase.auth().onAuthStateChanged(() => { authKnown = true; schedule(); }, schedule);
  } catch (_) { schedule(); }
  // Also works when the Firebase SDK cannot establish a connection.
  setTimeout(() => { if (!authKnown) schedule(); }, 1500);
  window.addEventListener('pagehide', () => { ++version; clearTimeout(scheduled); });
})();
