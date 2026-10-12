// Run with: node --test tests/terminal.test.cjs
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');
function setup(persisted) {
  const saved = persisted || new Map(),events=[];
  const window = {dispatchEvent(event){events.push(event);}};
  const context = vm.createContext({window,TextEncoder,Date,Intl,console,crypto:require('node:crypto').webcrypto,
    CustomEvent:class {constructor(type,{detail}){this.type=type;this.detail=detail;}},
    localStorage:{getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,String(value))}});
  for(const name of ['lifeos-core.js','terminal.js'])vm.runInContext(readFileSync(join(__dirname,'..',name),'utf8'),context);
  const rewards=[];
  const shell=new window.LifeOSShellEngine({reward:reward=>rewards.push(reward)});
  return {shell,core:window.LifeOSCore,rewards,saved,events};
}
test('paths, relative navigation, cd -, globs and read-only data views',async()=>{
  const {shell}=setup();
  assert.equal((await shell.run('pwd')).stdout,'/home/producer\n');
  assert.equal((await shell.run('cd /etc; cat os-release | grep -F LifeOS')).code,0);
  assert.equal((await shell.run('cd -')).stdout,'/home/producer\n');
  assert.match((await shell.run('ls -la')).stdout,/\.profile/);
  assert.equal((await shell.run('echo bad > /etc/os-release')).code,1);
  assert.equal((await shell.run('cat /etc/os-release')).stdout.includes('bad'),false);
  assert.equal((await shell.run('mkdir -p ~/tmp/a/b; echo saved > ~/tmp/a/b/note; cat ~/tmp/a/b/*')).stdout,'saved\n');
});
test('quotes, expansion, pipelines, conditionals and syntax errors',async()=>{
  const {shell}=setup();
  assert.equal((await shell.run('false; echo $?')).stdout,'1\n');
  assert.equal((await shell.run('export PROJECT="chapter 3"; echo "$PROJECT"')).stdout,'chapter 3\n');
  assert.equal((await shell.run("echo '$USER' \"$USER\"")).stdout,'$USER producer\n');
  assert.equal((await shell.run('false && echo wrong || echo right')).stdout,'right\n');
  assert.equal((await shell.run('printf "b\\na\\na\\n" | sort | uniq -c')).stdout,'2 a\n1 b\n');
  assert.equal((await shell.run('echo none | grep absent || echo recovered')).stdout,'recovered\n');
  assert.equal((await shell.run('does-not-exist')).code,127);
  assert.equal((await shell.run('echo "unterminated')).code,2);
  assert.equal((await shell.run('quest add never-created &&')).code,2);
  assert.equal((await shell.run('quest ls -a | grep never-created')).code,1);
});
test('redirects, append, scratch copies and persistence',async()=>{
  const {shell,core}=setup();
  assert.equal((await shell.run('echo first > ~/tmp/log; echo second >> ~/tmp/log; cat -n ~/tmp/log')).stdout,'     1\tfirst\n     2\tsecond\n');
  assert.equal((await shell.run('cp ~/tmp/log ~/tmp/copy; mv ~/tmp/copy ~/tmp/moved; wc -l ~/tmp/moved')).stdout,'2\n');
  assert.equal((await shell.run('rm ~/vault/status.txt')).code,1);
  assert.equal((await shell.run('cat ~/vault/status.txt')).code,0);
  assert.equal((await shell.run('touch ~/tmp/log; tail -n 1 ~/tmp/log')).stdout,'second\n');
  assert.equal(core.read().version,1);
});
test('quests and habits share state, award once and retain level-up behavior',async()=>{
  const {shell,core,rewards}=setup();
  await shell.run('quest add -x 75 -p high "Chapter 3"');
  let state=core.read();const q=state.quests[state.quests.length-1];
  assert.equal(q.xp,75);assert.equal(q.priority,'high');
  assert.equal((await shell.run(`quest done ${q.id}`)).code,0);
  await shell.run(`quest done ${q.id}`);assert.equal(core.read().xp,75);assert.equal(rewards.length,1);
  await shell.run('habit check 1 1');assert.equal(core.read().xp,90);assert.equal(rewards.length,2);
  await shell.run('habit check 1');assert.equal(core.read().xp,90);assert.equal(rewards.length,2);
  await shell.run('quest add --xp=20 "Level up"');state=core.read();
  await shell.run(`quest done ${state.quests[state.quests.length-1].id}`);
  assert.equal(core.read().level,2);assert.equal(core.read().xp,10);assert.equal(rewards[2].levelUp,true);
  assert.equal((await shell.run('quest add -x 501 bad')).code,2);
});
test('graph backups and old saves stay compatible; corrupt storage is protected',()=>{
  const {core,saved}=setup();
  const state=core.defaults();
  assert.equal(core.validateState(state).loreGraph.nodes.length,0);
  delete state.loreGraph;assert.equal(core.validateState(state).loreGraph.nodes.length,0);
  const node={id:'world',name:'World',type:'dimension',status:'Aktiv',home:'',notes:'Lore',attributes:[]};
  state.loreGraph={nodes:[node],edges:[]};assert.equal(core.validateState(JSON.parse(JSON.stringify(state))).loreGraph.nodes[0].notes,'Lore');
  state.loreGraph.edges=[{id:'edge',from:'world',to:'missing',label:'invalid'}];assert.throws(()=>core.validateState(state));
  saved.set(core.STORAGE_KEY,'broken');assert.throws(()=>core.update(s=>{s.xp=1;}));assert.equal(saved.get(core.STORAGE_KEY),'broken');
});
test('completion, aliases, unknown flags and JSON output',async()=>{
  const {shell}=setup();
  assert.ok(shell.complete('qu').includes('quest '));assert.ok(shell.complete('cat /etc/o').includes('cat /etc/os-release '));
  assert.equal((await shell.run("alias os='cat /etc/os-release'; os | grep -F 'ID=lifeos'")).stdout,'ID=lifeos\n');
  assert.equal((await shell.run('ls -z')).code,2);
  assert.ok(Array.isArray(JSON.parse((await shell.run('quest ls --json')).stdout)));
  assert.equal((await shell.run('theme teto')).code,0);assert.equal((await shell.run('theme')).stdout,'teto\n');
});

test('initial record IDs survive a separate page context before any mutation',()=>{
  const first=setup();const initial=first.core.read();
  const second=setup(first.saved);const next=second.core.read();
  assert.equal(initial.quests[0].id,next.quests[0].id);
  assert.equal(initial.habits[0].id,next.habits[0].id);
});
