"""Mocked greetings, account changes, theme enforcement and narrow layouts."""
from playwright.sync_api import sync_playwright
from ui_smoke import configure, cf, fw, BASE

def main():
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
  for signed_in in [False,True]:
   context=browser.new_context(viewport={'width':390,'height':844},service_workers='block')
   configure(context)
   if not signed_in:
    context.add_init_script("if(window.firebase)firebase.auth().currentUser=null;")
    context.route('https://www.gstatic.com/**',lambda r:r.fulfill(body="if(window.firebase)firebase.auth().currentUser=null;",content_type='application/javascript'))
   calls=[]
   def quote(route):
    data=route.request.post_data_json;calls.append((data,route.request.headers.get('authorization')))
    name='Teto' if data['tab']=='teto' else 'Miku'
    route.fulfill(json={'tab':data['tab'],'quote':f'{name}: Hello '+('Master!' if route.request.headers.get('authorization') else 'visitor!')})
   context.route('**/lifeos/quote',quote)
   page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   for name in ['index','chat']:
    if page.url.startswith(BASE): page.evaluate("localStorage.setItem('theme','miku');LifeOSCore.update(s=>{s.preferences.theme='miku';},{activity:false})")
    page.goto(BASE+name+'.html');f=cf(page)
    f.locator('.companion-source').filter(has_text='GROQ').wait_for()
    assert f.locator('.companion-bubble').is_visible()
    assert ('Master' in f.locator('.companion-line').inner_text())==signed_in
    f.locator('.menu-toggle').click();f.locator('.cyber-theme').click();f.locator('.menu-toggle').click()
    f.locator('.companion-line').filter(has_text='Teto').wait_for()
    assert 'tetokage' in f.locator('.portal-art img' if name=='index' else '.neural-sidebar>img').get_attribute('src')
    f.locator('.companion-reroll').click();f.locator('.companion-source').filter(has_text='GROQ').wait_for()
    assert fw(page).evaluate('document.documentElement.scrollWidth<=innerWidth')
    # Verify an auth transition clears the old greeting.
    if signed_in:
     fw(page).evaluate('firebase.auth().currentUser=null; document.dispatchEvent(new Event("themechange"))')
     f.locator('.companion-line').filter(has_text='visitor').wait_for()
     fw(page).evaluate("firebase.auth().currentUser={uid:'test',getIdToken:async()=> 'test-only'};document.dispatchEvent(new Event('themechange'))")
     f.locator('.companion-line').filter(has_text='Master').wait_for()
   page.goto(BASE+'lifeos.html');f=cf(page);f.locator('#dashboard').wait_for()
   if f.locator('#enter-lifeos').is_visible():f.locator('#enter-lifeos').click()
   # Start with a conflicting globally saved preference.
   page.evaluate("LifeOSCore.update(s=>{s.preferences.theme='teto';},{activity:false})")
   for tab in ['teto','lifestyle','lore','finance','imam','teto']:
    f.locator('[data-tab="'+tab+'"]').click();page.wait_for_timeout(150)
    expected='teto' if tab=='teto' else 'miku'
    assert fw(page).evaluate('document.documentElement.dataset.theme')==expected,tab
    assert page.evaluate('document.documentElement.dataset.theme')==expected,tab
    f.locator('#persona-sprite').wait_for(state='visible')
    assert f.locator('#persona-sprite').get_attribute('src')==f'assets/lifeos/sprite_{tab}.png'
    f.locator('.menu-toggle').click();f.locator('.cyber-theme').click();f.locator('.menu-toggle').click()
    assert fw(page).evaluate('document.documentElement.dataset.theme')==expected
   page.goto(BASE+'index.html');f=cf(page)
   f.locator('.companion-source').filter(has_text='GROQ').wait_for()
   assert page.evaluate('document.documentElement.dataset.theme')==fw(page).evaluate('document.documentElement.dataset.theme')
   assert not errors,errors
   assert any(auth for _,auth in calls)==signed_in
   context.close()
  browser.close()
 print('PASS: greetings, verified-token forwarding, guest/master transitions, portraits, forced LifeOS themes, mobile layout')
if __name__=='__main__':main()
