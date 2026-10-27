/* Owner-facing structured editing; published writes are protected by Firestore rules. */
(() => {
  'use strict';
  const store=window.WCUStore;if(!store)return;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clone=value=>JSON.parse(JSON.stringify(value));
  const text=value=>Array.isArray(value)?value.join('\n\n'):value||'';
  const prose=value=>value.trim().split(/\n\s*\n/).filter(Boolean);
  let draft,kind='projects',id='',baseRevision=0,dirty=false,busy=false;
  const dialog=document.createElement('dialog');dialog.id='wcu-editor';dialog.setAttribute('aria-labelledby','wcu-editor-title');
  dialog.innerHTML=`<header class="wcu-editor-heading"><div><span class="eyebrow">OWNER // CANON EDITOR</span><h2 id="wcu-editor-title">Edit the archive</h2></div><button type="button" data-editor-close aria-label="Close editor">×</button></header><p class="wcu-editor-intro">Saved changes stay in the private administrator archive. Paragraphs support [[character:id|label]] and [[project:id]] links.</p><div class="wcu-editor-selectors"><label>Record type<select id="wcu-edit-kind"><option value="projects">Stories & projects</option><option value="characters">Characters</option><option value="timelines">Timelines</option></select></label><label>Record<select id="wcu-edit-record"></select></label><button type="button" data-editor-new>+ New record</button></div><form id="wcu-edit-form"><div id="wcu-editor-fields"></div><div class="wcu-editor-actions"><button type="submit" id="wcu-publish">Publish changes</button><button type="button" data-editor-export>Download backup</button><button type="button" data-editor-import>Import backup</button><input type="file" id="wcu-import-file" accept="application/json,.json" hidden><button type="button" data-editor-delete class="wcu-editor-delete">Delete record</button></div></form><p id="wcu-editor-status" role="status" aria-live="polite"></p>`;
  document.body.append(dialog);
  const $=selector=>dialog.querySelector(selector), fields=$('#wcu-editor-fields'),form=$('#wcu-edit-form');
  const field=(label,name,value,attrs='')=>`<label>${label}<input name="${name}" value="${esc(value)}" ${attrs}></label>`;
  const area=(label,name,value)=>`<label>${label}<textarea name="${name}" rows="5" maxlength="20000">${esc(text(value))}</textarea></label>`;
  const choices=(entries,selected)=>entries.map(e=>`<option value="${esc(e.id)}" ${e.id===selected?'selected':''}>${esc(e.title||e.name)}</option>`).join('');
  function current(){return draft[kind].find(e=>e.id===id);}
  function status(message){$('#wcu-editor-status').textContent=message;}
  function reflect(){
    const allowed=store.status.canEdit;
    document.querySelectorAll('#wcu-manage,[data-wcu-edit]').forEach(button=>{button.hidden=!allowed;});
    if(!allowed){dirty=false;draft=null;fields.replaceChildren();$('#wcu-edit-record').replaceChildren();if(dialog.open)dialog.close();$('#wcu-publish').disabled=true;}
  }
  store.subscribe(reflect);addEventListener('wcu-view-rendered',reflect);
  function sectionRow(section={title:'',content:''}){return `<div class="wcu-edit-section" data-section-row>${field('Section heading','section-title',section.title,'required maxlength="250"')}${area('Section text','section-content',section.content)}<button type="button" data-remove-row>Remove section</button></div>`;}
  function factRow(key='',value=''){return `<div class="wcu-edit-fact" data-fact-row>${field('Fact key','fact-key',key,'required maxlength="80" placeholder="mainProtagonist"')}${field('Value','fact-value',value,'maxlength="2000"')}<button type="button" data-remove-row aria-label="Remove fact">×</button></div>`;}
  function relationRow(relation={characterId:'',type:'',description:''}){return `<div class="wcu-edit-section" data-relation-row><label>Character<select name="relation-character">${choices(draft.characters,relation.characterId)}</select></label>${field('Connection type','relation-type',relation.type,'maxlength="250"')}${area('Description','relation-description',relation.description)}<button type="button" data-remove-row>Remove relationship</button></div>`;}
  function checkList(name,entries,selected=[]){return `<div class="wcu-edit-checklist">${entries.map(e=>`<label><input type="checkbox" name="${name}" value="${esc(e.id)}" ${selected.includes(e.id)?'checked':''}> ${esc(e.title||e.name)}</label>`).join('')||'<p>No records to link yet.</p>'}</div>`;}
  function syncSelectors(){
    $('#wcu-edit-kind').value=kind;
    $('#wcu-edit-record').innerHTML=choices(draft[kind],id);
    if(!current()){id=draft[kind][0]?.id||'';$('#wcu-edit-record').value=id;}
  }
  function renderFields(){
    syncSelectors();const entry=current();
    if(!entry){fields.innerHTML='<p>No records in this group. Add a new record to begin.</p>';$('#wcu-publish').disabled=true;return;}
    $('#wcu-publish').disabled=!store.status.canEdit;
    const story=kind==='projects',character=kind==='characters';
    fields.innerHTML=`<div class="wcu-editor-grid">${field('Record ID','id',entry.id,'required readonly pattern="[-a-z0-9]{1,100}" maxlength="100"')}${field(story?'Title':'Name','name',entry.title||entry.name,'required maxlength="250"')}</div>`;
    if(!story&&!character){fields.insertAdjacentHTML('beforeend',field('Era label','era',entry.era,'required maxlength="250"')+area('Introduction','description',entry.description));return;}
    fields.insertAdjacentHTML('beforeend',field('Subtitle','subtitle',entry.subtitle,'maxlength="500"'));
    if(story)fields.insertAdjacentHTML('beforeend',`<div class="wcu-editor-grid">${field('Status','status',entry.status,'required maxlength="100"')}<label>Timeline<select name="timelineId" required>${choices(draft.timelines,entry.timelineId)}</select></label></div>${field('Amazon purchase URL (optional)','amazonUrl',entry.amazonUrl,'type="url" maxlength="2000"')}`);
    else fields.insertAdjacentHTML('beforeend',field('Aliases (comma-separated)','aliases',(entry.aliases||[]).join(', '),'maxlength="4000"'));
    fields.insertAdjacentHTML('beforeend',area(story?'Synopsis (blank lines separate paragraphs)':'Biography (blank lines separate paragraphs)','overview',story?entry.synopsis:entry.summary)+`<fieldset><legend>Quick facts</legend><div data-facts>${Object.entries(entry.infobox||{}).map(([k,v])=>factRow(k,v)).join('')}</div><button type="button" data-add-fact>+ Add fact</button></fieldset><fieldset><legend>Dossier sections</legend><div data-sections>${(entry.sections||[]).map(sectionRow).join('')}</div><button type="button" data-add-section>+ Add section</button></fieldset>`);
    if(story)fields.insertAdjacentHTML('beforeend',`<fieldset><legend>Characters</legend>${checkList('characterIds',draft.characters,entry.characterIds)}</fieldset><fieldset><legend>Connected projects</legend>${checkList('connectedProjectIds',draft.projects.filter(p=>p.id!==id),entry.connectedProjectIds)}</fieldset>`);
    else fields.insertAdjacentHTML('beforeend',`<fieldset><legend>Relationships</legend><div data-relations>${(entry.relationships||[]).map(relationRow).join('')}</div><button type="button" data-add-relation>+ Add relationship</button></fieldset>`);
  }
  function capture(){
    const previous=current();if(!previous)return;
    const values=new FormData(form),nextId=String(values.get('id')).trim();
    if(nextId!==id)throw Error('Record IDs stay stable to preserve existing links. Use a new record for a different ID.');
    const entry=clone(previous);entry[kind==='projects'?'title':'name']=String(values.get('name')).trim();
    if(kind==='timelines'){entry.era=String(values.get('era')).trim();entry.description=String(values.get('description')).trim();}
    else{
      entry.subtitle=String(values.get('subtitle')).trim();entry[kind==='projects'?'synopsis':'summary']=prose(String(values.get('overview')));
      const facts={};for(const row of fields.querySelectorAll('[data-fact-row]')){const key=row.querySelector('[name=fact-key]').value.trim();if(Object.hasOwn(facts,key))throw Error('Quick fact keys must be unique.');Object.defineProperty(facts,key,{value:row.querySelector('[name=fact-value]').value,enumerable:true,configurable:true,writable:true});}entry.infobox=facts;
      entry.sections=[...fields.querySelectorAll('[data-section-row]')].map(row=>({title:row.querySelector('[name=section-title]').value.trim(),content:prose(row.querySelector('[name=section-content]').value)}));
      if(kind==='projects'){entry.status=String(values.get('status')).trim();entry.timelineId=String(values.get('timelineId'));entry.amazonUrl=String(values.get('amazonUrl')).trim();entry.characterIds=values.getAll('characterIds');entry.connectedProjectIds=values.getAll('connectedProjectIds');}
      else{entry.aliases=String(values.get('aliases')).split(',').map(a=>a.trim()).filter(Boolean);entry.relationships=[...fields.querySelectorAll('[data-relation-row]')].map(row=>({characterId:row.querySelector('[name=relation-character]').value,type:row.querySelector('[name=relation-type]').value.trim(),description:row.querySelector('[name=relation-description]').value.trim()}));}
    }
    draft[kind][draft[kind].findIndex(e=>e.id===id)]=entry;
  }
  function captureSafe(){try{capture();return true;}catch(error){status(error.message);return false;}}
  function open(type,recordId){
    if(!store.status.canEdit)return;
    draft=clone(window.WCU_DATABASE);kind=type||'projects';id=recordId||draft[kind][0]?.id||'';baseRevision=store.status.revision;dirty=false;busy=false;
    renderFields();status(store.status.problem||'Changes stay in this draft until you publish.');dialog.showModal();
  }
  function close(){if(busy)return;if(dirty&&!confirm('Discard your unpublished archive changes?'))return;dirty=false;dialog.close();}
  document.getElementById('wcu-manage').addEventListener('click',()=>open());
  document.addEventListener('click',event=>{if(!event.target.closest('[data-wcu-edit]'))return;const route=location.hash.slice(2).split('?')[0].split('/');let entryId;try{entryId=decodeURIComponent(route[1]);}catch(_){return;}open(route[0]==='character'?'characters':'projects',entryId);});
  $('#wcu-edit-kind').addEventListener('change',event=>{if(!captureSafe()){event.target.value=kind;return;}kind=event.target.value;id=draft[kind][0]?.id||'';renderFields();});
  $('#wcu-edit-record').addEventListener('change',event=>{if(!captureSafe()){event.target.value=id;return;}id=event.target.value;renderFields();});
  dialog.addEventListener('input',event=>{if(event.target.id!=='wcu-import-file')dirty=true;});
  dialog.addEventListener('change',event=>{if(event.target.id!=='wcu-import-file')dirty=true;});
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button||busy)return;
    if(button.hasAttribute('data-editor-close'))close();
    if(button.hasAttribute('data-add-fact')){$('[data-facts]').insertAdjacentHTML('beforeend',factRow());dirty=true;}
    if(button.hasAttribute('data-add-section')){$('[data-sections]').insertAdjacentHTML('beforeend',sectionRow());dirty=true;}
    if(button.hasAttribute('data-add-relation')){$('[data-relations]').insertAdjacentHTML('beforeend',relationRow());dirty=true;}
    if(button.hasAttribute('data-remove-row')){button.parentElement.remove();dirty=true;}
    if(button.hasAttribute('data-editor-new')){
      if(!captureSafe())return;
      const newId=prompt('New record ID (lowercase letters, digits, and hyphens):');if(!newId)return;
      if(!/^[-a-z0-9]{1,100}$/.test(newId)||draft[kind].some(e=>e.id===newId)){status('Choose a unique lowercase record ID.');return;}
      const record=kind==='timelines'?{id:newId,name:'New timeline',era:'New era',description:''}:kind==='characters'?{id:newId,name:'New character',subtitle:'',summary:'',aliases:[],infobox:{},sections:[],relationships:[]}:{id:newId,title:'New story',subtitle:'',status:'In Development',timelineId:draft.timelines[0]?.id||'',synopsis:'',infobox:{},sections:[],characterIds:[],connectedProjectIds:[]};
      draft[kind].push(record);id=newId;dirty=true;renderFields();status('New record added to your draft. Fill in its details, then publish.');
    }
    if(button.hasAttribute('data-editor-delete')){
      const entry=current();if(!entry||!confirm(`Delete “${entry.title||entry.name}” from the archive?`))return;
      const proposed=clone(draft);proposed[kind]=proposed[kind].filter(e=>e.id!==id);
      try{store.validate(proposed);}catch(error){status('Remove references to this record before deleting it. '+error.message);return;}
      draft=proposed;id=draft[kind][0]?.id||'';dirty=true;renderFields();$('#wcu-publish').disabled=!store.status.canEdit;status('Record removed from your draft. Publish to apply the deletion.');
    }
    if(button.hasAttribute('data-editor-import'))$('#wcu-import-file').click();
    if(button.hasAttribute('data-editor-export')){
      if(!captureSafe())return;
      const url=URL.createObjectURL(new Blob([JSON.stringify(draft,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='wcu-archive.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
  });
  $('#wcu-import-file').addEventListener('change',async event=>{
    const file=event.target.files[0];if(!file)return;
    try{
      if(!store.status.canEdit)throw Error('Administrator access is required.');
      if(file.size>850000)throw Error('The backup is too large.');
      const imported=store.validate(JSON.parse(await file.text()));
      if(!store.status.canEdit)return;
      if(dirty&&!confirm('Replace the current draft with this backup?'))return;
      draft=imported;kind='projects';id=draft.projects[0]?.id||'';dirty=true;renderFields();status('Backup loaded into your private draft. Publish changes to save it to the private archive.');
    }catch(error){status(error.message||'This is not a valid archive backup.');}
    finally{event.target.value='';}
  });
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!form.reportValidity()||!captureSafe())return;
    try{store.validate(draft);}catch(error){status(error.message);return;}
    busy=true;dialog.querySelectorAll('button,select,input,textarea').forEach(el=>el.disabled=true);status('Publishing the archive…');
    try{await store.publish(draft,baseRevision);dirty=false;dialog.close();}
    catch(error){status(error.message||'The archive could not be published. Your draft is still open.');}
    finally{busy=false;dialog.querySelectorAll('button,select,input,textarea').forEach(el=>el.disabled=false);reflect();}
  });
  addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
})();
