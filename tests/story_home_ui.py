"""Story homepage, guestbook extraction, shell routing, motion and responsive layout."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
from ui_smoke import configure,cf,fw,BASE,ARTIFACTS

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('UI_BROWSER_PATH','/opt/brave.com/brave/brave'),headless=True,args=['--no-sandbox'])
    context=browser.new_context(service_workers='block');configure(context)
    context.add_init_script("const now=new Date();localStorage.setItem('weebokage_splash_date',`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`);")
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_viewport_size({'width':1440,'height':1000});page.goto(BASE+'index.html');f=cf(page)
    f.locator('#operator-title').wait_for();f.locator('.operator-dossier.is-visible').wait_for()
    assert f.locator('#guestbook-form,#comments-feed,#blog-feed,.module-links').count()==0
    assert f.locator('.domain-card').count()==3
    assert f.locator('.novel-section,.wcu-section').count()==0
    assert f.locator('.operator-portrait img').evaluate('(i)=>getComputedStyle(i).borderRadius')=='50%'
    document_before=fw(page).evaluate('window.storyMarker=39')
    f.locator('.story-scroll').click();page.wait_for_timeout(1000)
    assert fw(page).evaluate('window.storyMarker')==39
    assert fw(page).evaluate('scrollY')>100
    for element in f.locator('.reveal-on-scroll').all():element.scroll_into_view_if_needed();page.wait_for_timeout(100)
    page.wait_for_timeout(1000)
    assert f.locator('.reveal-on-scroll:not(.is-visible)').count()==0
    fw(page).evaluate('scrollTo(0,0)');page.wait_for_timeout(100)
    page.screenshot(path=str(ARTIFACTS/'story-desktop.png'),full_page=True)
    page.goto(BASE+'guestbook.html');f=cf(page);f.locator('#guestbook-form').wait_for()
    assert f.locator('.guestbook-entry').count()==1
    f.locator('#guestName').fill('Test visitor');f.locator('#guestMsg').fill('<script>window.injected=true</script> A little signal.')
    f.locator('#commentBtn').click();f.locator('#comment-status').filter(has_text='Message sent.').wait_for()
    writes=fw(page).evaluate('window.mockWrites');assert writes[-1]['name']=='comments'
    assert writes[-1]['data']['name']=='Test visitor'
    assert f.locator('#guestMsg').input_value()==''
    assert fw(page).evaluate('window.injected') is None
    # Check direct URLs and both new navigation destinations in the existing categories.
    for name in ['index','guestbook','wcu','lifeos','chat']:
        page.goto(BASE+name+'.html');f=cf(page);f.locator('.cyber-nav').wait_for()
        assert f.locator('.cyber-nav a[href="guestbook.html"]').count()==1
        assert f.locator('.cyber-nav a[href="wcu.html"]').count()==1
    for width in [320,375,768,1440]:
        page.set_viewport_size({'width':width,'height':900})
        for name in ['index','guestbook','wcu']:
            page.goto(BASE+name+'.html');f=cf(page);f.locator('#wcu-access' if name=='wcu' else 'main').wait_for()
            assert fw(page).evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,name)
        if width==375:
            page.goto(BASE+'index.html');f=cf(page);f.locator('#operator-title').wait_for();page.wait_for_timeout(800)
            page.screenshot(path=str(ARTIFACTS/'story-mobile.png'))
    page.emulate_media(reduced_motion='reduce');page.goto(BASE+'index.html');f=cf(page);f.locator('#operator-title').wait_for()
    assert f.locator('.reveal-on-scroll:not(.is-visible)').count()==0
    assert f.locator('.story-scroll span').evaluate('(i)=>getComputedStyle(i).animationName')=='none'
    assert not errors,errors
    print('Story content, reveals, in-page scroll, WCU shell routes, guestbook submission, reduced motion and 320–1440px layouts passed.')
    browser.close()
# All shared headers contain both links, not just the representative pages above.
for file in Path('.').glob('*.html'):
    text=file.read_text()
    if '<header class="cyber-header">' in text:
        header=text.split('<header class="cyber-header">')[1].split('</header>')[0]
        assert 'href="guestbook.html"' in header,file
        assert 'href="wcu.html"' in header,file
print('Shared navigation links verified across every page header.')
