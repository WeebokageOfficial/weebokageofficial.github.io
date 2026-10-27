"""Prayer names stay readable alongside native time controls at every screen size."""
import os
from playwright.sync_api import sync_playwright
from ui_smoke import configure,cf,BASE
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('UI_BROWSER_PATH','/opt/brave.com/brave/brave'),headless=True,args=['--no-sandbox'])
    context=browser.new_context(service_workers='block');configure(context)
    page=context.new_page();page.goto(BASE+'lifeos.html?tab=imam');f=cf(page)
    f.locator('.prayer-row').first.wait_for()
    if f.locator('#enter-lifeos').is_visible():f.locator('#enter-lifeos').click()
    for width in [320,375,768,1440]:
        page.set_viewport_size({'width':width,'height':1000})
        assert f.locator('.prayer-name').all_text_contents()==['Fajr','Dhuhr','Asr','Maghrib','Isha']
        for row in f.locator('.prayer-row').all():
            name=row.locator('.prayer-name');time=row.locator('[type=time]')
            assert name.evaluate('(e)=>e.clientWidth>=e.scrollWidth'),(width,name.inner_text())
            a=name.bounding_box();b=time.bounding_box();assert a['x']+a['width']<=b['x']
            assert b['width']>=100
    f.locator('label[for="prayer-check-Fajr"]').click()
    assert f.locator('#prayer-check-Fajr').is_checked()
    print('Five prayer labels fit at 320, 375, 768 and 1440px; label completion works.')
    browser.close()
