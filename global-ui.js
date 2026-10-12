const SPOTIFY_CLIENT_ID = 'd0eeaa4f1e2a43ffa9d05ad692629502';
(() => {
  'use strict';
  document.getElementById('global-ui').innerHTML = `
    <section id="quake-terminal" class="quake-terminal" aria-label="LifeOS command terminal" aria-hidden="true" inert>
      <header><span>LifeOS // CYBER-KERNEL TERMINAL</span><button type="button" id="terminal-close" aria-label="Close terminal">×</button></header>
      <div id="terminal-output" role="log" aria-live="polite" aria-label="Command output" tabindex="0"></div>
      <pre id="terminal-matrix" aria-hidden="true" hidden></pre>
      <form id="terminal-form" autocomplete="off"><label for="terminal-input">user@lifeos:~$</label><input id="terminal-input" type="text" spellcheck="false" autocomplete="off" maxlength="500" aria-label="Terminal command"></form>
    </section>
    <section id="cyberdeck" class="cyberdeck" aria-label="Spotify CyberDeck music player">
      <div class="deck-track"><div class="deck-art"><span aria-hidden="true">♫</span><img id="deck-cover" alt="Current album cover" hidden></div><div class="deck-metadata"><span class="deck-label">SPOTIFY // CYBERDECK</span><a id="deck-title" href="https://open.spotify.com" target="_blank" rel="noopener noreferrer">Your soundtrack awaits</a><span id="deck-artist">LifeOS CyberDeck</span></div></div>
      <div class="deck-playback"><div class="deck-buttons">
        <button id="deck-prev" type="button" aria-label="Previous track" disabled>⏮</button>
        <button id="deck-play" type="button" aria-label="Play" disabled>▶</button>
        <button id="deck-next" type="button" aria-label="Next track" disabled>⏭</button>
        <button id="deck-shuffle" type="button" aria-label="Shuffle" aria-pressed="false" disabled>⤨</button>
      </div><div class="deck-progress"><time id="deck-position">0:00</time><input id="deck-seek" type="range" min="0" max="1" step="1" value="0" aria-label="Track position" disabled><time id="deck-duration">0:00</time></div></div>
      <div class="deck-connect"><label class="deck-volume">VOL <input id="deck-volume" type="range" min="0" max="100" value="50" aria-label="Volume" disabled></label><span id="deck-status" class="deck-status" role="status">CONNECT // DISCONNECTED</span><button id="deck-connect" class="small-button" type="button">Connect Spotify</button><button type="button" id="terminal-toggle" class="global-terminal-toggle" aria-controls="quake-terminal" aria-expanded="false" title="Kommandozentrale (^ / ~ / Escape)" aria-label="Kommandozentrale öffnen">&gt;_</button></div>
      <p id="deck-message" class="deck-message" role="status">Connect Spotify Premium, then select a song in Spotify.</p>
    </section>
`;
})();
// Isolated from dashboard storage, imports and module re-renders.
(() => {
  'use strict';
  const el = name => document.getElementById(`deck-${name}`);
  const TOKEN_KEY = 'weebokage.lifeos.spotify.token';
  const AUTH_KEY = 'weebokage.lifeos.spotify.pkce';
  const redirectURI = new URL('lifeos.html', new URL('.', document.currentScript.src)).href;
  const scopes = 'streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state';
  let token = null, player = null, deviceId = null, playback = null, sampledAt = 0;
  let refreshPending = null, seeking = false, shuffle = false, initializing = false;
  const message = text => { el('message').textContent = text; };
  const run = action => Promise.resolve().then(action).catch(error => message(error.message || 'Spotify is currently unavailable.'));
  const fill = input => input.style.setProperty('--fill', `${100 * Number(input.value) / Number(input.max)}%`);
  const clock = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
  function controls(ready) {
    ['prev','play','next','shuffle','volume'].forEach(name => { el(name).disabled = !ready; });
    el('seek').disabled = !ready || !playback;
  }
  function status(ready, label = ready ? 'CONNECTED' : 'DISCONNECTED') {
    el('status').textContent = `CONNECT // ${label}`;
    el('status').classList.toggle('connected', ready);
    el('connect').hidden = ready;
    el('connect').textContent = token ? 'Reconnect Spotify' : 'Connect Spotify';
    controls(ready);
  }
  function forget() {
    token = null;
    try { localStorage.removeItem(TOKEN_KEY); } catch (_) { /* Memory-only session. */ }
    player?.disconnect(); player = null; deviceId = null; renderState(null); status(false);
  }
  async function exchange(params) {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({client_id:SPOTIFY_CLIENT_ID,...params})
    });
    if (!response.ok) {
      if ([400,401].includes(response.status)) forget();
      throw new Error('Spotify login expired or failed. Please connect again.');
    }
    const data = await response.json();
    token = {access_token:data.access_token, refresh_token:data.refresh_token || token?.refresh_token, expires_at:Date.now() + data.expires_in * 1000};
    try { localStorage.setItem(TOKEN_KEY,JSON.stringify(token)); } catch (_) { message('Spotify connected for this page session only.'); }
    return token.access_token;
  }
  async function accessToken() {
    if (token?.access_token && token.expires_at > Date.now() + 60000) return token.access_token;
    if (!token?.refresh_token) { forget(); throw new Error('Please connect Spotify again.'); }
    if (!refreshPending) refreshPending = exchange({grant_type:'refresh_token',refresh_token:token.refresh_token}).finally(() => { refreshPending = null; });
    return refreshPending;
  }
  async function api(path, options = {}) {
    const response = await fetch(`https://api.spotify.com/v1/me/player${path}`, {
      ...options, headers:{Authorization:`Bearer ${await accessToken()}`,'Content-Type':'application/json'}
    });
    if (response.status === 401) { forget(); throw new Error('Spotify session expired. Please reconnect.'); }
    if (!response.ok) throw new Error(response.status === 403 ? 'Spotify Premium and access to this Spotify app are required.' : `Spotify request failed (${response.status}). Please try again.`);
    return response.status === 204 ? null : response.json();
  }
  const random = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2,'0')).join('');
  async function authorize() {
    if (!window.isSecureContext || !crypto.subtle) throw new Error('Spotify login requires HTTPS (or a loopback development address).');
    const verifier = random(), state = random();
    const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier));
    const challenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    sessionStorage.setItem(AUTH_KEY,JSON.stringify({verifier,state,created:Date.now(),returnTo:location.pathname+location.search+location.hash}));
    const url = new URL('https://accounts.spotify.com/authorize');
    url.search = new URLSearchParams({client_id:SPOTIFY_CLIENT_ID,response_type:'code',redirect_uri:redirectURI,scope:scopes,state,code_challenge_method:'S256',code_challenge:challenge}).toString();
    location.assign(url.href);
  }
  async function callback() {
    try { token = JSON.parse(localStorage.getItem(TOKEN_KEY)); } catch (_) { token = null; }
    const url = new URL(location.href);
    if (!url.searchParams.has('code') && !url.searchParams.has('error')) return;
    const code = url.searchParams.get('code'), state = url.searchParams.get('state'), error = url.searchParams.get('error');
    ['code','state','error','error_description'].forEach(key => url.searchParams.delete(key));
    history.replaceState(history.state,'',`${url.pathname}${url.search}${url.hash}`);
    let auth;
    try { auth = JSON.parse(sessionStorage.getItem(AUTH_KEY)); } finally { sessionStorage.removeItem(AUTH_KEY); }
    if (!auth || auth.state !== state || Date.now() - auth.created > 600000) throw new Error('Spotify login could not be verified. Please connect again.');
    if (error || !code) throw new Error('Spotify login cancelled. You can connect again at any time.');
    await exchange({grant_type:'authorization_code',code,redirect_uri:redirectURI,code_verifier:auth.verifier});
    if (auth.returnTo) window.LifeOSShell.navigate(auth.returnTo,{replace:true});
  }
  function renderState(state) {
    playback = state; sampledAt = performance.now();
    const track = state?.track_window?.current_track;
    el('title').textContent = track?.name || 'Your soundtrack awaits';
    el('title').href = track?.id ? `https://open.spotify.com/track/${encodeURIComponent(track.id)}` : 'https://open.spotify.com';
    el('artist').textContent = track?.artists?.map(artist => artist.name).join(', ') || 'Select a song in Spotify';
    const cover = track?.album?.images?.[0]?.url;
    el('cover').hidden = !cover;
    if (cover) el('cover').src = cover; else el('cover').removeAttribute('src');
    el('play').textContent = state && !state.paused ? 'Ⅱ' : '▶';
    el('play').setAttribute('aria-label',state && !state.paused ? 'Pause' : 'Play');
    shuffle = !!state?.shuffle; el('shuffle').setAttribute('aria-pressed',String(shuffle));
    el('seek').max = state?.duration || 1;
    el('duration').textContent = clock(state?.duration || 0);
    el('seek').disabled = !state || !deviceId;
    if (state) message('LifeOS CyberDeck // Spotify');
    tick();
  }
  function tick() {
    if (seeking) return;
    const position = playback ? Math.min(playback.duration,playback.position + (playback.paused ? 0 : performance.now() - sampledAt)) : 0;
    el('seek').value = position; el('position').textContent = clock(position); fill(el('seek'));
  }
  async function initialize() {
    if (!window.Spotify || !token || player || initializing) return;
    initializing = true;
    try {
      await accessToken(); status(false,'CONNECTING');
      player = new Spotify.Player({name:'LifeOS CyberDeck',volume:Number(el('volume').value)/100,enableMediaSession:true,
        getOAuthToken: cb => { run(async () => cb(await accessToken())); }
      });
      player.addListener('ready',({device_id}) => {
        deviceId = device_id;
        run(async () => {
          await api('',{method:'PUT',body:JSON.stringify({device_ids:[device_id],play:false})});
          status(true); message('Select a song in Spotify to start your soundtrack.');
          renderState(await player.getCurrentState());
        });
      });
      player.addListener('not_ready',() => { deviceId = null; renderState(null); status(false); message('Spotify device went offline. Reconnect to continue.'); });
      player.addListener('player_state_changed',renderState);
      player.addListener('authentication_error',() => { forget(); message('Spotify authentication failed. Please reconnect.'); });
      ['initialization_error','account_error'].forEach(event => player.addListener(event,({message:detail}) => { player?.disconnect(); player = null; deviceId = null; renderState(null); status(false); message(detail); }));
      player.addListener('playback_error',({message:detail}) => message(detail));
      player.addListener('autoplay_failed',() => message('Press Play to enable audio in this browser.'));
      if (!await player.connect()) { player.disconnect(); player = null; status(false); message('Spotify could not connect. Please try again.'); }
    } finally { initializing = false; }
  }
  window.LifeOSMusic = {
    async command(args) {
      const [action = 'status', value, ...extra] = args;
      if (extra.length) throw new Error('music: too many arguments');
      if (action === 'status') return `${el('status').textContent}\n${el('title').textContent} — ${el('artist').textContent}`;
      if (action === 'connect') { el('connect').click(); return 'Opening Spotify connection…'; }
      if (!player || !deviceId) throw new Error('music: no connected device; run music connect');
      if (['play','pause','toggle','next','prev'].includes(action)) {
        if (value != null) throw new Error('music: unexpected argument');
        if (action === 'play' || action === 'toggle') await player.activateElement();
        await player[({play:'resume',pause:'pause',toggle:'togglePlay',next:'nextTrack',prev:'previousTrack'})[action]]();
        return `music: ${action}`;
      }
      if (action === 'volume') {
        if (value == null) return `volume: ${Math.round(await player.getVolume() * 100)}%`;
        const volume = Number(value);
        if (!Number.isFinite(volume) || volume < 0 || volume > 100) throw new Error('music volume: expected 0..100');
        await player.setVolume(volume / 100); el('volume').value = volume; fill(el('volume'));
        return `volume: ${volume}%`;
      }
      if (action === 'shuffle') {
        if (value == null) return `shuffle: ${shuffle ? 'on' : 'off'}`;
        if (!['on','off'].includes(value)) throw new Error('music shuffle: expected on or off');
        await api(`/shuffle?state=${value === 'on'}&device_id=${encodeURIComponent(deviceId)}`,{method:'PUT'});
        shuffle = value === 'on'; el('shuffle').setAttribute('aria-pressed',String(shuffle));
        return `shuffle: ${value}`;
      }
      throw new Error('music: unknown command; see man music');
    }
  };
  window.onSpotifyWebPlaybackSDKReady = () => { run(initialize); };
  el('connect').addEventListener('click',() => run(async () => {
    if (!token) return authorize();
    if (player) { player.disconnect(); player = null; deviceId = null; renderState(null); }
    if (!window.Spotify) { loadSDK(); message('Loading Spotify…'); return; }
    await initialize();
  }));
  ['prev','play','next'].forEach((name,index) => el(name).addEventListener('click',() => {
    // Invoke while the click still counts as a user gesture (required on iOS).
    if (name === 'play') player?.activateElement().catch(error => message(error.message));
    run(async () => { await player[['previousTrack','togglePlay','nextTrack'][index]](); });
  }));
  el('shuffle').addEventListener('click',() => run(async () => {
    const next = !shuffle;
    await api(`/shuffle?state=${next}&device_id=${encodeURIComponent(deviceId)}`,{method:'PUT'});
    shuffle = next; el('shuffle').setAttribute('aria-pressed',String(shuffle));
  }));
  el('volume').addEventListener('input',() => fill(el('volume')));
  el('volume').addEventListener('change',() => run(() => player.setVolume(Number(el('volume').value)/100)));
  el('seek').addEventListener('input',() => { seeking = true; el('position').textContent = clock(Number(el('seek').value)); fill(el('seek')); });
  el('seek').addEventListener('change',() => run(async () => {
    try { const position = Number(el('seek').value); await player.seek(position); if (playback) { playback = {...playback,position}; sampledAt = performance.now(); } }
    finally { seeking = false; tick(); }
  }));
  el('cover').addEventListener('error',() => { el('cover').hidden = true; });
  function loadSDK() {
    if (document.getElementById('spotify-playback-sdk')) return;
    const script = document.createElement('script'); script.id = 'spotify-playback-sdk'; script.src = 'https://sdk.scdn.co/spotify-player.js'; script.async = true;
    script.onerror = () => { script.remove(); status(false); message('Spotify SDK could not load. Check your connection and reconnect.'); };
    document.head.append(script);
  }
  run(async () => { await callback(); status(false); if (token) { loadSDK(); await initialize(); } });
  fill(el('volume')); setInterval(tick,250);
  document.addEventListener('visibilitychange',() => { if (!document.hidden && player) run(async () => renderState(await player.getCurrentState())); });
  window.addEventListener('pagehide',event => { if (!event.persisted) player?.disconnect(); });
})();

