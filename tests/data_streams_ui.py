"""Public stream pages and the daily encounter, with deterministic external API fixtures."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from ui_smoke import configure, cf, fw, BASE, ARTIFACTS

TRACKS=[{'id':i,'name':f'Neon Frequency {i}','minMilliBpm':150000,'maxMilliBpm':150000,'thumbUrl':'https://sprites.example.test/cover.webp','artists':[{'name':'Cyber Producer','artist':{'artistType':'Producer'}},{'name':'Hatsune Miku','artist':{'artistType':'Vocaloid'}}],'pvs':[{'service':'Youtube','pvType':'Original','url':'https://youtu.be/test-only'}]} for i in range(1,5)]
def fixtures(context,calls):
 context.route('https://sprites.example.test/**',lambda r:r.fulfill(body=Path('assets/mikukage.webp').read_bytes(),content_type='image/webp'))
 def voca(route):
  calls.append(route.request.url)
  assert 'authorization' not in route.request.headers
  route.fulfill(json={'items':TRACKS})
 context.route('https://vocadb.net/api/**',voca)
 def poke(route):
  calls.append(route.request.url)
  assert 'authorization' not in route.request.headers
  query=route.request.url.rstrip('/').split('/')[-1]
  if query=='typo':route.fulfill(status=404,json={});return
  ident=int(query) if query.isdigit() else 25
  if '/pokemon-species/' in route.request.url:
   route.fulfill(json={'names':[{'name':'Daten-Pikachu','language':{'name':'de'}}],'flavor_text_entries':[{'flavor_text':'Ein elektrisches Datensignal.','language':{'name':'de'}}]})
  else:
   route.fulfill(json={'id':ident,'name':'pikachu','species':{'name':str(ident)},'height':4,'weight':60,'types':[{'type':{'name':'electric'}}],'stats':[{'stat':{'name':key},'base_stat':value} for key,value in {'hp':35,'attack':55,'defense':40,'speed':90}.items()],'sprites':{'front_default':'https://sprites.example.test/sprite.webp'}})
 context.route('https://pokeapi.co/api/v2/**',poke)

def main():
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
  for width in [390,1440]:
   context=browser.new_context(viewport={'width':width,'height':950},service_workers='block',reduced_motion='reduce');configure(context);calls=[];fixtures(context,calls)
   page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(BASE+'lifeos.html');f=cf(page);f.locator('[data-vocadb-widget] .stream-track').wait_for()
   if f.locator('#enter-lifeos').is_visible():f.locator('#enter-lifeos').click()
   assert f.locator('[data-cyberdex-widget]').is_visible()
   first=f.locator('[data-vocadb-widget] h3').inner_text();f.locator('[data-stream-reroll]').click()
   page.wait_for_timeout(200);assert f.locator('[data-vocadb-widget] h3').inner_text()!=first
   assert len([u for u in calls if 'vocadb.net' in u])==1
   page.evaluate('Math.random=()=>24/251')
   checks=f.locator('[data-change="habit"]')
   for i in range(checks.count()):checks.nth(i).check()
   page.locator('#cyberdex-modal[open]').wait_for();page.locator('#encounter-creature h3').filter(has_text='#025').wait_for()
   page.locator('#cyberdex-close').click()
   # Reloading keeps the exact pending encounter, and does not require a login.
   page.reload();f=cf(page);f.locator('#dashboard').wait_for();page.locator('#cyberdex-modal[open]').wait_for();page.locator('#encounter-creature h3').filter(has_text='#025').wait_for()
   before=page.evaluate('LifeOSCore.read().xp');assert before==65
   page.locator('#cyberdex-catch').click();page.locator('#encounter-status').filter(has_text='SYNC COMPLETE // +50 XP').wait_for()
   assert page.evaluate('LifeOSCore.read().level')==2
   assert page.evaluate('LifeOSCore.read().xp')==15
   assert page.evaluate('JSON.parse(localStorage.cyberdex_caught).length')==1
   page.locator('#cyberdex-close').click()
   checks=f.locator('[data-change="habit"]');checks.nth(0).uncheck();checks.nth(0).check();page.wait_for_timeout(250)
   assert page.evaluate('LifeOSCore.read().xp')==15
   assert not page.locator('#cyberdex-modal').is_visible()
   f.locator('.dex-tile').click();f.locator('#cyberdex-details[open]').wait_for();assert f.locator('#cyberdex-details meter').count()==4
   f.locator('[data-dex-close]').click()
   assert fw(page).evaluate('document.documentElement.scrollWidth<=innerWidth')
   page.screenshot(path=str(ARTIFACTS/f'streams-lifeos-{width}.png'))
   page.evaluate("LifeOSShell.navigate('pokemon.html')");f=cf(page);f.locator('.dex-tile').wait_for()
   assert '1 / 251' in f.locator('[data-cyberdex-widget]').inner_text()
   f.locator('#dex-query').fill('typo');f.locator('#dex-search button').click();f.locator('#dex-search-status.is-error').filter(has_text='404').wait_for()
   f.locator('#dex-query').fill('pikachu');f.locator('#dex-search button').click();f.locator('#cyberdex-details[open]').wait_for();f.locator('[data-dex-close]').click()
   page.screenshot(path=str(ARTIFACTS/f'streams-pokemon-{width}.png'))
   assert fw(page).evaluate('document.documentElement.scrollWidth<=innerWidth')
   page.evaluate("LifeOSTerminal.toggle(true)")
   field=page.locator('#terminal-input')
   for command,expected in [('vocaloid random','VOCADB STREAM'),('vocaloid find Miku','3. Neon Frequency 3'),('dex 25','HP: 35 | ATK: 55'),('dex list','DEX SYNC: 1 / 251'),('dex typo','ERROR: Node unreachable')]:
    field.fill(command);field.press('Enter');page.locator('#terminal-output').filter(has_text=expected).wait_for();page.wait_for_timeout(100)
   assert '404' in page.locator('.terminal-error').last.inner_text()
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
  # CLI habit completion works from a standalone page; API failure preserves the claim.
  context=browser.new_context(viewport={'width':390,'height':844},service_workers='block');configure(context);fixtures(context,[])
  context.add_init_script("firebase.auth().currentUser=null")
  page=context.new_page();page.goto(BASE+'pokemon.html');f=cf(page);f.locator('[data-cyberdex-widget]').wait_for()
  def unavailable(route):route.fulfill(status=503,json={})
  context.route('https://pokeapi.co/api/v2/pokemon/*',unavailable)
  page.evaluate('LifeOSTerminal.toggle(true)');page.locator('#terminal-input').fill('habit check 1 2 3');page.locator('#terminal-input').press('Enter')
  page.locator('#cyberdex-modal[open]').wait_for();page.locator('#encounter-status').filter(has_text='ERROR: Node unreachable').wait_for()
  ident=page.evaluate('LifeOSCore.read().cyberdex.encounters[LifeOSCore.dateKey()].id')
  assert page.evaluate('LifeOSCore.read().xp')==65
  page.locator('#cyberdex-close').click();page.evaluate('LifeOSTerminal.toggle(false)')
  context.unroute('https://pokeapi.co/api/v2/pokemon/*',unavailable)
  f.locator('[data-encounter-open]').click();page.locator('#cyberdex-catch:not([disabled])').wait_for()
  assert page.evaluate('LifeOSCore.read().cyberdex.encounters[LifeOSCore.dateKey()].id')==ident
  page.locator('#cyberdex-catch').click();page.locator('#encounter-status').filter(has_text='SYNC COMPLETE // +50 XP').wait_for()
  assert page.evaluate('LifeOSCore.read().level')==2
  context.close()
  browser.close()
 print('PASS: desktop/mobile standalone pages, widgets, anonymous APIs, cache, pending reload, catch XP/level-up, anti-repeat, stats, CLI and 404 feedback')
if __name__=='__main__':main()
