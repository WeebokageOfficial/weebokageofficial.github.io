/* Private owner-only archive. No public data fallback or unauthenticated reads. */
(() => {
  'use strict';
  const MAX_BYTES=850000, listeners=new Set();
  let firestore,reference,revision=0,canEdit=false,ready=false,problem='',authVersion=0,stopRecords=null;
  const clone=value=>JSON.parse(JSON.stringify(value));
  function validate(data){
    const fail=message=>{throw new Error(message);};
    const str=(v,max=20000)=>typeof v==='string'&&v.length<=max;
    const prose=v=>str(v)||Array.isArray(v)&&v.length<=100&&v.every(p=>str(p));
    if(!data||!['timelines','projects','characters'].every(k=>Array.isArray(data[k])&&data[k].length<=1000))fail('The archive needs timelines, projects, and characters arrays (up to 1,000 records each).');
    const ids={};
    for(const kind of ['timelines','projects','characters']){
      ids[kind]=new Set();
      for(const entry of data[kind]){
        if(!entry||typeof entry!=='object'||!str(entry.id,100)||!/^[-a-z0-9]{1,100}$/.test(entry.id)||ids[kind].has(entry.id))fail(`Use a unique lowercase ID for every ${kind} record.`);
        ids[kind].add(entry.id);
        if(!str(kind==='projects'?entry.title:entry.name,250)||!(kind==='projects'?entry.title:entry.name).trim())fail(`Record ${entry.id} needs a name or title.`);
        if(kind==='timelines'){
          if(!str(entry.name,250)||!str(entry.era,250)||!entry.era.trim()||(entry.description!=null&&!str(entry.description)))fail(`Check the name, era label, and description for ${entry.id}.`);
          continue;
        }
        if(!str(entry.subtitle||'',500)||!prose(kind==='projects'?entry.synopsis:entry.summary))fail(`Check the subtitle and overview for ${entry.id}.`);
        if(!entry.infobox||typeof entry.infobox!=='object'||Array.isArray(entry.infobox)||Object.keys(entry.infobox).length>50||!Object.entries(entry.infobox).every(([k,v])=>str(k,80)&&str(v,2000)))fail(`Quick facts for ${entry.id} must be text key/value pairs (up to 50).`);
        if(!Array.isArray(entry.sections)||entry.sections.length>50||!entry.sections.every(s=>s&&str(s.title,250)&&s.title.trim()&&prose(s.content)))fail(`Check the section headings and text for ${entry.id}.`);
        if(entry.aliases!=null&&(!Array.isArray(entry.aliases)||entry.aliases.length>50||!entry.aliases.every(a=>str(a,150))))fail(`Check aliases for ${entry.id}.`);
      }
    }
    for(const p of data.projects){
      if(!ids.timelines.has(p.timelineId)||!str(p.status,100)||!p.status.trim())fail(`Choose a timeline and status for ${p.title}.`);
      for(const [key,group] of [['characterIds','characters'],['connectedProjectIds','projects']])if(!Array.isArray(p[key])||p[key].length>1000||new Set(p[key]).size!==p[key].length||!p[key].every(id=>ids[group].has(id)))fail(`Remove missing or repeated ${key} references from ${p.title}.`);
      if(p.amazonUrl){try{if(new URL(p.amazonUrl).protocol!=='https:')throw Error();}catch(_){fail(`The purchase link for ${p.title} must be a valid HTTPS URL.`);}}
    }
    for(const c of data.characters)if(c.relationships!=null&&(!Array.isArray(c.relationships)||c.relationships.length>1000||!c.relationships.every(r=>r&&ids.characters.has(r.characterId)&&str(r.type,250)&&str(r.description||''))))fail(`Check the relationship targets and descriptions for ${c.name}.`);
    // Reject dangling explicit wiki links while allowing literal HTML to remain safe text.
    const encoded=JSON.stringify(data);
    for(const match of encoded.matchAll(/\[\[(project|character):([^|\]]+)(?:\|[^\]]+)?\]\]/g))if(!ids[match[1]==='project'?'projects':'characters'].has(match[2]))fail(`Wiki link points to a missing ${match[1]}: ${match[2]}.`);
    if(new TextEncoder().encode(encoded).length>MAX_BYTES)fail('The archive is too large to publish in one document. Download a backup before reducing its size.');
    return clone(data);
  }
  const status=()=>({canEdit,ready,revision,problem,available:Boolean(reference)});
  const notify=()=>{for(const fn of listeners)fn(status());};
  function apply(data){const valid=validate(data);for(const key of ['timelines','projects','characters'])window.WCU_DATABASE[key]=valid[key];window.dispatchEvent(new Event('wcu-data-updated'));}
  async function publish(data,baseRevision){
    if(!canEdit||!reference)throw new Error('Sign in as the configured site owner to publish.');
    const valid=validate(data),payload=JSON.stringify(valid),ownerVersion=authVersion;
    try{
      await firestore.runTransaction(async transaction=>{
        const current=await transaction.get(reference),currentRevision=current.exists?current.data().revision:0;
        if(currentRevision!==baseRevision)throw new Error('The archive changed in another session. Your draft is still open. Copy or download it, then reopen the editor with the latest version.');
        transaction.set(reference,{schemaVersion:1,databaseJson:payload,revision:currentRevision+1,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:firebase.auth().currentUser.uid});
      });
      if(!canEdit||ownerVersion!==authVersion)return;
      revision=baseRevision+1;apply(valid);notify();
    }catch(error){
      if(error.code==='permission-denied')throw new Error('Publishing was denied. Deploy the Firestore rules and set site_config/access.ownerUid to your Firebase account UID.');
      throw error;
    }
  }
  window.WCUStore={validate,publish,get status(){return status();},subscribe(fn){listeners.add(fn);fn(status());return()=>listeners.delete(fn);}};
  function clear(){
    stopRecords?.();stopRecords=null;revision=0;
    for(const key of ['timelines','projects','characters'])window.WCU_DATABASE[key]=[];
    window.dispatchEvent(new Event('wcu-data-updated'));
  }
  try{
    if(!window.firebase?.firestore){ready=true;notify();return;}
    firestore=firebase.firestore();
    if(typeof firestore.doc!=='function'||typeof firestore.runTransaction!=='function'){ready=true;notify();return;}
    reference=firestore.doc('wcu/active');
    const unAuth=firebase.auth().onAuthStateChanged(async user=>{
      const previouslyAllowed=canEdit,current=++authVersion;canEdit=false;ready=false;problem='';clear();notify();
      if(!user){ready=true;notify();if(previouslyAllowed)location.replace('wcu.html');return;}
      let allowed=false;
      try{const access=await firestore.doc('site_config/access').get({source:'server'});allowed=access.exists&&access.data().ownerUid===user.uid;}catch(_){}
      if(!allowed){try{await Weebokage.apiFetch('/admin/config',{timeout:12000});allowed=true;}catch(_){}}
      if(current!==authVersion)return;
      if(!allowed){ready=true;notify();if(previouslyAllowed)location.replace('wcu.html');return;}
      canEdit=true;notify();
      // Content is requested only after authorization. Firestore independently enforces ownership.
      stopRecords=reference.onSnapshot(snapshot=>{
        if(current!==authVersion||!canEdit)return;
        try{
          if(snapshot.exists){const saved=snapshot.data();if(saved.schemaVersion!==1||!Number.isSafeInteger(saved.revision)||saved.revision<1)throw Error();apply(JSON.parse(saved.databaseJson));revision=saved.revision;}
          ready=true;problem='';
        }catch(_){clear();problem='The private archive could not be read.';ready=true;}
        notify();
      },()=>{if(current!==authVersion)return;const hadContent=revision>0;canEdit=false;clear();problem='Private archive access is unavailable. Check the owner configuration and Firestore rules.';ready=true;notify();if(hadContent)location.replace('wcu.html');});
    });
    addEventListener('pagehide',()=>{++authVersion;canEdit=false;unAuth();clear();notify();});
    addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
  }catch(_){problem='Administrator access could not be verified.';ready=true;canEdit=false;clear();notify();}
})();
