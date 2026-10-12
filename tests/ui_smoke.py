"""Run against a local static server; uses only mocked Firebase/API data. Requires Playwright + Chromium."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
import os
BASE=os.environ.get('UI_BASE_URL','http://127.0.0.1:8765/').rstrip('/')+'/'
ARTIFACTS=Path(os.environ.get('UI_ARTIFACT_DIR','/tmp/weebokage-ui'));ARTIFACTS.mkdir(parents=True,exist_ok=True)
FIREBASE='''(()=>{const user={email:'test@example.test',getIdToken:async()=> 'test-only'};const auth={currentUser:location.pathname.endsWith('/login.html')?null:user,onAuthStateChanged(fn){setTimeout(()=>fn(this.currentUser),0);return()=>{};},signOut:async()=>{},setPersistence:async()=>{},signInWithEmailAndPassword:async()=>{throw new Error('test rejection');}};const collection=name=>({orderBy(){return this},limit(){return this},onSnapshot(fn){fn({size:1,docs:[{data:()=>name==='posts'?{title:'A new frequency',content:'The digital sector is online. Build a little, explore a little.',timestamp:{toDate:()=>new Date('2026-10-12T12:00:00Z')}}:{name:'Signal visitor',msg:'Love this corner of the internet.'}}]});return()=>{};},add:async data=>{window.mockWrites=(window.mockWrites||[]).concat({name,data})}});const firestore=()=>({collection});firestore.FieldValue={serverTimestamp:()=> 'test-time'};const authFn=()=>auth;authFn.Auth={Persistence:{LOCAL:'local'}};window.firebase={apps:[{}],initializeApp(){},app(){return{}},auth:authFn,firestore};})();'''
ANIME=[{'mal_id':i+1,'title':title,'type':kind,'status':'Finished Airing','score':score,'episodes':12,'images':{'jpg':{'large_image_url':BASE+'assets/mikukage.webp'}}} for i,(title,kind,score) in enumerate([('Cyber Song','TV',8.5),('Vocaloid Memories','Movie',9.1),('A Neon Dream','TV',7.4),('Orbit 39','OVA',8.2),('Beyond the Gate','TV',9.5),('Moonlight Core','Movie',8.3)])]
def configure(c):
 c.add_init_script(FIREBASE)
 c.route('https://www.gstatic.com/**',lambda r:r.fulfill(body='',content_type='application/javascript'))
 c.route('https://fonts.googleapis.com/**',lambda r:r.abort())
 c.route('https://fonts.gstatic.com/**',lambda r:r.abort())
 c.route('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/**',lambda r:r.fulfill(body='',content_type='text/css'))
 c.route('https://unpkg.com/**',lambda r:r.abort())
 c.route('https://js-dos.com/**',lambda r:r.abort())
 c.route('https://cdn.jsdelivr.net/npm/three@0.180.0/**',lambda r:r.abort())
 def api(r):
  path=r.request.url
  if '/anime-proxy' in path:data=ANIME
  elif '/anime-detail/' in path:data={'info':dict(ANIME[0],synopsis='A story about music, code and connection.',rank=39,duration='24 min',rating='PG-13',season='spring',year=2026),'characters':[]}
  elif '/admin/config' in path:data={'transit':[{'name':name,'url':'https://feed.example/'+name} for name in ['Nagelsbaum','Opladen','Leverkusen','Merheim']],'drives':[{'title':'Secure documents','url':'https://drive.example','label':'Open archive'}]}
  elif '/chat' in path:data={'reply':'## Neural link ready\nHello **Producer**.\n```javascript\nconst frequency = 39;\n```\n<script>window.bad=true</script><img src=x onerror="window.bad=true">\n[Unsafe](javascript:alert(1))'}
  elif '/hadith/' in path:data={'arabic':'بِسْمِ اللهِ','english':'A test archive entry.','number':1}
  else:data={'quote':'A small step is a lovely start.','reply':'Ready.'}
  r.fulfill(json=data)
 c.route('https://weebokageofficial-github-io.onrender.com/**',api)
 c.route('https://api.open-meteo.com/**',lambda r:r.fulfill(json={'current_weather':{'temperature':18,'windspeed':8}}))
 c.route('https://feed.example/**',lambda r:r.fulfill(body='<html><body style="background:#121820;color:#39c5bb;font-family:monospace;padding:20px">DEPARTURES // LIVE<br><br>260 · Köln Hbf · 4 min<br><br>251 · Opladen · 9 min</body></html>',content_type='text/html'))
def cf(page):return page.frame_locator('#site-content')
def fw(page):return page.locator('#site-content').element_handle().content_frame()
def main():
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
  c=browser.new_context(viewport={'width':1440,'height':1100},service_workers='block');configure(c)
  page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  for name in ['index','anime','transit','chat','games','credits','islam','downloads','login','lifeos','scanner']:
   page.goto(BASE+name+'.html',wait_until='domcontentloaded');f=cf(page);f.locator('.cyber-header').wait_for();f.locator('.cyber-footer').wait_for();page.wait_for_timeout(300)
   if name=='lifeos':f.locator('#enter-lifeos').click() if f.locator('#enter-lifeos').is_visible() else None
   assert f.locator('.cyber-nav a[href="chat.html"]').count()==1,name
   assert fw(page).evaluate('document.documentElement.scrollWidth<=innerWidth'),(name,'desktop overflow')
   assert fw(page).evaluate("getComputedStyle(document.body).backgroundColor")=='rgb(10, 14, 20)',name
   if name in ['index','anime','transit','chat','lifeos']:page.screenshot(path=str(ARTIFACTS/('desktop-'+name+'.png')))
   print('DESKTOP',name,flush=True)
   if name=='index':
    f.locator('#guestName').fill('UI test');f.locator('#guestMsg').fill('Test only');f.locator('#commentBtn').click();f.locator('#comment-status').filter(has_text='Message sent.').wait_for()
   if name=='anime':
    f.locator('.ani-card').first.wait_for();assert f.locator('.ani-card').count()==6
    f.locator('#anime-type').select_option('TV');assert f.locator('.ani-card').count()==3
    f.locator('#anime-sort').select_option('score');assert f.locator('.ani-title').first.inner_text()=='Beyond the Gate'
    f.locator('.ani-card').first.click();f.locator('#modal-title-en').wait_for();assert f.locator('#anime-modal-backdrop').get_attribute('class')=='open';f.locator('#modal-close').click()
    f.locator('#aniSearch').fill('Miku');f.locator('#aniSearch').press('Enter');f.locator('#grid-header').filter(has_text='Miku').wait_for()
    page.route('**/anime-proxy**',lambda r:r.fulfill(status=502,json={'detail':'Test upstream unavailable'}));f.locator('#search-button').click();f.locator('.is-error').filter(has_text='HTTP 502').wait_for();page.unroute('**/anime-proxy**')
   if name=='transit':assert f.locator('.stop-card').count()==4
   if name=='chat':
    f.locator('#miku-input').fill('Explain code');f.locator('#neural-send').click();f.locator('.chat-message pre code').wait_for();assert f.locator('.chat-message pre code.hljs').count()==1;assert not fw(page).evaluate('window.bad||false');assert f.locator('.chat-message script,.chat-message img').count()==0;assert f.locator('.chat-message a[href^="javascript:"]').count()==0
   if name=='login':
    f.locator('#email').fill('test@example.test');f.locator('#pass').fill('test-only');f.locator('#loginBtn').click();f.locator('#err').filter(has_text='ACCESS DENIED').wait_for()
  assert not errors,errors
  # Check all pages in one mobile shell without replacing persistent services.
  mc=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,service_workers='block',reduced_motion='reduce');configure(mc);mp=mc.new_page();me=[];mp.on('pageerror',lambda e:me.append(str(e)))
  for name in ['index','anime','transit','chat','games','credits','islam','downloads','login','lifeos','scanner']:
   mp.goto(BASE+name+'.html',wait_until='domcontentloaded');f=cf(mp);f.locator('.cyber-header').wait_for();mp.wait_for_timeout(250)
   assert fw(mp).evaluate('document.documentElement.scrollWidth<=innerWidth'),(name,'mobile overflow',fw(mp).evaluate('[document.documentElement.scrollWidth,innerWidth]'))
   if name=='lifeos':f.locator('#enter-lifeos').click() if f.locator('#enter-lifeos').is_visible() else None
   f.locator('.menu-toggle').click();assert f.locator('.menu-toggle').get_attribute('aria-expanded')=='true';assert f.locator('.cyber-nav a[href="chat.html"]').is_visible();f.locator('.menu-toggle').click()
   if name in ['index','anime','chat','transit']:mp.screenshot(path=str(ARTIFACTS/('mobile-'+name+'.png')))
   print('MOBILE',name,flush=True)
  # Extra compact and tablet layouts, plus LifeOS module/theme state.
  for width in [320,768]:
   mp.set_viewport_size({'width':width,'height':900})
   for name in ['index','anime','chat','lifeos']:
    mp.goto(BASE+name+'.html',wait_until='domcontentloaded');f=cf(mp);f.locator('.cyber-header').wait_for()
    if name=='lifeos':
     for tab in ['lifestyle','finance','lore','teto','imam']:
      f.locator('[data-tab="'+tab+'"]').click()
      assert fw(mp).evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,name,tab)
     before=fw(mp).evaluate('LifeOSCore.read().activeTab')
     f.locator('.menu-toggle').click();f.locator('.cyber-theme').click()
     assert fw(mp).evaluate('LifeOSCore.read().activeTab')==before
     assert fw(mp).evaluate('document.documentElement.dataset.theme')=='miku'
     assert mp.evaluate('document.documentElement.dataset.theme')=='miku'
    assert fw(mp).evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,name)
    # Restore Miku for the next width.
    mp.evaluate("localStorage.setItem('theme','miku');LifeOSCore.update(s=>{s.preferences.theme='miku';},{activity:false});")
  assert not me,me
  print('PASS: 11 pages desktop/mobile, navigation, no overflow, guestbook, anime filters/search/modal/error, transit feeds, safe Markdown/highlighting, login errors',flush=True)
  browser.close()

if __name__=='__main__':main()
