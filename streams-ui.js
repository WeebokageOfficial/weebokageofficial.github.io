// VocaDB widgets shared by LifeOS and the music stream page.
(() => {
  'use strict';
  const data=()=>window.parent.LifeOSDataStreams || window.LifeOSDataStreams;
  const escape=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const safe=value=>data()?.safeURL(value)||'';
  let dailyPromise, songValue, songError='', revision=0;
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
  function mount() {
    if(document.querySelector('[data-vocadb-widget]')) {renderSong();if(!songValue&&!dailyPromise)void loadDaily();}
  }
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-stream-reroll]'))void loadDaily(true);
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
  window.LifeOSStreamsUI={mount};
  window.addEventListener('storage',event=>{if(event.key==='vocadb_daily_cache'){songValue=null;void loadDaily();}});
  try{window.parent.addEventListener('vocadb-track-changed',mount);window.addEventListener('pagehide',()=>window.parent.removeEventListener('vocadb-track-changed',mount));}catch(_){}
  mount();
})();
