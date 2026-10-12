// Spotify configuration lives in global-ui.js.
(() => {
  'use strict';

  // State management: one versioned document, local calendar dates, integer cents.
  const {STORAGE_KEY,BACKUP_KEY,dateKey,dayDistance,uid,prayers,titleForLevel,newHabit,defaults,validateState,validateLoreGraph,currentStreak} = window.LifeOSCore;
  let storageIssue = '';
  let lastSaveSucceeded = true;
  const Store = {
    load() {
      for (const key of [STORAGE_KEY,BACKUP_KEY]) {
        try {
          const raw = localStorage.getItem(key);
          if (!raw) continue;
          const restored = validateState(JSON.parse(raw));
          if (key === BACKUP_KEY) storageIssue = 'Your previous saved progress was recovered from the automatic backup.';
          return restored;
        } catch (_) { storageIssue = 'Saved data could not be loaded. Restore an exported backup before making new changes.'; }
      }
      return defaults();
    },
    save() {
      const previousSavedAt = state.savedAt;
      try {
        const previous = localStorage.getItem(STORAGE_KEY);
        Dialogue.snapshot();
        state.savedAt = new Date().toISOString();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        if (previous) { try { validateState(JSON.parse(previous)); localStorage.setItem(BACKUP_KEY,previous); } catch (_) { /* The primary save succeeded; a backup is best effort. */ } }
        lastSaveSucceeded = true;
        updateSaveStatus();
        return true;
      } catch (_) {
        state.savedAt = previousSavedAt;
        lastSaveSucceeded = false;
        updateSaveStatus();
        notify('Unable to save. Export a backup now; these changes currently remain in this session only.');
        return false;
      }
    },
    touch() { const today = dateKey(); if (!state.activityDays.includes(today)) state.activityDays.push(today); },
    award(amount) {
      const previous = state.level;
      const previousTitle = titleForLevel(previous);
      state.xp += amount;
      while (state.xp >= requiredXP()) { state.xp -= requiredXP(); state.level++; }
      void AudioEngine.play(state.level > previous);
      if (titleForLevel(state.level) !== previousTitle) showTitleUnlock(titleForLevel(state.level));
      notify(state.level > previous ? `LEVEL UP! LV. ${state.level} // +${amount} XP ✦` : `+${amount} XP // Neural sync improved`);
    }
  };
  let state = Store.load();
  let currentDay = dateKey();
  const ui = { filter: 'all', loreQuery: '', loreCategory: 'all', loreStatus: 'all', month: dateKey().slice(0, 7), quote: 0, hadith: Math.floor(Date.parse(`${dateKey()}T12:00:00Z`) / 86400000) % 3, editor: null, quotes: {}, quotePending: {}, importBusy: false, importStatus: '', importDrafts: [], importMessages: [] };
  const requiredXP = () => 100 + (state.level - 1) * 50;
  const $ = selector => document.querySelector(selector);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const euro = cents => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR' }).format(cents / 100);
  const personas = {
    lifestyle: { name: 'HATSUNE MIKU', system: '01 // SYSTEM IDOL', role: 'Your next small step matters.', alt: 'Miku holding a notebook and a mug', quotes: ['A small sync beats a perfect plan. Let’s take the next step! 🩵', 'Your habits set the rhythm. You write the melody.', 'A sip of water, a fresh idea, a step outside. Ready, Producer?'] },
    lore: { name: 'HATSUNE MIKU', system: '01 // STORY ARCHIVIST', role: 'Every great world starts with a small idea.', alt: 'Miku, your writing and lore companion', quotes: ['Your first draft only needs to be one thing: written. 🎵', 'Give your character a wish. Then give them a reason to hide it.', 'One scene can be the beginning of an entire universe.'] },
    finance: { name: 'HATSUNE MIKU', system: '01 // BUDGET OPERATOR', role: 'A clearer picture. More room for your goals.', alt: 'Miku, your budget companion', quotes: ['Let’s give your numbers a steady rhythm. 🩵', 'An honest overview is a good first step.', 'Your budget is a plan for what matters to you.'] },
    teto: { name: 'KASANE TETO', system: '04 // CHIMERA UTILITY', role: 'Less busywork. More done.', alt: 'Teto, your quick tools companion', quotes: ['Finally. Give me your text — I can count without a baguette, you know. 🥖', 'Miku would have taken longer. So, what are we converting?', 'Of course I’ll help. Someone around here has to be competent.'] },
    imam: { name: 'HATSUNE MIKU', system: '01 // REFLECTION GUIDE', role: 'A quiet moment for intention and consistency.', alt: 'Miku, your companion for daily reflection', quotes: ['Assalamu alaikum! Take a quiet moment to renew your intention, inshaAllah.', 'Bismillah — begin with a small, sincere step and make room for salah.', 'Alhamdulillah for another day. Make a little space for gratitude and reflection.'] }
  };
  const hadiths = [
    { text: 'The value of an action depends on the intention behind it.', source: 'Sahih al-Bukhari 1', url: 'https://sunnah.com/bukhari:1' },
    { text: 'The deeds most beloved to Allah are consistent, even if they are small.', source: 'Sahih al-Bukhari 6464', url: 'https://sunnah.com/bukhari:6464' },
    { text: 'Whoever follows a path seeking knowledge, Allah makes a path to Paradise easier for them.', source: 'Sahih Muslim 2699a', url: 'https://sunnah.com/muslim:2699a' }
  ];
  if (!personas[state.activeTab]) state.activeTab = 'lifestyle';
  const requestedTab = new URLSearchParams(location.search).get('tab');
  if (Object.hasOwn(personas, requestedTab)) state.activeTab = requestedTab;

  // Audio is synthesised locally and only unlocked by a user interaction.
  const AudioEngine = {
    context: null,
    async play(levelUp = false) {
      if (state.preferences.muted) return;
      try {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        this.context ||= new Audio();
        const context = this.context;
        if (context.state === 'suspended') await context.resume();
        const start = context.currentTime + 0.01;
        const frequencies = levelUp ? [261.63, 329.63, 392, 523.25, 659.25] : [440, 880];
        const step = levelUp ? 0.085 : 0.075;
        frequencies.forEach((frequency, index) => {
          const oscillator = context.createOscillator(), gain = context.createGain();
          oscillator.type = levelUp ? 'triangle' : 'square';
          oscillator.frequency.setValueAtTime(frequency, start + index * step);
          const at = start + index * step, duration = levelUp ? 0.24 : 0.075;
          gain.gain.setValueAtTime(0, at);
          gain.gain.linearRampToValueAtTime(levelUp ? 0.11 : 0.045, at + 0.006);
          gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
          oscillator.connect(gain); gain.connect(context.destination);
          if (levelUp) {
            const delay = context.createDelay(0.5), echo = context.createGain();
            delay.delayTime.value = 0.065; echo.gain.value = 0.18;
            gain.connect(delay); delay.connect(echo); echo.connect(context.destination);
            setTimeout(() => { delay.disconnect(); echo.disconnect(); }, 1500);
          }
          oscillator.start(at); oscillator.stop(at + duration);
          oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        });
      } catch (_) { /* Audio support/autoplay policy must never block progress. */ }
    },
    toggle() { state.preferences.muted = !state.preferences.muted; commit({ activity:false, redraw:false }); if (!state.preferences.muted) void this.play(); }
  };
  let titleTimer;
  function showTitleUnlock(title) {
    const popup = $('#title-unlock');
    $('#unlocked-title').textContent = title;
    $('#unlocked-level').textContent = `LV. ${state.level} // A NEW FREQUENCY`;
    popup.hidden = false; popup.classList.remove('animate'); void popup.offsetWidth; popup.classList.add('animate');
    clearTimeout(titleTimer); titleTimer = setTimeout(() => { popup.hidden = true; }, 4200);
  }

  const Dialogue = {
    period(date = new Date()) {
      const hour = date.getHours();
      return hour < 5 ? 'night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    },
    snapshot() {
      const today = dateKey();
      if (state.questDay !== today) {
        const yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1);
        const day = dateKey(yesterday);
        if (state.questDay < today && state.questHistory[day] == null && state.questHistory[state.questDay] != null) state.questHistory[day] = state.questHistory[state.questDay];
        state.questDay = today;
      }
      state.questHistory[today] = state.quests.filter(quest => !quest.done).length;
    },
    context() {
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1);
      return { period:this.period(), streak:currentStreak(state.activityDays), missed_quests:state.questHistory[dateKey(yesterday)] || 0 };
    },
    key(context = this.context()) { return `${dateKey()}:${context.period}:${context.streak}:${context.missed_quests}:${window.firebase?.auth?.().currentUser?.uid || (window.firebase?.auth?.().currentUser ? "signed-in" : "guest")}`; },
    local(tab, reroll = false) {
      const context = this.context(), key = this.key(context), previous = ui.quotes[tab];
      if (!reroll && previous?.key === key) return previous.text;
      const phrases = {
        morning:['Good morning! Start gently, drink some water, and choose one small win.', 'A fresh morning, a glass of water, a little momentum. Ready?'],
        afternoon:['Time for a focus check: choose one open quest and one habit.', 'Keep your afternoon steady. One useful step is enough to restart the rhythm.'],
        evening:['Let’s close the day: review what worked and leave tomorrow one clear next step.', 'Evening sync: notice your progress before you plan your next move.'],
        night:['It’s late. Save your progress and get some sleep — your neural sync needs rest.', 'The next level can wait until morning. Protect your sleep and recharge.']
      };
      const flavour = {
        lifestyle:['Your habits are the beat. 🩵','Small daily wins add up. 🎵'],
        lore:['Your story will still be here; save your notes.','One good scene is a lovely next step.'],
        finance:['Keep your budget notes clear and simple.','A quick spending check can wait if you need rest.'],
        teto:['Even a superior chimera needs a break. 🥖','I can count the words; you handle the sensible choices. 🥖'],
        imam:['Assalamu alaikum! Make room for salah and a sincere intention, inshaAllah.','Bismillah. Keep your intentions sincere and your steps steady.']
      };
      let selection = Math.floor(Math.random()*phrases[context.period].length);
      if (reroll && previous?.selection === selection) selection = (selection+1)%phrases[context.period].length;
      const extra = [];
      if (context.streak >= 5) extra.push(`${context.streak} days in sync — that consistency deserves real praise!`);
      if (context.missed_quests > 0) extra.push(tab === 'teto' ? `${context.missed_quests} quests left open yesterday? Bold of you. Let’s rescue one, genius.` : `There were ${context.missed_quests} open quests yesterday. Pick one manageable next step.`);
      if (context.period === 'night' && context.missed_quests > 0) extra[extra.length-1] = tab === 'teto' ? 'Yesterday’s unfinished quests are not a reason to skip sleep, genius.' : 'Leave yesterday’s unfinished quests for after you rest.';
      const text = [(window.firebase?.auth?.().currentUser ? 'Master, ' : '') + phrases[context.period][selection], flavour[tab][selection%flavour[tab].length], ...extra].join(' ');
      ui.quotes[tab] = { text, live:false, key, selection };
      return text;
    },
    refreshTimer: null,
    schedule() { clearTimeout(this.refreshTimer); this.refreshTimer=setTimeout(()=>void requestQuote(state.activeTab),600); }
  };

  // Aladhan ISO timestamps keep the countdown correct across location timezones/DST.
  const PrayerClock = {
    pending:null, status:'', lastDay:'',
    day(date = new Date()) {
      const parts = new Intl.DateTimeFormat('en-GB',{timeZone:state.prayerPrefs.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
      const part = type => parts.find(item=>item.type === type).value;
      return `${part('year')}-${part('month')}-${part('day')}`;
    },
    tomorrow(day) { const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate()+1); return date.toISOString().slice(0,10); },
    locationKey() { const prefs=state.prayerPrefs; return JSON.stringify([prefs.city,prefs.country,prefs.method,prefs.coordinates]); },
    timestamp(day,time,timezone=state.prayerPrefs.timezone) {
      let stamp=Date.parse(`${day}T${time}:00Z`);
      const target=stamp;
      for (let i=0;i<3;i++) {
        const parts=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(stamp));
        const get=key=>Number(parts.find(part=>part.type===key).value);
        const represented=Date.UTC(get('year'),get('month')-1,get('day'),get('hour'),get('minute'),get('second'));
        const delta=target-represented; stamp+=delta;
        if (!delta) break;
      }
      return stamp;
    },
    candidates() {
      const today=this.day();
      return [today,this.tomorrow(today)].flatMap(day=>prayers.map(name=>{
        const record=state.prayerSchedules[day];
        const value=state.prayerTimes[day]?.[name];
        if (!value) return null;
        const overridden=state.prayerOverrides[day]?.includes(name);
        const stamp=!overridden && record?.locationKey===this.locationKey() && record.timings[name] ? Date.parse(record.timings[name]) : this.timestamp(day,value);
        return {name,stamp};
      }).filter(Boolean)).filter(prayer=>Number.isFinite(prayer.stamp)).sort((a,b)=>a.stamp-b.stamp);
    },
    tick() {
      if (state.activeTab !== 'imam') return;
      const day=this.day();
      const changed=this.lastDay && this.lastDay !== day;
      this.lastDay=day;
      if (changed) { render(); void this.refresh(); }
      const box=$('#prayer-countdown'); if (!box) return;
      const next=this.candidates().find(prayer=>prayer.stamp > Date.now());
      if (!next) { box.textContent='Next prayer: waiting for today’s / tomorrow’s times'; return; }
      const seconds=Math.max(0,Math.floor((next.stamp-Date.now())/1000));
      const time=[Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
      box.textContent=`Next prayer: ${next.name} in ${time}`;
    },
    async fetchDay(day,prefs,key) {
      const date=day.split('-').reverse().join('-');
      const query=new URLSearchParams({method:String(prefs.method),iso8601:'true'});
      let path;
      if (prefs.coordinates) { path='timings'; query.set('latitude',prefs.coordinates.latitude);query.set('longitude',prefs.coordinates.longitude); }
      else {path='timingsByCity';query.set('city',prefs.city);query.set('country',prefs.country);}
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
      try {
        const response=await fetch(`https://api.aladhan.com/v1/${path}/${date}?${query}`,{signal:controller.signal});
        if (!response.ok) throw new Error(`Prayer service returned ${response.status}.`);
        const result=await response.json(),data=result.data;
        if (result.code !== 200 || !data?.meta?.timezone || !prayers.every(name=>typeof data.timings?.[name] === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(data.timings[name]) && Number.isFinite(Date.parse(data.timings[name])))) throw new Error('Prayer service returned invalid times.');
        new Intl.DateTimeFormat('en-GB',{timeZone:data.meta.timezone}).format();
        if (this.locationKey() !== key) return;
        state.prayerPrefs.timezone=data.meta.timezone;
        state.prayerSchedules[day]={locationKey:key,timezone:data.meta.timezone,timings:Object.fromEntries(prayers.map(name=>[name,data.timings[name]]))};
        state.prayerTimes[day] ||= {};
        for (const name of prayers) if (!state.prayerOverrides[day]?.includes(name)) state.prayerTimes[day][name]=data.timings[name].slice(11,16);
      } finally {clearTimeout(timer);}
    },
    async refresh(force=false) {
      if (this.pending) return this.pending;
      const day=this.day(),tomorrow=this.tomorrow(day),key=this.locationKey();
      if (!force && [day,tomorrow].every(date=>state.prayerSchedules[date]?.locationKey===key)) {this.status='Saved Aladhan times · '+state.prayerPrefs.timezone;this.tick();return;}
      if (!navigator.onLine) {this.status='Offline — using saved times. Manual times remain available.';if(state.activeTab==='imam')render();return;}
      this.status='Loading prayer times…';
      if (state.activeTab==='imam') render();
      const prefs=JSON.parse(JSON.stringify(state.prayerPrefs));
      this.pending=(async()=>{
        const results=await Promise.allSettled([this.fetchDay(day,prefs,key),this.fetchDay(tomorrow,prefs,key)]);
        if (this.locationKey() !== key) return;
        const failed=results.some(result=>result.status==='rejected');
        this.status=failed ? 'Some times could not be loaded. Saved/manual times remain available; retry when online.' : 'Aladhan · '+state.prayerPrefs.timezone+' · tomorrow’s Fajr saved';
        Store.save();
      })().finally(()=>{this.pending=null;if(state.activeTab==='imam'){render();this.tick();}if(this.locationKey()!==key)void this.refresh(true);});
      return this.pending;
    },
    locate() {
      if (!navigator.geolocation) {notify('Location unavailable. Using your saved city.');void this.refresh(true);return;}
      this.status='Finding your location…'; if(state.activeTab==='imam')render();
      navigator.geolocation.getCurrentPosition(position=>{
        state.prayerPrefs.coordinates={latitude:position.coords.latitude,longitude:position.coords.longitude};
        commit({activity:false});void this.refresh(true);
      },()=>{notify('Location access unavailable. Using your saved city.');void this.refresh(true);},{timeout:10000,maximumAge:300000});
    }
  };

  const AppInstall = {
    prompt:null, ready:false,
    status() {
      $('#pwa-status').textContent=!navigator.onLine ? 'OFFLINE MODE' : this.ready ? 'OFFLINE READY' : 'LOCAL SYSTEM';
      $('#install-app').hidden=window.matchMedia?.('(display-mode: standalone)').matches || false;
    },
    async install() {
      if (window.parent.LifeOSShell?.hasInstallPrompt) { await window.parent.LifeOSShell.installApp(); return; }
      if (!this.prompt) {notify('Use your browser’s Install app option. On iPhone/iPad: Share → Add to Home Screen.');return;}
      const prompt=this.prompt;this.prompt=null;
      await prompt.prompt();await prompt.userChoice;
    },
    async register() {
      window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();this.prompt=event;});
      window.addEventListener('appinstalled',()=>{$('#install-app').hidden=true;notify('LifeOS installed. Your progress stays on this device.');});
      window.addEventListener('offline',()=>{this.status();Dialogue.local(state.activeTab);renderHeader();});
      window.addEventListener('online',()=>{this.status();if(!window.firebase)sdkReady=loadAuthSDK();void requestQuote(state.activeTab,true);if(state.activeTab==='imam')void PrayerClock.refresh();});
      this.status();
      if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
      try {
        await navigator.serviceWorker.register('./sw.js');
        await navigator.serviceWorker.ready;this.ready=true;this.status();
      } catch (_) {$('#pwa-status').textContent='OFFLINE SETUP UNAVAILABLE';}
    }
  };

  // Graph data is deliberately plain JSON: backup imports cannot inject vis options.
  const LoreGraph = (() => {
    const types = {dimension:['Dimension','#39C5BB'],character:['Charakter','#9d4edd'],faction:['Fraktion','#ff007f'],artifact:['Artefakt','#e0a96d'],event:['Event','#e0a96d']};
    let network = null, selected = new URLSearchParams(location.search).get('node'), filter = 'all';
    const animation = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : {duration:450,easingFunction:'easeInOutQuad'};
    const visible = () => state.loreGraph.nodes.filter(n=>filter==='all' || n.type===filter);
    function markup() {
      return `<section class="card module-card lore-graph"><div class="section-heading"><div><h2>◈ Lore & Dimensions</h2><p>Your universe, connected.</p></div><button type="button" id="lore-add-node" class="small-button">+ Neuer Knoten</button></div><div class="toolbar"><label class="field">Knoten suchen<input id="lore-node-search" type="search" placeholder="Name eingeben …"></label><label class="field">Typ<select id="lore-type-filter"><option value="all">Alle Typen</option>${Object.entries(types).map(([key,[label]])=>`<option value="${key}" ${filter===key?'selected':''}>${label}</option>`).join('')}</select></label><button id="lore-fit" type="button" class="small-button">Übersicht</button></div><p id="lore-graph-status" class="hint" role="status"></p><div class="lore-graph-layout"><div><div id="lore-network-canvas" tabindex="0" aria-label="Interactive lore network"></div><div id="lore-node-list" class="lore-node-list" aria-label="Accessible node list"></div></div><aside id="lore-sidebar" aria-label="Node details" hidden></aside></div></section>`;
    }
    function data() {
      const nodes = visible(); const ids = new Set(nodes.map(n=>n.id));
      return {nodes:nodes.map(n=>({id:n.id,label:n.name,x:n.x,y:n.y,color:{background:'#101821',border:types[n.type][1],highlight:{background:'#1a2533',border:types[n.type][1]}},shadow:{enabled:true,color:types[n.type][1],size:10,x:0,y:0}})),edges:state.loreGraph.edges.filter(e=>ids.has(e.from)&&ids.has(e.to)).map(e=>({...e}))};
    }
    function refresh() {
      network?.setData(data());
      $('#lore-node-list').innerHTML = visible().map(n=>`<button type="button" class="small-button" data-lore-node="${escape(n.id)}">${escape(n.name)}</button>`).join('');
      $('#lore-graph-status').textContent = state.loreGraph.nodes.length ? `${visible().length} / ${state.loreGraph.nodes.length} Knoten. Ziehen, zoomen oder einen Knoten auswählen.` : 'Dein Universum beginnt hier. Lege deinen ersten Knoten an.';
      if (!window.vis?.Network) $('#lore-graph-status').textContent += ' Graph-Bibliothek nicht verfügbar; die Knotenliste bleibt bedienbar.';
      if (selected && !visible().some(n=>n.id===selected)) { selected=null; $('#lore-sidebar').hidden=true; }
    }
    function focus(id) {
      const node=state.loreGraph.nodes.find(n=>n.id===id); if (!node) return;
      if (filter!=='all' && filter!==node.type) { filter='all'; $('#lore-type-filter').value='all'; refresh(); }
      selected=id; network?.selectNodes([id]); network?.focus(id,{scale:1.15,animation:animation()}); sidebar(node);
    }
    function sidebar(n) {
      const links=state.loreGraph.edges.filter(e=>e.from===n.id||e.to===n.id);
      const panel=$('#lore-sidebar'); panel.hidden=false;
      panel.innerHTML=`<div class="section-heading"><h3>${escape(n.name)}</h3><button type="button" id="lore-sidebar-close" class="icon-button" aria-label="Close details">×</button></div><span class="tag" style="color:${types[n.type][1]}">${types[n.type][0]}</span><p>${escape(n.status)}</p><p class="hint">Heimatdimension / Fraktion: ${escape(n.home || '—')}</p><h4>Fähigkeiten / Attribute</h4><div class="lore-attributes">${n.attributes.map(a=>`<span class="tag">${escape(a)}</span>`).join('')||'<span class="hint">Noch keine Attribute.</span>'}</div><h4>Verbindungen</h4><div class="lore-connections">${links.map(e=>{const other=state.loreGraph.nodes.find(node=>node.id===(e.from===n.id?e.to:e.from));return `<button type="button" class="small-button" data-lore-node="${escape(other.id)}">${e.from===n.id?'→':'←'} ${escape(e.label || 'verbunden')} · ${escape(other.name)}</button>`;}).join('')||'<p class="hint">Noch keine Verbindungen.</p>'}</div><label class="field">Notizen<textarea id="lore-node-notes" maxlength="20000" rows="7">${escape(n.notes)}</textarea></label><span id="lore-note-save" class="hint" role="status">Notizen werden automatisch gespeichert.</span>`;
    }
    function mount() {
      const canvas=$('#lore-network-canvas'); if (!canvas) return;
      if (window.vis?.Network) {
        network=new vis.Network(canvas,data(),{nodes:{shape:'box',borderWidth:2,margin:14,font:{color:'#e6edf5',face:'monospace',size:14}},edges:{arrows:'to',color:'#59687c',font:{color:'#b9c8d9',strokeWidth:3,strokeColor:'#0a0e14'},smooth:{type:'continuous'}},physics:{solver:'forceAtlas2Based',forceAtlas2Based:{gravitationalConstant:-35,springLength:150,damping:.65},stabilization:{iterations:120}},interaction:{hover:true,keyboard:{enabled:true,bindToWindow:false}},layout:{randomSeed:39}});
        network.on('click',event=>{if(event.nodes.length)focus(event.nodes[0]);});
        network.on('dragEnd',() => {
          const positions=network.getPositions();
          state.loreGraph.nodes.forEach(n=>{if(positions[n.id])Object.assign(n,positions[n.id]);});
          commit({activity:false,redraw:false});
        });
      }
      if (selected && network) { const initial = selected; network.once('stabilized', () => { if (selected === initial) { network.selectNodes([initial]); network.focus(initial,{scale:1.15,animation:animation()}); } }); }
      refresh(); if (selected) {const n=state.loreGraph.nodes.find(n=>n.id===selected);if(n && visible().some(v=>v.id===selected))sidebar(n);}
    }
    function destroy() { network?.destroy(); network=null; }
    document.getElementById('vis-network-sdk').addEventListener('load',()=>{if(state.activeTab==='lore'){destroy();mount();}});
    document.getElementById('vis-network-sdk').addEventListener('error',()=>{if(state.activeTab==='lore')refresh();});
    document.addEventListener('click',event=>{
      const button=event.target.closest('[data-lore-node]'); if (button) {focus(button.dataset.loreNode);return;}
      if(event.target.closest('#lore-fit')) network?.fit({animation:animation()});
      if(event.target.closest('#lore-sidebar-close')) {selected=null;$('#lore-sidebar').hidden=true;network?.unselectAll();}
      if(event.target.closest('#lore-node-close')) $('#lore-node-dialog').close();
      if(event.target.closest('#lore-add-node')) {
        $('#lore-node-form').reset();
        $('#lore-node-connections').innerHTML=`<legend>Verbindungen (vom neuen Knoten aus)</legend>${state.loreGraph.nodes.map(n=>`<label><input type="checkbox" name="connection" value="${escape(n.id)}"> ${escape(n.name)}</label>`).join('')||'<p class="hint">Weitere Knoten anlegen, um Verbindungen zu erstellen.</p>'}`;
        $('#lore-node-dialog').showModal();
      }
    });
    document.addEventListener('input',event=>{
      if(event.target.id==='lore-node-search') {
        const query=event.target.value.trim().toLocaleLowerCase();
        if(!query)return;
        const node=visible().find(n=>n.name.toLocaleLowerCase().includes(query));
        if(node)focus(node.id); else $('#lore-graph-status').textContent='Kein passender Knoten im aktuellen Filter.';
      }
      if(event.target.id==='lore-node-notes') {
        const node=state.loreGraph.nodes.find(n=>n.id===selected);if(!node)return;
        node.notes=event.target.value;
        $('#lore-note-save').textContent=commit({activity:false,redraw:false})?'Notizen gespeichert.':'Nicht gespeichert — bitte Backup exportieren.';
      }
    });
    document.addEventListener('change',event=>{if(event.target.id==='lore-type-filter'){filter=event.target.value;refresh();network?.fit({animation:animation()});}});
    $('#lore-node-form').addEventListener('submit',event=>{
      event.preventDefault();const form=new FormData(event.target), id=uid();
      const attributes=String(form.get('attributes')).split(',').map(s=>s.trim()).filter(Boolean);
      if(!String(form.get('name')).trim() || attributes.length>50 || attributes.some(a=>a.length>100)){notify('Please check the name and attributes (max. 100 characters each).');return;}
      const nodes=[...state.loreGraph.nodes,{id,name:String(form.get('name')).trim(),type:form.get('type'),status:form.get('status'),home:form.get('home'),attributes,notes:form.get('notes')}];
      const edges=[...state.loreGraph.edges,...form.getAll('connection').map(to=>({id:uid(),from:id,to,label:String(form.get('relation')).trim()||'verbunden'}))];
      try {state.loreGraph=validateLoreGraph({nodes,edges});} catch (_) {notify('Graph limit reached or invalid node.');return;}
      selected=id;$('#lore-node-dialog').close();commit();focus(id);
    });
    return {markup,mount,destroy};
  })();

  // Rendering: all user-controlled content is escaped before HTML insertion.
  let notificationTimer;
  function notify(message) { const el = $('#notification'); el.textContent = message; el.classList.add('visible'); clearTimeout(notificationTimer); notificationTimer = setTimeout(() => el.classList.remove('visible'), 5000); }
  function renderHeader() {
    const needed = requiredXP();
    $('#level-label').textContent = `LV. ${state.level} ${titleForLevel(state.level)}`;
    $('#streak-label').textContent = `🔥 ${currentStreak(state.activityDays)}D SYNC`;
    $('#xp-label').textContent = `${state.xp} / ${needed} XP (${Math.floor(state.xp / needed * 100)}%)`;
    $('#xp-bar').max = needed; $('#xp-bar').value = state.xp;
    $('#today-label').textContent = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date()).toUpperCase();
    const persona = personas[state.activeTab];
    $('#dashboard').classList.toggle('teto-theme', state.activeTab === 'teto');
    const spriteTab = state.activeTab;
    $('#persona-sprite').src = `assets/sprites/sprite_${spriteTab}.png`;
    $('#persona-sprite').alt = personas[spriteTab].alt;
    $('#persona-name').textContent = persona.name;
    $('#persona-system').textContent = persona.system;
    $('#persona-role').textContent = persona.role;
    const contextKey=Dialogue.key();
    const quote=ui.quotes[state.activeTab];
    $('#persona-quote').textContent = quote?.key === contextKey ? quote.text : Dialogue.local(state.activeTab);
    $('#quote-source').textContent = ui.quotePending[state.activeTab] === contextKey ? 'COMPANION IS THINKING…' : ui.quotes[state.activeTab]?.live ? 'LIVE COMPANION' : 'LOCAL COMPANION';
    $('#refresh-quote').disabled = ui.quotePending[state.activeTab] === contextKey;
    $('#sound-toggle').textContent=state.preferences.muted ? '🔇' : '🔊';
    $('#sound-toggle').setAttribute('aria-label',state.preferences.muted ? 'Unmute sounds' : 'Mute sounds');
    $('#sound-toggle').setAttribute('aria-pressed',String(state.preferences.muted));
    updateSaveStatus();
    document.querySelectorAll('[data-tab]').forEach(tab => { const active = tab.dataset.tab === state.activeTab; tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1; });
    $('#module-panel').setAttribute('aria-labelledby', `tab-${state.activeTab}`);
  }
  const empty = message => `<p class="empty">${message}</p>`;
  const deleteButton = (type, id) => `<button class="delete-button" data-action="delete-${type}" data-id="${escape(id)}" aria-label="Delete entry">×</button>`;
  function renderLifestyle() {
    const today = dateKey();
    const habits = state.habits.map(h => `<div class="habit-row ${h.days.includes(today) ? 'completed' : ''}"><input class="row-check" type="checkbox" data-change="habit" data-id="${escape(h.id)}" ${h.days.includes(today) ? 'checked' : ''} aria-label="${escape(h.title)} completed today"><div class="row-copy"><div class="row-title">${escape(h.title)}</div><div class="row-meta">🔥 ${currentStreak(h.days)} day streak</div></div><span class="xp">+${h.xp} XP</span>${deleteButton('habit', h.id)}</div>`).join('');
    const quests = state.quests.filter(q => ui.filter === 'all' || (ui.filter === 'done' ? q.done : !q.done)).map(q => `<div class="quest-row ${q.done ? 'completed' : ''}"><input class="row-check" type="checkbox" data-change="quest" data-id="${escape(q.id)}" ${q.done ? 'checked' : ''} aria-label="${escape(q.title)} completed"><div class="row-copy"><div class="row-title">${escape(q.title)}</div><div class="row-meta"><span class="tag ${['high','medium','low'].includes(q.priority) ? q.priority : 'low'}">${escape(({high:'High',medium:'Medium',low:'Low'})[q.priority] || 'Low')}</span><span>${q.done ? 'Completed' : 'In progress'}</span></div></div><span class="xp">+${q.xp} XP</span>${deleteButton('quest', q.id)}</div>`).join('');
    return `<section class="breach-launch card"><div><span class="eyebrow">ARCADE // BREACH PROTOCOL</span><h3>Find the signal. Break the sequence.</h3><p class="hint">30 seconds · alternating rows & columns · +40 XP · 3 rewarded hacks per day</p></div><button class="small-button" type="button" data-action="open-breach">Breach Terminal ↗</button></section><div class="module-grid"><section class="card module-card"><div class="section-heading"><div><h2><span>◈</span>Daily Habit Syncs</h2><p>Your rhythm for today</p></div><button class="small-button" data-action="new-habit">+ New Habit</button></div>${habits || empty('Time for a new rhythm. Add your first habit.')}<div class="card-bottom">${state.habits.filter(h => h.days.includes(today)).length} / ${state.habits.length} SYNCS COMPLETE // DAILY RESET AT MIDNIGHT</div></section><section class="card module-card"><div class="section-heading"><div><h2><span>⌁</span>Active Quests</h2><p>Small missions. Real progress.</p></div><button class="small-button" data-action="new-quest">+ New Quest</button></div><div class="filters" aria-label="Filter quests">${[['all','All'],['open','Open'],['done','Completed']].map(([value,label]) => `<button data-action="filter" data-value="${value}" class="${ui.filter === value ? 'active' : ''}" aria-pressed="${ui.filter === value}">${label}</button>`).join('')}</div>${quests || empty('No quests in this view.')}<div class="card-bottom">${state.quests.filter(q => !q.done).length} OPEN MISSIONS // YOUR PACE, YOUR PROGRESS</div></section></div>`;
  }
  function filteredNotes() { return state.notes.filter(n => (ui.loreCategory === 'all' || n.category === ui.loreCategory) && (ui.loreStatus === 'all' || n.status === ui.loreStatus) && `${n.title} ${n.content}`.toLocaleLowerCase().includes(ui.loreQuery.toLocaleLowerCase())); }
  function noteCards() { return filteredNotes().map(n => `<article class="note-card"><span class="tag">${escape(n.category)}</span> <span class="tag">${escape(n.status)}</span><h3>${escape(n.title)}</h3><div class="note-content">${escape(n.content)}</div>${n.source ? `<p class="note-source">${escape(n.source.filename)} · pp. ${escape(n.source.pages?.join(', ') || '')}</p>` : ''}<div class="note-footer"><button class="small-button" data-action="edit-note" data-id="${escape(n.id)}">Edit ↗</button>${deleteButton('note', n.id)}</div></article>`).join('') || empty('No matching archive entries yet. Capture your next idea.'); }
  function renderLore() { return `<a class="lore-scanner-link small-button" href="scanner.html">◉ Holographic 3D Dimension Scanner öffnen ↗</a>${LoreGraph.markup()}<section class="card module-card"><div class="section-heading"><div><h2><span>▤</span>Lore Archive</h2><p>Characters, worlds and chapters in one place.</p></div><button class="small-button" data-action="new-note">+ New note</button></div><div class="pdf-import"><h3>Let Miku read your PDFs</h3><p class="hint">Upload text-based PDFs. Miku extracts and sorts characters, chapter notes and worldbuilding for your review.</p><p class="hint">PDF text is sent through your Render backend to Groq. Owner sign-in required. Up to 3 files, 5 MB and 40 pages each. Scans need OCR first.</p><div class="toolbar"><input id="lore-pdfs" type="file" accept="application/pdf,.pdf" multiple aria-label="Choose lore PDF files" ${ui.importBusy ? 'disabled' : ''}><button type="button" class="primary" data-action="import-pdfs" ${ui.importBusy ? 'disabled' : ''}>${ui.importBusy ? 'Miku is reading…' : 'Read & organise ↗'}</button></div><p class="import-status" id="pdf-status" role="status">${escape(ui.importStatus)}</p></div><div class="toolbar"><label class="field">Search archive<input id="lore-search" type="search" placeholder="Title or content …" value="${escape(ui.loreQuery)}"></label><label class="field">Category<select id="lore-category">${options([['all','All categories'],['Character Sheet','Character Sheet'],['Chapter Notes','Chapter Notes'],['Worldbuilding','Worldbuilding']],ui.loreCategory)}</select></label><label class="field">Status<select id="lore-status">${options([['all','All statuses'],['Draft','Draft'],['Final','Final']],ui.loreStatus)}</select></label></div><div id="note-list" class="note-grid">${noteCards()}</div></section>`; }
  const options = (items, selected) => items.map(([value,label]) => `<option value="${escape(value)}" ${value === selected ? 'selected' : ''}>${escape(label)}</option>`).join('');
  function renderFinance() {
    const entries = state.transactions.filter(t => t.date.startsWith(ui.month));
    const income = entries.filter(t => t.type === 'income').reduce((sum,t) => sum + t.cents, 0);
    const expense = entries.filter(t => t.type === 'expense').reduce((sum,t) => sum + t.cents, 0);
    return `<div class="toolbar"><label class="field">Budget month<input id="finance-month" type="month" value="${ui.month}"></label><p class="hint">Your overview in EUR · ${entries.length} transactions this month</p></div><div class="summary-grid"><article class="card summary-card"><p>TOTAL INCOME</p><strong class="positive">${euro(income)}</strong></article><article class="card summary-card"><p>TOTAL EXPENSES</p><strong class="negative">${euro(expense)}</strong></article><article class="card summary-card"><p>REMAINING BUDGET</p><strong class="${income-expense >= 0 ? 'positive':'negative'}">${euro(income-expense)}</strong></article></div><div class="budget-layout"><section class="card module-card"><div class="section-heading"><h2>New transaction</h2></div><form id="finance-form"><label class="field">Description<input name="title" required maxlength="100" placeholder="e.g. Groceries or salary"></label><div class="field-pair"><label class="field">Type<select name="type"><option value="expense">Expense</option><option value="income">Income</option></select></label><label class="field">Amount (€)<input name="amount" type="number" min="0.01" max="1000000" step="0.01" required placeholder="0,00"></label></div><label class="field">Category<select name="category">${options(['Salary','Housing','Groceries','Transport','Leisure','Savings','Other'].map(v=>[v,v]),'Other')}</select></label><label class="field">Date<input type="date" name="date" required value="${ui.month === dateKey().slice(0,7) ? dateKey() : ui.month+'-01'}"></label><button type="submit" class="primary">+ Save transaction</button></form></section><section class="card module-card"><div class="section-heading"><h2>Transaction Log</h2><span class="tag">${escape(ui.month)}</span></div>${entries.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(t=>`<div class="entry-row"><div class="row-copy"><div class="row-title">${escape(t.title)}</div><div class="row-meta">${escape(t.category)} · ${escape(t.date)}</div></div><span class="amount ${t.type === 'income' ? 'positive':'negative'}">${t.type === 'income'?'+':'−'}${euro(t.cents)}</span>${deleteButton('transaction',t.id)}</div>`).join('') || empty('No transactions yet. Your monthly overview starts here.')}</section></div>`;
  }
  const units = { length: { mm:0.001, cm:0.01, m:1, km:1000, in:0.0254, ft:0.3048, mi:1609.344 }, weight: { g:0.001, kg:1, oz:0.028349523125, lb:0.45359237 }, time: { Seconds:1, Minutes:60, Hours:3600, Days:86400 }, temperature: { '°C':1, '°F':1, K:1 } };
  function renderTools() { return `<div class="module-grid"><section class="card module-card"><div class="section-heading"><div><h2><span>⌘</span>Text Analyzer</h2><p>Teto counts. You write.</p></div><span class="tag">LIVE</span></div><label class="field">Your text<textarea id="counter-text" placeholder="Paste your text here …" rows="8"></textarea></label><div class="tool-output"><div class="tool-stat"><strong id="char-count">0</strong><span>CHARACTERS</span></div><div class="tool-stat"><strong id="word-count">0</strong><span>WORDS</span></div><div class="tool-stat"><strong id="line-count">0</strong><span>LINES</span></div></div><p class="hint">Characters include spaces. Your text stays on this device.</p></section><section class="card module-card"><div class="section-heading"><div><h2><span>⇄</span>Quick Converter</h2><p>Switch units. Save brainpower.</p></div></div><label class="field">Category<select id="convert-kind">${options([['length','Length'],['weight','Weight'],['time','Time'],['temperature','Temperature']],'length')}</select></label><label class="field">Value<input id="convert-value" type="number" step="any" value="1"></label><div class="field-pair"><label class="field">From<select id="convert-from"></select></label><label class="field">To<select id="convert-to"></select></label></div><output id="convert-result" class="converter-result" aria-live="polite"></output><p class="hint">Length · Weight · Time · Temperature</p></section></div>`; }
  function renderImam() {
    const day = PrayerClock.day();
    const done = state.prayerDays[day] || [];
    const times = state.prayerTimes[day] || {};
    const hadith = hadiths[ui.hadith];
    return `<div class="module-grid"><section class="card module-card"><div class="section-heading"><div><h2><span>☾</span>Daily Prayer Sync</h2><p>The five daily prayers · ${escape(day)}</p></div><span class="tag">${done.length}/5</span></div><div class="prayer-settings"><form id="prayer-location-form"><div class="field-pair"><label class="field">City<input name="city" required maxlength="80" value="${escape(state.prayerPrefs.city)}"></label><label class="field">Country<input name="country" required maxlength="80" value="${escape(state.prayerPrefs.country)}"></label></div><label class="field">Calculation method<select name="method">${options([['3','Muslim World League'],['2','ISNA'],['4','Umm al-Qura'],['12','UOIF'],['13','Diyanet']],String(state.prayerPrefs.method))}</select></label><div class="prayer-actions"><button class="small-button" type="submit">Load times</button><button class="small-button" type="button" data-action="locate-prayers">◎ Use my location</button><button class="small-button" type="button" data-action="refresh-prayers">↻ Refresh</button></div></form><p id="prayer-status" class="hint">${escape(PrayerClock.status || (state.prayerPrefs.coordinates ? 'Your coordinates' : state.prayerPrefs.city+', '+state.prayerPrefs.country))}</p></div><div id="prayer-countdown" class="prayer-countdown" role="timer" aria-live="off">Next prayer: loading times…</div>${prayers.map(name=>`<div class="prayer-row"><input class="row-check" type="checkbox" data-change="prayer" data-name="${name}" ${done.includes(name)?'checked':''} aria-label="${name} prayed today"><span class="row-copy row-title">${name}<span class="prayer-xp">+20 XP</span></span><input type="time" data-change="prayer-time" data-name="${name}" value="${escape(times[name] || '')}" aria-label="Today’s time for ${name}"></div>`).join('')}<p class="hint">Aladhan times use the selected calculation method. Match your local mosque if needed; manual edits are preserved. Times shown in ${escape(state.prayerPrefs.timezone)}. Each prayer earns 20 XP once per day.</p></section><section class="card module-card" data-holo-card="hadith"><div class="section-heading"><div><h2>Hadith of the Day</h2><p>A moment to reflect.</p></div><button class="icon-button" data-action="next-hadith" aria-label="Show another hadith">↻</button></div><p class="hadith-text">${hadith.text}</p><a class="source-link" href="${hadith.url}" target="_blank" rel="noopener noreferrer">${hadith.source} ↗</a><p class="hint">English paraphrase of an excerpt. Read the complete hadith in the linked source.</p><div class="card-bottom">INTENTION // CONSISTENCY // KNOWLEDGE</div></section></div>`;
  }
  function render() { LoreGraph.destroy(); renderHeader(); $('#module-panel').innerHTML = ({ lifestyle:renderLifestyle, lore:renderLore, finance:renderFinance, teto:renderTools, imam:renderImam })[state.activeTab](); if (state.activeTab === 'lore') LoreGraph.mount(); if (state.activeTab === 'teto') setConverterUnits(); if (state.activeTab === 'imam') PrayerClock.tick(); }
  function commit({ activity = true, redraw = true } = {}) { if (activity) Store.touch(); const saved = Store.save(); if (redraw) render(); else renderHeader(); Dialogue.schedule(); return saved; }
  function setConverterUnits() { const names = Object.keys(units[$('#convert-kind').value]); $('#convert-from').innerHTML = options(names.map(v=>[v,v]),names[0]); $('#convert-to').innerHTML = options(names.map(v=>[v,v]),names[1]); convert(); }
  function convert() {
    const raw = $('#convert-value').value;
    const value = Number(raw), kind = $('#convert-kind').value, from = $('#convert-from').value, to = $('#convert-to').value;
    let result;
    if (raw === '' || !Number.isFinite(value)) { $('#convert-result').textContent = 'Enter a valid number.'; return; }
    if (kind === 'temperature') { const celsius = from === '°F' ? (value-32)*5/9 : from === 'K' ? value-273.15 : value; result = to === '°F' ? celsius*9/5+32 : to === 'K' ? celsius+273.15 : celsius; }
    else result = value * units[kind][from] / units[kind][to];
    $('#convert-result').textContent = Number.isFinite(result) ? `${new Intl.NumberFormat('en-GB',{maximumSignificantDigits:10}).format(result)} ${to}` : 'Value outside the supported number range.';
  }

  // Dialogs and event handlers: mutations flow through commit(), never through rendering.
  const inputField = (label,name,value='',extra='') => `<label class="field">${label}<input name="${name}" value="${escape(value)}" ${extra}></label>`;
  function openEditor(kind,id) {
    ui.editor = {kind,id};
    const entry = kind === 'note' ? state.notes.find(n=>n.id === id) : null;
    $('#editor-title').textContent = kind === 'habit' ? 'New Habit' : kind === 'quest' ? 'New Quest' : entry ? 'Edit note' : 'New note';
    $('#editor-fields').innerHTML = kind === 'note' ? `${inputField('Title','title',entry?.title,'required maxlength="120"')}<div class="field-pair"><label class="field">Category<select name="category">${options(['Character Sheet','Chapter Notes','Worldbuilding'].map(v=>[v,v]),entry?.category || 'Character Sheet')}</select></label><label class="field">Status<select name="status">${options([['Draft','Draft'],['Final','Final']],entry?.status || 'Draft')}</select></label></div><label class="field">Note content<textarea name="content" required maxlength="20000" rows="8">${escape(entry?.content || '')}</textarea></label>` : `${inputField('Name','title','','required maxlength="120"')}${kind === 'quest' ? `<label class="field">Priority<select name="priority">${options([['high','High'],['medium','Medium'],['low','Low']],'medium')}</select></label>` : ''}${inputField('XP reward','xp',kind === 'habit' ? 20 : 50,'type="number" min="1" max="500" step="1" required')}`;
    $('#editor-dialog').showModal();
  }
  document.addEventListener('click', event => {
    const tab = event.target.closest('[data-tab]');
    if (tab) { state.activeTab = tab.dataset.tab; ui.quote = 0; commit({activity:false}); void requestQuote(state.activeTab); if(state.activeTab==='imam')void PrayerClock.refresh(); return; }
    if (event.target.closest('#refresh-quote')) { ui.quote++; Dialogue.local(state.activeTab,true); renderHeader(); void requestQuote(state.activeTab,true); return; }
    const button = event.target.closest('[data-action]'); if (!button) return;
    const {action,id,value} = button.dataset;
    if (action === 'open-breach') { window.parent.LifeOSArcade?.open(); return; }
    if (action === 'toggle-sound') { AudioEngine.toggle(); return; }
    if (action === 'install-app') { void AppInstall.install(); return; }
    if (action === 'locate-prayers') { PrayerClock.locate(); return; }
    if (action === 'refresh-prayers') { void PrayerClock.refresh(true); return; }
    if (action === 'export-backup') { exportBackup(); return; }
    if (action === 'restore-backup') { $('#backup-file').click(); return; }
    if (action === 'close-import') { $('#import-dialog').close(); return; }
    if (action === 'import-pdfs') { void importPDFs([...($('#lore-pdfs')?.files || [])]); return; }
    if (action === 'close-dialog') { $('#editor-dialog').close(); return; }
    if (action.startsWith('new-')) { openEditor(action.slice(4)); return; }
    if (action === 'edit-note') { openEditor('note',id); return; }
    if (action === 'filter') { ui.filter = value; render(); return; }
    if (action === 'next-hadith') { ui.hadith = (ui.hadith+1)%hadiths.length; render(); return; }
    if (action.startsWith('delete-')) {
      if (!window.confirm('Delete this entry?')) return;
      const collection = ({habit:'habits',quest:'quests',note:'notes',transaction:'transactions'})[action.slice(7)];
      if (collection) { state[collection] = state[collection].filter(entry=>entry.id !== id); commit(); }
    }
  });
  $('.tabs').addEventListener('keydown', event => {
    const tabs = [...document.querySelectorAll('[data-tab]')];
    const index = tabs.indexOf(document.activeElement);
    if (index < 0 || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length-1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length)%tabs.length;
    tabs[next].click(); tabs[next].focus();
  });
  document.addEventListener('change', event => {
    const input = event.target, type = input.dataset.change, today = dateKey();
    if (input.name?.startsWith('pick-')) { input.closest('.import-note').querySelectorAll('input:not([type=checkbox]),select,textarea').forEach(field=>{field.disabled=!input.checked;}); return; }
    if (input.id === 'backup-file') { void restoreBackup(input.files?.[0]); input.value = ''; return; }
    if (type === 'habit') {
      const habit = state.habits.find(h=>h.id === input.dataset.id); if (!habit) return;
      habit.days = habit.days.filter(day=>day !== today);
      if (input.checked) { habit.days.push(today); if (!habit.rewarded.includes(today)) { habit.rewarded.push(today); Store.award(habit.xp); } }
      commit();
    } else if (type === 'quest') {
      const quest = state.quests.find(q=>q.id === input.dataset.id); if (!quest) return;
      quest.done = input.checked;
      quest.completedOn = quest.done ? today : null;
      if (quest.done && !quest.rewarded) { quest.rewarded = true; Store.award(quest.xp); }
      commit();
    } else if (type === 'prayer') {
      const day=PrayerClock.day(),name=input.dataset.name;
      const completed = (state.prayerDays[day] || []).filter(value=>value !== name);
      if (input.checked) {
        completed.push(name); state.prayerRewards[day] ||= [];
        if (!state.prayerRewards[day].includes(name)) { state.prayerRewards[day].push(name); Store.award(20); }
      }
      state.prayerDays[day] = completed; commit();
    } else if (type === 'prayer-time') {
      const day=PrayerClock.day(),name=input.dataset.name;
      state.prayerTimes[day] = {...state.prayerTimes[day], [name]: input.value};
      state.prayerOverrides[day]=[...new Set([...(state.prayerOverrides[day] || []),name])];
      commit({redraw:false}); PrayerClock.tick();
    } else if (input.id === 'finance-month' && /^\d{4}-\d{2}$/.test(input.value)) { ui.month = input.value; render(); }
    else if (input.id === 'lore-category' || input.id === 'lore-status') { ui[input.id === 'lore-category' ? 'loreCategory':'loreStatus'] = input.value; $('#note-list').innerHTML = noteCards(); }
    else if (input.id === 'convert-kind') setConverterUnits();
    else if (input.id === 'convert-from' || input.id === 'convert-to') convert();
  });
  document.addEventListener('input', event => {
    const input = event.target;
    if (input.id === 'lore-search') { ui.loreQuery = input.value; $('#note-list').innerHTML = noteCards(); }
    if (input.id === 'counter-text') { $('#char-count').textContent = [...input.value].length; $('#word-count').textContent = input.value.trim() ? input.value.trim().split(/\s+/u).length : 0; $('#line-count').textContent = input.value ? input.value.split(/\r\n|\r|\n/).length : 0; }
    if (input.id === 'convert-value') convert();
  });
  document.addEventListener('submit', event => {
    if (event.target.id === 'prayer-location-form') {
      event.preventDefault(); const data=Object.fromEntries(new FormData(event.target));
      if (!data.city.trim() || !data.country.trim()) return;
      state.prayerPrefs={...state.prayerPrefs,city:data.city.trim(),country:data.country.trim(),method:Number(data.method),coordinates:null};
      commit({activity:false}); void PrayerClock.refresh(true); return;
    }
    if (event.target.id === 'import-review-form') { event.preventDefault(); saveImportedNotes(event.target); return; }
    if (!['editor-form','finance-form'].includes(event.target.id)) return;
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    if (!data.title.trim()) { notify('Please enter a name.'); return; }
    if (event.target.id === 'finance-form') {
      const cents = Math.round(Number(data.amount)*100);
      if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 100000000 || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) { notify('Please check the amount and date.'); return; }
      state.transactions.push({id:uid(),title:data.title.trim(),type:data.type,category:data.category,cents,date:data.date}); ui.month = data.date.slice(0,7); if (commit()) notify('Transaction saved.'); return;
    }
    const {kind,id} = ui.editor;
    if (kind === 'note') {
      const note = {...state.notes.find(n=>n.id === id), id:id || uid(),title:data.title.trim(),category:data.category,status:data.status,content:data.content.trim()};
      if (!note.content) { notify('Please enter note content.'); return; }
      const index = state.notes.findIndex(n=>n.id === id);
      if (index >= 0) state.notes[index] = note; else state.notes.unshift(note);
    } else {
      const xp = Number(data.xp);
      if (!Number.isInteger(xp) || xp < 1 || xp > 500) { notify('Enter between 1 and 500 XP.'); return; }
      if (kind === 'habit') state.habits.push(newHabit(data.title.trim(),xp));
      else state.quests.push({id:uid(),title:data.title.trim(),priority:data.priority,xp,done:false,rewarded:false,createdOn:dateKey()});
    }
    $('#editor-dialog').close(); if (commit()) notify('Saved. Your next step is waiting.');
  });

  function updateSaveStatus() {
    const el = $('#save-status');
    el.classList.toggle('save-error',!lastSaveSucceeded);
    el.textContent = lastSaveSucceeded ? `Saved on this device${state.savedAt ? ' · '+new Date(state.savedAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) : ''}` : 'Unsaved changes — export a backup';
  }
  function exportBackup() {
    const blob = new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href=url; link.download='lifeos_backup.json'; link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function restoreBackup(file) {
    if (!file) return;
    if (file.size > 10*1024*1024) { notify('Backup files must be smaller than 10 MB.'); return; }
    try {
      const restored = validateState(JSON.parse(await file.text()));
      if (!personas[restored.activeTab]) restored.activeTab='lifestyle';
      if (!window.confirm('Replace your current progress with this backup? Export your current progress first if you want to keep both.')) return;
      const previous=state;state=restored;
      if (!Store.save()) {state=previous;render();notify('Backup could not be saved. Your original progress is unchanged.');return;}
      render();notify('Your progress has been restored.');
      void requestQuote(state.activeTab);if(state.activeTab==='imam')void PrayerClock.refresh();
    } catch (_) { notify('This is not a valid LifeOS backup. Your current progress is unchanged.'); }
  }
  async function requestQuote(tab,manual=false) {
    const context=Dialogue.context(),key=Dialogue.key(context);
    if (ui.quotePending[tab] === key || (!manual && ui.quotes[tab]?.live && ui.quotes[tab]?.key === key)) return;
    const previous=ui.quotes[tab]?.text || Dialogue.local(tab);
    if (!navigator.onLine) {Dialogue.local(tab);renderHeader();return;}
    ui.quotePending[tab]=key;renderHeader();
    try {
      if (!window.Weebokage) throw new Error('The backend connection is not available.');
      const response=await Weebokage.apiFetch('/lifeos/quote',{method:'POST',body:JSON.stringify({tab,previous:previous.slice(0,500),...context}),timeout:15000});
      const data=await response.json();
      if (data.tab !== tab || typeof data.quote !== 'string' || !data.quote.trim() || data.quote.length > 500) throw new Error('Invalid companion response.');
      if (Dialogue.key() === key) ui.quotes[tab]={text:data.quote,live:true,key};
    } catch (error) {
      if (Dialogue.key() === key) Dialogue.local(tab);
      if (manual) notify(`Using a local companion line. ${error.name === 'AbortError' ? 'AI request timed out.' : error.message}`);
    } finally { if(ui.quotePending[tab]===key)delete ui.quotePending[tab];if(state.activeTab===tab)renderHeader(); }
  }
  let authReady = Promise.resolve(null);
  let sdkReady = Promise.resolve();
  function initializeAuth() {
    try {
      if (!navigator.onLine || !window.Weebokage || !window.firebase) return;
      Weebokage.initFirebase();
      authReady = new Promise(resolve=>{
        const timeout=setTimeout(()=>resolve(null),12000);
        firebase.auth().onAuthStateChanged(user=>{
          clearTimeout(timeout); resolve(user);
          for (const id of ['nav-transit','nav-islam']) { const link=$('#'+id); link.hidden=!user; }
          $('#lifeos-login').textContent=user ? 'Account' : 'Admin';
          renderHeader(); Dialogue.schedule();
        },()=>{clearTimeout(timeout);resolve(null);});
      });
    } catch (_) { /* Local modules stay available without the online SDK. */ }
  }
  async function importPDFs(files) {
    if (ui.importBusy) return;
    if (!files.length) { notify('Choose at least one PDF first.'); return; }
    if (files.length > 3 || files.some(file=>file.size > 5*1024*1024 || !/\.pdf$/i.test(file.name))) { notify('Choose up to 3 PDFs, no more than 5 MB each.'); return; }
    await sdkReady;
    await authReady;
    if (!window.firebase?.auth?.().currentUser) { notify('Sign in through Admin to use Miku’s PDF reader.'); return; }
    ui.importBusy=true; ui.importDrafts=[]; ui.importMessages=[];
    for (let index=0;index<files.length;index++) {
      const file=files[index];
      ui.importStatus=`Miku is reading ${index+1}/${files.length}: ${file.name}`;
      if (state.activeTab === 'lore') render();
      try {
        const response=await Weebokage.apiFetch('/lifeos/lore-import?filename='+encodeURIComponent(file.name.slice(0,180)),{method:'POST',body:file,headers:{'Content-Type':'application/pdf'},timeout:120000});
        const data=await response.json();
        if (!Array.isArray(data.notes) || !data.notes.length || data.notes.length > 20) throw new Error('No valid notes were returned.');
        const drafts=data.notes.map(note=>{
          if (typeof note.title !== 'string' || typeof note.content !== 'string' || !['Character Sheet','Chapter Notes','Worldbuilding'].includes(note.category) || !Array.isArray(note.source_pages)) throw new Error('Invalid note data.');
          return {...note,filename:file.name};
        });
        ui.importDrafts.push(...drafts);
        ui.importMessages.push(`${file.name}: ${data.summary}${data.skipped_pages?.length ? ' Pages without readable text were skipped: '+data.skipped_pages.join(', ')+'.' : ''}`);
      } catch (error) { ui.importMessages.push(`${file.name}: ${error.name === 'AbortError' ? 'Request timed out. Try a smaller PDF.' : error.message}`); }
    }
    ui.importBusy=false;
    ui.importStatus=ui.importDrafts.length ? `${ui.importDrafts.length} notes extracted. Review them before saving.` : ui.importMessages.join(' ');
    if (state.activeTab === 'lore') render();
    if (ui.importDrafts.length) openImportReview(); else notify('PDF import failed. See the Lore tab for details.');
  }
  function openImportReview() {
    ui.importDrafts.sort((a,b)=>a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
    $('#import-review').innerHTML=ui.importMessages.map(message=>`<p class="hint">${escape(message)}</p>`).join('')+ui.importDrafts.map((note,index)=>`<article class="import-note"><label class="import-select"><input type="checkbox" name="pick-${index}" checked class="row-check"> Save this note</label><p class="note-source">${escape(note.filename)} · pp. ${escape(note.source_pages.join(', '))}</p>${inputField('Title','title-'+index,note.title,'required maxlength="120"')}<label class="field">Category<select name="category-${index}">${options(['Character Sheet','Chapter Notes','Worldbuilding'].map(v=>[v,v]),note.category)}</select></label><label class="field">Content<textarea name="content-${index}" required maxlength="20000">${escape(note.content)}</textarea></label></article>`).join('');
    $('#import-dialog').showModal();
  }
  function saveImportedNotes(form) {
    const data=new FormData(form), selected=[];
    ui.importDrafts.forEach((draft,index)=>{
      if (!data.has('pick-'+index)) return;
      const title=String(data.get('title-'+index) || '').trim(),content=String(data.get('content-'+index) || '').trim(),category=data.get('category-'+index);
      if (!title || !content || !['Character Sheet','Chapter Notes','Worldbuilding'].includes(category)) return;
      selected.push({id:uid(),title,content,category,status:'Draft',source:{filename:draft.filename,pages:draft.source_pages}});
    });
    if (!selected.length) { notify('Select at least one complete note to save.'); return; }
    state.notes.unshift(...selected);
    $('#import-dialog').close(); ui.importDrafts=[]; ui.loreQuery=''; ui.loreCategory='all';ui.loreStatus='all';
    ui.importStatus=`${selected.length} notes added to your archive.`;
    if (commit()) notify(`${selected.length} lore notes saved.`);
  }
  async function loadAuthSDK() {
    if (!navigator.onLine) return;
    try {
      for (const library of ['firebase-app-compat','firebase-auth-compat']) {
        await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=`https://www.gstatic.com/firebasejs/10.7.1/${library}.js`;script.onload=resolve;script.onerror=reject;document.head.appendChild(script);});
      }
      initializeAuth();
    } catch (_) { /* Offline/local features never wait for Firebase. */ }
  }
  function finishSplash() { $('#splash').hidden=true; $('#dashboard').inert=false; document.body.classList.remove('lifeos-loading'); }
  function checkDay() { if (dateKey() !== currentDay) { currentDay = dateKey(); ui.hadith = Math.floor(Date.parse(`${currentDay}T12:00:00Z`) / 86400000)%3;Dialogue.snapshot();Store.save();render();if(state.activeTab==='imam')void PrayerClock.refresh();Dialogue.schedule(); } }
  setInterval(checkDay,30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDay(); });
  window.addEventListener('lifeos-reward', event => { if (event.detail.titleChanged) showTitleUnlock(event.detail.title); });
  window.addEventListener('lifeos-state-changed', () => { state = Store.load(); render(); });
  window.addEventListener('storage', event => { if (event.key === STORAGE_KEY) { state = Store.load(); if (!personas[state.activeTab]) state.activeTab='lifestyle'; render(); } });
  Dialogue.snapshot();
  render();
  sdkReady=loadAuthSDK();
  void AppInstall.register();
  $('#terminal-toggle').addEventListener('click', () => { window.parent.dispatchEvent(new CustomEvent('lifeos-terminal-toggle')); });
  $('#enter-lifeos').addEventListener('click',finishSplash);
  document.addEventListener('keydown',event=>{if (event.key === 'Escape' && !$('#splash').hidden) finishSplash();});
  setTimeout(finishSplash,window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 1300);
  void requestQuote(state.activeTab);
  if (!storageIssue) Store.save();
  if (state.activeTab==='imam') void PrayerClock.refresh();
  setInterval(()=>PrayerClock.tick(),1000);
  let lastContextKey=Dialogue.key();
  setInterval(()=>{const key=Dialogue.key();if(key!==lastContextKey){lastContextKey=key;renderHeader();Dialogue.schedule();}},30000);
  if (storageIssue) notify(storageIssue);
})();
