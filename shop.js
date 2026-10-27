(() => {
  'use strict';
  const Core=window.LifeOSCore, Shop=window.LifeOSShop;
  const $=selector=>document.querySelector(selector);
  const escape=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const departments={
    miku:{name:'Hatsune Miku',title:'A little glow.<br>A lot of Miku.',description:'A fresh look for your favorite songs. Pick something that feels like you.',stamp:'39 / GOOD VIBES',lines:[
      'You did the hard part. Now pick your little reward! 🩵',
      'Your playlist called. It wants a cute new stage partner.',
      'Every little habit adds up. Look at you turning progress into pixels!',
      'Window shopping counts as self-care. I checked. Probably.']},
    teto:{name:'Kasane Teto',title:'Excellent taste.<br>Questionable impulse.',description:'Premium attitude. Locally sourced chaos. Find something worthy of your soundtrack.',stamp:'04 / CHIMERA APPROVED',lines:[
      'Welcome to the superior department. Try to act surprised. 🥖',
      'I accept XP, compliments, and absolutely no refunds on my attitude.',
      'Finish your quests first. I run a shop, not a procrastination charity.',
      'A new sprite won’t fix your playlist. But I will look spectacular judging it.']}
  };
  let department='miku', view='all', selected=null, busy=false, toastTimer, lastLine={};
  try {department=sessionStorage.getItem('weebokage.shop.department')==='teto'?'teto':'miku';} catch (_) {}
  const query=new URLSearchParams(location.search);
  if(['miku','teto'].includes(query.get('department')))department=query.get('department');
  if(query.get('view')==='owned')view='owned';
  function notify(message) {
    const status=$('#shop-status');status.textContent=message;status.hidden=false;
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>{status.hidden=true;},6000);
  }
  function shopkeeperImage(img,theme) {
    img.dataset.shopkeeper=theme;
    const custom=`assets/shopkeeper/${theme}_shopkeeper.png`, fallback=`assets/splash/${theme}_victory.png`;
    img.onerror=()=>{img.onerror=null;img.src=fallback;};
    if(img.getAttribute('src')!==custom) {
      img.style.visibility='hidden';
      img.onload=()=>{img.style.visibility='';img.onload=null;};
      img.src=custom;
    }
  }
  function speak(message) {
    const pool=departments[department].lines.filter(line=>line!==lastLine[department]);
    const line=message || pool[Math.floor(Math.random()*pool.length)];
    lastLine[department]=line;$('#shopkeeper-line').textContent=`“${line}”`;
  }
  function setDepartment(theme) {
    department=theme==='teto'?'teto':'miku';
    const d=departments[department];document.body.dataset.department=department;
    document.querySelectorAll('[data-department-select]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.departmentSelect===department)));
    $('#department-title').innerHTML=d.title;
    $('#counter-number').textContent=`DEPARTMENT ${department==='miku'?'01':'02'} // ${d.name.toUpperCase()}`;
    $('#department-description').textContent=d.description;$('#shopkeeper-name').textContent=`${department.toUpperCase()} SAYS`;
    $('#stage-stamp').textContent=d.stamp;$('#counter-sign-name').textContent=d.name;
    $('#shopkeeper-art').alt=`${d.name} welcomes you to ${department==='miku'?'her':'the chaos'} counter`;
    shopkeeperImage($('#shopkeeper-art'),department);
    const counter=$('.shop-counter');counter.classList.remove('is-entering');void counter.offsetWidth;counter.classList.add('is-entering');
    try {sessionStorage.setItem('weebokage.shop.department',department);} catch (_) {}
    speak();render();
  }
  function read() {
    try {return Core.read();} catch(error) {notify(error.message || 'Your save could not be read. Open LifeOS to restore a backup.');return null;}
  }
  function render() {
    const state=read(), shop=Shop.inventory(state || {});
    $('#wallet-xp').textContent=state ? state.xp.toLocaleString('en-GB') : '—';
    $('#wallet-level').textContent=state ? `LEVEL ${String(state.level).padStart(2,'0')} // AVAILABLE XP` : 'SAVE UNAVAILABLE';
    $('#owned-count').textContent=shop.owned.length;
    $('#shelf-title').textContent=view==='owned'?'Your personal collection.':'Fresh off the shelf.';
    const products=Shop.catalog.filter(item=>view==='owned'?shop.owned.includes(item.id):item.department===department);
    $('#shop-products').innerHTML=products.map((item,index)=>{
      const owned=shop.owned.includes(item.id), equipped=shop.equipped[item.type]===item.id;
      return `<article class="product-card" data-department="${item.department}" data-effect="${item.effect || ''}" data-type="${item.type}"><div class="product-art"><span class="product-badge">${equipped?'✓ EQUIPPED':owned?'✓ IN YOUR LOCKER':escape(item.tag)}</span><span class="product-index">NO. ${String(index+1).padStart(2,'0')}</span><img src="${item.image}" alt="${escape(item.name)} ${item.type==='accent'?'player accent preview':'sprite preview'}" loading="lazy"></div><div class="product-info"><span class="product-type">${item.type==='sprite'?'PLAYER SPRITE':'PLAYER LIGHTING'} / ${item.department.toUpperCase()}</span><h3>${escape(item.name)}</h3><p>${escape(item.description)}</p><div class="product-bottom"><strong class="product-price">${owned?'Yours':item.price} <small>${owned?'TO KEEP':'XP'}</small></strong><button type="button" data-item="${item.id}" data-equipped="${equipped}" aria-label="Preview ${escape(item.name)}">${equipped?'Equipped ✓':owned?'Try it on ↗':'Take a look ↗'}</button></div></div></article>`;
    }).join('') || '<p class="locker-empty">Your locker is waiting for its first favorite.<br>Complete a LifeOS quest, then treat your player to something nice.</p>';
    if($('#shop-item-dialog').open && selected) updateItem(state,shop);
  }
  function updateItem(state,shop) {
    const owned=shop.owned.includes(selected.id), equipped=shop.equipped[selected.type]===selected.id;
    $('#item-price').textContent=owned?'Already owned':`${selected.price} XP`;
    $('#item-balance').textContent=state?`${state.xp} XP`:'Unavailable';
    $('#item-note').textContent=!state?'Your save is unavailable. Restore it in LifeOS before shopping.':equipped?'Already on your player. Looking good.':owned?'Equip it again for free, whenever you like.':state.xp<selected.price?`You need ${selected.price-state.xp} more XP. Your next quest has your name on it.`:`${state.xp-selected.price} XP will remain. Your level stays ${state.level}.`;
    const action=$('#item-action');
    action.disabled=busy || !state || equipped || (!owned && state.xp<selected.price);
    action.textContent=busy?'Saving…':equipped?'Equipped ✓':owned?'Equip on my player':`Unlock & equip — ${selected.price} XP`;
  }
  function openItem(id) {
    selected=Shop.get(id);if(!selected)return;
    const preview=$('#item-preview');preview.dataset.department=selected.department;preview.dataset.effect=selected.effect || '';
    preview.classList.remove('is-animated');$('#preview-motion').setAttribute('aria-pressed','false');$('#preview-motion').textContent='▶ Animate preview';
    $('#item-image').src=selected.image;$('#item-image').alt=`${selected.name} preview`;
    $('#item-type').textContent=`${selected.department.toUpperCase()} / ${selected.type==='sprite'?'PLAYER SPRITE':'PLAYER LIGHTING'}`;
    $('#item-title').textContent=selected.name;$('#item-description').textContent=selected.description;
    const state=read();updateItem(state,Shop.inventory(state || {}));
    $('#shop-item-dialog').showModal();
  }
  function openEntrance() {$('#shop-entrance').showModal();}
  function enter(theme=department) {
    setDepartment(theme);$('#shop-entrance').close();
    $(`#department-${department}`).focus();
  }
  document.addEventListener('click',async event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.departmentSelect) {setDepartment(button.dataset.departmentSelect);return;}
    if(button.dataset.enter) {enter(button.dataset.enter);return;}
    if(button.dataset.view) {
      view=button.dataset.view;document.querySelectorAll('[data-view]').forEach(el=>el.setAttribute('aria-pressed',String(el===button)));render();return;
    }
    if(button.dataset.item) {openItem(button.dataset.item);return;}
    if(button.dataset.reset && !busy) {
      busy=true;
      try {await Shop.change('reset',button.dataset.reset);notify('Original player settings restored. Your unlocks are still in your locker.');render();}
      catch(error) {notify(error.message);} finally {busy=false;}
    }
  });
  $('#shopkeeper-talk').addEventListener('click',()=>speak());
  $('#replay-entrance').addEventListener('click',openEntrance);
  $('#skip-entrance').addEventListener('click',()=>enter());
  $('#shop-entrance').addEventListener('cancel',event=>{event.preventDefault();enter();});
  $('#close-item').addEventListener('click',()=>$('#shop-item-dialog').close());
  $('#shop-item-dialog').addEventListener('close',()=>{
    if(selected)document.querySelector(`[data-item="${selected.id}"]`)?.focus();
    $('#item-preview').classList.remove('is-animated');
  });
  $('#preview-motion').addEventListener('click',()=>{
    const playing=$('#item-preview').classList.toggle('is-animated');
    $('#preview-motion').setAttribute('aria-pressed',String(playing));$('#preview-motion').textContent=playing?'Ⅱ Pause preview':'▶ Animate preview';
    $('#item-image').src=playing && selected?.bop ? selected.bop : selected.image;
  });
  $('#item-action').addEventListener('click',async()=>{
    if(busy || !selected)return;
    busy=true;const item=selected;
    try {
      const state=Core.read(), owned=Shop.inventory(state).owned.includes(item.id);
      updateItem(state,Shop.inventory(state));
      await Shop.change(owned?'equip':'buy',item.id);
      $('#shop-item-dialog').close();
      speak(department==='miku'?'A perfect fit! Your soundtrack just got a little more you. 🩵':'Excellent choice. Obviously. I’ll pretend I’m not pleased. 🥖');
      notify(`${item.name} ${owned?'equipped':'unlocked and equipped'}. Look at your music player!`);
    } catch(error) {notify(error.message || 'Could not save. No purchase was completed.');}
    finally {busy=false;render();}
  });
  window.addEventListener('storage',event=>{if(event.key===Core.STORAGE_KEY)render();});
  window.addEventListener('lifeos-state-changed',render);
  document.querySelectorAll('[data-shopkeeper]').forEach(img=>shopkeeperImage(img,img.dataset.shopkeeper));
  document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===view)));
  setDepartment(department);
  openEntrance();
  window.addEventListener('pageshow',event=>{if(event.persisted && !$('#shop-entrance').open)openEntrance();});
})();