// One terminal session survives internal page navigation alongside the SDK device.
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const HISTORY_KEY = 'weebokage.shell.history.v1';
  let opened = false, previousFocus = null, history = [], cursor = 0, draft = '';
  let busy = false, generation = 0, matrixTimer = null, matrixEnd = null, audioContext = null;
  try {const stored=JSON.parse(localStorage.getItem(HISTORY_KEY));if(Array.isArray(stored))history=stored.filter(line=>typeof line==='string'&&line.length<=500).slice(-200);}catch(_){}
  cursor=history.length;
  function saveHistory() {try{localStorage.setItem(HISTORY_KEY,JSON.stringify(history));}catch(_) { /* History remains usable in memory. */ }}
  function write(text,error=false) {
    if(!text)return;
    const line=document.createElement('pre');line.textContent=text.replace(/\n$/,'');if(error)line.className='terminal-error';
    $('terminal-output').append(line);while($('terminal-output').children.length>300)$('terminal-output').firstChild.remove();
    $('terminal-output').scrollTop=$('terminal-output').scrollHeight;
  }
  function prompt() {$('terminal-form').querySelector('label').textContent=shell.prompt();$('terminal-form').dataset.exit=String(shell.code);}
  function stopMatrix(){clearInterval(matrixTimer);clearTimeout(matrixEnd);$('terminal-matrix').hidden=true;}
  function matrix(){
    stopMatrix();const area=$('terminal-matrix');area.hidden=false;
    const rain=()=>{area.textContent=Array.from({length:12},()=>Array.from({length:Math.max(20,Math.min(110,Math.floor(area.clientWidth/9)))},()=>Math.random()>.3?'01アイウエオカキクケコ'[Math.floor(Math.random()*12)]:' ').join('')).join('\n');};
    rain();if(!matchMedia('(prefers-reduced-motion: reduce)').matches)matrixTimer=setInterval(rain,90);matrixEnd=setTimeout(stopMatrix,5000);
  }
  let toastTimer;
  async function reward(detail){
    const toast=$('shell-toast');toast.textContent=`${detail.levelUp?'LEVEL UP // ':''}+${detail.amount} XP · LV. ${detail.level} ${detail.title}`;toast.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{toast.hidden=true;},4200);
    try{const frame=$('site-content');frame.contentWindow.dispatchEvent(new CustomEvent('lifeos-reward',{detail}));}catch(_){}
    if(window.LifeOSCore.read().preferences.muted)return;
    try{
      const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
      audioContext ||= new Audio();if(audioContext.state==='suspended')await audioContext.resume();
      const start=audioContext.currentTime+.01;
      (detail.levelUp?[261.63,329.63,392,523.25,659.25]:[440,880]).forEach((frequency,index)=>{
        const oscillator=audioContext.createOscillator(),gain=audioContext.createGain(),at=start+index*.085;
        oscillator.type=detail.levelUp?'triangle':'square';oscillator.frequency.value=frequency;
        gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(detail.levelUp ? 0.11 : 0.045,at+.006);gain.gain.exponentialRampToValueAtTime(.0001,at+(detail.levelUp ? 0.24 : 0.075));
        oscillator.connect(gain);gain.connect(audioContext.destination);oscillator.start(at);oscillator.stop(at+.25);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
      });
    }catch(_) { /* Playback policies never block the saved reward. */ }
  }
  async function blip(kind='click') {
    try {
      if(window.LifeOSCore.read().preferences.muted)return;
      const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
      audioContext ||= new Audio();if(audioContext.state==='suspended')await audioContext.resume();
      const at=audioContext.currentTime+.005,osc=audioContext.createOscillator(),gain=audioContext.createGain();
      const frequency={click:540,copy:980,success:1320,failure:140}[kind]||540;
      osc.type=kind==='failure'?'sawtooth':'sine';osc.frequency.setValueAtTime(frequency,at);osc.frequency.exponentialRampToValueAtTime(kind==='failure'?65:frequency*1.5,at+.075);
      gain.gain.setValueAtTime(.045,at);gain.gain.exponentialRampToValueAtTime(.0001,at+.12);osc.connect(gain);gain.connect(audioContext.destination);osc.start(at);osc.stop(at+.13);osc.onended=()=>{osc.disconnect();gain.disconnect();};
    } catch(_) { /* Unsupported audio never blocks a copy or a move. */ }
  }
  window.LifeOSAudio={blip,reward};
  const shell=new window.LifeOSShellEngine({
    history:()=>history,clearHistory:()=>{history=[];cursor=0;draft='';saveHistory();},
    arcade:()=>{toggle(false);window.LifeOSArcade?.open();},
    clear:()=>{$('terminal-output').replaceChildren();stopMatrix();},exit:()=>toggle(false),matrix,reward
  });
  const toast=document.createElement('p');toast.id='shell-toast';toast.setAttribute('role','status');toast.hidden=true;$('global-ui').append(toast);
  function toggle(force) {
    const child=$('site-content').contentDocument;
    if(!opened&&(document.querySelector('dialog[open]')||child?.querySelector('dialog[open]')))return;
    opened=force??!opened;
    const terminal=$('quake-terminal');terminal.classList.toggle('open',opened);terminal.inert=!opened;terminal.setAttribute('aria-hidden',String(!opened));$('terminal-toggle').setAttribute('aria-expanded',String(opened));
    child?.getElementById('terminal-toggle')?.setAttribute('aria-expanded',String(opened));
    if(opened){previousFocus=document.activeElement;prompt();$('terminal-input').focus();}else{stopMatrix();if(previousFocus?.isConnected)previousFocus.focus();}
  }
  function handleGlobalKey(event) {
    if(event.defaultPrevented||event.isComposing||event.repeat||event.ctrlKey||event.metaKey||event.altKey)return;
    if(event.key==='Escape'&&opened){event.preventDefault();event.stopImmediatePropagation();toggle(false);return;}
    const editing=event.target.closest?.('input,textarea,select,[contenteditable]:not([contenteditable=false]),[role=textbox]');
    if(editing)return;
    if(['^','~','Escape'].includes(event.key)||(event.key==='Dead'&&event.code==='Backquote')){event.preventDefault();event.stopImmediatePropagation();toggle();}
  }
  window.LifeOSTerminal={toggle,handleGlobalKey};
  window.addEventListener('lifeos-terminal-toggle',()=>toggle());
  document.addEventListener('keydown',handleGlobalKey);
  $('terminal-toggle').addEventListener('click',()=>toggle());$('terminal-close').addEventListener('click',()=>toggle(false));
  $('terminal-input').addEventListener('keydown',event=>{
    if(event.isComposing)return;const input=event.target;
    if(event.ctrlKey&&!event.altKey&&!event.metaKey){
      const key=event.key.toLowerCase();
      if(key==='l'){event.preventDefault();$('terminal-output').replaceChildren();return;}
      if(key==='c'){event.preventDefault();generation++;stopMatrix();write(`${shell.prompt()} ${input.value}^C`);input.value='';shell.code=130;prompt();return;}
      if(key==='d'&&!input.value){event.preventDefault();toggle(false);return;}
      if(key==='a'){event.preventDefault();input.setSelectionRange(0,0);return;}
      if(key==='e'){event.preventDefault();input.setSelectionRange(input.value.length,input.value.length);return;}
      if(key==='u'){event.preventDefault();input.value=input.value.slice(input.selectionStart);input.setSelectionRange(0,0);return;}
      if(key==='k'){event.preventDefault();input.value=input.value.slice(0,input.selectionStart);return;}
      if(key==='r'){event.preventDefault();const query=input.dataset.historyQuery??input.value;input.dataset.historyQuery=query;const found=history.slice(0,cursor).map((line,index)=>({line,index})).reverse().find(item=>item.line.includes(query));if(found){cursor=found.index;input.value=found.line;}return;}
    }
    if(event.key!=='Control')delete input.dataset.historyQuery;
    if(event.key==='Tab'){
      event.preventDefault();try{
        const matches=shell.complete(input.value.slice(0,input.selectionStart));
        if(matches.length===1){input.value=matches[0]+input.value.slice(input.selectionStart);input.setSelectionRange(matches[0].length,matches[0].length);}
        else if(matches.length){let common=matches[0];for(const candidate of matches)while(!candidate.startsWith(common))common=common.slice(0,-1);if(common.length>input.selectionStart){input.value=common+input.value.slice(input.selectionStart);input.setSelectionRange(common.length,common.length);}else write(matches.map(candidate=>candidate.trim().split(/\s+/).pop()).join('  '));}
      }catch(error){write(error.message,true);}return;
    }
    if(['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();if(cursor===history.length)draft=input.value;cursor=Math.max(0,Math.min(history.length,cursor+(event.key==='ArrowUp'?-1:1)));input.value=cursor===history.length?draft:history[cursor];input.setSelectionRange(input.value.length,input.value.length);}
  });
  $('terminal-form').addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;const input=$('terminal-input');let line=input.value.trim();if(!line)return;
    if(line==='!!'||/^!\d+$/.test(line)){const previous=line==='!!'?history[history.length-1]:history[Number(line.slice(1))-1];if(!previous){write('sh: event not found',true);return;}line=previous;}
    write(`${shell.prompt()} ${line}`);history.push(line);history=history.slice(-200);saveHistory();cursor=history.length;draft='';input.value='';
    busy=true;const run=generation;$('terminal-form').setAttribute('aria-busy','true');
    try{
      const outcome=await shell.run(line);
      if(run===generation){write(outcome.stdout);write(outcome.stderr,true);if(line==='help'){
        const list=document.createElement('div');list.className='terminal-help';for(const name of shell.complete('')){const button=document.createElement('button');button.type='button';button.textContent=name.trim();button.dataset.terminalHelp=name.trim();list.append(button);}$('terminal-output').append(list);
      }}
    }catch(error){write(error.message,true);}finally{busy=false;$('terminal-form').setAttribute('aria-busy','false');prompt();if(opened)input.focus();}
  });
  $('terminal-output').addEventListener('click',async event=>{const button=event.target.closest('[data-terminal-help]');if(button){const outcome=await shell.run(`man ${button.dataset.terminalHelp}`);write(outcome.stdout);$('terminal-input').focus();}});
  const resize=new ResizeObserver(entries=>{document.documentElement.style.setProperty('--deck-height',`${Math.ceil(entries[0].target.getBoundingClientRect().height)}px`);});resize.observe($('cyberdeck'));
  write('LifeOS Cyber-Kernel v3.9-vocaloid\nBrowser shell · virtual filesystem · Type help or man COMMAND.\nTab completes commands, paths and IDs. Music keeps playing between pages.');prompt();
})();
