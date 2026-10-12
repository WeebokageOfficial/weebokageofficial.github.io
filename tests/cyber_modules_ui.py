"""Playwright checks using mocked APIs and the real pinned VanillaTilt library."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import time
from ui_smoke import BASE, ARTIFACTS, configure, cf, fw
import tempfile, urllib.request
TILT_FIXTURE=Path(tempfile.gettempdir())/"weebokage-vanilla-tilt-1.8.1.js"
if not TILT_FIXTURE.exists():TILT_FIXTURE.write_bytes(urllib.request.urlopen("https://cdnjs.cloudflare.com/ajax/libs/vanilla-tilt/1.8.1/vanilla-tilt.min.js",timeout=20).read())
BATTERY='''(()=>{const battery=new EventTarget();battery.level=.73;battery.charging=false;Object.defineProperty(navigator,'getBattery',{value:async()=>battery,configurable:true});const net=new EventTarget();net.type='wifi';net.effectiveType='4g';Object.defineProperty(navigator,'connection',{value:net,configurable:true});window.testBattery=battery;window.testNet=net;})();'''
def solution(page):
 return page.evaluate('''()=>{const r=initBreachMinigame().round;for(let a=0;a<4;a++)for(let row=1;row<4;row++)for(let col=0;col<4;col++){let cells=[a,row*4+a,row*4+col];if(col!==a&&cells.every((c,i)=>r.board[c]===r.target[i]))return cells;}throw Error('no solution');}''')
def win(page):
 for cell in solution(page):page.locator('[data-breach-cell="'+str(cell)+'"]').click()
 page.locator('#breach-result').filter(has_text='ACCESS GRANTED').wait_for()
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,args=['--no-sandbox']);c=b.new_context(viewport={'width':1440,'height':1100},service_workers='block',permissions=['clipboard-read','clipboard-write']);configure(c);c.add_init_script(BATTERY)
 c.route('https://cdnjs.cloudflare.com/ajax/libs/vanilla-tilt/**',lambda r:r.fulfill(path=str(TILT_FIXTURE),content_type='application/javascript'))
 health={'delay':0,'fail':False,'calls':0}
 def ping(r):
  health['calls']+=1;time.sleep(health['delay'])
  if health['fail']:r.abort()
  else:r.fulfill(json={'status':'ok'})
 c.route('**/health',ping)
 page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(BASE+'lifeos.html',wait_until='domcontentloaded');f=cf(page);f.locator('[data-action="open-breach"]').wait_for();page.locator('#diagnostics-render.online').wait_for()
 assert page.locator('#diagnostics-power').inner_text()=='PWR: 73% [DISCHARGING]';assert page.locator('#diagnostics-net').inner_text()=='NET: WIFI';assert 'JST' in page.locator('#diagnostics-tokyo').inner_text()
 page.evaluate('testBattery.charging=true;testBattery.dispatchEvent(new Event("chargingchange"))');assert '[CHARGING]' in page.locator('#diagnostics-power').inner_text()
 for delay,status in [(0.25,'latency'),(.6,'offline')]:health['delay']=delay;page.evaluate('LifeOSDiagnostics.refresh()');assert status in page.locator('#diagnostics-render').get_attribute('class')
 health['fail']=True;page.evaluate('LifeOSDiagnostics.refresh()');assert 'offline' in page.locator('#diagnostics-render').get_attribute('class');health.update(delay=0,fail=False)
 print('PASS: health RTT green/yellow/red and request failure; live battery/network/world clocks',flush=True)
 fw(page).wait_for_function("document.querySelector('[data-holo-card=quote]').vanillaTilt!=null")
 settings=fw(page).evaluate("document.querySelector('[data-holo-card=quote]').vanillaTilt.settings");assert settings['max']==15 and settings['speed']==400 and settings['glare'] and settings['max-glare']==.35 and settings['gyroscope']
 f.locator('[data-holo-card="quote"] .holo-copy').click();f.locator('.holo-copy.copied').wait_for();copied=page.evaluate('navigator.clipboard.readText()');assert 'HATSUNE MIKU' in copied;page.wait_for_timeout(1600);assert f.locator('.holo-copy').inner_text()=='Copy Quote'
 for _ in range(4):f.locator('[data-tab="imam"]').click();f.locator('[data-tab="lifestyle"]').click()
 f.locator('[data-tab="imam"]').click();assert f.locator('[data-holo-card="hadith"] .holo-copy').count()==1;f.locator('[data-holo-card="hadith"] .holo-copy').click();f.locator('[data-holo-card="hadith"] .copied').wait_for();assert 'https://sunnah.com/' in page.evaluate('navigator.clipboard.readText()')
 assert fw(page).evaluate("document.querySelectorAll('[data-holo-card=quote] .js-tilt-glare').length")==1
 print('PASS: real VanillaTilt settings, clipboard quote/source, hadith copy and remount cleanup',flush=True)
 f.locator('[data-tab="lifestyle"]').click();page.evaluate('LifeOSCore.update(s=>{s.xp=80;s.breachRewards={};},{activity:false})');f.locator('[data-action="open-breach"]').click();assert page.locator('#breach-terminal').is_visible();assert page.locator('#breach-grid button:enabled').count()==0
 page.locator('#breach-start').click();assert page.locator('#breach-grid button:enabled').count()==4;win(page);assert '+40 XP' in page.locator('#breach-result').inner_text();assert 'LEVEL UP' in page.locator('#breach-result').inner_text();assert page.evaluate('LifeOSCore.read().level')==2;assert page.evaluate('LifeOSCore.read().xp')==20;assert '+40 XP' in page.locator('#shell-toast').inner_text()
 for n in range(2):page.locator('#breach-start').click();win(page)
 assert page.evaluate('LifeOSCore.read().xp')==100
 page.locator('#breach-start').click();win(page);assert 'PRACTICE' in page.locator('#breach-result').inner_text();assert page.evaluate('LifeOSCore.read().xp')==100
 page.locator('#breach-start').click();page.evaluate('initBreachMinigame().round.deadline=Date.now()-1');page.locator('#breach-result').filter(has_text='Time expired').wait_for();assert page.evaluate('LifeOSCore.read().xp')==100
 page.locator('#breach-start').click();page.evaluate("initBreachMinigame().round.target=['XX','XX','XX']");page.locator('[data-breach-cell="0"]').click();assert page.locator('#breach-grid button:enabled').count()==3;page.locator('[data-breach-cell="4"]').click();page.locator('[data-breach-cell="5"]').click();page.locator('#breach-result').filter(has_text='Buffer mismatch').wait_for()
 page.screenshot(path=str(ARTIFACTS/'breach-desktop.png'));page.keyboard.press('Escape');assert not page.locator('#breach-terminal').is_visible()
 page.locator('#terminal-toggle').click();page.locator('#terminal-input').fill('arcade');page.locator('#terminal-input').press('Enter');page.locator('#breach-terminal').wait_for(state='visible');page.locator('#quake-terminal').wait_for(state='hidden');page.keyboard.press('Escape')
 page.evaluate("LifeOSShell.navigate('anime.html')");cf(page).locator('.cyber-header').wait_for();assert page.locator('#cyber-diagnostics-bar').count()==1;assert page.evaluate('LifeOSCore.read().breachRewards[LifeOSCore.dateKey()].rounds.length')==3
 assert not errors,errors
 print('PASS: modal and terminal launch, real move constraints, +40 XP/level-up, 3/day limit, practice, timeout and mismatch; no JS errors',flush=True)
 mobile=b.new_context(viewport={'width':320,'height':844},is_mobile=True,has_touch=True,reduced_motion='reduce',service_workers='block');configure(mobile);mobile.route('**/health',lambda r:r.fulfill(json={'status':'ok'}));mobile.route('https://cdnjs.cloudflare.com/ajax/libs/vanilla-tilt/**',lambda r:r.abort());mp=mobile.new_page();mp.goto(BASE+'lifeos.html',wait_until='domcontentloaded');mf=cf(mp);mf.locator('[data-action="open-breach"]').wait_for();assert fw(mp).evaluate('document.documentElement.scrollWidth<=innerWidth');assert mp.evaluate('document.documentElement.scrollWidth<=innerWidth');assert fw(mp).evaluate("!document.querySelector('[data-holo-card=quote]').vanillaTilt");mf.locator('[data-action="open-breach"]').click();assert mp.locator('#breach-terminal').bounding_box()['width']<=320;mp.locator('#breach-start').click();win(mp);mp.screenshot(path=str(ARTIFACTS/'breach-mobile.png'));assert '+40 XP' in mp.locator('#breach-result').inner_text();print('PASS: 320px touch layout, reduced motion/CDN fallback, complete mobile breach',flush=True)
 b.close()
