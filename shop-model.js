// Shared, fixed cosmetics catalogue. Purchases and XP live in the same LifeOS save.
(() => {
  'use strict';
  const catalog = Object.freeze([
    {id:'miku-encore',department:'miku',type:'sprite',name:'Encore Miku',tag:'THE HEADLINER',price:45,image:'assets/shop/items/miku/encore.png',idle:'assets/shop/items/miku/encore.png',bop:'assets/shop/items/miku/encore.png',effect:'encore',description:'A celebration pose for your CyberDeck. Every playlist deserves an encore.'},
    {id:'miku-hologram',department:'miku',type:'sprite',name:'Hologram Miku',tag:'SIGNAL FOUND',price:30,image:'assets/shop/items/miku/hologram_idle.png',idle:'assets/shop/items/miku/hologram_idle.png',bop:'assets/shop/items/miku/hologram_bop.png',effect:'hologram',description:'The classic dancing Miku, remixed with a luminous holographic glow.'},
    {id:'miku-frequency',department:'miku',type:'accent',name:'Teal Frequency',tag:'SET THE MOOD',price:20,image:'assets/shop/items/miku/hologram_idle.png',description:'Give your player a teal light wash and a glowing stage, whatever the site theme.'},
    {id:'teto-encore',department:'teto',type:'sprite',name:'Encore Teto',tag:'MAIN CHARACTER ENERGY',price:45,image:'assets/shop/items/teto/encore.png',idle:'assets/shop/items/teto/encore.png',bop:'assets/shop/items/teto/encore.png',effect:'encore',description:'One triumphant chimera. Zero humility. Give Teto the stage she knows she deserves.'},
    {id:'teto-hologram',department:'teto',type:'sprite',name:'Hologram Teto',tag:'OVERCLOCKED',price:30,image:'assets/shop/items/teto/hologram_idle.png',idle:'assets/shop/items/teto/hologram_idle.png',bop:'assets/shop/items/teto/hologram_bop.png',effect:'hologram',description:'Teto’s familiar dance with a luminous holographic finish. Extra attitude included.'},
    {id:'teto-frequency',department:'teto',type:'accent',name:'Crimson Frequency',tag:'TURN IT UP',price:20,image:'assets/shop/items/teto/hologram_idle.png',description:'A crimson player light wash and glowing stage. A little louder, visually.'}
  ].map(Object.freeze));
  const get = id => catalog.find(item=>item.id===id);
  function inventory(state) {
    const owned=(state.shop?.owned || []).filter(id=>get(id));
    const equipped={sprite:null,accent:null};
    for (const type of ['sprite','accent']) {
      const id=state.shop?.equipped?.[type];
      if(owned.includes(id) && get(id)?.type===type) equipped[type]=id;
    }
    return {owned,equipped};
  }
  function announce() {
    window.dispatchEvent(new Event('lifeos-shop-changed'));
    if(window.parent!==window) {
      try { window.parent.dispatchEvent(new Event('lifeos-shop-changed')); } catch (_) { /* Standalone preview. */ }
    }
  }
  async function change(action,id) {
    const run=()=>{
      const result=window.LifeOSCore.update(state=>{
        const shop=inventory(state), item=get(id);
        if(action==='reset') {
          if(!['sprite','accent'].includes(id)) throw Error('Unknown cosmetic slot.');
          shop.equipped[id]=null;
        } else {
          if(!item) throw Error('This item is not in the catalogue.');
          if(action==='buy') {
            if(shop.owned.includes(id)) throw Error('You already own this item. No XP was spent.');
            if(state.xp<item.price) throw Error(`You need ${item.price-state.xp} more XP. Complete a LifeOS habit or quest first.`);
            state.xp-=item.price;
            shop.owned.push(id);
          } else if(action!=='equip' || !shop.owned.includes(id)) throw Error('Unlock this item before equipping it.');
          shop.equipped[item.type]=id;
        }
        state.shop=shop;
        return shop;
      },{activity:false});
      announce();
      return result;
    };
    return navigator.locks ? navigator.locks.request('weebokage-lifeos-shop',run) : run();
  }
  window.LifeOSShop=Object.freeze({catalog,get,inventory,change});
})();
