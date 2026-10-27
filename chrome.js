(() => {
  'use strict';
  const header=document.querySelector('.cyber-header'), menu=document.querySelector('.menu-toggle'), nav=document.querySelector('.cyber-nav');
  const desktop=matchMedia('(min-width:1101px)'), categories=[...(nav?.querySelectorAll('.nav-category') || [])], backdrop=header?.querySelector('.nav-backdrop');
  function setOpen(open,{focus=false}={}) {
    if(desktop.matches)open=false;
    menu?.setAttribute('aria-expanded',String(open));
    menu?.setAttribute('aria-label',open?'Close navigation':'Open navigation');
    header?.classList.toggle('menu-open',open);
    document.body.classList.toggle('navigation-open',open);
    if(nav)nav.inert=!desktop.matches && !open;
    if(backdrop)backdrop.hidden=!open;
    if(focus && open)nav?.querySelector('a')?.focus();
  }
  function syncLayout(){setOpen(false);categories.forEach(category=>{category.open=false;});}
  menu?.addEventListener('click',()=>setOpen(menu.getAttribute('aria-expanded')!=='true',{focus:true}));
  backdrop?.addEventListener('click',()=>{setOpen(false);menu?.focus();});
  window.addEventListener('keydown',event=>{
    if(event.key==='Escape') {
      if(header?.classList.contains('menu-open')){event.preventDefault();event.stopImmediatePropagation();setOpen(false);menu.focus();}
      else if(desktop.matches){const category=categories.find(el=>el.open);if(category){event.preventDefault();category.open=false;category.querySelector('summary').focus();}}
    }
    if(event.key==='Tab' && header?.classList.contains('menu-open')) {
      const items=[menu,...nav.querySelectorAll('a,button,summary')].filter(el=>el.getClientRects().length && !el.disabled);
      const first=items[0],last=items.at(-1);
      if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
    }
  },true);
  document.addEventListener('click',event=>{
    if(header&&!header.contains(event.target)){setOpen(false);categories.forEach(category=>{category.open=false;});}
  });
  nav?.addEventListener('click',event=>{if(event.target.closest('a')){setOpen(false);categories.forEach(category=>{category.open=false;});}});
  nav?.addEventListener('click',event=>{
    if(!event.target.closest('[data-open-terminal]'))return;
    setOpen(false);categories.forEach(category=>{category.open=false;});
    (desktop.matches ? nav.querySelector('[data-category="workspace"] summary') : menu)?.focus();
    (window.parent.LifeOSTerminal || window.LifeOSTerminal)?.toggle(true);
  });
  nav?.addEventListener('click',event=>{
    if(!event.target.closest('[data-open-music]'))return;
    setOpen(false);categories.forEach(category=>{category.open=false;});
    (desktop.matches ? nav.querySelector('[data-category="music"] summary') : menu)?.focus();
    (window.parent.LifeOSMusic || window.LifeOSMusic)?.open();
  });
  desktop.addEventListener('change',syncLayout);
  categories.forEach(category=>{
    category.querySelector('summary').addEventListener('click',event=>{
      event.preventDefault();
      const open=!category.open;
      categories.forEach(other=>{other.open=other===category && open;});
    });
  });
  syncLayout();
  const themeButton=document.querySelector('.cyber-theme');
  function syncTheme(){const theme=document.documentElement.dataset.theme==='teto'?'teto':'miku';
    themeButton?.setAttribute('aria-pressed',String(theme==='teto'));const label=themeButton?.querySelector('span');if(label)label.textContent=theme.toUpperCase();
    document.querySelectorAll('.portal-art img,.neural-sidebar>img,.splash-avatar').forEach(image=>{
      const src=`assets/avatars/${theme==='teto'?'tetokage':'mikukage'}.png?v=portraits-1`;
      if(image.getAttribute('src')!==src)image.src=src;
      image.alt=theme==='teto'?'Teto companion':'Miku companion';
    });
  }
  themeButton?.addEventListener('click',()=>{
    const next=document.documentElement.dataset.theme==='teto'?'miku':'teto';
    // The menu owns this user action: trigger explicitly, rather than depending
    // on setTheme detecting a change after shell/state synchronization.
    setOpen(false);
    window.Weebokage?.setTheme(next, { manual: true, silent: true });
    window.parent.LifeOSShell?.syncTheme();
    syncTheme();
    const showVictory = window.triggerThemeSwitchVictory || window.parent.triggerThemeSwitchVictory;
    showVictory?.(next);
  });
  document.addEventListener('themechange',syncTheme);
  window.addEventListener('storage',event=>{if(event.key==='theme'){document.documentElement.dataset.theme=localStorage.getItem('theme')||'miku';syncTheme();}});
  const dashboard=document.getElementById('dashboard');
  if(dashboard){
    let companionTheme;
    const followCompanion=()=>{
      const theme=dashboard.classList.contains('teto-theme')?'teto':'miku';
      if (theme === companionTheme) return;
      companionTheme = theme;
      if(document.documentElement.dataset.theme!==theme)window.Weebokage?.setTheme(theme, { silent: true });
      syncTheme();
    };
    new MutationObserver(followCompanion).observe(dashboard,{attributes:true,attributeFilter:['class']});
    followCompanion();
  }
  syncTheme();
})();
