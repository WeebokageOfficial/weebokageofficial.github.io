// One telemetry loop in the persistent shell, independent of page navigation.
(() => {
  'use strict';
  const bar=document.createElement('aside');bar.id='cyber-diagnostics-bar';bar.setAttribute('aria-label','Live Cyber-Deck diagnostics');
  bar.innerHTML='<span class="diagnostics-label">◈ CYBER-DECK</span><span id="diagnostics-render" class="diagnostic-pill checking" role="status">RENDER // CHECKING</span><span id="diagnostics-power" title="Battery API unavailable; power source cannot be measured">PWR: AC // OK</span><span id="diagnostics-net">NET: UNKNOWN</span><time id="diagnostics-local" aria-label="Local system time"></time><time id="diagnostics-tokyo" aria-label="Tokyo time"></time>';
  document.body.prepend(bar);
  const $=id=>document.getElementById(id),life=new AbortController(),options={signal:life.signal};
  const local=new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  const tokyo=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  let clockTimer,pingTimer,request,timeout,battery,dead=false;
  function clocks(){const now=new Date();$('diagnostics-local').textContent='LOCAL: '+local.format(now);$('diagnostics-local').dateTime=now.toISOString();$('diagnostics-tokyo').textContent='TYO: '+tokyo.format(now)+' JST';$('diagnostics-tokyo').dateTime=now.toISOString();}
  function network(){const connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection;const type=connection?.type&&connection.type!=='unknown'&&connection.type!=='none'?connection.type:connection?.effectiveType;$('diagnostics-net').textContent=navigator.onLine?'NET: '+(type?type.toUpperCase():'UNKNOWN'):'NET: OFFLINE';}
  function power(){if(!battery)return;$('diagnostics-power').textContent=`PWR: ${Math.round(battery.level*100)}% [${battery.charging?'CHARGING':'DISCHARGING'}]`;$('diagnostics-power').title='Reported by the browser Battery API';}
  async function ping(){
    if(dead||request||document.hidden)return;
    request=new AbortController();timeout=setTimeout(()=>request?.abort(),10000);const started=performance.now(),pill=$('diagnostics-render');
    pill.classList.add('checking');
    try{
      const response=await fetch(window.Weebokage.apiBase+'/health',{signal:request.signal,cache:'no-store',headers:{Accept:'application/json'}});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const data=await response.json();if(data.status!=='ok')throw new Error('Unhealthy backend');
      const rtt=Math.round(performance.now()-started);pill.className='diagnostic-pill '+(rtt<150?'online':rtt<=500?'latency':'offline');pill.textContent=rtt<=500?`RENDER: ${rtt}ms // ${rtt<150?'ONLINE':'LATENCY'}`:'RENDER // OFFLINE';pill.title=`Last round trip: ${rtt} ms · ${new Date().toLocaleTimeString()}`;
    }catch(error){if(!dead){pill.className='diagnostic-pill offline';pill.textContent='RENDER // OFFLINE';pill.title=error.name==='AbortError'?'Health request timed out or paused':error.message;}}
    finally{clearTimeout(timeout);request=null;}
  }
  function stop(){clearInterval(clockTimer);clearInterval(pingTimer);request?.abort();}
  function start(){if(dead)return;stop();clocks();network();clockTimer=setInterval(clocks,1000);pingTimer=setInterval(ping,30000);void ping();}
  document.addEventListener('visibilitychange',()=>document.hidden?stop():start(),options);
  window.addEventListener('online',()=>{network();void ping();},options);window.addEventListener('offline',network,options);
  const connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection;connection?.addEventListener('change',network,options);
  if(navigator.getBattery)navigator.getBattery().then(value=>{if(dead)return;battery=value;power();battery.addEventListener('levelchange',power,options);battery.addEventListener('chargingchange',power,options);}).catch(()=>{});
  const resize=new ResizeObserver(()=>document.documentElement.style.setProperty('--diagnostics-height',Math.ceil(bar.getBoundingClientRect().height)+'px'));resize.observe(bar);
  function dispose(){if(dead)return;dead=true;stop();life.abort();resize.disconnect();bar.remove();}
  window.addEventListener('pagehide',event=>event.persisted?stop():dispose());window.addEventListener('pageshow',event=>{if(event.persisted)start();});
  window.LifeOSDiagnostics={refresh:ping,dispose};start();
})();
