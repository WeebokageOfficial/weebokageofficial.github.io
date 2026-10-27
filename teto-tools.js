// Structured AI outputs stay in this page's memory; only accepted quests enter the profile.
(() => {
  'use strict';
  const tools=['polish','quests','prompt','scanner','decision','jargon','choreography'];
  const specialized=new Set(['decision','jargon','choreography']);
  const jobs=Object.fromEntries(tools.map(tool=>[tool,{text:'',fields:{},optionC:false,mode:'cyberpunk',engine:'code',result:null,busy:false,status:'',error:false}]));
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const Core=()=>window.parent.LifeOSCore || window.LifeOSCore;
  const persona='You are Kasane Teto from Weebokage LifeOS: direct, sarcastic, precise and helpful. Always respond in English with cyberpunk slang. ';
  const modes={cyberpunk:'Cyberpunk style: vivid neon imagery and direct language, without inventing facts.',drama:'Story drama: precise dialogue, emotion and tension, without adding plot elements.',minimalist:'Minimalist: remove filler and shorten while preserving meaning.'};
  const engines={code:'Code LLM: role, problem, runtime placeholders, reproducible steps, edge cases, tests and output format.',image:'Image generation: subject, composition, perspective, lighting, colors, style, exclusions and optional aspect ratio. No invented parameters.',writing:'Creative writing: genre, voice, perspective, characters, conflict, structure and constraints.'};
  const text=(value,max=18000)=>typeof value==='string' && value.trim().length>0 && value.length<=max;
  const object=value=>value && typeof value==='object' && !Array.isArray(value);
  function parseResult(tool, raw) {
    let value;
    try {value=JSON.parse(raw);}catch(_){throw new Error('INVALID AI OUTPUT // Invalid JSON. Please try again.');}
    let valid=false;
    if(tool==='polish')valid=object(value)&&text(value.verdict,1500)&&text(value.polished);
    if(tool==='prompt')valid=object(value)&&text(value.prompt);
    if(tool==='quests')valid=Array.isArray(value)&&value.length>0&&value.length<=10&&value.every(q=>object(q)&&text(q.title,160)&&Number.isInteger(q.xp)&&q.xp>=15&&q.xp<=50&&(q.category===undefined||text(q.category,40)));
    if(tool==='scanner')valid=object(value)&&text(value.verdict,1500)&&['plotholes','pacing','cliches'].every(key=>{const c=value[key];return object(c)&&Number.isInteger(c.score)&&c.score>=0&&c.score<=100&&text(c.analysis,2000)&&Array.isArray(c.tips)&&c.tips.length>0&&c.tips.length<=4&&c.tips.every(t=>text(t,800));});
    if(tool==='decision')valid=object(value)&&['A','B','C'].includes(value.choice)&&text(value.reason,900)&&text(value.order,1200)&&Number.isInteger(value.minutes)&&value.minutes>=1&&value.minutes<=120;
    if(tool==='jargon')valid=Array.isArray(value)&&value.length===5&&value.every(spec=>object(spec)&&text(spec.name,120)&&text(spec.acronym,32)&&text(spec.description,1500))&&new Set(value.map(spec=>spec.name.toLowerCase())).size===5&&new Set(value.map(spec=>spec.acronym.toLowerCase())).size===5;
    if(tool==='choreography')valid=object(value)&&text(value.title,120)&&Array.isArray(value.beats)&&value.beats.length>=3&&value.beats.length<=12&&value.beats.every(beat=>object(beat)&&['BURST','TEMPO SHIFT','CLIMAX'].includes(beat.tag)&&text(beat.text,2000))&&value.beats.some(beat=>beat.tag==='CLIMAX')&&sceneText(value).length<=20000;
    if(!valid)throw new Error('INVALID AI OUTPUT // Invalid structure, text length or values. Please try again.');
    return value;
  }
  function output(tool, job) {
    const result=job.result;if(!result)return '';
    if(tool==='decision') {
      const selected=job.submitted?.options.find(option=>option.label===result.choice);
      return `<section class="teto-decision-result"><div class="teto-command-banner">COMMAND ISSUED // NO HESITATION</div><h3>OPTION ${result.choice} // ${escape(selected?.title||'')}</h3><p>${escape(result.reason)}</p><div class="teto-march-order"><span class="tag">${result.minutes} MIN // FOCUS</span><p>${escape(result.order)}</p></div></section>`;
    }
    if(tool==='jargon')return `<div class="teto-spec-grid">${result.map((spec,index)=>`<article class="teto-spec-card"><span class="tag">${escape(spec.acronym)}</span><h3>${escape(spec.name)}</h3><p>${escape(spec.description)}</p><button class="small-button" type="button" data-teto-spec-copy="${index}">Copy Spec ↗</button></article>`).join('')}</div>`;
    if(tool==='choreography')return `<div class="teto-output-heading"><h3>${escape(result.title)}</h3><button class="small-button" type="button" data-teto-save-lore ${job.saved?'disabled':''}>${job.saved?'[SAVED // LORE]':'Save to Lore ↗'}</button></div><div class="teto-scene-output">${result.beats.map(beat=>`<section class="teto-scene-beat"><span class="teto-pacing-tag pacing-${beat.tag.toLowerCase().replace(' ','-')}">[${beat.tag}]</span><p>${escape(beat.text)}</p></section>`).join('')}</div>`;
    if(tool==='polish')return `<section class="teto-verdict"><h3>Teto’s Verdict</h3><p>${escape(result.verdict)}</p></section><section><div class="teto-output-heading"><h3>Polished Data</h3><button class="small-button" type="button" data-teto-copy="polish">Copy ↗</button></div><pre class="teto-result-text">${escape(result.polished)}</pre></section>`;
    if(tool==='prompt')return `<div class="teto-output-heading"><h3>Master-Prompt</h3><button class="small-button" type="button" data-teto-copy="prompt">Copy ↗</button></div><pre class="teto-result-text">${escape(result.prompt)}</pre>`;
    if(tool==='quests')return result.map((q,index)=>`<article class="teto-quest-draft"><span class="tag">${escape(q.category||'General')} // +${q.xp} XP</span><h3>${escape(q.title)}</h3><button class="small-button" type="button" data-teto-quest="${index}" ${q.added?'disabled':''}>${q.added?'[ADDED // SAVED]':'[+ Add to Lifestyle quests]'}</button></article>`).join('')+'<p class="hint">XP is awarded only when the quest is completed.</p>';
    return `<section class="teto-verdict"><h3>Teto’s Verdict</h3><p>${escape(result.verdict)}</p></section>`+[['plotholes','Plot holes','Risk'],['pacing','Pacing / tension','Tension'],['cliches','Cliche factor','Share']].map(([key,title,meaning])=>{const c=result[key];return `<section class="teto-scan-criterion"><div class="teto-output-heading"><h3>${title}</h3><span>${c.score}% ${meaning}</span></div><progress max="100" value="${c.score}" aria-label="${title}: ${c.score}%"></progress><p>${escape(c.analysis)}</p><ul>${c.tips.map(t=>`<li>${escape(t)}</li>`).join('')}</ul></section>`;}).join('');
  }
  function update(tool) {
    const card=document.querySelector(`[data-teto-tool="${tool}"]`);if(!card)return;
    const job=jobs[tool],form=card.querySelector('form');
    if(!specialized.has(tool) && form.elements.text.value!==job.text)form.elements.text.value=job.text;
    for(const [name,value] of Object.entries(job.fields))if(form.elements.namedItem(name))form.elements.namedItem(name).value=value;
    if(tool==='decision') {
      const optional=card.querySelector('#teto-decision-c'), toggle=card.querySelector('[data-teto-option-c]');
      optional.hidden=!job.optionC;optional.disabled=!job.optionC;
      toggle.setAttribute('aria-expanded',String(job.optionC));toggle.textContent=job.optionC?'− Remove option C':'+ Add option C';
    }
    if(form.elements.engine)form.elements.engine.value=job.engine;
    card.querySelectorAll('[data-teto-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.tetoMode===job.mode)));
    card.setAttribute('aria-busy',String(job.busy));form.querySelector('[type="submit"]').disabled=job.busy;
    const status=card.querySelector('.teto-job-status');status.textContent=job.status;status.classList.toggle('teto-thinking',job.busy);status.classList.toggle('teto-error',job.error);
    card.querySelector('.teto-tool-output').innerHTML=output(tool,job);
  }
  function mount(){tools.forEach(update);}
  async function run(tool) {
    const job=jobs[tool];if(job.busy||!job.text.trim())return;
    job.busy=true;job.error=false;job.status=specialized.has(tool)?'TETO IS CALCULATING TRAJECTORY...':'TETO IS THINKING...';update(tool);
    if(specialized.has(tool))void window.parent.LifeOSAudio?.blip('click');
    const specialInstructions={"decision": "Choose exactly one supplied option (choice A, B or C), prioritizing practical long-term momentum. Give a sharp reason in at most two sentences and an immediately actionable order with a time limit of 1–120 minutes in minutes. Respect stated constraints and facts.", "jargon": "Generate exactly five distinct fictional science-fiction names with unique acronyms or version numbers and plausible technical descriptions. Avoid generic names. Worldbuilding only, without real construction instructions. Return a JSON array with name, acronym and description.", "choreography": "Write a fast fictional exchange between the supplied characters matching their attitudes, scene goals and mode. Use short sentences, dialogue fragments, micro-movements and glances. Keep verbal conflicts verbal. Return a title and 3–12 screenplay beats tagged BURST, TEMPO SHIFT or CLIMAX, including at least one CLIMAX. No real-world training instructions.", "polish": "Revise the material in the requested style, preserving meaning without inventing facts. verdict is a brief cheeky comment; polished contains only the finished text.", "quests": "Extract 1–10 concrete, manageable tasks without inventing obligations. Return a JSON array with an actionable title, a short category and integer xp between 15 and 50.", "prompt": "Create a detailed, ready-to-use master prompt for the requested engine, including role, goal, context, requirements, output format and appropriate parameters. Mark missing user details as placeholders. Do not invent engine parameters or credentials.", "scanner": "Analyze plot holes, pacing and cliches. Percentages are editorial estimates, not measurements. Higher plotholes and cliches mean more problems; higher pacing means more tension. Include evidence from the supplied text in analysis and actionable improvements in tips. Do not invent scenes."};
    const submitted=specialized.has(tool)?JSON.parse(job.text):null;
    const instruction=(['decision','jargon','choreography'].includes(tool)?specialInstructions[tool]:null) || (tool==='polish'?modes[job.mode]:tool==='quests'?specialInstructions.quests:tool==='prompt'?engines[job.engine]:specialInstructions.scanner);
    try {
      const raw=await window.callTetoAI(persona+instruction,job.text,{tool,onStatus:status=>{job.status=status;update(tool);}});
      const value=parseResult(tool,raw);
      if(tool==='decision'&&!submitted.options.some(option=>option.label===value.choice))throw new Error('INVALID AI OUTPUT // This option was not supplied.');
      job.submitted=submitted;
      if(tool==='choreography'){job.saved=false;job.draftId=Core().uid();}
      job.result=tool==='quests'?value.map(q=>({...q,draftId:Core().uid(),added:false})):value;
      job.status='DATA OPTIMIZED // Teto delivered. Your turn.';
      if(specialized.has(tool))void window.parent.LifeOSAudio?.blip('success');
    }catch(error){job.error=true;job.status=(specialized.has(tool)?'UPLINK LOST // RETRY · ':'')+(error.message || 'AI UPLINK FAILED // Please try again.');}
    finally{job.busy=false;update(tool);}
  }
  function addQuest(index) {
    const job=jobs.quests,draft=job.result?.[index];if(!draft||draft.added)return;
    try {
      const result=Core().update(state=>{
        const existing=state.quests.find(q=>q.tetoDraftId===draft.draftId || q.title.trim().toLocaleLowerCase('de-DE')===draft.title.trim().toLocaleLowerCase('de-DE'));
        if(existing)return false;
        if(state.quests.length>=10000)throw new Error('Quest limit reached. Please clean up your profile.');
        state.quests.push({id:Core().uid(),title:draft.title.trim(),category:draft.category||'General',xp:draft.xp,priority:'medium',done:false,rewarded:false,tetoDraftId:draft.draftId});
        return true;
      });
      draft.added=true;job.error=false;job.status=result?'QUEST IMPORTED // Saved in Lifestyle.':'QUEST EXISTS // Already in Lifestyle.';
      void window.parent.LifeOSAudio?.blip('success');
    }catch(error){job.error=true;job.status='SAVE FAILED // '+error.message;}
    update('quests');
  }
  function readForm(tool,form) {
    const job=jobs[tool];
    for(const field of Array.from(form.elements))if(field.name && field.type!=='submit')job.fields[field.name]=field.value;
    if(tool==='decision') {
      const labels=job.optionC?['A','B','C']:['A','B'];
      job.text=JSON.stringify({options:labels.map(label=>({label,title:job.fields['option_'+label.toLowerCase()]||'',context:job.fields['context_'+label.toLowerCase()]||''}))});
    }else if(tool==='jargon')job.text=JSON.stringify({category:job.fields.category,purpose:job.fields.text||''});
    else if(tool==='choreography')job.text=JSON.stringify({first:job.fields.first||'',second:job.fields.second||'',mode:job.fields.scene_mode,cause:job.fields.text||''});
    else {job.text=form.elements.text.value;if(form.elements.engine)job.engine=form.elements.engine.value;}
  }
  function sceneText(result){return result.beats.map(beat=>`[${beat.tag}]\n${beat.text}`).join('\n\n');}
  function saveLore() {
    const job=jobs.choreography;if(!job.result||job.saved)return;
    try {
      const saved=Core().update(state=>{
        if(state.notes.some(note=>note.tetoDraftId===job.draftId))return false;
        if(state.notes.length>=10000)throw new Error('Lore archive is full.');
        const content=sceneText(job.result);if(content.length>20000)throw new Error('Scene is too long for a lore note. Request a shorter simulation.');
        state.notes.unshift({id:Core().uid(),title:job.result.title,category:'Chapter Notes',status:'Draft',content,tetoDraftId:job.draftId});
        return true;
      });
      job.saved=true;job.error=false;job.status=saved?'SCENE ARCHIVED // Saved as a draft in Lore.':'SCENE EXISTS // Already in the lore archive.';
      void window.parent.LifeOSAudio?.blip('success');
    }catch(error){job.error=true;job.status='SAVE FAILED // '+error.message;}
    update('choreography');
  }
  async function copyText(button,value) {
    await navigator.clipboard.writeText(value);button.textContent='[COPIED // SAVED]';void window.parent.LifeOSAudio?.blip('copy');
    setTimeout(()=>{if(button.isConnected)button.textContent=button.hasAttribute('data-teto-spec-copy')?'Copy Spec ↗':'Copy ↗';},1500);
  }
  document.addEventListener('input',event=>{const form=event.target.closest('[data-teto-form]');if(form)readForm(form.dataset.tetoForm,form);});
  document.addEventListener('change',event=>{const form=event.target.closest('[data-teto-form]');if(form)readForm(form.dataset.tetoForm,form);});
  document.addEventListener('submit',event=>{
    const tool=event.target.dataset.tetoForm;if(!tool)return;
    event.preventDefault();readForm(tool,event.target);
    const handlers={decision:window.handleDecisionMatrix,jargon:window.handleJargonGenerator,choreography:window.handleChoreographer};
    void (handlers[tool]?handlers[tool]():run(tool));
  });
  document.addEventListener('click',async event=>{
    const optional=event.target.closest('[data-teto-option-c]');if(optional){const job=jobs.decision;job.optionC=!job.optionC;readForm('decision',optional.closest('form'));update('decision');}
    if(event.target.closest('[data-teto-save-lore]'))saveLore();
    const specButton=event.target.closest('[data-teto-spec-copy]');
    if(specButton){const spec=jobs.jargon.result?.[Number(specButton.dataset.tetoSpecCopy)];if(spec)try{await copyText(specButton,`${spec.name} [${spec.acronym}]\n${spec.description}`);}catch(_){jobs.jargon.error=true;jobs.jargon.status='COPY FAILED // Please copy the specification manually.';update('jargon');}}
    const mode=event.target.closest('[data-teto-mode]');if(mode){jobs.polish.mode=mode.dataset.tetoMode;update('polish');}
    const add=event.target.closest('[data-teto-quest]');if(add)addQuest(Number(add.dataset.tetoQuest));
    const copy=event.target.closest('[data-teto-copy]');
    if(copy){
      const tool=copy.dataset.tetoCopy,job=jobs[tool],value=tool==='polish'?job.result?.polished:job.result?.prompt;if(!value)return;
      try {await copyText(copy,value);}
      catch(_){job.error=true;job.status='COPY FAILED // Select the text and copy it manually.';update(tool);}
    }
  });
  window.LifeOSTetoTools={mount,parseResult,run};mount();
})();
