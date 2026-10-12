// The outer shell owns a single encounter, even during navigation or CLI habit checks.
(() => {
  'use strict';
  const Core=window.LifeOSCore, Data=window.LifeOSDataStreams;
  let dialog, current=null, busy=false, checking=false, shownDay='', lastScanDay='';
  function createDialog() {
    if (dialog) return dialog;
    dialog=document.createElement('dialog');dialog.id='cyberdex-modal';dialog.setAttribute('aria-labelledby','encounter-title');
    dialog.innerHTML='<div class="encounter-signal" aria-hidden="true">◈</div><span class="eyebrow">DAILY HABITS // 100% SYNC</span><h2 id="encounter-title">ALERT: WILD DATA SIGNAL DETECTED!</h2><div id="encounter-creature"></div><p id="encounter-status" role="status"></p><div class="stream-actions"><button type="button" class="primary" id="cyberdex-catch">[SYNCHRONIZE // CATCH]</button><button type="button" class="small-button" id="cyberdex-close">Later</button></div>';
    document.body.append(dialog);
    dialog.querySelector('#cyberdex-close').addEventListener('click',()=>dialog.close());
    dialog.querySelector('#cyberdex-catch').addEventListener('click',()=>void synchronize());
    dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
    window.addEventListener('keydown',event=>{if(dialog.open && event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();if(!busy)dialog.close();}},true);
    return dialog;
  }
  function setStatus(text) {dialog.querySelector('#encounter-status').textContent=text;}
  async function open() {
    const record=Core.read().cyberdex.encounters[Core.dateKey()];
    if (!record || record.status!=='pending' || busy) return;
    createDialog();if(dialog.open)return;
    current={day:Core.dateKey(),id:record.id,pokemon:null};
    shownDay=current.day;
    const slot=dialog.querySelector('#encounter-creature');slot.replaceChildren();
    const button=dialog.querySelector('#cyberdex-catch');button.disabled=true;button.textContent='[SYNCHRONIZE // CATCH]';
    dialog.querySelector('#cyberdex-close').textContent='Later';dialog.querySelector('#cyberdex-close').disabled=false;
    dialog.showModal();setStatus('DECODING SIGNAL…');void window.LifeOSAudio?.blip('encounter');
    const request=current;
    try {
      const pokemon=await Data.pokemon(record.id);
      if(current!==request || request.day!==Core.dateKey())return;
      request.pokemon=pokemon;
      const image=document.createElement('img');image.loading='lazy';image.alt=pokemon.displayName;image.width=128;image.height=128;
      if(pokemon.sprite)image.src=pokemon.sprite;
      const title=document.createElement('h3');title.textContent=`#${String(pokemon.id).padStart(3,'0')} ${pokemon.displayName}`;
      slot.replaceChildren(image,title);setStatus(`${pokemon.types.join(' / ')} // +50 XP · One rewarded catch per day`);button.disabled=false;
    } catch(error) {if(current===request){setStatus(error.message+' · Close and retry when online. Your signal is saved.');}}
  }
  async function synchronize() {
    if(busy || !current?.pokemon)return;
    if(current.day!==Core.dateKey()){setStatus('SIGNAL EXPIRED // Complete today’s habits for a new encounter.');return;}
    busy=true;dialog.querySelector('#cyberdex-catch').disabled=true;dialog.querySelector('#cyberdex-close').disabled=true;
    try {
      const result=await Data.catchPokemon(current.day,current.pokemon);
      setStatus(result?`SYNC COMPLETE // +50 XP${result.levelUp?' // LEVEL UP · '+result.level:''}`:'SIGNAL ALREADY SYNCHRONIZED // No additional XP');
      dialog.querySelector('#cyberdex-catch').textContent='[SYNC COMPLETE]';dialog.querySelector('#cyberdex-close').textContent='Close';
      if(result)void window.LifeOSAudio?.reward(result);
    }catch(_) {setStatus('SAVE FAILED // Storage unavailable. Try again; XP was not granted.');dialog.querySelector('#cyberdex-catch').disabled=false;}
    finally {busy=false;dialog.querySelector('#cyberdex-close').disabled=false;}
  }
  async function check() {
    if(checking)return;checking=true;
    try {
      const day=Core.dateKey(), state=Core.read();
      if(lastScanDay && lastScanDay!==day){shownDay='';if(dialog?.open && !busy)dialog.close();}
      lastScanDay=day;
      let record=state.cyberdex.encounters[day];
      if(!record && Data.eligible(state,day)) {
        const claim=()=>Core.update(next=>Data.prepareEncounter(next,day),{activity:false});
        record=navigator.locks?await navigator.locks.request('lifeos-state',claim):claim();
      }
      Data.mirrorCaught();
      if(record?.status==='pending' && shownDay!==day) await open();
    }catch(_) { /* Corrupt/unwritable profile data is never overwritten. */ }
    finally {checking=false;}
  }
  window.LifeOSCyberdex={open,check};
  window.addEventListener('lifeos-state-changed',()=>void check());
  window.addEventListener('storage',event=>{if(event.key===Core.STORAGE_KEY)void check();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void check();});
  setTimeout(()=>void check(),0);
  const midnightCheck=setInterval(()=>void check(),30000);
  window.addEventListener('pagehide',()=>clearInterval(midnightCheck));
})();
