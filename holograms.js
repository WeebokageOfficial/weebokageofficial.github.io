// Lifecycle-aware enhancements for dynamic LifeOS quote and hadith cards.
(() => {
  'use strict';
  const cards=new Map(),motion=matchMedia('(prefers-reduced-motion: reduce)');let queued=false,disposed=false;
  function text(card){if(card.dataset.holoCard==='hadith')return card.querySelector('.hadith-text').textContent+'\n— '+card.querySelector('.source-link').textContent.replace(' ↗','')+'\n'+card.querySelector('.source-link').href;return document.getElementById('persona-quote').textContent+'\n— '+document.getElementById('persona-name').textContent+' // '+document.getElementById('quote-source').textContent;}
  function tilt(card){if(motion.matches){card.vanillaTilt?.destroy();card.querySelector('.js-tilt-glare')?.remove();}else if(window.VanillaTilt&&!card.vanillaTilt)window.VanillaTilt.init(card,{max:15,speed:400,glare:true,'max-glare':.35,gyroscope:true});}
  function refresh(){
    queued=false;if(disposed)return;
    for(const [card,entry] of cards)if(!card.isConnected){card.vanillaTilt?.destroy();entry.events.abort();clearTimeout(entry.timer);cards.delete(card);}
    document.querySelectorAll('[data-holo-card]').forEach(card=>{
      if(cards.has(card)){tilt(card);return;}
      const entry={events:new AbortController(),timer:null},options={signal:entry.events.signal};cards.set(card,entry);card.classList.add('holo-card');
      const button=document.createElement('button');button.type='button';button.className='holo-copy small-button';button.textContent='Copy Quote';button.setAttribute('aria-live','polite');card.append(button);
      card.addEventListener('pointermove',event=>{if(motion.matches)return;const rect=card.getBoundingClientRect();card.style.setProperty('--holo-x',`${(event.clientX-rect.left)/rect.width*100}%`);card.style.setProperty('--holo-y',`${(event.clientY-rect.top)/rect.height*100}%`);},options);
      button.addEventListener('click',async()=>{
        if(button.disabled)return;button.disabled=true;
        try{const value=text(card);if(!value.trim()||!navigator.clipboard)throw new Error('Clipboard unavailable');await navigator.clipboard.writeText(value);if(!card.isConnected)return;button.textContent='[COPIED // SAVED]';button.classList.add('copied');void (window.parent.LifeOSAudio||window.LifeOSAudio)?.blip('copy');}
        catch(_){button.textContent='[COPY FAILED // RETRY]';}
        entry.timer=setTimeout(()=>{button.textContent='Copy Quote';button.classList.remove('copied');button.disabled=false;},1500);
      },options);tilt(card);
    });
  }
  const observer=new MutationObserver(()=>{if(!queued){queued=true;queueMicrotask(refresh);}});observer.observe(document.getElementById('dashboard'),{childList:true,subtree:true});
  motion.addEventListener('change',refresh);document.getElementById('vanilla-tilt-sdk')?.addEventListener('load',refresh);refresh();
  window.addEventListener('pagehide',event=>{if(event.persisted)return;disposed=true;observer.disconnect();motion.removeEventListener('change',refresh);for(const [card,entry] of cards){card.vanillaTilt?.destroy();entry.events.abort();clearTimeout(entry.timer);}cards.clear();});
  window.LifeOSHolograms={refresh};
})();
