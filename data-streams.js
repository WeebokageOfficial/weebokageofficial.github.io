// Public APIs, normalized cache entries and daily song recommendations.
(() => {
  'use strict';
  const pending = new Map(), DAY = 86400000, CACHE_KEY = 'weebokage.streams.cache.v1';
  const error = message => new Error(`ERROR: Node unreachable${message ? ' — '+message : ''}`);
  function readCache(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (_) { return null; } }
  let cache = readCache(CACHE_KEY);
  if (!cache || typeof cache !== 'object' || Array.isArray(cache)) cache = {};
  function saveCache(key, data, ttl) {
    cache[key] = {data, expires: Date.now()+ttl};
    cache = Object.fromEntries(Object.entries(cache).filter(([,r])=>r && r.expires>Date.now()).slice(-300));
    // Keep provider metadata from crowding out the LifeOS profile.
    while (JSON.stringify(cache).length > 500000) delete cache[Object.keys(cache)[0]];
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (_) { /* Optional API cache may remain in memory. */ }
    return data;
  }
  async function request(url, ttl, compact = value => value) {
    if (cache[url]?.expires > Date.now()) return cache[url].data;
    if (pending.has(url)) return pending.get(url);
    const promise = (async () => {
      const controller = new AbortController(), timer = setTimeout(()=>controller.abort(), 12000);
      try {
        const response = await fetch(url, {signal:controller.signal, credentials:'omit', headers:{Accept:'application/json'}});
        if (!response.ok) throw error(response.status===404?'entry not found (404)':`HTTP ${response.status}`);
        return saveCache(url, compact(await response.json()), ttl);
      } catch (e) { throw e.message?.startsWith('ERROR:') ? e : error(e.name==='AbortError'?'request timed out':'check your connection'); }
      finally { clearTimeout(timer); }
    })();
    pending.set(url,promise);
    try { return await promise; } finally { pending.delete(url); }
  }
  function safeURL(value, hosts = null) {
    try {
      const url = new URL(value);
      if (url.protocol==='http:') url.protocol='https:';
      if (url.protocol!=='https:' || url.username || url.password || (hosts && !hosts.includes(url.hostname))) return '';
      return url.href;
    } catch (_) { return ''; }
  }
  const clean = (value, max=200) => String(value || '').replace(/[\x00-\x1f\x7f]/g,' ').slice(0,max);
  function song(raw) {
    if (!raw || !Number.isInteger(raw.id) || typeof raw.name!=='string') throw error('invalid VocaDB response');
    const artists = Array.isArray(raw.artists) ? raw.artists : [];
    const names = group => group.map(a=>clean(a.name || a.artist?.name)).filter(Boolean).join(', ');
    const producers = names(artists.filter(a=>a.artist?.artistType==='Producer' || /Producer|Composer/.test(a.categories||a.roles||'')));
    const vocalists = names(artists.filter(a=>/Vocaloid|UTAU|SynthesizerV|CeVIO|Voice/.test(a.artist?.artistType||'') || /Vocalist/.test(a.categories||'')));
    const pvs = (Array.isArray(raw.pvs)?raw.pvs:[]).filter(p=>!p.disabled);
    const pv = pvs.find(p=>p.service==='Youtube' && p.pvType==='Original') || pvs.find(p=>p.service==='Youtube') || pvs.find(p=>p.service==='NicoNicoDouga');
    const url = safeURL(pv?.url,['www.youtube.com','youtube.com','youtu.be','www.nicovideo.jp','nicovideo.jp','nico.ms']);
    const low = Number(raw.minMilliBpm)/1000, high = Number(raw.maxMilliBpm)/1000;
    const bpm = low>0 && high>0 ? (low===high ? String(low) : `${low}–${high}`) : Number(raw.bpm)>0 ? String(raw.bpm) : 'N/A';
    return {id:raw.id, title:clean(raw.name),producer:producers || clean(raw.artistString) || 'Unknown',vocalist:vocalists || 'Unknown',bpm,
      cover:safeURL(pv?.thumbUrl || (typeof raw.thumbUrl==='string' ? raw.thumbUrl : raw.thumbUrl?.url)), url,
      databaseURL:`https://vocadb.net/S/${raw.id}`};
  }
  async function songs(query) {
    const params = new URLSearchParams({fields:'ThumbUrl,Artists,PVs,Bpm',maxResults:query? '10':'50',lang:'English'});
    if (query) params.set('query',query); else params.set('sort','RatingScore');
    const result = await request('https://vocadb.net/api/songs?'+params, query ? 3600000 : DAY, r=>({items:Array.isArray(r?.items)?r.items.map(song):null}));
    if (!Array.isArray(result?.items)) throw error('invalid VocaDB response');
    return result.items.map(item=>item.title ? item : song(item));
  }
  async function randomSong(exclude) {
    const tracks=await songs();
    if (!tracks.length) throw error('no tracks found');
    const choices=tracks.filter(t=>t.id!==exclude), pool=choices.length?choices:tracks;
    return pool[Math.floor(Math.random()*pool.length)];
  }
  let dailyPending;
  async function dailySong(reroll=false) {
    if (dailyPending) return dailyPending;
    const saved=readCache('vocadb_daily_cache');
    if (!reroll && saved?.expires>Date.now() && Number.isInteger(saved.song?.id) && typeof saved.song?.title==='string') return saved.song;
    dailyPending=(async()=>{
      const track=await randomSong(saved?.song?.id);
      const value={song:track,expires:Date.now()+DAY};
      try {localStorage.setItem('vocadb_daily_cache',JSON.stringify(value));} catch (_) { /* Display still works without the optional cache. */ }
      window.dispatchEvent(new CustomEvent('vocadb-track-changed',{detail:track}));
      return track;
    })();
    try {return await dailyPending;} finally {dailyPending=null;}
  }
  async function command(name,args) {
    if (name==='vocaloid') {
      if (args[0]==='random' && args.length===1) {
        const t=await randomSong();
        return `[VOCADB STREAM] Track: ${t.title} | Producer: ${t.producer} | Vocalist: ${t.vocalist} | BPM: ${t.bpm}\nUplink: ${t.url || t.databaseURL}\n`;
      }
      if (args[0]==='find' && args.length>1 && args.join(' ').length<=250) {
        const tracks=(await songs(args.slice(1).join(' '))).slice(0,3);
        return tracks.length?tracks.map((t,i)=>`${i+1}. ${t.title} | ${t.producer}\n   ${t.url || t.databaseURL}`).join('\n')+'\n':'No matching tracks.\n';
      }
      const e=new Error('vocaloid: usage: vocaloid random | vocaloid find QUERY');e.code=2;throw e;
    }
    const e=new Error('Unknown data stream command');e.code=127;throw e;
  }
  window.LifeOSDataStreams={dailySong,randomSong,songs,command,safeURL,song};
})();
