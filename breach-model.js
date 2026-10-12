// Pure game rules: guaranteed solvable boards, alternating axes, no reused cells.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LifeOSBreachModel=api;})(globalThis,()=>{
  'use strict';
  const HEX=['1C','E9','55','7A','BD'];
  class BreachRound {
    constructor({random=Math.random,now=Date.now,duration=30000}={}){
      this.now=now;this.duration=duration;this.status='ready';this.selected=[];this.deadline=null;
      const pick=n=>Math.min(n-1,Math.max(0,Math.floor(random()*n)));
      this.board=Array.from({length:16},()=>HEX[pick(HEX.length)]);
      const col=pick(4),row=1+pick(3),lastCol=(col+1+pick(3))%4;
      this.target=[this.board[col],this.board[row*4+col],this.board[row*4+lastCol]];
    }
    start(){if(this.status!=='ready')return false;this.status='running';this.deadline=this.now()+this.duration;return true;}
    remaining(){return this.deadline===null?this.duration:Math.max(0,this.deadline-this.now());}
    expire(){if(this.status==='running'&&this.remaining()<=0)this.status='timeout';return this.status;}
    allowed(index){if(this.status!=='running'||!Number.isInteger(index)||index<0||index>=16||this.selected.includes(index))return false;if(!this.selected.length)return index<4;const last=this.selected.at(-1);return this.selected.length%2===1?index%4===last%4:Math.floor(index/4)===Math.floor(last/4);}
    choose(index){this.expire();if(!this.allowed(index))return false;this.selected.push(index);if(this.selected.length===3)this.status=this.selected.every((cell,i)=>this.board[cell]===this.target[i])?'won':'lost';return true;}
  }
  function validateLedger(value={}){
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>366)throw new Error('Invalid breach ledger');
    for(const [day,record] of Object.entries(value)){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!record||!Array.isArray(record.rounds)||record.rounds.length>3||record.rounds.some(id=>typeof id!=='string'||!id||id.length>100)||new Set(record.rounds).size!==record.rounds.length||!Number.isSafeInteger(record.lastSuccessAt)||record.lastSuccessAt<0)throw new Error('Invalid breach reward');
    }
    return value;
  }
  function applyReward(state,roundId,day,now,award){
    if(typeof roundId!=='string'||!roundId||roundId.length>100||!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isSafeInteger(now)||now<0)throw new Error('Invalid breach claim');
    const ledger=validateLedger(state.breachRewards||{}),record=ledger[day]||{rounds:[],lastSuccessAt:0};
    if(record.rounds.includes(roundId))return {reward:null,remaining:3-record.rounds.length,reason:'duplicate'};
    if(record.rounds.length>=3)return {reward:null,remaining:0,reason:'daily-limit'};
    record.rounds.push(roundId);record.lastSuccessAt=now;ledger[day]=record;
    state.breachRewards=Object.fromEntries(Object.entries(ledger).sort(([a],[b])=>b.localeCompare(a)).slice(0,30));
    return {reward:award(state,40),remaining:3-record.rounds.length,reason:'awarded'};
  }
  return {HEX,BreachRound,validateLedger,applyReward};
});
