// Persistent, accessible game modal; rewards commit through the shared state transaction.
(() => {
  'use strict';
  let instance;
  function initBreachMinigame(){return instance ||= new BreachTerminal();}
  class BreachTerminal {
    constructor(){
      this.dialog=document.createElement('dialog');this.dialog.id='breach-terminal';this.dialog.setAttribute('aria-labelledby','breach-title');
      this.dialog.innerHTML='<header class="breach-heading"><div><span class="eyebrow">ARCADE // INTRUSION SIMULATOR</span><h2 id="breach-title">Breach Protocol<span>_</span></h2></div><button type="button" class="small-button" data-breach-close aria-label="Close Breach Terminal">×</button></header><div class="breach-status-line"><span id="breach-phase">AWAITING INPUT</span><time id="breach-timer" role="timer" aria-live="off">30.0s</time></div><div class="breach-target"><span>TARGET BUFFER</span><div id="breach-target"></div></div><p id="breach-instruction" class="hint">Start in the top row. Alternate column → row. Match all three codes; each cell can be used once.</p><div id="breach-grid" class="breach-grid" role="group" aria-label="4 by 4 code matrix"></div><div class="breach-buffer"><span>YOUR BUFFER</span><div id="breach-buffer"></div></div><p id="breach-result" role="status" aria-live="polite">30 seconds. Three codes. One way in.</p><p id="breach-quota" class="hint"></p><div class="breach-actions"><button type="button" class="primary" id="breach-start">Start breach ↗</button><button type="button" class="small-button" data-breach-close>Close terminal</button></div>';
      document.body.append(this.dialog);this.life=new AbortController();const opts={signal:this.life.signal};
      this.dialog.addEventListener('click',event=>{if(event.target.closest('[data-breach-close]'))this.close();const cell=event.target.closest('[data-breach-cell]');if(cell)this.choose(Number(cell.dataset.breachCell));if(event.target.closest('#breach-start'))this.start();},opts);
      this.dialog.addEventListener('close',()=>{clearInterval(this.timer);this.round=null;this.opener?.focus?.();},opts);
      window.addEventListener('keydown',event=>{if(this.dialog.open&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();if(!this.saving)this.close();}}, {...opts,capture:true});
      this.dialog.addEventListener('cancel',event=>{if(this.saving)event.preventDefault();},opts);
      document.addEventListener('visibilitychange',()=>{if(this.dialog.open)this.tick();},opts);
    }
    $(id){return this.dialog.querySelector('#'+id);}
    quota(){const n=window.LifeOSCore.read().breachRewards?.[window.LifeOSCore.dateKey()]?.rounds.length||0;this.$('breach-quota').textContent=`${Math.max(0,3-n)} / 3 XP rewards left today · +40 XP per success · unlimited practice`;}
    open(){if(this.dialog.open)return;this.opener=document.activeElement;this.reset();this.dialog.showModal();this.$('breach-start').focus();}
    close(){if(!this.saving)this.dialog.close();}
    reset(){clearInterval(this.timer);this.saving=false;this.round=new window.LifeOSBreachModel.BreachRound();this.roundId=window.LifeOSCore.uid();this.dialog.dataset.phase='ready';this.$('breach-start').disabled=false;this.$('breach-start').textContent='Start breach ↗';this.$('breach-result').textContent='30 seconds. Three codes. One way in.';this.$('breach-phase').textContent='AWAITING INPUT';this.quota();this.render();}
    start(){if(this.saving)return;if(this.round.status!=='ready')this.reset();this.round.start();this.dialog.dataset.phase='running';this.$('breach-start').textContent='Reset matrix ↻';this.$('breach-result').textContent='Sequence lock active. Choose your path.';this.render();this.timer=setInterval(()=>this.tick(),100);this.$('breach-grid').querySelector('button:not(:disabled)')?.focus();}
    render(){
      const r=this.round;if(!r)return;
      this.$('breach-target').replaceChildren(...r.target.map((value,i)=>{const span=document.createElement('span');span.textContent=value;span.className=r.selected[i]===undefined?'':r.board[r.selected[i]]===value?'matched':'mismatch';return span;}));
      this.$('breach-grid').replaceChildren(...r.board.map((value,i)=>{const button=document.createElement('button');button.type='button';button.dataset.breachCell=i;button.textContent=value;button.disabled=!r.allowed(i);button.classList.toggle('selected',r.selected.includes(i));button.setAttribute('aria-label',`${value}, row ${Math.floor(i/4)+1}, column ${i%4+1}${r.selected.includes(i)?', selected':''}`);return button;}));
      this.$('breach-buffer').textContent=r.selected.map(i=>r.board[i]).concat(Array(3-r.selected.length).fill('—')).join(' → ');
      this.$('breach-timer').textContent=(r.remaining()/1000).toFixed(1)+'s';
      if(r.status==='running')this.$('breach-phase').textContent=r.selected.length%2===1?'SELECT // SAME COLUMN':r.selected.length?'SELECT // SAME ROW':'SELECT // TOP ROW';
    }
    choose(index){const r=this.round;if(!r||this.saving)return;const accepted=r.choose(index);if(!accepted){if(r.status==='timeout')this.finish(false);return;}void window.LifeOSAudio?.blip('click');this.render();if(r.status==='won')void this.finish(true);else if(r.status==='lost')void this.finish(false);else this.$('breach-grid').querySelector('button:not(:disabled)')?.focus();}
    tick(){if(!this.round||this.saving)return;this.$('breach-timer').textContent=(this.round.remaining()/1000).toFixed(1)+'s';if(this.round.expire()==='timeout')void this.finish(false);}
    async finish(won){
      if(this.saving||!this.round||!['won','lost','timeout'].includes(this.round.status))return;clearInterval(this.timer);this.saving=true;this.$('breach-start').disabled=true;this.render();
      this.dialog.dataset.phase=won?'granted':'failed';this.$('breach-phase').textContent=won?'ACCESS GRANTED':'SECURITY LOCKOUT';
      if(won){
        try{
          const claim=()=>window.LifeOSCore.update(state=>window.LifeOSBreachModel.applyReward(state,this.roundId,window.LifeOSCore.dateKey(),Date.now(),window.LifeOSCore.award));
          const result=navigator.locks?await navigator.locks.request('lifeos-state',claim):claim();
          this.$('breach-result').textContent=result.reward?`ACCESS GRANTED // +40 XP${result.reward.levelUp?' // LEVEL UP · LV. '+result.reward.level:''}`:'ACCESS GRANTED // PRACTICE COMPLETE · Daily XP limit reached';
          if(result.reward)void window.LifeOSAudio?.reward(result.reward);else void window.LifeOSAudio?.blip('success');
        }catch(_){this.$('breach-result').textContent='ACCESS GRANTED // XP NOT SAVED · Check LifeOS storage';}
      }else{this.$('breach-result').textContent='BREACH FAILED // SECURITY LOCKOUT'+(this.round.status==='timeout'?' · Time expired':' · Buffer mismatch');void window.LifeOSAudio?.blip('failure');}
      this.saving=false;this.quota();this.$('breach-start').disabled=false;this.$('breach-start').textContent='Try another matrix ↻';this.$('breach-start').focus();
    }
    dispose(){clearInterval(this.timer);this.life.abort();this.dialog.remove();}
  }
  window.initBreachMinigame=initBreachMinigame;window.LifeOSArcade={open:()=>initBreachMinigame().open()};
  window.addEventListener('pagehide',event=>{if(!event.persisted)instance?.dispose();});
})();
