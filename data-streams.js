// Public APIs, normalized cache entries and shared daily collection rules.
(() => {
  'use strict';
  const Core = window.LifeOSCore;
  const pending = new Map(), DAY = 86400000, CACHE_KEY = 'weebokage.streams.cache.v1';
  const error = message => new Error(`ERROR: Node unreachable${message ? ' — '+message : ''}`);
  function readCache(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (_) { return null; } }
  let cache = readCache(CACHE_KEY);
  if (!cache || typeof cache !== 'object' || Array.isArray(cache)) cache = {};
  function saveCache(key, data, ttl) {
    cache[key] = {data, expires: Date.now()+ttl};
    cache = Object.fromEntries(Object.entries(cache).filter(([,r])=>r && r.expires>Date.now()).slice(-300));
    // Leave room for the profile: raw species responses can contain hundreds of flavor entries.
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
  async function pokemon(input) {
    const name=String(input).toLowerCase().trim();
    if (!/^(?:[1-9]\d{0,4}|[a-z][a-z0-9-]{0,60})$/.test(name)) throw error('use a Pokémon name or National-Dex number');
    const raw=await request(`https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(name)}`,30*DAY, p=>({
      id:p.id,name:p.name,species:p.species,height:p.height,weight:p.weight,types:p.types,stats:p.stats,
      sprites:{front_default:p.sprites?.other?.showdown?.front_default || p.sprites?.versions?.['generation-v']?.['black-white']?.animated?.front_default || p.sprites?.front_default}
    }));
    if (!Number.isInteger(raw?.id) || !Array.isArray(raw.stats) || !Array.isArray(raw.types)) throw error('invalid PokéAPI response');
    let species=null;
    try {species=await request(`https://pokeapi.co/api/v2/pokemon-species/${encodeURIComponent(raw.species?.name || raw.id)}`,30*DAY, p=>({
      names:['de','en'].map(lang=>p.names?.find(n=>n.language?.name===lang)).filter(Boolean),
      flavor_text_entries:['de','en'].map(lang=>p.flavor_text_entries?.find(n=>n.language?.name===lang)).filter(Boolean)
    }));} catch (_) { /* Pokémon data remains usable if species data is unavailable. */ }
    const stat=key=>Number(raw.stats.find(s=>s.stat?.name===key)?.base_stat)||0;
    const displayName=species?.names?.find(n=>n.language?.name==='de')?.name || raw.name;
    const description=species?.flavor_text_entries?.find(n=>n.language?.name==='de')?.flavor_text || species?.flavor_text_entries?.find(n=>n.language?.name==='en')?.flavor_text || '';
    return {id:raw.id,name:clean(raw.name,100),displayName:clean(displayName,100),
      sprite:safeURL(raw.sprites?.other?.showdown?.front_default || raw.sprites?.versions?.['generation-v']?.['black-white']?.animated?.front_default || raw.sprites?.front_default),
      types:raw.types.map(t=>clean(t.type?.name,20)),stats:{hp:stat('hp'),attack:stat('attack'),defense:stat('defense'),speed:stat('speed')},
      height:Number(raw.height)/10,weight:Number(raw.weight)/10,description:clean(description,1000)};
  }
  function eligible(state, day=Core.dateKey()) {return state.habits.length>0 && state.habits.every(h=>h.days.includes(day));}
  function prepareEncounter(state, day=Core.dateKey(), random=Math.random) {
    state.cyberdex ||= {caught:[],encounters:{}};
    if (state.cyberdex.encounters[day] || !eligible(state,day)) return state.cyberdex.encounters[day] || null;
    return state.cyberdex.encounters[day]={id:1+Math.min(250,Math.max(0,Math.floor(random()*251))),status:'pending'};
  }
  function applyCatch(state, day, creature) {
    const encounter=state.cyberdex?.encounters[day];
    if (day!==Core.dateKey() || !encounter || encounter.status!=='pending' || encounter.id!==creature.id) return null;
    Core.validateCyberdex({caught:[creature],encounters:{}});
    encounter.status='caught';
    if (!state.cyberdex.caught.some(p=>p.id===creature.id)) state.cyberdex.caught.push(creature);
    return Core.award(state,50);
  }
  function caught() {return Core.read().cyberdex.caught.slice().sort((a,b)=>a.id-b.id);}
  function mirrorCaught() {
    try {localStorage.setItem('cyberdex_caught',JSON.stringify(caught()));} catch (_) { /* Atomic LifeOS document is the authoritative collection. */ }
  }
  async function catchPokemon(day, creature) {
    const claim=()=>Core.update(state=>applyCatch(state,day,creature));
    const reward=navigator.locks ? await navigator.locks.request('lifeos-state',claim) : claim();
    mirrorCaught();
    return reward;
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
    if (args.length===1 && args[0]==='list') return 'DEX SYNC: '+caught().length+' / 251\nID   NAME                     TYPE\n'+caught().map(p=>`#${String(p.id).padStart(3,'0')} ${p.displayName.padEnd(24)} ${p.types.join(' / ')}`).join('\n')+'\n';
    if (args.length!==1) {const e=new Error('dex: usage: dex NAME_OR_ID | dex list');e.code=2;throw e;}
    const p=await pokemon(args[0]);
    return `========================================\nPOKÉ-DEX ENTRY: #${String(p.id).padStart(3,'0')} ${p.displayName.toUpperCase()} (${p.name})\nTYPE: ${p.types.join(' / ')}\nSTATS: HP: ${p.stats.hp} | ATK: ${p.stats.attack} | DEF: ${p.stats.defense} | SPE: ${p.stats.speed}\nHEIGHT: ${p.height}m | WEIGHT: ${p.weight}kg\n========================================\n`;
  }
  window.LifeOSDataStreams={dailySong,randomSong,songs,pokemon,command,caught,eligible,prepareEncounter,applyCatch,catchPokemon,mirrorCaught,safeURL,song};
})();
