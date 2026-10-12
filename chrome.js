(() => {
  'use strict';
  const header=document.querySelector('.cyber-header'), menu=document.querySelector('.menu-toggle'), nav=document.querySelector('.cyber-nav');
  function setOpen(open){menu?.setAttribute('aria-expanded',String(open));menu?.setAttribute('aria-label',open?'Close navigation':'Open navigation');header?.classList.toggle('menu-open',open);}
  menu?.addEventListener('click',()=>setOpen(menu.getAttribute('aria-expanded')!=='true'));
  window.addEventListener('keydown',event=>{if(event.key==='Escape'&&header?.classList.contains('menu-open')){event.preventDefault();event.stopImmediatePropagation();setOpen(false);menu.focus();}},true);
  document.addEventListener('click',event=>{if(header&&!header.contains(event.target))setOpen(false);});
  nav?.addEventListener('click',event=>{if(event.target.closest('a'))setOpen(false);});
  matchMedia('(min-width:1101px)').addEventListener('change',()=>setOpen(false));
  const themeButton=document.querySelector('.cyber-theme');
  function syncTheme(){const theme=document.documentElement.dataset.theme==='teto'?'teto':'miku';
    themeButton?.setAttribute('aria-pressed',String(theme==='teto'));const label=themeButton?.querySelector('span');if(label)label.textContent=theme.toUpperCase();
    document.querySelectorAll('.portal-art img,.neural-sidebar>img,.splash-avatar').forEach(image=>{
      const src=`assets/${theme==='teto'?'tetokage':'mikukage'}.webp`;
      if(image.getAttribute('src')!==src)image.src=src;
      image.alt=theme==='teto'?'Teto companion':'Miku companion';
    });
  }
  themeButton?.addEventListener('click',()=>{
    const next=document.documentElement.dataset.theme==='teto'?'miku':'teto';
    window.Weebokage?.setTheme(next, { manual: true });
    window.parent.LifeOSShell?.syncTheme();
    syncTheme();
    setOpen(false);
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
