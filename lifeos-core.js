// Shared schema and transactions for the dashboard and global command shell.
(() => {
  'use strict';
  const STORAGE_KEY = 'weebokage.lifeos.v1';
  const dateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const dayDistance = (a, b) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000);
  const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const prayers = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  const titleForLevel = level => level >= 10 ? 'SYSTEM ARCHITECT' : level >= 6 ? 'NEURAL OPERATOR' : level >= 3 ? 'CYBER VOCALIST' : 'CYBER NOVICE';
  const newHabit = (title, xp) => ({ id: uid(), title, xp, days: [], rewarded: [] });
  const defaults = () => ({ version: 1, level: 1, xp: 0, activeTab: 'lifestyle', activityDays: [], habits: [newHabit('Hydrate 2.5L', 15), newHabit('Creative Writing', 30), newHabit('15-Min Walk', 20)], quests: [{ id: uid(), title: 'Start your first chapter', priority: 'high', xp: 50, done: false, rewarded: false }, { id: uid(), title: 'Clear your desk', priority: 'low', xp: 20, done: false, rewarded: false }], notes: [], transactions: [], prayerDays: {}, prayerTimes: {}, prayerSchedules: {}, prayerRewards: {}, prayerOverrides: {}, prayerPrefs: {city:'Cologne',country:'Germany',method:3,timezone:'Europe/Berlin',coordinates:null}, preferences:{muted:false}, loreGraph:{nodes:[],edges:[]}, questHistory:{}, breachRewards:{}, questDay:dateKey() });
  const BACKUP_KEY = `${STORAGE_KEY}.backup`;
  const legacyCategories = { 'Charakterbogen':'Character Sheet', 'Kapitelnotiz':'Chapter Notes', 'Gehalt':'Salary', 'Wohnen':'Housing', 'Lebensmittel':'Groceries', 'Mobilität':'Transport', 'Freizeit':'Leisure', 'Sparen':'Savings', 'Sonstiges':'Other' };
  function validateState(parsed) {
    if (!parsed || parsed.version !== 1 || !Number.isInteger(parsed.level) || parsed.level < 1 || parsed.level > 100000 || !Number.isInteger(parsed.xp) || parsed.xp < 0 || parsed.xp >= 100 + (parsed.level-1)*50 || !['habits','quests','notes','transactions','activityDays'].every(key=>Array.isArray(parsed[key]) && parsed[key].length <= 10000)) throw new Error('Invalid backup');
    const dated = values => Array.isArray(values) && values.every(value=>typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value));
    const entry = value => value && typeof value.id === 'string' && typeof value.title === 'string' && value.title.length <= 200;
    if (!dated(parsed.activityDays) || !parsed.habits.every(h=>entry(h) && dated(h.days) && dated(h.rewarded) && Number.isInteger(h.xp) && h.xp >= 1 && h.xp <= 500) || !parsed.quests.every(q=>entry(q) && Number.isInteger(q.xp) && q.xp >= 1 && q.xp <= 500 && typeof q.done === 'boolean' && typeof q.rewarded === 'boolean')) throw new Error('Invalid habits or quests');
    if (!parsed.notes.every(n=>entry(n) && typeof n.content === 'string' && n.content.length <= 20000 && typeof n.category === 'string' && ['Draft','Final'].includes(n.status)) || !parsed.transactions.every(t=>entry(t) && Number.isSafeInteger(t.cents) && t.cents > 0 && ['income','expense'].includes(t.type) && typeof t.category === 'string' && dated([t.date]))) throw new Error('Invalid archive or budget');
    for (const field of ['prayerDays','prayerTimes']) {
      if (parsed[field] != null && (typeof parsed[field] !== 'object' || Array.isArray(parsed[field]))) throw new Error('Invalid prayer data');
    }
    if (!Object.values(parsed.prayerDays || {}).every(value=>Array.isArray(value) && value.every(name=>prayers.includes(name))) || !Object.values(parsed.prayerTimes || {}).every(value=>value && typeof value === 'object' && Object.entries(value).every(([name,time])=>prayers.includes(name) && typeof time === 'string' && (time === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(time))))) throw new Error('Invalid prayer entries');
    if (parsed.preferences != null && (typeof parsed.preferences !== 'object' || typeof parsed.preferences.muted !== 'boolean')) throw new Error('Invalid sound preference');
    if (parsed.questHistory != null && (typeof parsed.questHistory !== 'object' || Array.isArray(parsed.questHistory) || !Object.entries(parsed.questHistory).every(([day,count])=>dated([day]) && Number.isInteger(count) && count >= 0 && count <= 10000))) throw new Error('Invalid quest history');
    for (const field of ['prayerRewards','prayerOverrides']) if (parsed[field] != null && (typeof parsed[field] !== 'object' || Array.isArray(parsed[field]) || !Object.entries(parsed[field]).every(([day,names])=>dated([day]) && Array.isArray(names) && names.every(name=>prayers.includes(name))))) throw new Error('Invalid prayer progress');
    if (parsed.prayerSchedules != null && (typeof parsed.prayerSchedules !== 'object' || Array.isArray(parsed.prayerSchedules) || !Object.entries(parsed.prayerSchedules).every(([day,record])=>dated([day]) && record && typeof record.locationKey === 'string' && typeof record.timezone === 'string' && record.timings && prayers.every(name=>typeof record.timings[name] === 'string' && Number.isFinite(Date.parse(record.timings[name])))))) throw new Error('Invalid prayer schedule');
    if (parsed.preferences?.theme != null && !['miku','teto'].includes(parsed.preferences.theme)) throw new Error('Invalid theme preference');
    if (parsed.breachRewards != null) {
      const ledger=parsed.breachRewards;
      if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger) || Object.keys(ledger).length>366 || !Object.entries(ledger).every(([day,r])=>/^\d{4}-\d{2}-\d{2}$/.test(day) && r && Array.isArray(r.rounds) && r.rounds.length<=3 && r.rounds.every(id=>typeof id==='string' && id.length>0 && id.length<=100) && new Set(r.rounds).size===r.rounds.length && Number.isSafeInteger(r.lastSuccessAt) && r.lastSuccessAt>=0)) throw new Error('Invalid breach rewards');
    }
    const graph = validateLoreGraph(parsed.loreGraph);
    const restored = { ...defaults(), ...parsed, loreGraph:graph };
    restored.preferences={muted:false,...parsed.preferences};
    restored.prayerPrefs={...defaults().prayerPrefs,...parsed.prayerPrefs};
    const prefs=restored.prayerPrefs;
    if (typeof prefs.city !== 'string' || prefs.city.length > 80 || typeof prefs.country !== 'string' || prefs.country.length > 80 || ![2,3,4,12,13].includes(prefs.method) || (prefs.coordinates && (!Number.isFinite(prefs.coordinates.latitude) || Math.abs(prefs.coordinates.latitude)>90 || !Number.isFinite(prefs.coordinates.longitude) || Math.abs(prefs.coordinates.longitude)>180))) throw new Error('Invalid prayer location');
    new Intl.DateTimeFormat('en-GB',{timeZone:prefs.timezone}).format();
    restored.prayerRewards=parsed.prayerRewards || JSON.parse(JSON.stringify(parsed.prayerDays || {}));
    restored.prayerOverrides=parsed.prayerOverrides || Object.fromEntries(Object.entries(parsed.prayerTimes || {}).map(([day,times])=>[day,Object.keys(times).filter(name=>times[name])]));
    if (parsed.questDay != null && !dated([parsed.questDay])) throw new Error('Invalid quest date');
    restored.notes = parsed.notes.map(n=>({...n,category:legacyCategories[n.category] || n.category}));
    restored.transactions = parsed.transactions.map(t=>({...t,category:legacyCategories[t.category] || t.category}));
    return restored;
  }
  function validateLoreGraph(graph) {
    if (graph == null) return {nodes:[],edges:[]};
    const types = ['dimension','character','faction','artifact','event'];
    const str = (value,max) => typeof value === 'string' && value.length <= max;
    if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges) || graph.nodes.length > 2000 || graph.edges.length > 10000) throw new Error('Invalid lore graph');
    const ids = new Set();
    const nodes = graph.nodes.map(n => {
      if (!n || !str(n.id,100) || !n.id || ids.has(n.id) || !str(n.name,120) || !n.name.trim() || !types.includes(n.type) || !['Aktiv','Verschollen','Zerstört'].includes(n.status) || !str(n.home,120) || !str(n.notes,20000) || !Array.isArray(n.attributes) || n.attributes.length > 50 || !n.attributes.every(a=>str(a,100)) || ['x','y'].some(k=>n[k] != null && (!Number.isFinite(n[k]) || Math.abs(n[k])>1e7))) throw new Error('Invalid lore node');
      ids.add(n.id); return {id:n.id,name:n.name,type:n.type,status:n.status,home:n.home,notes:n.notes,attributes:n.attributes,...(n.x != null ? {x:n.x}:{}),...(n.y != null ? {y:n.y}:{})};
    });
    const edgeIds = new Set();
    const edges = graph.edges.map(e => {
      if (!e || !str(e.id,100) || !e.id || edgeIds.has(e.id) || !ids.has(e.from) || !ids.has(e.to) || !str(e.label,80)) throw new Error('Invalid lore connection');
      edgeIds.add(e.id); return {id:e.id,from:e.from,to:e.to,label:e.label};
    });
    return {nodes,edges};
  }
  function currentStreak(days) {
    const unique = [...new Set(days)].sort().reverse();
    if (!unique.length || dayDistance(dateKey(), unique[0]) > 1) return 0;
    let count = 1;
    for (let i = 1; i < unique.length && dayDistance(unique[i - 1], unique[i]) === 1; i++) count++;
    return count;
  }
  let initial = null;
  function read() {
    let damaged = false;
    for (const key of [STORAGE_KEY, BACKUP_KEY]) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try { return validateState(JSON.parse(raw)); } catch (_) { damaged = true; }
    }
    if (damaged) throw new Error('LifeOS: saved data is damaged. Restore a backup in LifeOS before making changes.');
    initial ||= defaults();
    // Persist generated IDs before another page reads the initial document.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    return JSON.parse(JSON.stringify(initial));
  }
  function update(change, {activity = true} = {}) {
    const next = read();
    const result = change(next);
    if (activity && !next.activityDays.includes(dateKey())) next.activityDays.push(dateKey());
    const today = dateKey();
    if (next.questDay !== today) {
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1);
      const day = dateKey(yesterday);
      if (next.questDay < today && next.questHistory[day] == null && next.questHistory[next.questDay] != null) next.questHistory[day] = next.questHistory[next.questDay];
      next.questDay = today;
    }
    next.questHistory[today] = next.quests.filter(q => !q.done).length;
    validateState(next);
    next.savedAt = new Date().toISOString();
    const previous = localStorage.getItem(STORAGE_KEY);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    if (previous) { try { validateState(JSON.parse(previous)); localStorage.setItem(BACKUP_KEY, previous); } catch (_) {} }
    window.dispatchEvent(new CustomEvent('lifeos-state-changed', {detail:next}));
    return result;
  }
  function award(state, amount) {
    const previous = state.level;
    const previousTitle = titleForLevel(previous);
    state.xp += amount;
    while (state.xp >= 100 + (state.level - 1) * 50) { state.xp -= 100 + (state.level - 1) * 50; state.level++; }
    return {amount,level:state.level,levelUp:state.level > previous,titleChanged:titleForLevel(state.level)!==previousTitle,title:titleForLevel(state.level)};
  }
  window.LifeOSCore = {STORAGE_KEY,BACKUP_KEY,dateKey,dayDistance,uid,prayers,titleForLevel,newHabit,defaults,validateState,validateLoreGraph,currentStreak,read,update,award};
})();
