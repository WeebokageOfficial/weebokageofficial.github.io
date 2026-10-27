"""Private wiki rendering and search use synthetic fixtures, never actual lore."""
import os
from playwright.sync_api import sync_playwright
from ui_smoke import configure,cf,fw,BASE
from wcu_fixtures import firebase_script
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('UI_BROWSER_PATH','/opt/brave.com/brave/brave'),headless=True,args=['--no-sandbox'])
 c=b.new_context(service_workers='block');configure(c);c.add_init_script(firebase_script())
 page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(BASE+'wcu.html');f=cf(page);f.locator('.wcu-project-card').nth(1).wait_for()
 f.locator('#wcu-status').select_option('Planned');f.locator('.wcu-project-card').filter(has_text='Second Story').wait_for();assert f.locator('.wcu-project-card').count()==1
 f.locator('#wcu-reset').click();f.locator('.wcu-project-card').nth(1).wait_for()
 f.locator('#wcu-search').fill('Example');f.locator('.wcu-search-group').first.wait_for()
 f.locator('.wcu-project-card h3 a').filter(has_text='Example Story').click();f.locator('.wcu-infobox').wait_for()
 f.locator('.wcu-infobox a[href*="character/example-character"]').click();f.locator('#wcu-view-title').filter(has_text='Example Character').wait_for()
 assert f.locator('#wiki-appearances li').count()==2
 page.go_back();f=cf(page);f.locator('#wcu-view-title').filter(has_text='Example Story').wait_for()
 for width in [320,375,768,1440]:
  page.set_viewport_size({'width':width,'height':1000})
  for route in ['timeline','projects','characters','project/example-story','character/example-character']:
   page.goto(BASE+'wcu.html#/'+route);f=cf(page);f.locator('#wcu-view-title').wait_for()
   assert fw(page).evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,route)
 assert not errors,errors
 print('PASS: private owner wiki filters, search, cross-links, history, and responsive dossiers with synthetic records.')
 b.close()
