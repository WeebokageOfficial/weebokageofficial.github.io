(() => {
  'use strict';
  const db=window.WCU_DATABASE;
  const $=selector=>document.querySelector(selector);
  const view=$('#wcu-view'),summary=$('#wcu-filter-summary');
  let projects=new Map(db.projects.map(p=>[p.id,p])),characters=new Map(db.characters.map(c=>[c.id,c])),eras=new Map(db.timelines.map(t=>[t.id,t]));
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text=value=>Array.isArray(value)?value.join(' '):String(value??'');
  const paragraphs=value=>(Array.isArray(value)?value:[value]).filter(Boolean).map(p=>`<p>${wiki(p)}</p>`).join('');
  const label=key=>key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,c=>c.toUpperCase());
  let state,lastIndex=null,searchTimer;
  function params(){const q=new URLSearchParams();if(state.q)q.set('q',state.q);if(state.era!=='all')q.set('era',state.era);if(state.status!=='all')q.set('status',state.status);return q.size?'?'+q.toString():'';}
  function href(type,id){return '#/'+type+(id?'/'+encodeURIComponent(id):'')+params();}
  function entryLink(type,id,title){const entry=(type==='project'?projects:characters).get(id);return entry?`<a class="wcu-wikilink" href="${esc(href(type,id))}">${esc(title||entry.title||entry.name)}</a>`:`<span class="wcu-undocumented">${esc(title||id)} <small>(record pending)</small></span>`;}
  // Only this small wiki-link syntax produces markup; all supplied prose is escaped.
  function wiki(value){return String(value??'').split(/(\[\[(?:project|character):[^\]]+\]\])/g).map(part=>{
    const match=part.match(/^\[\[(project|character):([^|\]]+)(?:\|([^\]]+))?\]\]$/);
    return match?entryLink(match[1],match[2],match[3]):esc(part);
  }).join('');}
  let aliases=[...db.characters.flatMap(c=>[c.name,...c.aliases||[]].map(name=>({name,id:c.id})))].sort((a,b)=>b.name.length-a.name.length);
  // Infobox names become links without requiring HTML or wiki syntax in the data.
  function infoValue(value){
    const str=String(value??'');if(str.includes('[['))return wiki(str);
    if(!aliases.length)return esc(str);
    const pattern=new RegExp('('+[...new Set(aliases.map(a=>a.name))].map(n=>n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')','g');
    let previous=0,result='';
    for(const match of str.matchAll(pattern)){
      const start=match.index,end=start+match[0].length;
      if((start>0 && /[\p{L}\p{N}]/u.test(str[start-1])) || (end<str.length && /[\p{L}\p{N}]/u.test(str[end])))continue;
      result+=esc(str.slice(previous,start))+entryLink('character',aliases.find(a=>a.name===match[0]).id,match[0]);previous=end;
    }
    return result+esc(str.slice(previous));
  }
  function projectMatches(p){
    return (state.era==='all'||p.timelineId===state.era) && (state.status==='all'||p.status===state.status) && matches([p.title,p.subtitle,p.status,p.synopsis,Object.values(p.infobox||{}),...(p.sections||[]).map(s=>s.title+' '+s.content),...(p.characterIds||[]).map(id=>{const c=characters.get(id);return c?[c.name,...c.aliases||[]].join(' '):id;})]);
  }
  function matches(values){const haystack=values.map(text).join(' ').toLocaleLowerCase('en');return state.q.toLocaleLowerCase('en').split(/\s+/).filter(Boolean).every(word=>haystack.includes(word));}
  function appearances(id){return db.projects.filter(p=>(p.characterIds||[]).includes(id));}
  function characterMatches(c){const stories=appearances(c.id);return (state.era==='all'&&state.status==='all'||stories.some(p=>(state.era==='all'||p.timelineId===state.era)&&(state.status==='all'||p.status===state.status))) && matches([c.name,c.subtitle,c.summary,c.aliases||[],Object.values(c.infobox||{}),...(c.sections||[]).map(s=>s.title+' '+s.content),...stories.map(p=>p.title)]);}
  const badge=status=>`<span class="wcu-badge ${status==='Published'?'is-published':''}">${esc(status||'Archive record')}</span>`;
  function projectCard(p,index){const era=eras.get(p.timelineId);return `<article class="wcu-project-card"><div class="wcu-card-top"><span class="wcu-record-id">${String(index+1).padStart(2,'0')} // ${esc(era?.era||'Unassigned era')}</span>${badge(p.status)}</div><h3><a href="${esc(href('project',p.id))}">${esc(p.title)} <span aria-hidden="true">↗</span></a></h3><p class="wcu-card-subtitle">${esc(p.subtitle)}</p><p class="wcu-card-summary">${esc(text(p.synopsis))}</p><div class="wcu-card-bottom"><span>${(p.characterIds||[]).filter(id=>characters.has(id)).length} characters</span><a href="${esc(href('project',p.id))}" aria-label="Open ${esc(p.title)} dossier">Read dossier →</a></div></article>`;}
  function characterCard(c){return `<article class="wcu-character-card"><span class="wcu-character-monogram" aria-hidden="true">${esc(c.name.split(' ').filter(s=>s!=='Dr.').map(n=>n[0]).slice(0,2).join(''))}</span><div><h3><a href="${esc(href('character',c.id))}">${esc(c.name)}</a></h3><p>${esc(c.subtitle)}</p><small>${appearances(c.id).length} ${appearances(c.id).length===1?'appearance':'appearances'}</small></div><a class="wcu-card-arrow" href="${esc(href('character',c.id))}" aria-label="Open ${esc(c.name)} dossier">↗</a></article>`;}
  function empty(message){return `<div class="wcu-empty"><span aria-hidden="true">⌕</span><h3>No matching records</h3><p>${esc(message||'Try another search or reset the timeline and status filters.')}</p><button type="button" data-reset>Reset filters</button></div>`;}
  function title(kicker,heading,description){return `<header class="wcu-view-heading"><span class="eyebrow">${esc(kicker)}</span><h2 tabindex="-1" id="wcu-view-title">${esc(heading)}</h2><p>${esc(description)}</p></header>`;}
  function timeline(){
    const found=db.projects.filter(projectMatches);
    return title('01 // NARRATIVE CHRONOLOGY','The connected timelines','Explore by narrative era. These branches are not a publication schedule or a single dated sequence.')+`<div class="wcu-era-switch" role="group" aria-label="Select timeline"><button type="button" data-era="all" aria-pressed="${state.era==='all'}">All eras <span>${db.projects.length}</span></button>${db.timelines.map(t=>`<button type="button" data-era="${esc(t.id)}" aria-pressed="${state.era===t.id}">${esc(t.name)} <span>${db.projects.filter(p=>p.timelineId===t.id).length}</span></button>`).join('')}</div>`+(found.length?`<div class="wcu-timeline">${db.timelines.filter(t=>state.era==='all'||state.era===t.id).map(t=>{const entries=found.filter(p=>p.timelineId===t.id);return entries.length?`<section class="wcu-era-block" aria-labelledby="era-${esc(t.id)}"><header class="wcu-era-heading"><span class="wcu-timeline-node" aria-hidden="true"></span><span class="wcu-era-date">${esc(t.era)}</span><h3 id="era-${esc(t.id)}">${esc(t.name)}</h3><p>${esc(t.description||'')}</p></header><div class="wcu-project-grid">${entries.map(projectCard).join('')}</div></section>`:'';}).join('')}</div>`:empty());
  }
  function index(kind){const story=kind==='projects',entries=(story?db.projects:db.characters).filter(story?projectMatches:characterMatches);return title(story?'02 // STORY INDEX':'03 // CHARACTER INDEX',story?'Stories & projects':'People across the multiverse',story?'Published stories, works in development, and alternate branches. Open a record to explore its canon.':'Character dossiers, story appearances, and connections across the WCU.')+(entries.length?`<div class="${story?'wcu-project-grid':'wcu-character-grid'}">${entries.map(story?projectCard:characterCard).join('')}</div>`:empty());}
  function search(){const stories=db.projects.filter(projectMatches),people=db.characters.filter(characterMatches);return title('ARCHIVE // GLOBAL SEARCH',`Results for “${state.q}”`,'Search covers titles, aliases, synopses, dossier sections, infoboxes, and character appearances.')+(!stories.length&&!people.length?empty():`<section class="wcu-search-group"><h3>Stories & projects <span>${stories.length}</span></h3>${stories.length?`<div class="wcu-project-grid">${stories.map(projectCard).join('')}</div>`:'<p class="wcu-muted">No matching stories.</p>'}</section><section class="wcu-search-group"><h3>Characters <span>${people.length}</span></h3>${people.length?`<div class="wcu-character-grid">${people.map(characterCard).join('')}</div>`:'<p class="wcu-muted">No matching characters.</p>'}</section>`);}
  function infobox(entry,kind){const story=kind==='project',era=story?eras.get(entry.timelineId):null;return `<aside class="wcu-infobox" aria-label="${esc(entry.title||entry.name)} quick facts"><div class="wcu-infobox-banner"><span aria-hidden="true">${story?'▤':'◈'}</span><small>${story?'STORY RECORD':'CHARACTER RECORD'}</small><strong>${esc(entry.title||entry.name)}</strong>${story?badge(entry.status):'<span class="wcu-badge">WCU incarnation</span>'}</div><dl>${era?`<div><dt>Timeline</dt><dd><a href="${esc('#/timeline?era='+encodeURIComponent(era.id))}">${esc(era.name)}</a><small>${esc(era.era)}</small></dd></div>`:''}${(entry.aliases||[]).length?`<div><dt>Also known as</dt><dd>${esc(entry.aliases.join(', '))}</dd></div>`:''}${Object.entries(entry.infobox||{}).map(([key,value])=>`<div><dt>${esc(label(key))}</dt><dd>${infoValue(value)}</dd></div>`).join('')}</dl><p class="wcu-record-key">RECORD // ${esc(entry.id)}</p></aside>`;}
  function relatedProjects(p){return db.projects.filter(other=>other.id!==p.id&&((p.connectedProjectIds||[]).includes(other.id)||(other.connectedProjectIds||[]).includes(p.id)));}
  function dossier(kind,id){
    const story=kind==='project',entry=(story?projects:characters).get(id);
    if(!entry)return title('ARCHIVE // RECORD NOT FOUND','This record is not in the archive','The link may refer to a planned entry, or the record ID may have changed.')+`<a class="wcu-return" href="${esc(href(story?'projects':'characters'))}">← Browse ${story?'stories':'characters'}</a>`;
    const name=entry.title||entry.name,sections=entry.sections||[],cast=(entry.characterIds||[]).map(id=>characters.get(id)).filter(Boolean),related=story?relatedProjects(entry):appearances(id),relationships=(entry.relationships||[]);
    const toc=[['overview','Overview'],...sections.map((s,i)=>['section-'+i,s.title]),...(story&&cast.length?[['cast','Characters']]:[]),...(!story&&relationships.length?[['relationships','Relationships']]:[]),...(related.length?[[story?'connected':'appearances',story?'Connected projects':'Story appearances']]:[])];
    const returnHref=lastIndex&&/^#\/(timeline|projects|characters|search)(?:\?|$)/.test(lastIndex)?lastIndex:href(state.q?'search':story?'projects':'characters');
    return `<nav class="wcu-breadcrumbs" aria-label="Dossier breadcrumb"><a href="${esc(returnHref)}">← Back to archive</a><span aria-hidden="true">/</span><span>${story?'Story dossier':'Character dossier'}</span></nav><article class="wcu-dossier"><header class="wcu-dossier-heading"><span class="eyebrow">${story?'LITERARY ARCHIVE':'CHARACTER ARCHIVE'} // ${esc(entry.id)}</span><div><h2 tabindex="-1" id="wcu-view-title">${esc(name)}</h2><button type="button" class="wcu-copy-link" data-wcu-edit hidden>Edit dossier ✎</button><button type="button" class="wcu-copy-link" data-copy-link>Copy link ↗</button></div><p>${esc(entry.subtitle||'')}</p><span id="wcu-copy-status" role="status" aria-live="polite"></span></header><div class="wcu-wiki-layout">${infobox(entry,kind)}<div class="wcu-article-body"><section id="wiki-overview"><h3 tabindex="-1">Overview</h3>${paragraphs(story?entry.synopsis:entry.summary)}</section>${story&&entry.amazonUrl&&safeUrl(entry.amazonUrl)?`<a class="amazon-cta" href="${esc(safeUrl(entry.amazonUrl))}" target="_blank" rel="noopener noreferrer"><img src="assets/brands/amazon.svg" width="25" height="25" alt="Amazon"><span>GET ON AMAZON <small>PAPERBACK &amp; KINDLE</small></span><span aria-hidden="true">↗</span></a>`:''}<nav class="wcu-contents" aria-label="Dossier contents"><strong>Contents</strong><ol>${toc.map(([key,title])=>`<li><button type="button" data-section="wiki-${key}">${esc(title)}</button></li>`).join('')}</ol></nav>${sections.map((section,i)=>`<section class="wcu-wiki-section" id="wiki-section-${i}"><h3 tabindex="-1">${esc(section.title)}</h3>${paragraphs(section.content)}</section>`).join('')}${story&&cast.length?`<section class="wcu-wiki-section" id="wiki-cast"><h3 tabindex="-1">Characters</h3><div class="wcu-character-grid">${cast.map(characterCard).join('')}</div></section>`:''}${!story&&relationships.length?`<section class="wcu-wiki-section" id="wiki-relationships"><h3 tabindex="-1">Relationships</h3><dl class="wcu-relationships">${relationships.map(r=>`<div><dt>${entryLink('character',r.characterId)}</dt><dd><strong>${esc(r.type)}</strong><p>${wiki(r.description||'')}</p></dd></div>`).join('')}</dl></section>`:''}${related.length?`<section class="wcu-wiki-section" id="wiki-${story?'connected':'appearances'}"><h3 tabindex="-1">${story?'Connected projects':'Story appearances'}</h3><ul class="wcu-related-list">${related.map(p=>`<li><div>${entryLink('project',p.id)}<p>${esc(p.subtitle)}</p></div>${badge(p.status)}</li>`).join('')}</ul></section>`:''}<p class="wcu-dossier-note">This record reflects the supplied WCU summaries. Alternate-timeline connections are identified explicitly; undocumented details are left open.</p></div></div></article>`;
  }
  function safeUrl(value){try{const url=new URL(value);return url.protocol==='https:'?url.href:null;}catch(_){return null;}}
  function readRoute(){const hash=location.hash.replace(/^#\/?/,'')||'timeline',path=hash.split('?')[0],q=new URLSearchParams(hash.includes('?')?hash.slice(hash.indexOf('?')+1):'');const parts=path.split('/');let id='';try{id=decodeURIComponent(parts[1]||'');}catch(_){id='';}return {view:['timeline','projects','characters','search','project','character'].includes(parts[0])?parts[0]:'unknown',id,q:(q.get('q')||'').slice(0,200),era:eras.has(q.get('era'))?q.get('era'):'all',status:db.projects.some(p=>p.status===q.get('status'))?q.get('status'):'all'};}
  function render({focus=false}={}){
    const access=window.WCUStore?.status;
    const allowed=Boolean(access?.canEdit&&access.ready&&!access.problem);
    $('#wcu-main').hidden=!allowed;$('#wcu-access').hidden=allowed;
    if(!allowed){
      view.replaceChildren();summary.textContent='';
      $('#wcu-access-message').textContent=access?.problem||(!access?.ready?'Checking administrator access…':'This archive is available to the administrator only.');
      document.title='Private archive // Weebokage';
      window.dispatchEvent(new Event('wcu-view-rendered'));return;
    }
    state=readRoute();if(!['project','character','unknown'].includes(state.view))lastIndex=location.hash||'#/timeline';
    $('#wcu-search').value=state.q;$('#wcu-era').value=state.era;$('#wcu-status').value=state.status;
    document.querySelectorAll('[data-view]').forEach(a=>{a.href=href(a.dataset.view);const active=a.dataset.view===state.view||(state.view==='project'&&a.dataset.view==='projects')||(state.view==='character'&&a.dataset.view==='characters');if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    const stories=db.projects.filter(projectMatches),people=db.characters.filter(characterMatches),isDossier=['project','character'].includes(state.view);
    summary.textContent=isDossier?'DOSSIER // Follow linked names to explore connected records.':`${stories.length} ${stories.length===1?'story':'stories'} · ${people.length} ${people.length===1?'character':'characters'}${state.q?' · matching “'+state.q+'”':''}`;
    view.innerHTML=state.view==='timeline'?timeline():state.view==='projects'||state.view==='characters'?index(state.view):state.view==='search'?search():isDossier?dossier(state.view,state.id):title('ARCHIVE // UNKNOWN VIEW','This archive view does not exist','Choose Timeline, Stories & projects, or Characters from the archive navigation.');
    const entry=(state.view==='project'?projects:characters).get(state.id);document.title=`${isDossier&&entry?(entry.title||entry.name)+' // ':''}WCU // Weebokage Cinematic Universe`;
    window.dispatchEvent(new Event('wcu-view-rendered'));
    if(focus){const heading=$('#wcu-view-title');heading?.focus({preventScroll:true});$('.wcu-content').scrollIntoView({behavior:'instant',block:'start'});}
  }
  function go(hash,{replace=false,focus=false}={}){
    if(replace){history.replaceState(null,'',hash);syncOuterUrl();render({focus});}
    else if(location.hash===hash)render({focus});
    else location.hash=hash;
  }
  // The outer shell owns the visible address bar; keep dossier permalinks shareable.
  function syncOuterUrl(){if(parent===window)return;try{if(parent.LifeOSShell){const url=new URL('wcu.html',location.href);url.hash=location.hash;parent.history.replaceState({lifeosShell:true},'',url.pathname+url.search+url.hash);parent.document.title=document.title;}}catch(_){/* Standalone and restricted frames remain usable. */}}
  function reset(){clearTimeout(searchTimer);state.q='';state.era='all';state.status='all';go(href(['project','character','search'].includes(state.view)?'timeline':state.view),{replace:true});}
  function refreshIndexes(){
    projects=new Map(db.projects.map(p=>[p.id,p]));characters=new Map(db.characters.map(c=>[c.id,c]));eras=new Map(db.timelines.map(t=>[t.id,t]));
    aliases=[...db.characters.flatMap(c=>[c.name,...c.aliases||[]].map(name=>({name,id:c.id})))].sort((a,b)=>b.name.length-a.name.length);
    $('#wcu-era').innerHTML='<option value="all">All timelines</option>';
    $('#wcu-status').innerHTML='<option value="all">All statuses</option>';
  $('#wcu-stats').innerHTML=[['timelines',db.timelines.length],['stories',db.projects.length],['characters',db.characters.length]].map(([label,count])=>`<div><strong>${count}</strong><span>${label}</span></div>`).join('');
  $('#wcu-era').insertAdjacentHTML('beforeend',db.timelines.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join(''));
  $('#wcu-status').insertAdjacentHTML('beforeend',[...new Set(db.projects.map(p=>p.status).filter(Boolean))].map(status=>`<option>${esc(status)}</option>`).join(''));
  }
  refreshIndexes();
  addEventListener('wcu-data-updated',()=>{refreshIndexes();render();syncOuterUrl();});
  window.WCUStore?.subscribe(()=>{render();syncOuterUrl();});
  $('#wcu-search').addEventListener('input',event=>{clearTimeout(searchTimer);const query=event.target.value;searchTimer=setTimeout(()=>{state.q=query.trim();go(href(state.q?'search':'timeline'),{replace:true});},160);});
  $('#wcu-era').addEventListener('change',event=>{clearTimeout(searchTimer);state.era=event.target.value;go(href(['project','character'].includes(state.view)?'timeline':state.view));});
  $('#wcu-status').addEventListener('change',event=>{clearTimeout(searchTimer);state.status=event.target.value;go(href(['project','character'].includes(state.view)?'projects':state.view));});
  $('#wcu-reset').addEventListener('click',reset);
  document.addEventListener('click',async event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-reset'))reset();
    if(button.hasAttribute('data-era')){state.era=button.dataset.era;go(href('timeline'));}
    if(button.dataset.section){const section=document.getElementById(button.dataset.section);section?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});section?.querySelector('h3')?.focus({preventScroll:true});}
    if(button.hasAttribute('data-copy-link')){
      const url=new URL('wcu.html',location.href);url.hash=location.hash;
      const status=$('#wcu-copy-status');
      try{await navigator.clipboard.writeText(url.href);if(status?.isConnected)status.textContent='Dossier link copied.';}catch(_){if(status?.isConnected)status.textContent='Copy this dossier URL: '+url.href;}
    }
  });
  // Cancel pending search work before a new record is opened.
  document.addEventListener('click',event=>{if(event.target.closest('a[href^="#/"]'))clearTimeout(searchTimer);});
  addEventListener('hashchange',()=>{render({focus:true});syncOuterUrl();});
  render({focus:['project','character'].includes(readRoute().view)});syncOuterUrl();
})();
