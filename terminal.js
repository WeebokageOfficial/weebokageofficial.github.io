/* Browser shell: no eval, subprocesses or access to the host filesystem. */
(() => {
  'use strict';
  const Core = window.LifeOSCore;
  const HOME = '/home/producer', FILES_KEY = 'weebokage.shell.files.v1';
  const manual = {
    help:['help [command]', 'Show this command index. Click a command or use man COMMAND.'],
    man:['man COMMAND', 'Syntax, options and examples. Most commands accept --help.'],
    pwd:['pwd [-L|-P]', 'Print the virtual working directory.'],
    cd:['cd [DIRECTORY|-]', 'Change directory; ~, .., absolute paths and cd - work. Example: cd ~/lore'],
    ls:['ls [-alhR] [PATH...]', 'List files. -a includes dotfiles, -l shows details, -h human sizes, -R recurses. Example: ls -la ~/lore'],
    cat:['cat [-n] [FILE...]', 'Read files or stdin; -n numbers lines. Example: cat /etc/os-release'],
    echo:['echo [-n] [-e] [TEXT...]', 'Print text; -n omits newline, -e interprets \\n and \\t. Example: echo "$USER @ $PWD"'],
    printf:['printf FORMAT [ARG...]', 'Format %s, %d and %%; supports \\n and \\t. Example: printf "%s\\n" miku teto'],
    grep:['grep [-invFc] PATTERN [FILE...]', 'Filter lines. -i ignore case, -n line numbers, -v invert, -F literal, -c count. Regex is supported with limits. Exit 1 means no matches. Example: quest ls | grep -i chapter'],
    head:['head [-n COUNT] [FILE...]', 'First lines (default 10). Example: cat ~/vault/status.txt | head -n 3'],
    tail:['tail [-n COUNT] [FILE...]', 'Last lines (default 10).'],
    wc:['wc [-lwc] [FILE...]', 'Count lines, words and UTF-8 bytes from files or stdin.'],
    sort:['sort [-nr] [FILE...]', 'Sort lines; -n numeric, -r reverse.'],
    uniq:['uniq [-c] [FILE]', 'Collapse adjacent duplicate lines; -c adds counts. Example: cat ~/tmp/list | sort | uniq -c'],
    find:['find [PATH] [-name GLOB] [-type f|d]', 'Find virtual files. Example: find ~/lore -name "*.md"'],
    touch:['touch FILE...', 'Create empty scratch files under ~/tmp. Existing files are preserved.'],
    mkdir:['mkdir [-p] DIRECTORY...', 'Create scratch directories under ~/tmp.'],
    rm:['rm [-r] [-f] [--] PATH...', 'Remove scratch files; -r removes scratch subdirectories. LifeOS records are read-only filesystem views.'],
    cp:['cp SOURCE DESTINATION', 'Copy a virtual file into ~/tmp.'],
    mv:['mv SOURCE DESTINATION', 'Move a scratch file within ~/tmp.'],
    date:['date [-I|--iso-8601]', 'Current local date or ISO calendar date.'],
    whoami:['whoami', 'Print the current virtual username.'],
    id:['id [-u|-g|-un]', 'Show the browser shell identity.'],
    uname:['uname [-a|-s|-r|-m]', 'Show LifeOS virtual kernel information.'],
    hostname:['hostname', 'Print lifeos.'],
    uptime:['uptime', 'Show this persistent shell session’s uptime.'],
    env:['env', 'Print shell variables. No OS or secret environment is exposed.'],
    export:['export NAME=value ...', 'Set shell variables. Example: export PROJECT="Chapter 3"'],
    alias:['alias [NAME=COMMAND...]', 'List or define aliases. Example: alias ll="ls -lah"'],
    unalias:['unalias NAME...', 'Remove an alias.'],
    history:['history [-c]', 'Show command history; -c clears it. ↑/↓ browse, Ctrl-R searches, !! repeats the last command.'],
    clear:['clear', 'Clear terminal output (also Ctrl-L).'],
    exit:['exit', 'Close the drop-down shell (also Ctrl-D on an empty input).'],
    true:['true', 'Return status 0.'], false:['false', 'Return status 1.'],
    quest:['quest add [-x|--xp N] [-p|--priority high|medium|low] [--] TITLE\nquest ls [-a|--all|--done] [--json]\nquest done ID...\nquest show ID', 'IDs may be full IDs, unambiguous prefixes or list numbers. Default reward: 50 XP; range: 1–500. Repeated completion never grants extra XP. Legacy trailing XP is accepted. Example: quest add -x 75 -p high "Write chapter 3"'],
    habit:['habit ls [--json]\nhabit check ID...\nhabit add [-x|--xp N] [--] TITLE', 'Daily checks use local calendar days; each habit earns XP once per day. Example: habit check 1'],
    stats:['stats | status', 'Level, XP progress, title and habit streaks. Example: stats | head -n 5'],
    theme:['theme [miku|teto|auto]', 'Set the site-wide accent, or follow the page theme with auto.'],
    music:['music status|connect|play|pause|toggle|next|prev\nmusic volume [0..100]\nmusic shuffle [on|off]', 'Control the persistent Spotify CyberDeck from any page. Spotify Premium and an authorized session are required.'],
    vocaloid:['vocaloid random\nvocaloid find QUERY', 'Public VocaDB stream. Random recommendation or the top three search results. Example: vocaloid find \"Hatsune Miku\"'],
    dex:['dex NAME_OR_ID\ndex list', 'Public PokéAPI lookup and your locally caught Gen 1–2 collection. Example: dex pikachu'],
    arcade:['arcade [breach]', 'Open Breach Protocol. Match three codes within 30 seconds, alternating column and row. +40 XP, up to three rewarded hacks per local day.'],
    matrix:['matrix', 'Five seconds of code rain; Ctrl-C stops the animation.'],
    miku:['miku', 'Miku ASCII art and motivation.'],teto:['teto', 'Initialize baguette protocol.'],
    sudo:['sudo COMMAND', 'Permission denied: Miku is the only root user here.']
  };
  const result = (stdout = '', code = 0, stderr = '') => ({stdout,code,stderr});
  const fail = (message, code = 1) => { const error = new Error(message); error.code = code; throw error; };
  const lines = text => text.replace(/\n$/,'').split('\n');
  const nl = text => text ? text + '\n' : '';
  const glob = pattern => new RegExp('^' + pattern.split('').map(c => c === '*' ? '[^/]*' : c === '?' ? '[^/]' : c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('') + '$');
  class Shell {
    constructor(hooks = {}) {
      this.cwd=HOME; this.oldpwd=HOME; this.code=0; this.started=Date.now(); this.hooks=hooks;
      this.env={USER:'producer',LOGNAME:'producer',HOME,SHELL:'/bin/lifeos-sh',TERM:'xterm-256color',LANG:'en_US.UTF-8',PATH:'/usr/bin:/bin'};
      this.aliases=Object.assign(Object.create(null),{ll:'ls -lah',la:'ls -a',l:'ls -CF'});
      this.files={};
      try {const saved=JSON.parse(localStorage.getItem(FILES_KEY));if(saved&&typeof saved==='object'&&!Array.isArray(saved))for(const [path,file] of Object.entries(saved))if(path.startsWith(HOME+'/tmp/')&&!path.split('/').includes('..')&&file&&['file','dir'].includes(file.type)&&typeof file.content==='string'&&file.content.length<=100000)this.files[path]={type:file.type,content:file.content};}catch(_){}
    }
    prompt() {return `producer@lifeos:${this.cwd===HOME?'~':this.cwd.startsWith(HOME+'/')?'~'+this.cwd.slice(HOME.length):this.cwd}$`;}
    vars() {return {...this.env,PWD:this.cwd,OLDPWD:this.oldpwd,'?':String(this.code)};}
    lex(line) {
      const out=[];let value='',started=false,quoted=false,quote=null;
      const push=()=>{if(started)out.push({value,quoted});value='';started=false;quoted=false;};
      for(let i=0;i<line.length;i++){
        const c=line[i];
        if(c==='\\'&&quote!=="'"){if(i+1===line.length)fail('sh: trailing escape',2);const next=line[++i];if(quote==='"'&&!['$','"','\\'].includes(next))value+='\\';value+=next;started=true;continue;}
        if(quote){if(c===quote){quote=null;continue;}if(c!=='$'||quote==="'"){value+=c;continue;}}
        else {
          if(/\s/.test(c)){push();continue;}
          if(c==='#'&&!started)break;
          if(c==='"'||c==="'"){quote=c;started=true;quoted=true;continue;}
          if('|;&>'.includes(c)){push();let op=c;if(line[i+1]===c&&c!==';')op+=line[++i];if(op==='&')fail('sh: background jobs are not supported',2);out.push({op});continue;}
        }
        if(c==='$'){
          if(line[i+1]==='(')fail('sh: command substitution is not supported',2);
          const match=line.slice(i+1).match(/^(\{[A-Za-z_][A-Za-z0-9_]*\}|[A-Za-z_][A-Za-z0-9_]*|\?)/);
          if(match){value+='\x00'+match[1].replace(/[{}]/g,'')+'\x00';i+=match[1].length;started=true;continue;}
        }
        if(c==='`')fail('sh: command substitution is not supported',2);
        value+=c;started=true;
      }
      if(quote)fail('sh: unterminated quote',2);push();return out;
    }
    path(value='.') {
      if(value==='~'||value.startsWith('~/'))value=HOME+value.slice(1);
      const full=value.startsWith('/')?value:this.cwd+'/'+value;
      const parts=[];for(const part of full.split('/')){if(!part||part==='.')continue;if(part==='..')parts.pop();else parts.push(part);}return '/'+parts.join('/');
    }
    stats(state=Core.read()) {
      const needed=100+(state.level-1)*50;
      return `+-- LIFEOS // ${Core.titleForLevel(state.level)} --+\nLEVEL ${state.level}  XP ${state.xp}/${needed}\n[${'#'.repeat(Math.floor(state.xp/needed*20)).padEnd(20,'-')}]\nSYNC STREAK: ${Core.currentStreak(state.activityDays)} days\nHABITS TODAY: ${state.habits.filter(h=>h.days.includes(Core.dateKey())).length}/${state.habits.length}\n${state.habits.map(h=>`${h.title}: ${Core.currentStreak(h.days)} day streak`).join('\n')}\n`;
    }
    tree() {
      const s=Core.read(),tree=Object.create(null);
      const dir=path=>{tree[path]={type:'dir',content:''};};
      ['/', '/home', HOME,HOME+'/habits',HOME+'/quests',HOME+'/lore',HOME+'/vault',HOME+'/tmp','/etc','/proc','/proc/self','/usr','/usr/bin','/bin'].forEach(dir);
      const file=(path,content)=>{tree[path]={type:'file',content};};
      file('/etc/os-release','NAME="LifeOS"\nVERSION="3.9-vocaloid"\nID=lifeos\nPRETTY_NAME="LifeOS Browser Shell"\n');
      file('/proc/version','LifeOS Cyber-Kernel v3.9-vocaloid x86_64 GNU/Linux (virtual browser environment)\n');
      file('/proc/uptime',`${Math.floor((Date.now()-this.started)/1000)} 0\n`);
      file('/proc/self/status',`Name:\tlifeos-sh\nState:\tR (running)\nUid:\t1000\n`);
      file(HOME+'/.profile','export USER=producer\nexport SHELL=/bin/lifeos-sh\n# Browser shell; use help for supported commands.\n');
      file(HOME+'/vault/status.txt',this.stats(s));
      s.notes.forEach(n=>file(HOME+'/lore/'+n.id+'.md',`${n.title}\n${n.content}\n`));
      s.quests.forEach(q=>file(HOME+'/quests/'+q.id,`${q.title}\nStatus: ${q.done?'done':'open'}\nXP: ${q.xp}\nPriority: ${q.priority}\n`));
      s.habits.forEach(h=>file(HOME+'/habits/'+h.id,`${h.title}\nToday: ${h.days.includes(Core.dateKey())?'checked':'open'}\nStreak: ${Core.currentStreak(h.days)}\nXP: ${h.xp}\n`));
      Object.keys(manual).forEach(name=>file('/usr/bin/'+name,'LifeOS browser built-in\n'));
      Object.assign(tree,this.files);return tree;
    }
    expand(tokens) {
      return tokens.flatMap(original=>{
        const token={...original,value:original.value.replace(/\x00([^\x00]+)\x00/g,(_,key)=>this.vars()[key]??'')};
        if(!token.quoted && (token.value==='~'||token.value.startsWith('~/')))token.value=HOME+token.value.slice(1);
        if(token.quoted||!/[?*]/.test(token.value))return [token.value];
        const pattern=this.path(token.value),matched=Object.keys(this.tree()).filter(path=>glob(pattern).test(path));
        return matched.length?matched:[token.value];
      });
    }
    readFile(path) {
      const full=this.path(path),file=this.tree()[full];
      if(!file)fail(`cat: ${path}: No such file or directory`);
      if(file.type==='dir')fail(`cat: ${path}: Is a directory`);
      return file.content;
    }
    input(args,stdin) {return args.length?args.map(path=>path==='-'?stdin:this.readFile(path)).join(''):stdin;}
    saveFiles(next) {
      const serialized=JSON.stringify(next);if(serialized.length>500000)fail('sh: scratch filesystem quota exceeded (500 KB)');
      localStorage.setItem(FILES_KEY,serialized);this.files=next;
    }
    writable(path) {
      const full=this.path(path);if(!full.startsWith(HOME+'/tmp/'))fail(`sh: ${path}: Read-only filesystem (write under ~/tmp)`);
      const parent=full.slice(0,full.lastIndexOf('/'))||'/';if(this.tree()[parent]?.type!=='dir')fail(`sh: ${path}: No such directory`);
      if(this.tree()[full]?.type==='dir')fail(`sh: ${path}: Is a directory`);
      return full;
    }
    writeFile(path,text,append=false) {
      const full=this.writable(path),content=(append?(this.files[full]?.content||''):'')+text;
      if(content.length>100000)fail('sh: file too large (100 KB)');
      this.saveFiles({...this.files,[full]:{type:'file',content}});
    }
    options(args,allowed) {
      const flags=new Set(),rest=[];let ended=false;
      for(const arg of args){if(!ended&&arg==='--'){ended=true;continue;}if(!ended&&arg.startsWith('-')&&arg!=='-'){for(const flag of arg.slice(1)){if(!allowed.includes(flag))fail(`invalid option -- '${flag}'`,2);flags.add(flag);}}else rest.push(arg);}
      return {flags,rest};
    }
    record(items,id) {
      const numbered=/^[1-9]\d*$/.test(id)?items[Number(id)-1]:null;
      if(numbered)return numbered;
      const exact=items.find(item=>item.id===id);if(exact)return exact;
      const found=items.filter(item=>item.id.startsWith(id));
      if(found.length!==1)fail(found.length?`${id}: ambiguous ID prefix`:`${id}: no such record`);
      return found[0];
    }
    reward(change) {
      let reward=null;
      const output=Core.update(state=>change(state,amount=>{reward=Core.award(state,amount);}));
      if(reward)this.hooks.reward?.(reward);return result(nl(output));
    }
    async command(argv,stdin='',depth=0) {
      let [name,...args]=argv;if(!name)return result();
      if(this.aliases[name]){if(depth>8)fail('sh: alias loop',2);return this.command([...this.expand(this.lex(this.aliases[name])),...args],stdin,depth+1);}
      if(name==='status')name='stats';
      if(args.includes('--help'))return result(nl(manual[name]?`${manual[name][0]}\n\n${manual[name][1]}`:`${name}: no manual entry`),manual[name]?0:1);
      if(name==='help'||name==='man'){
        if(args.length){const key=args[0]==='status'?'stats':args[0];if(!manual[key])fail(`man: no manual entry for ${args[0]}`);return result(nl(`${key.toUpperCase()}(1)             LifeOS User Commands\n\nSYNOPSIS\n  ${manual[key][0]}\n\nDESCRIPTION\n  ${manual[key][1]}`));}
        return result('LifeOS browser shell · virtual filesystem\n\n'+Object.entries(manual).map(([key,[syntax]])=>key.padEnd(10)+' '+syntax.split('\n')[0]).join('\n')+'\n\nShell: quotes, $VAR / $?, ~, globs, |, ;, &&, ||, >, >>, # comments\nKeys: Tab, ↑/↓, Ctrl-R, Ctrl-L, Ctrl-C, Ctrl-D · history: !! / !N\nWritable scratch space: ~/tmp · LifeOS records: ~/quests, ~/habits, ~/lore\n');
      }
      if(name==='true')return result();if(name==='false')return result('',1);
      if(name==='pwd'){this.options(args,'LP');return result(this.cwd+'\n');}
      if(name==='cd'){
        if(args.length>1)fail('cd: too many arguments');const next=args[0]==='-'?this.oldpwd:this.path(args[0]||HOME);
        if(this.tree()[next]?.type!=='dir')fail(`cd: ${args[0]}: Not a directory`);
        this.oldpwd=this.cwd;this.cwd=next;return result(args[0]==='-'?next+'\n':'');
      }
      if(name==='ls'){
        const {flags,rest}=this.options(args,'alhRCF');let output='';const tree=this.tree();
        const children=path=>Object.keys(tree).filter(p=>p!=='/'&&p.slice(0,p.lastIndexOf('/'))===path.replace(/\/$/,'')).sort();
        const describe=path=>{const f=tree[path],base=path.split('/').pop()||'/';if(!flags.has('l'))return base+(f.type==='dir'?'/':'');const bytes=new TextEncoder().encode(f.content).length;return `${f.type==='dir'?'drwxr-xr-x':'-r--r--r--'} 1 producer producer ${String(flags.has('h')&&bytes>1024?(bytes/1024).toFixed(1)+'K':bytes).padStart(7)} ${base}${f.type==='dir'?'/':''}`;};
        const list=path=>{const entries=children(path).filter(p=>flags.has('a')||!p.split('/').pop().startsWith('.'));if(flags.has('R')||rest.length>1)output+=path+':\n';if(flags.has('a'))output+=(flags.has('l')?'drwxr-xr-x 1 producer producer       0 .\ndrwxr-xr-x 1 producer producer       0 ..\n':'.  ..\n');output+=entries.map(describe).join(flags.has('l')?'\n':'  ')+'\n';if(flags.has('R'))for(const p of entries)if(tree[p].type==='dir')list(p);};
        for(const arg of rest.length?rest:['.']){const path=this.path(arg);if(!tree[path])fail(`ls: cannot access '${arg}': No such file or directory`);if(tree[path].type==='dir')list(path);else output+=describe(path)+'\n';}return result(output);
      }
      if(name==='cat'){const {flags,rest}=this.options(args,'n');let text=this.input(rest,stdin);if(flags.has('n'))text=lines(text).map((line,i)=>String(i+1).padStart(6)+'\t'+line).join('\n')+(text.endsWith('\n')?'\n':'');return result(text);}
      if(name==='echo'){
        let newline=true,escapes=false;while(args[0]==='-n'||args[0]==='-e'){if(args.shift()==='-n')newline=false;else escapes=true;}
        let text=args.join(' ');if(escapes)text=text.replace(/\\n/g,'\n').replace(/\\t/g,'\t').replace(/\\\\/g,'\\');return result(text+(newline?'\n':''));
      }
      if(name==='printf'){
        const format=(args.shift()||'').replace(/\\n/g,'\n').replace(/\\t/g,'\t');let i=0;
        return result(format.replace(/%([sd%])/g,(_,type)=>type==='%'?'%':type==='d'?String(Number(args[i++]||0)):String(args[i++]||'')));
      }
      if(name==='grep'){
        const {flags,rest}=this.options(args,'invFc');if(!rest.length)fail('grep: missing pattern',2);const pattern=rest.shift();
        if(pattern.length>200)fail('grep: pattern too long',2);
        // Restrict patterns with nested quantifiers to keep the UI responsive.
        if(!flags.has('F')&&(/[(){}]|\\[1-9]/.test(pattern)||/([+*?])\1/.test(pattern)))fail('grep: use a simple regex or -F for a literal pattern',2);
        let re;try{re=flags.has('F')?null:new RegExp(pattern,flags.has('i')?'i':'');}catch(_){fail('grep: invalid regular expression',2);}
        const text=this.input(rest,stdin);const matches=text?lines(text).map((line,i)=>({line,i})).filter(({line})=>{const matched=re?re.test(line):(flags.has('i')?line.toLowerCase().includes(pattern.toLowerCase()):line.includes(pattern));return flags.has('v')?!matched:matched;}):[];
        return result(flags.has('c')?matches.length+'\n':nl(matches.map(({line,i})=>(flags.has('n')?`${i+1}:`:'')+line).join('\n')),matches.length?0:1);
      }
      if(name==='head'||name==='tail'){
        let count=10;if(args[0]==='-n'){args.shift();count=Number(args.shift());}else if(/^-[0-9]+$/.test(args[0]))count=Number(args.shift().slice(1));
        if(!Number.isInteger(count)||count<0||count>100000)fail(`${name}: invalid line count`,2);
        const text=this.input(args,stdin),list=text?lines(text):[];return result(nl((name==='head'?list.slice(0,count):count?list.slice(-count):[]).join('\n')));
      }
      if(name==='wc'){
        const {flags,rest}=this.options(args,'lwc'),text=this.input(rest,stdin);const counts={l:(text.match(/\n/g)||[]).length,w:text.trim()?text.trim().split(/\s+/).length:0,c:new TextEncoder().encode(text).length};return result((flags.size?[...flags]:['l','w','c']).map(k=>counts[k]).join(' ')+'\n');
      }
      if(name==='sort'){const {flags,rest}=this.options(args,'nr');const text=this.input(rest,stdin),list=text?lines(text):[];list.sort(flags.has('n')?(a,b)=>Number.parseFloat(a)-Number.parseFloat(b):undefined);if(flags.has('r'))list.reverse();return result(nl(list.join('\n')));}
      if(name==='uniq'){const {flags,rest}=this.options(args,'c');const text=this.input(rest,stdin),groups=[];for(const line of text?lines(text):[]){if(groups.length&&groups[groups.length-1].line===line)groups[groups.length-1].count++;else groups.push({line,count:1});}return result(nl(groups.map(g=>(flags.has('c')?`${g.count} `:'')+g.line).join('\n')));}
      if(name==='find'){
        const start=this.path(args.length&&!args[0].startsWith('-')?args.shift():'.');let pattern='*',type=null;
        while(args.length){const opt=args.shift(),value=args.shift();if(opt==='-name'&&value!=null)pattern=value;else if(opt==='-type'&&['f','d'].includes(value))type=value;else fail('find: supported options: -name GLOB, -type f|d',2);}
        const tree=this.tree();if(!tree[start])fail(`find: ${start}: No such file or directory`);
        return result(nl(Object.keys(tree).filter(p=>(p===start||p.startsWith(start==='/'?'/':start+'/'))&&glob(pattern).test(p.split('/').pop())&&(!type||tree[p].type===(type==='f'?'file':'dir'))).sort().join('\n')));
      }
      if(name==='touch'){if(!args.length)fail('touch: missing file operand',2);for(const path of args){const full=this.writable(path);if(!this.files[full])this.writeFile(full,'');}return result();}
      if(name==='mkdir'){
        const {flags,rest}=this.options(args,'p');if(!rest.length)fail('mkdir: missing operand',2);
        for(const arg of rest){const full=this.path(arg);if(!full.startsWith(HOME+'/tmp/'))fail(`mkdir: ${arg}: Read-only filesystem`);const existing=this.tree()[full];if(existing){if(flags.has('p')&&existing.type==='dir')continue;fail(`mkdir: ${arg}: File exists`);}
          const parts=full.slice((HOME+'/tmp/').length).split('/');let current=HOME+'/tmp';const next={...this.files};for(let i=0;i<parts.length;i++){current+='/'+parts[i];const entry=this.tree()[current];if(entry?.type==='file')fail(`mkdir: ${current}: Not a directory`);if(!entry){if(!flags.has('p')&&i<parts.length-1)fail(`mkdir: ${arg}: No such directory`);next[current]={type:'dir',content:''};}}this.saveFiles(next);
        }return result();
      }
      if(name==='rm'){
        const {flags,rest}=this.options(args,'rf');if(!rest.length&&!flags.has('f'))fail('rm: missing operand',2);
        for(const arg of rest){const full=this.path(arg);if(!full.startsWith(HOME+'/tmp/'))fail(`rm: ${arg}: Read-only filesystem`);const entry=this.files[full];if(!entry){if(flags.has('f'))continue;fail(`rm: ${arg}: No such file or directory`);}if(entry.type==='dir'&&!flags.has('r'))fail(`rm: ${arg}: Is a directory`);const next={...this.files};for(const path of Object.keys(next))if(path===full||path.startsWith(full+'/'))delete next[path];this.saveFiles(next);}return result();
      }
      if(name==='cp'||name==='mv'){
        if(args.length!==2)fail(`${name}: expected SOURCE DESTINATION`,2);const source=this.path(args[0]),tree=this.tree(),entry=tree[source];if(!entry||entry.type!=='file')fail(`${name}: source must be a file`);if(name==='mv'&&!source.startsWith(HOME+'/tmp/'))fail('mv: source is read-only');
        const dest=this.path(args[1])+(tree[this.path(args[1])]?.type==='dir'?'/'+source.split('/').pop():'');if(dest===source)fail(`${name}: source and destination are the same file`);this.writeFile(dest,entry.content);if(name==='mv'){const next={...this.files};delete next[source];this.saveFiles(next);}return result();
      }
      if(name==='date'){if(args.length&& !['-I','--iso-8601'].includes(args[0]))fail('date: supported option: -I',2);return result((args.length?Core.dateKey():new Date().toString())+'\n');}
      if(name==='whoami')return result(this.env.USER+'\n');
      if(name==='hostname')return result('lifeos\n');
      if(name==='id'){if(!args.length)return result('uid=1000(producer) gid=1000(producer) groups=1000(producer)\n');if(args[0]==='-un')return result('producer\n');if(['-u','-g'].includes(args[0]))return result('1000\n');fail('id: unsupported option',2);}
      if(name==='uname'){const {flags}=this.options(args,'asrm');return result(flags.has('a')?'LifeOS Cyber-Kernel v3.9-vocaloid x86_64 GNU/Linux\n':nl([...flags.size?flags:['s']].map(k=>({s:'LifeOS',r:'3.9-vocaloid',m:'x86_64'})[k]).join(' ')));}
      if(name==='uptime')return result(`up ${Math.floor((Date.now()-this.started)/60000)} min, 1 user, browser shell\n`);
      if(name==='env')return result(nl(Object.entries(this.vars()).filter(([key])=>key!=='?').map(([key,value])=>`${key}=${value}`).join('\n')));
      if(name==='export'){for(const arg of args){const match=arg.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s);if(!match)fail(`export: ${arg}: invalid assignment`,2);if(['HOME','PWD','OLDPWD','?'].includes(match[1]))fail(`export: ${match[1]}: read-only variable`);this.env[match[1]]=match[2];}return result();}
      if(name==='alias'){if(!args.length)return result(nl(Object.entries(this.aliases).map(([key,value])=>`alias ${key}='${value}'`).join('\n')));for(const arg of args){const match=arg.match(/^([A-Za-z_][A-Za-z0-9_-]*)=(.*)$/s);if(!match)fail('alias: expected NAME=COMMAND',2);this.aliases[match[1]]=match[2];}return result();}
      if(name==='unalias'){for(const arg of args){if(!Object.prototype.hasOwnProperty.call(this.aliases,arg))fail(`unalias: ${arg}: not found`);delete this.aliases[arg];}return result();}
      if(name==='history'){if(args[0]==='-c'){this.hooks.clearHistory?.();return result();}return result(nl((this.hooks.history?.()||[]).map((line,i)=>`${String(i+1).padStart(5)}  ${line}`).join('\n')));}
      if(['clear','exit','matrix'].includes(name)){this.hooks[name]?.();return result();}
      if(name==='arcade'){if(args.length>1 || (args.length===1 && args[0]!=='breach'))fail('arcade: expected arcade [breach]',2);if(!this.hooks.arcade)fail('arcade: game interface unavailable');this.hooks.arcade();return result('BREACH PROTOCOL // Terminal opened.\n');}
      if(name==='sudo')return result('',1,'Permission denied: Miku is the only root user here.\n');
      if(name==='miku')return result('  /|  /\\_/\\  |\\\n ||  ( ^‿^ )  ||\n ||   /|39|\\  ||\n      /___\\\nOne small sync beats a perfect plan. You’ve got this, Producer!\n');
      if(name==='teto')return result("Baguette protocol initialized. Why aren't you working?\n");
      if(name==='stats')return result(this.stats());
      if(name==='theme'){
        if(!args.length)return result((Core.read().preferences.theme||'auto')+'\n');if(args.length!==1||!['miku','teto','auto'].includes(args[0]))fail('theme: expected miku, teto or auto',2);
        if(args[0]!=='auto')window.Weebokage?.setTheme(args[0], { manual: true });Core.update(s=>{if(args[0]==='auto')delete s.preferences.theme;else s.preferences.theme=args[0];},{activity:false});window.LifeOSShell?.syncTheme();return result(`theme: ${args[0]}\n`);
      }
      if(name==='vocaloid'||name==='dex'){
        if(!window.LifeOSDataStreams)fail('ERROR: Node unreachable — data module unavailable');
        return result(await window.LifeOSDataStreams.command(name,args));
      }
      if(name==='quest'||name==='habit'){
        const sub=args.shift(),collection=name==='quest'?'quests':'habits';
        if(sub==='ls'){
          let all=false,done=false,json=false;for(const arg of args){if(['-a','--all'].includes(arg))all=true;else if(arg==='--done')done=true;else if(arg==='--json')json=true;else fail(`${name} ls: unknown option ${arg}`,2);}
          const items=Core.read()[collection];const shown=items.map((item,i)=>({...item,number:i+1})).filter(item=>name==='habit'||all||(done?item.done:!item.done));
          return result(json?JSON.stringify(shown,null,2)+'\n':nl(shown.map(item=>`${String(item.number).padStart(3)} ${item.id} [${name==='quest'?(item.done?'x':' '):(item.days.includes(Core.dateKey())?'x':' ')}] ${item.title} (+${item.xp} XP)${name==='habit'?` streak=${Core.currentStreak(item.days)}`:''}`).join('\n')));
        }
        if(sub==='add'){
          let xp=name==='quest'?50:20,priority='medium',title=[],ended=false,explicitXP=false;
          for(let i=0;i<args.length;i++){const arg=args[i];if(!ended&&arg==='--'){ended=true;continue;}if(!ended&&(arg==='-x'||arg==='--xp'||arg.startsWith('--xp='))){xp=Number(arg.includes('=')?arg.slice(arg.indexOf('=')+1):args[++i]);explicitXP=true;continue;}if(name==='quest'&&!ended&&(arg==='-p'||arg==='--priority'||arg.startsWith('--priority='))){priority=arg.includes('=')?arg.slice(arg.indexOf('=')+1):args[++i];continue;}if(!ended&&arg.startsWith('-'))fail(`${name} add: unknown option ${arg}`,2);title.push(arg);}
          if(!explicitXP&&title.length>1&&/^[+-]?\d+(\.\d+)?$/.test(title[title.length-1]))xp=Number(title.pop());
          const text=title.join(' ').trim();if(!text||text.length>120||!Number.isInteger(xp)||xp<1||xp>500||!['high','medium','low'].includes(priority))fail(`${name} add: title required; XP 1–500; priority high|medium|low`,2);
          let id;Core.update(s=>{if(s[collection].length>=10000)fail(`${name}: record limit reached`);const item=name==='quest'?{id:Core.uid(),title:text,xp,priority,done:false,rewarded:false}:Core.newHabit(text,xp);id=item.id;s[collection].push(item);});return result(`${id}\n`);
        }
        if(sub==='show'&&name==='quest'&&args.length===1){const q=this.record(Core.read().quests,args[0]);return result(JSON.stringify(q,null,2)+'\n');}
        if(sub===(name==='quest'?'done':'check')&&args.length){
          return this.reward((s,award)=>{const items=args.map(id=>this.record(s[collection],id));let total=0;const output=[];for(const item of items){if(name==='quest'){if(item.done){output.push(`${item.id}: already complete`);continue;}item.done=true;item.completedOn=Core.dateKey();if(!item.rewarded){item.rewarded=true;total+=item.xp;}}
            else {const today=Core.dateKey();if(item.days.includes(today)){output.push(`${item.id}: already checked today`);continue;}item.days.push(today);if(!item.rewarded.includes(today)){item.rewarded.push(today);total+=item.xp;}}output.push(`${item.id}: completed`);}if(total)award(total);return output.join('\n');});
        }
        fail(`${name}: invalid subcommand; see man ${name}`,2);
      }
      if(name==='music'){
        if(!window.LifeOSMusic)fail('music: player is loading');return result(nl(await window.LifeOSMusic.command(args)));
      }
      fail(`${name}: command not found`,127);
    }
    parse(tokens) {
      const groups=[];let commands=[],current=[],redirect=null,condition=';';
      const finishCommand=()=>{if(!current.length&&!redirect)fail('sh: unexpected operator',2);commands.push({tokens:current,redirect});current=[];redirect=null;};
      for(let i=0;i<tokens.length;i++){
        const token=tokens[i];if(!token.op){current.push(token);continue;}
        if(['>','>>'].includes(token.op)){const target=tokens[++i];if(!target||target.op)fail('sh: missing redirect target',2);redirect={target,append:token.op==='>>'};continue;}
        finishCommand();if(token.op==='|')continue;
        groups.push({commands,condition});commands=[];condition=token.op;
      }
      if(current.length||redirect){finishCommand();groups.push({commands,condition});}
      else if(commands.length||tokens[tokens.length-1]?.op&&tokens[tokens.length-1].op!==';')fail('sh: unexpected end of command',2);
      return groups;
    }
    async run(line) {
      let stdout='',stderr='';let code=this.code;
      try {
        // Parse the complete line before executing any mutations.
        const groups=this.parse(this.lex(line));
        for(const group of groups){if(group.condition==='&&'&&code!==0||group.condition==='||'&&code===0)continue;
          let input='',last=result();
          for(const command of group.commands){
            try{
              if(command.redirect){const targets=this.expand([command.redirect.target]);if(targets.length!==1)fail('sh: ambiguous redirect');command.redirect.path=targets[0];this.writable(command.redirect.path);}
              last=await this.command(this.expand(command.tokens),input);
              if(command.redirect){this.writeFile(command.redirect.path,last.stdout,command.redirect.append);last.stdout='';}
            }catch(error){last=result('',error.code||1,(error.message||String(error))+'\n');}
            stderr+=last.stderr;input=last.stdout;
          }
          stdout+=last.stdout;code=last.code;this.code=code;
        }
      }catch(error){stderr+=(error.message||String(error))+'\n';code=error.code||2;}
      this.code=code;return {stdout,stderr,code};
    }
    complete(input) {
      const match=input.match(/(?:^|[\s|;&])([^\s|;&]*)$/);if(!match)return [];
      const word=match[1],before=input.slice(0,input.length-word.length);
      if(!before.trim()||/[|;&]\s*$/.test(before))return [...new Set([...Object.keys(manual),'status',...Object.keys(this.aliases)])].filter(c=>c.startsWith(word)).sort().map(c=>before+c+' ');
      if(/(?:^|[|;&]\s*)vocaloid\s+[^\s]*$/.test(input))return ['random','find'].filter(value=>value.startsWith(word)).map(value=>before+value+' ');
      if(/(?:^|[|;&]\s*)dex\s+[^\s]*$/.test(input))return ['list',...(window.LifeOSDataStreams?.caught()||[]).map(p=>p.name)].filter(value=>value.startsWith(word)).map(value=>before+value+' ');
      if(/\b(?:quest done|quest show|habit check)\s+[^\s]*$/.test(input)){const items=Core.read()[input.includes('habit check')?'habits':'quests'];return items.filter(item=>item.id.startsWith(word)).map(item=>before+item.id+' ');}
      const slash=word.lastIndexOf('/'),prefix=slash<0?'':word.slice(0,slash+1),name=word.slice(slash+1),directory=this.path(prefix||'.');
      return Object.entries(this.tree()).filter(([p])=>(p.slice(0,p.lastIndexOf('/'))||'/')===directory&&p.split('/').pop().startsWith(name)).map(([p,file])=>before+prefix+p.split('/').pop()+(file.type==='dir'?'/':' ')).sort();
    }
  }
  window.LifeOSShellEngine=Shell;
})();
