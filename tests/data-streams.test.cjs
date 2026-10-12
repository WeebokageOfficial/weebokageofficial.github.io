const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function setup(fetch){
 const saved=new Map();let full=false;
 const window={dispatchEvent(){}};
 const ctx=vm.createContext({window,Date,Intl,URL,URLSearchParams,AbortController,setTimeout,clearTimeout,CustomEvent:class{},navigator:{},fetch,crypto:require('node:crypto').webcrypto,localStorage:{getItem:k=>saved.get(k)||null,setItem(k,v){if(full)throw Error('Disk full');saved.set(k,String(v));}}});
 for(const file of ['lifeos-core.js','data-streams.js','terminal.js'])vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'..',file),'utf8'),ctx);
 return {Core:window.LifeOSCore,Data:window.LifeOSDataStreams,Shell:window.LifeOSShellEngine,saved,setFull:v=>full=v};
}
const creature={id:25,name:'pikachu',displayName:'Pikachu',sprite:'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png',types:['electric'],stats:{hp:35,attack:55,defense:40,speed:90},height:.4,weight:6,description:'Mouse Pokémon.'};
const track=id=>({id,name:'Rolling Girl '+id,thumbUrl:'http://example.test/cover.jpg',minMilliBpm:195000,maxMilliBpm:195000,artists:[{name:'wowaka',artist:{artistType:'Producer'}},{name:'Miku',artist:{artistType:'Vocaloid'}}],pvs:[{service:'Youtube',pvType:'Original',url:'https://youtu.be/example'}]});
const response=data=>({ok:true,json:async()=>data});
test('daily encounters require nonempty completed habits, persist selection and only award once',()=>{
 const {Core,Data,saved}=setup();const today=Core.dateKey();
 assert.equal(Data.prepareEncounter(Core.defaults(),today),null);
 const empty=Core.defaults();empty.habits=[];assert.equal(Data.prepareEncounter(empty,today),null);
 Core.update(s=>{s.habits.forEach(h=>h.days.push(today));s.xp=80;Data.prepareEncounter(s,today,()=>24/251);});
 assert.equal(Core.read().cyberdex.encounters[today].id,25);
 Core.update(s=>Data.prepareEncounter(s,today,()=>0));
 assert.equal(Core.read().cyberdex.encounters[today].id,25);
 assert.equal(Core.update(s=>Data.applyCatch(s,today,{...creature,id:26})),null);
 const reward=Core.update(s=>Data.applyCatch(s,today,creature));
 assert.equal(reward.amount,50);assert.equal(reward.levelUp,true);assert.equal(Core.read().level,2);assert.equal(Core.read().xp,30);
 assert.equal(Core.update(s=>Data.applyCatch(s,today,creature)),null);
 Core.update(s=>{s.habits[0].days=[];});Core.update(s=>{s.habits[0].days.push(today);Data.prepareEncounter(s,today);});
 assert.equal(Core.update(s=>Data.applyCatch(s,today,creature)),null);assert.equal(Core.read().xp,30);
 Data.mirrorCaught();assert.equal(JSON.parse(saved.get('cyberdex_caught')).length,1);
 assert.equal(Core.validateState(JSON.parse(JSON.stringify(Core.read()))).cyberdex.caught.length,1);
});
test('a repeated species on a new day stays unique; expired claims and failed storage grant no XP',async()=>{
 const {Core,Data,setFull,saved}=setup();const today=Core.dateKey();
 Core.update(s=>{s.cyberdex.caught.push(creature);s.cyberdex.encounters[today]={id:25,status:'pending'};});
 assert.equal(Core.update(s=>Data.applyCatch(s,'2000-01-01',creature)),null);
 setFull(true);await assert.rejects(()=>Data.catchPokemon(today,creature));setFull(false);
 assert.equal(Core.read().xp,0);assert.equal(Core.read().cyberdex.encounters[today].status,'pending');
 await Data.catchPokemon(today,creature);assert.equal(Core.read().xp,50);assert.equal(Core.read().cyberdex.caught.length,1);assert.equal(JSON.parse(saved.get('cyberdex_caught')).length,1);
});
test('legacy saves migrate; corrupted collection and encounter ledgers are rejected',()=>{
 const {Core}=setup();const old=Core.defaults();delete old.cyberdex;assert.equal(Core.validateState(old).cyberdex.caught.length,0);
 for(const value of [null,{caught:[creature,creature],encounters:{}},{caught:[],encounters:{bad:{id:25,status:'caught'}}},{caught:[],encounters:{'2026-10-12':{id:252,status:'pending'}}},{caught:[{...creature,stats:{}}],encounters:{}}])assert.throws(()=>Core.validateState({...old,cyberdex:value}));
});
test('VocaDB normalizes milli-BPM and artists, caches for 24h, rerolls without another API call',async()=>{
 let calls=0;
 const {Data,saved}=setup(async()=>{calls++;return response({items:[track(1),track(2)]});});
 const first=await Data.dailySong();assert.equal(first.bpm,'195');assert.equal(first.producer,'wowaka');assert.equal(first.vocalist,'Miku');assert.match(first.cover,/^https:/);
 assert.equal((await Data.dailySong()).id,first.id);assert.notEqual((await Data.dailySong(true)).id,first.id);assert.equal(calls,1);
 assert.ok(JSON.parse(saved.get('vocadb_daily_cache')).expires>Date.now());
 assert.equal(Data.song({...track(3),minMilliBpm:120000,maxMilliBpm:180000}).bpm,'120–180');
 assert.equal(Data.safeURL('javascript:alert(1)'), '');assert.equal(Data.song({...track(4),pvs:[{service:'Youtube',url:'https://evil.test'}]}).url,'');
});
test('PokéAPI normalizes German species data and units; CLI errors use stderr and nonzero exit',async()=>{
 let calls=0;
 const {Data,Shell}=setup(async url=>{calls++;if(url.endsWith('/missing'))return {ok:false,status:404};return response(url.includes('pokemon-species')?{names:[{name:'Pikachu',language:{name:'de'}}],flavor_text_entries:[{flavor_text:'Eine\nMaus.',language:{name:'de'}}]}:{id:25,name:'pikachu',species:{name:'pikachu'},height:4,weight:60,types:[{type:{name:'electric'}}],stats:Object.entries({hp:35,attack:55,defense:40,speed:90}).map(([name,base_stat])=>({stat:{name},base_stat})),sprites:{front_default:creature.sprite}});});
 const p=await Data.pokemon('PIKACHU');assert.equal(p.height,.4);assert.equal(p.weight,6);assert.equal(p.description,'Eine Maus.');await Data.pokemon('pikachu');assert.equal(calls,2);
 const shell=new Shell();const entry=await shell.run('dex pikachu');assert.match(entry.stdout,/HP: 35.*ATK: 55.*DEF: 40.*SPE: 90/);assert.match(entry.stdout,/HEIGHT: 0.4m/);
 const missing=await shell.run('dex missing');assert.equal(missing.code,1);assert.match(missing.stderr,/ERROR: Node unreachable.*404/);
 assert.equal((await shell.run('dex a b')).code,2);assert.equal((await shell.run('vocaloid find')).code,2);assert.match((await shell.run('dex list')).stdout,/DEX SYNC: 0 \/ 251/);assert.match((await shell.run('man vocaloid')).stdout,/Public VocaDB/);assert.ok(shell.complete('voc').includes('vocaloid '));
});
test('VocaDB CLI searches top three, supports pipelines and reports unreachable APIs',async()=>{
 const {Shell}=setup(async()=>response({items:[track(1),track(2),track(3),track(4)]}));const shell=new Shell();
 const search=await shell.run('vocaloid find "Hatsune Miku"');assert.equal(search.code,0);assert.match(search.stdout,/3\. Rolling Girl 3/);assert.doesNotMatch(search.stdout,/Rolling Girl 4/);
 assert.match((await shell.run('vocaloid random | head -n 1')).stdout,/VOCADB STREAM/);
 const bad=setup(async()=>{throw new TypeError('Network unavailable');});assert.match((await new bad.Shell().run('vocaloid random')).stderr,/ERROR: Node unreachable/);
});

test('API cache drops unused provider payloads and stays within the profile storage budget',async()=>{
 const {Data,saved,Shell}=setup(async()=>response({items:Array.from({length:50},(_,i)=>({...track(i+1),unusedPayload:'x'.repeat(20000)}))}));
 await Data.dailySong();assert.ok(saved.get('weebokage.streams.cache.v1').length<500000);assert.doesNotMatch(saved.get('weebokage.streams.cache.v1'),/unusedPayload/);
 const shell=new Shell();assert.ok(shell.complete('vocaloid r').includes('vocaloid random '));assert.ok(shell.complete('dex l').includes('dex list '));
});
