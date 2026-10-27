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
test('removed Cyber-Dex has no API or terminal entry point',async()=>{
 const {Data,Shell}=setup();const shell=new Shell();
 assert.equal(Data.pokemon,undefined);assert.equal(Data.prepareEncounter,undefined);
 assert.equal((await shell.run('dex list')).code,127);
 assert.doesNotMatch((await shell.run('help')).stdout,/PokéAPI|dex list/);
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
 const shell=new Shell();assert.ok(shell.complete('vocaloid r').includes('vocaloid random '));assert.ok(!shell.complete('dex l').includes('dex list '));
});
