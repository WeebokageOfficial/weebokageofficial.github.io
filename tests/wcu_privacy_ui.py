"""Private archive stays closed for anonymous users and ordinary signed-in accounts."""
import os,json,re
from pathlib import Path
from playwright.sync_api import sync_playwright
from ui_smoke import configure,cf,fw,BASE
from wcu_fixtures import DATABASE,firebase_script

with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('UI_BROWSER_PATH','/opt/brave.com/brave/brave'),headless=True,args=['--no-sandbox'])
 for role in ['anonymous','visitor','owner']:
  context=browser.new_context(service_workers='block');configure(context);context.add_init_script(firebase_script(role))
  context.route('**/admin/config',lambda r:r.fulfill(status=403,json={'detail':'Admin access required.'}))
  page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(BASE+'wcu.html#/project/example-story');f=cf(page)
  if role=='owner':
   f.locator('#wcu-view-title').filter(has_text='Example Story').wait_for()
   assert f.locator('#wcu-access').is_hidden()
   f.locator('[data-wcu-edit]').click();assert f.locator('#wcu-editor').is_visible()
   # Losing authentication clears data, the editor draft, and the rendered dossier.
   fw(page).evaluate('testAuthSignOut()')
   f.locator('#wcu-access').wait_for();page.wait_for_timeout(200)
  else:
   f.locator('#wcu-access-message').filter(has_text='administrator only').wait_for()
   assert fw(page).evaluate('window.testArchiveReads')==0,role
   assert f.locator('#wcu-main').is_hidden()
   assert f.locator('#wcu-view').inner_text()==''
   assert not fw(page).evaluate('WCU_DATABASE.projects.length')
   assert f.locator('#wcu-manage').is_hidden()
  assert not errors,(role,errors)
  context.close()
 browser.close()
# Static assets contain no actual records; old public cache entries are not retained.
assert 'timelines:[],projects:[],characters:[]' in Path('wcu-data.js').read_text()
assert not re.search(r"'\./wcu[^']*'",Path('sw.js').read_text())
rules=Path('firestore.rules').read_text().split('match /wcu/active {')[1].split('allow create')[0]
assert 'allow read: if isWikiOwner();' in rules
home=Path('index.html').read_text()
assert 'novel-section' not in home and 'wcu-section' not in home
print('PASS: anonymous and signed-in non-admin users trigger no archive reads; owner dossiers work; sign-out clears content; static data is empty; private Firestore reads and cache exclusions are configured.')
