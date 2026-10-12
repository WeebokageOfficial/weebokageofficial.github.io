// Widgets shared by LifeOS, vocadb.html and pokemon.html. API state lives in the shell.
(() => {
  'use strict';
  const data=()=>window.parent.LifeOSDataStreams || window.LifeOSDataStreams;
  const core=()=>window.parent.LifeOSCore || window.LifeOSCore;
  const escape=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const safe=value=>data()?.safeURL(value)||'';
  let dailyPromise, songValue, songError='', revision=0, infoDialog;
  function songCard(t) {
    const cover=safe(t.cover), link=safe(t.url);
    return `<article class="stream-track">${cover?`<img src="${escape(cover)}" alt="Cover for ${escape(t.title)}" loading="lazy" width="112" height="112">`:'<span class="track-placeholder" aria-hidden="true">♫</span>'}<div><h3>${escape(t.title)}</h3><p>PRODUCER // ${escape(t.producer)}<br>VOCALIST // ${escape(t.vocalist)}</p><span class="tag">BPM ${escape(t.bpm)}</span><div class="stream-actions">${link?`<a class="btn btn-outline" href="${escape(link)}" target="_blank" rel="noopener noreferrer">Open Track ↗</a>`:'<span class="hint">No playable PV available.</span>'}<a class="source-link" href="https://vocadb.net/S/${Number(t.id)}" target="_blank" rel="noopener noreferrer">VocaDB ↗</a></div></div></article>`;
  }
  function renderSong() {
    document.querySelectorAll('[data-vocadb-widget]').forEach(box=>{
      box.innerHTML='<div class="section-heading"><div><span class="eyebrow">VOCADB // DAILY DATA STREAM</span><h2>Song of the Day</h2></div><button type="button" class="small-button" data-stream-reroll>↻ Reroll Track</button></div>'+(songValue?songCard(songValue):'')+(dailyPromise?'<p class="status-message is-loading" role="status">TUNING THE VOCALOID SIGNAL…</p>':songError?`<p class="status-message is-error" role="status">${escape(songError)}</p>`:'')+'<p class="hint">A recommendation from VocaDB’s top-rated pool · cached for 24 hours. <a href="vocadb.html">Open full stream ↗</a></p>';
      box.querySelector('[data-stream-reroll]').disabled=Boolean(dailyPromise);
    });
  }
  async function loadDaily(reroll=false) {
    if(dailyPromise)return dailyPromise;
    if(!data()){songError='ERROR: Node unreachable — reload to reconnect the data stream.';renderSong();return;}
    songError='';
    dailyPromise=data().dailySong(reroll);renderSong();
    try {songValue=await dailyPromise;}catch(error){songError=error.message;}finally{dailyPromise=null;renderSong();}
  }
  function badge(type) {return `<span class="dex-type type-${escape(type)}">${escape(type)}</span>`;}
  function renderDex() {
    const Data=data();if(!Data)return;
    let creatures,record;
    try {creatures=Data.caught();record=core().read().cyberdex.encounters[core().dateKey()];}catch(error){document.querySelectorAll('[data-cyberdex-widget]').forEach(box=>{box.textContent=error.message;});return;}
    document.querySelectorAll('[data-cyberdex-widget]').forEach(box=>{
      const full=box.hasAttribute('data-full-dex'),visible=creatures;
      box.innerHTML=`<div class="section-heading"><div><span class="eyebrow">GEN 01–02 // HABIT REWARDS</span><h2>Cyber-Dex</h2></div><span class="tag">DEX SYNC: ${creatures.length} / 251</span></div><p class="hint">Complete all of today’s habits to discover one data signal. Catch it for +50 XP.</p>${record?.status==='pending'?'<button class="small-button" type="button" data-encounter-open>Resume daily encounter ↗</button>':record?.status==='caught'?'<p class="dex-success">TODAY’S SIGNAL // SYNCHRONIZED</p>':''}<div id="cyberdex-container" class="cyberdex-grid">${visible.map(p=>`<button type="button" class="dex-tile" data-dex-id="${p.id}" aria-label="Stats for ${escape(p.displayName)}">${safe(p.sprite)?`<img src="${escape(safe(p.sprite))}" alt="${escape(p.displayName)}" loading="lazy" width="80" height="80">`:'<span aria-hidden="true">◈</span>'}<small>#${String(p.id).padStart(3,'0')}</small><strong>${escape(p.displayName)}</strong><span>${p.types.map(badge).join(' ')}</span></button>`).join('')||'<p class="hint">NO SIGNALS CAPTURED // Your first encounter starts with today’s habits.</p>'}</div><a class="source-link" href="pokemon.html">${full?'View habits in LifeOS':'Open full Cyber-Dex'} ↗</a>`;
      if(full)box.querySelector('.source-link').href='lifeos.html';
    });
  }
  function showPokemon(p) {
    if(!infoDialog){infoDialog=document.createElement('dialog');infoDialog.id='cyberdex-details';infoDialog.setAttribute('aria-labelledby','dex-info-title');document.body.append(infoDialog);infoDialog.addEventListener('click',event=>{if(event.target.closest('[data-dex-close]'))infoDialog.close();});window.addEventListener('keydown',event=>{if(event.key==='Escape'&&infoDialog.open){event.preventDefault();event.stopImmediatePropagation();infoDialog.close();}},true);}
    infoDialog.innerHTML=`<div class="section-heading"><h2 id="dex-info-title">#${String(p.id).padStart(3,'0')} ${escape(p.displayName)}</h2><button type="button" class="small-button" data-dex-close aria-label="Close Pokémon stats">×</button></div>${safe(p.sprite)?`<img class="dex-detail-sprite" src="${escape(safe(p.sprite))}" alt="${escape(p.displayName)}" loading="lazy" width="112" height="112">`:''}<div>${p.types.map(badge).join(' ')}</div><p>${escape(p.description)}</p><dl class="dex-stats">${[['hp','HP'],['attack','ATK'],['defense','DEF'],['speed','SPD']].map(([key,label])=>`<div><dt>${label}</dt><dd><meter min="0" max="255" value="${Number(p.stats[key])}" aria-label="${label}"></meter><span>${Number(p.stats[key])}</span></dd></div>`).join('')}</dl><p class="hint">HEIGHT ${p.height}m // WEIGHT ${p.weight}kg</p>`;
    if(!infoDialog.open)infoDialog.showModal();
  }
  function mount() {
    if(document.querySelector('[data-vocadb-widget]')) {renderSong();if(!songValue&&!dailyPromise)void loadDaily();}
    renderDex();
  }
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-stream-reroll]'))void loadDaily(true);
    if(event.target.closest('[data-encounter-open]'))void window.parent.LifeOSCyberdex?.open();
    const tile=event.target.closest('[data-dex-id]');
    if(tile){const creature=data()?.caught().find(p=>p.id===Number(tile.dataset.dexId));if(creature)showPokemon(creature);}
  });
  const songSearch=document.querySelector('#vocadb-search');
  songSearch?.addEventListener('submit',async event=>{
    event.preventDefault();const current=++revision,button=songSearch.querySelector('button'),output=document.querySelector('#vocadb-results');
    const query=songSearch.elements.query.value.trim();if(!query)return;
    button.disabled=true;output.innerHTML='<p class="status-message is-loading" role="status">SEARCHING VOCADB…</p>';
    try{const tracks=await data().songs(query);if(current===revision)output.innerHTML=tracks.map(songCard).join('')||'<p class="status-message">No matching tracks.</p>';}
    catch(error){if(current===revision)output.innerHTML=`<p class="status-message is-error" role="status">${escape(error.message)}</p>`;}
    finally{if(current===revision)button.disabled=false;}
  });
  const dexSearch=document.querySelector('#dex-search');
  dexSearch?.addEventListener('submit',async event=>{
    event.preventDefault();const button=dexSearch.querySelector('button'),status=document.querySelector('#dex-search-status');button.disabled=true;status.textContent='DECODING POKÉAPI NODE…';status.classList.remove('is-error');
    try{const creature=await data().pokemon(dexSearch.elements.pokemon.value);showPokemon(creature);status.textContent='NODE ONLINE // Lookup only; complete daily habits to catch.';}
    catch(error){status.textContent=error.message;status.classList.add('is-error');}finally{button.disabled=false;}
  });
  window.LifeOSStreamsUI={mount};
  window.addEventListener('storage',event=>{if(event.key===core()?.STORAGE_KEY)renderDex();if(event.key==='vocadb_daily_cache'){songValue=null;void loadDaily();}});
  window.addEventListener('lifeos-state-changed',renderDex);
  try{window.parent.addEventListener('vocadb-track-changed',mount);window.parent.addEventListener('lifeos-state-changed',renderDex);window.addEventListener('pagehide',()=>{window.parent.removeEventListener('vocadb-track-changed',mount);window.parent.removeEventListener('lifeos-state-changed',renderDex);});}catch(_){}
  mount();
})();
