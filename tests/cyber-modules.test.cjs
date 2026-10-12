const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {BreachRound,HEX,applyReward,validateLedger}=require('../breach-model.js');
function coreSetup(){
 const saved=new Map();let reject=false;const window={dispatchEvent(){}};
 const context=vm.createContext({window,Date,Intl,TextEncoder,crypto:require('node:crypto').webcrypto,CustomEvent:class {},localStorage:{getItem:key=>saved.get(key)||null,setItem(key,value){if(reject)throw new Error('Disk full');saved.set(key,String(value));}}});
 for(const file of ['lifeos-core.js','terminal.js'])vm.runInContext(readFileSync(join(__dirname,'..',file),'utf8'),context);
 return {core:window.LifeOSCore,Shell:window.LifeOSShellEngine,setReject:value=>{reject=value;}};
}
function solve(round){for(let a=0;a<4;a++)for(let row=1;row<4;row++)for(let col=0;col<4;col++){const b=row*4+a,c=row*4+col;if(col!==a&&[a,b,c].every((index,i)=>round.board[index]===round.target[i]))return[a,b,c];}throw new Error('Unsolvable');}
test('500 seeded boards have a legal three-cell solution and award no implicit wins',()=>{
 let seed=39;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/2**32);
 for(let i=0;i<500;i++){const round=new BreachRound({random});assert.equal(round.board.length,16);assert.ok(round.board.every(value=>HEX.includes(value)));assert.equal(round.status,'ready');assert.equal(round.choose(0),false);round.start();for(const cell of solve(round))assert.equal(round.choose(cell),true);assert.equal(round.status,'won');assert.equal(round.choose(0),false);}
});
test('axes alternate, reused/off-axis/out-of-range cells do not consume the buffer',()=>{
 const round=new BreachRound({random:()=>0});round.start();assert.equal(round.choose(4),false);assert.equal(round.choose(-1),false);assert.equal(round.choose(1.5),false);assert.equal(round.choose(2),true);assert.equal(round.choose(2),false);assert.equal(round.choose(5),false);assert.equal(round.choose(6),true);assert.equal(round.choose(10),false);assert.equal(round.choose(7),true);assert.deepEqual(round.selected,[2,6,7]);
});
test('deadline is absolute and forbids late selections even when timer callbacks were suspended',()=>{
 let now=0;const round=new BreachRound({now:()=>now});round.start();now=29999;assert.equal(round.remaining(),1);now=30000;assert.equal(round.choose(0),false);assert.equal(round.status,'timeout');assert.equal(round.selected.length,0);
});
test('incorrect three-code buffer fails without accepting extra moves',()=>{
 const round=new BreachRound({random:()=>0});round.target=['BD','BD','BD'];round.start();[0,4,5].forEach(cell=>round.choose(cell));assert.equal(round.status,'lost');assert.equal(round.choose(6),false);
});
test('rewards persist once per round, cap at three local-day successes and use real level-up rules',()=>{
 const {core}=coreSetup();core.update(state=>{state.xp=80;},{activity:false});
 const claim=(id,day='2026-10-12')=>core.update(state=>applyReward(state,id,day,1791800000000,core.award));
 const first=claim('round-1');assert.equal(first.reward.amount,40);assert.equal(first.reward.levelUp,true);assert.equal(core.read().level,2);assert.equal(core.read().xp,20);
 assert.equal(claim('round-1').reason,'duplicate');claim('round-2');claim('round-3');assert.equal(core.read().xp,100);assert.equal(claim('round-4').reason,'daily-limit');assert.equal(core.read().xp,100);assert.equal(core.read().breachRewards['2026-10-12'].rounds.length,3);
 assert.equal(claim('round-5','2026-10-13').reward.amount,40);assert.equal(core.read().xp,140);assert.equal(core.validateState(JSON.parse(JSON.stringify(core.read()))).breachRewards['2026-10-12'].rounds.length,3);
});
test('old saves remain compatible; malformed reward ledgers are rejected; failed writes grant nothing',()=>{
 const {core,setReject}=coreSetup();const old=core.defaults();delete old.breachRewards;assert.equal(Object.keys(core.validateState(old).breachRewards).length,0);
 for(const ledger of [[],{'bad':{rounds:[],lastSuccessAt:0}},{'2026-10-12':{rounds:['a','a'],lastSuccessAt:0}},{'2026-10-12':{rounds:[],lastSuccessAt:-1}}]){assert.throws(()=>validateLedger(ledger));assert.throws(()=>core.validateState({...core.defaults(),breachRewards:ledger}));}
 core.read();setReject(true);assert.throws(()=>core.update(state=>applyReward(state,'no-save','2026-10-12',1,core.award)));setReject(false);assert.equal(core.read().xp,0);assert.equal(Object.keys(core.read().breachRewards).length,0);
});
test('arcade command has Linux-like help, completion and argument validation',async()=>{
 const {Shell}=coreSetup();let opened=0;const shell=new Shell({arcade:()=>opened++});assert.equal((await shell.run('arcade')).code,0);assert.equal((await shell.run('arcade breach')).code,0);assert.equal(opened,2);assert.equal((await shell.run('arcade invalid')).code,2);assert.match((await shell.run('man arcade')).stdout,/40 XP/);assert.ok(shell.complete('arc').includes('arcade '));
});
