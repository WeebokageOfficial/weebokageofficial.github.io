"""Header separation, custom identity/cover slots, and equal hover behavior."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
from ui_smoke import configure,cf,fw,BASE
from wcu_fixtures import firebase_script
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('UI_BROWSER_PATH','/opt/brave.com/brave/brave'),headless=True,args=['--no-sandbox'])
    context=browser.new_context(service_workers='block');configure(context);context.add_init_script(firebase_script())
    context.add_init_script("const now=new Date();localStorage.setItem('weebokage_splash_date',`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`);")
    png=Path('assets/avatars/tetokage.png').read_bytes()
    context.route('**/assets/profile/profile.png',lambda r:r.fulfill(body=png,content_type='image/png'))
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    for width in [320,375,768,1440]:
        page.set_viewport_size({'width':width,'height':1000})
        for route in ['index.html','wcu.html#/project/example-story']:
            page.goto(BASE+route);f=cf(page);f.locator('main').wait_for();page.wait_for_timeout(300)
            # Focus and cross-frame scrolling previously moved the iframe beneath diagnostics.
            f.locator('main').scroll_into_view_if_needed()
            bar=page.locator('#cyber-diagnostics-bar').bounding_box();nav=f.locator('.cyber-header').bounding_box()
            assert nav['y']>=bar['y']+bar['height']-.5,(width,route,bar,nav)
            assert page.evaluate('document.scrollingElement.scrollTop')==0
            assert fw(page).evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,route)
        page.goto(BASE+'index.html');f=cf(page)
        f.locator('#operator-profile').evaluate('(i)=>new Promise(resolve=>{const timer=setInterval(()=>{if(i.src.endsWith("assets/profile/profile.png")){clearInterval(timer);resolve();}},10)})')
        assert f.locator('#operator-profile').get_attribute('src').endswith('assets/profile/profile.png')
        before=f.locator('#operator-profile').get_attribute('src')
        fw(page).evaluate("Weebokage.setTheme('teto',{manual:true,silent:true})")
        assert f.locator('#operator-profile').get_attribute('src')==before
        assert f.locator('.novel-cover-slot').count()==0
    page.set_viewport_size({'width':1440,'height':1000})
    for i in range(3):
        card=f.locator('.domain-card').nth(i);card.scroll_into_view_if_needed();page.wait_for_timeout(1100)
        box=card.bounding_box();page.mouse.move(box['x']+box['width']*.8,box['y']+box['height']*.3)
        page.wait_for_timeout(250)
        assert card.evaluate('(e)=>getComputedStyle(e).transform')!='none'
        assert card.evaluate('(e)=>e.style.getPropertyValue("--tilt-x")')
        assert card.evaluate('(e)=>getComputedStyle(e).transitionDelay')=='0s'
        page.mouse.move(0,0)
    assert not errors,errors
    print('PASS: bar/navigation separation after focus scrolling at 320–1440px; custom PNGs load independently of theme; all three interest cards tilt without delay.')
    browser.close()
