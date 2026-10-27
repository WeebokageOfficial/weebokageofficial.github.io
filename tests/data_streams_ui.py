"""Public VocaDB stream pages and removal of daily encounters, with deterministic external API fixtures."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
from ui_smoke import configure, cf, fw, BASE, ARTIFACTS

TRACKS=[{'id':i,'name':f'Neon Frequency {i}','minMilliBpm':150000,'maxMilliBpm':150000,'thumbUrl':'https://sprites.example.test/cover.webp','artists':[{'name':'Cyber Producer','artist':{'artistType':'Producer'}},{'name':'Hatsune Miku','artist':{'artistType':'Vocaloid'}}],'pvs':[{'service':'Youtube','pvType':'Original','url':'https://youtu.be/test-only'}]} for i in range(1,5)]
def fixtures(context,calls):
 context.route('https://sprites.example.test/**',lambda r:r.fulfill(body=Path('assets/avatars/mikukage.webp').read_bytes(),content_type='image/webp'))
 def voca(route):
  calls.append(route.request.url)
  assert 'authorization' not in route.request.headers
  route.fulfill(json={'items':TRACKS})
 context.route('https://vocadb.net/api/**',voca)

def main():
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,args=['--no-sandbox'],**({'executable_path':os.environ['UI_BROWSER_PATH']} if os.environ.get('UI_BROWSER_PATH') else {}))
  for width in [390,1440]:
   context=browser.new_context(viewport={'width':width,'height':950},service_workers='block',reduced_motion='reduce');configure(context);calls=[];fixtures(context,calls)
   page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(BASE+'lifeos.html');f=cf(page);f.locator('[data-vocadb-widget] .stream-track').wait_for()
   if f.locator('#enter-lifeos').is_visible():f.locator('#enter-lifeos').click()
   assert f.locator('[data-cyberdex-widget]').count()==0
   first=f.locator('[data-vocadb-widget] h3').inner_text();f.locator('[data-stream-reroll]').click()
   page.wait_for_timeout(200);assert f.locator('[data-vocadb-widget] h3').inner_text()!=first
   assert len([u for u in calls if 'vocadb.net' in u])==1
   checks=f.locator('[data-change="habit"]')
   for i in range(checks.count()):checks.nth(i).check()
   assert page.evaluate('LifeOSCore.read().xp')==65
   assert page.locator('#cyberdex-modal').count()==0
   assert f.locator('[data-cyberdex-widget]').count()==0
   assert fw(page).evaluate('document.documentElement.scrollWidth<=innerWidth')
   page.evaluate("LifeOSTerminal.toggle(true)")
   field=page.locator('#terminal-input')
   for command,expected in [('vocaloid random','VOCADB STREAM'),('vocaloid find Miku','3. Neon Frequency 3')]:
    field.fill(command);field.press('Enter');page.locator('#terminal-output').filter(has_text=expected).wait_for();page.wait_for_timeout(100)
   page.evaluate('LifeOSTerminal.toggle(false)')
   page.evaluate("LifeOSShell.navigate('vocadb.html')");f=cf(page);f.locator('[data-vocadb-widget] .stream-track').wait_for()
   f.locator('#voca-query').fill('Miku');f.locator('#vocadb-search button').click();f.locator('#vocadb-results .stream-track').first.wait_for()
   assert f.locator('#vocadb-results .stream-track').count()==4
   assert fw(page).evaluate('document.documentElement.scrollWidth<=innerWidth')
   page.screenshot(path=str(ARTIFACTS/f'streams-vocadb-{width}.png'))
   page.reload();f=cf(page);f.locator('[data-vocadb-widget] .stream-track').wait_for()
   assert len([u for u in calls if 'vocadb.net' in u and 'query=' not in u])==1
   assert not errors,errors
   context.close()
  browser.close()
 print('PASS: VocaDB desktop/mobile, cache, CLI, habits and Cyber-Dex removal')
if __name__=='__main__':main()
