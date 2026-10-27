// Copy controls for dynamic LifeOS dialogue and hadith cards, without hover effects.
(() => {
  'use strict';
  const cards=new Map();let queued=false,disposed=false;
  function text(card){if(card.dataset.holoCard==='hadith')return card.querySelector('.hadith-text').textContent+'\n— '+card.querySelector('.source-link').textContent.replace(' ↗','')+'\n'+card.querySelector('.source-link').href;return document.getElementById('persona-quote').textContent+'\n— '+document.getElementById('persona-name').textContent+' // '+document.getElementById('quote-source').textContent;}
  // Text cards are static; keep only their copy controls.
  function clearTilt(card){card.vanillaTilt?.destroy();card.querySelector('.js-tilt-glare')?.remove();}
  function refresh(){
    queued=false;if(disposed)return;
    for(const [card,entry] of cards)if(!card.isConnected){card.vanillaTilt?.destroy();entry.events.abort();clearTimeout(entry.timer);cards.delete(card);}
    document.querySelectorAll('[data-holo-card]').forEach(card=>{
      if(cards.has(card)){clearTilt(card);return;}
      const entry={events:new AbortController(),timer:null},options={signal:entry.events.signal};cards.set(card,entry);card.classList.add('static-text-card');
      const button=document.createElement('button');button.type='button';button.className='holo-copy small-button';button.textContent='Copy Quote';button.setAttribute('aria-live','polite');card.append(button);
      button.addEventListener('click',async()=>{
        if(button.disabled)return;button.disabled=true;
        try{const value=text(card);if(!value.trim()||!navigator.clipboard)throw new Error('Clipboard unavailable');await navigator.clipboard.writeText(value);if(!card.isConnected)return;button.textContent='[COPIED // SAVED]';button.classList.add('copied');void (window.parent.LifeOSAudio||window.LifeOSAudio)?.blip('copy');}
        catch(_){button.textContent='[COPY FAILED // RETRY]';}
        entry.timer=setTimeout(()=>{button.textContent='Copy Quote';button.classList.remove('copied');button.disabled=false;},1500);
      },options);clearTilt(card);
    });
  }
  const observer=new MutationObserver(()=>{if(!queued){queued=true;queueMicrotask(refresh);}});observer.observe(document.getElementById('dashboard'),{childList:true,subtree:true});
  refresh();
  window.addEventListener('pagehide',event=>{if(event.persisted)return;disposed=true;observer.disconnect();for(const [card,entry] of cards){card.vanillaTilt?.destroy();entry.events.abort();clearTimeout(entry.timer);}cards.clear();});
  window.LifeOSHolograms={refresh};
})();
