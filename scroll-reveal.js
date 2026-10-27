(() => {
  'use strict';
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const items=[...document.querySelectorAll('.reveal-on-scroll')];
  let observer;
  const showAll=()=>{observer?.disconnect();items.forEach(item=>item.classList.add('is-visible'));};
  if(reduced.matches || !('IntersectionObserver' in window))showAll();
  else {
    document.documentElement.classList.add('scroll-reveal-ready');
    observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
      if(!entry.isIntersecting)return;
      entry.target.classList.add('is-visible');observer.unobserve(entry.target);
      if(entry.target.matches('[data-tilt-card]'))setTimeout(()=>entry.target.classList.add('reveal-complete'),800+(Number(entry.target.dataset.delay)||0));
    }),{threshold:0.08,rootMargin:'0px 0px -24px 0px'});
    items.forEach(item=>{const delay=Number(item.dataset.delay)||0;item.style.setProperty('--reveal-delay',`${Math.max(0,Math.min(delay,500))}ms`);observer.observe(item);});
    reduced.addEventListener('change',event=>{if(event.matches)showAll();});
  }
  const fine=matchMedia('(hover: hover) and (pointer: fine)');
  document.querySelectorAll('[data-tilt-card]').forEach(card=>{
    let frame;
    const reset=()=>{cancelAnimationFrame(frame);card.style.removeProperty('--tilt-x');card.style.removeProperty('--tilt-y');};
    card.addEventListener('pointerenter',()=>{if(!reduced.matches && fine.matches)card.classList.add('reveal-complete');});
    card.addEventListener('pointermove',event=>{
      if(reduced.matches || !fine.matches)return;
      cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>{const box=card.getBoundingClientRect();card.style.setProperty('--tilt-x',`${-(event.clientY-box.top-box.height/2)/box.height*6}deg`);card.style.setProperty('--tilt-y',`${(event.clientX-box.left-box.width/2)/box.width*6}deg`);});
    });
    card.addEventListener('pointerleave',reset);card.addEventListener('blur',reset);reduced.addEventListener('change',reset);
  });
  // Anchor navigation remains in the current document, preserving reveal state.
  document.querySelectorAll('a[href^="#"]').forEach(anchor=>anchor.addEventListener('click',event=>{
    const destination=document.getElementById(anchor.hash.slice(1));if(!destination)return;
    event.preventDefault();destination.classList.add('is-visible');destination.scrollIntoView({behavior:reduced.matches?'instant':'smooth',block:'start'});
    history.replaceState(null,'',anchor.hash);
  }));
})();
