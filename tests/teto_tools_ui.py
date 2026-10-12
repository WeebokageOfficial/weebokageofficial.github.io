"""Teto tool contracts and interaction with mocked Groq/Firebase, including retry UI."""
import json
from playwright.sync_api import sync_playwright
from ui_smoke import configure, cf, fw, BASE, ARTIFACTS
from data_streams_ui import fixtures


def main():
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
  for width in [320,1440]:
   context=browser.new_context(viewport={'width':width,'height':1000},service_workers='block',reduced_motion='reduce',permissions=['clipboard-read','clipboard-write']);configure(context);fixtures(context,[])
   requests=[];state={'scenario':'normal','retry':0}
   criterion={'score':37,'analysis':'Die Motivation fehlt im zweiten Akt.','tips':['Die Entscheidung in einer Szene zeigen.']}
   replies={'polish':{'verdict':'Netter Kabelsalat. Ich habe ihn sortiert.','polished':'Neonlicht. Eine klare Entscheidung. <script>window.injected=true</script>'},'quests':[{'title':'Kapitelentwurf schreiben','category':'Writing','xp':30},{'title':'Notizen ordnen','category':'Organisation','xp':25}],'prompt':{'prompt':'SYSTEM: Du bist ein erfahrener Autor.\nZIEL: Eine Cyberpunk-Szene.\nPARAMETER: [Länge], [Perspektive].'},'scanner':{'verdict':'Ein guter Kern. Drei lose Kabel.','plotholes':criterion,'pacing':{**criterion,'score':72},'cliches':{**criterion,'score':23}}}
   def api(route):
    body=route.request.post_data_json;requests.append(body)
    if state['scenario']=='key':route.fulfill(status=503,json={'detail':'Chat is not configured.'});return
    if state['scenario']=='retry' and state['retry']==0:
     state['retry']+=1;route.fulfill(status=503,json={'detail':'Render warming up'});return
    reply=[{'title':'Bad task','xp':99}] if state['scenario']=='invalid' else replies[body['tool']]
    route.fulfill(json={'reply':json.dumps(reply)})
   context.route('**/lifeos/teto-ai',api)
   page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(BASE+'lifeos.html');f=cf(page);f.locator('[data-tab="teto"]').wait_for()
   if f.locator('#enter-lifeos').is_visible():f.locator('#enter-lifeos').click()
   f.locator('[data-tab="teto"]').click();f.locator('.teto-ai-suite').wait_for()
   assert f.locator('.teto-ai-card').count()==7
   assert fw(page).evaluate('document.documentElement.dataset.theme')=='teto'
   polish=f.locator('[data-teto-tool="polish"]');polish.locator('textarea').fill('Rohtext mit Neon.');polish.locator('[data-teto-mode="minimalist"]').click();polish.locator('[type="submit"]').click()
   polish.locator('.teto-job-status').filter(has_text='DATA OPTIMIZED').wait_for()
   assert 'Minimalist' in requests[-1]['system_prompt']
   assert polish.locator('.teto-result-text').inner_text()==replies['polish']['polished']
   assert polish.locator('script').count()==0
   assert not fw(page).evaluate('window.injected || false')
   polish.locator('[data-teto-copy]').click();polish.locator('[data-teto-copy]').filter(has_text='COPIED').wait_for()
   assert page.evaluate('navigator.clipboard.readText()')==replies['polish']['polished']
   quests=f.locator('[data-teto-tool="quests"]');quests.locator('textarea').fill('Kapitel schreiben und Notizen sortieren.');quests.locator('[type="submit"]').click();quests.locator('[data-teto-quest]').first.wait_for()
   before=page.evaluate('LifeOSCore.read().quests.length');xp=page.evaluate('LifeOSCore.read().xp')
   quests.locator('[data-teto-quest="0"]').click();quests.locator('[data-teto-quest="0"][disabled]').wait_for()
   assert page.evaluate('LifeOSCore.read().quests.length')==before+1
   assert page.evaluate('LifeOSCore.read().xp')==xp
   added=page.evaluate('LifeOSCore.read().quests.at(-1)');assert added['xp']==30 and added['category']=='Writing' and not added['done']
   f.locator('[data-tab="lifestyle"]').click();f.locator('.row-title').filter(has_text='Kapitelentwurf schreiben').wait_for()
   f.locator('[data-tab="teto"]').click();assert polish.locator('textarea').input_value()=='Rohtext mit Neon.';assert quests.locator('[data-teto-quest="0"]').is_disabled()
   prompt=f.locator('[data-teto-tool="prompt"]');prompt.locator('input').fill('FastAPI CORS Fehler beheben');prompt.locator('select').select_option('code');prompt.locator('[type="submit"]').click();prompt.locator('.teto-job-status').filter(has_text='DATA OPTIMIZED').wait_for();assert 'Code LLM' in requests[-1]['system_prompt']
   prompt.locator('select').select_option('image');prompt.locator('[type="submit"]').click();prompt.locator('.teto-job-status').filter(has_text='DATA OPTIMIZED').wait_for();assert 'Image Gen' in requests[-1]['system_prompt']
   scanner=f.locator('[data-teto-tool="scanner"]');scanner.locator('textarea').fill('Der Held vergisst seinen Konflikt.');scanner.locator('[type="submit"]').click();scanner.locator('progress').first.wait_for();assert scanner.locator('progress').count()==3;assert scanner.locator('progress').nth(1).get_attribute('value')=='72'
   assert fw(page).evaluate('document.documentElement.scrollWidth<=innerWidth')
   page.screenshot(path=str(ARTIFACTS/f'teto-ai-{width}.png'),full_page=True)
   # Existing utilities still work beneath the AI suite.
   f.locator('#counter-text').fill('eins zwei');assert f.locator('#word-count').inner_text()=='2'
   state['scenario']='invalid';quests.locator('[type="submit"]').click();quests.locator('.teto-job-status.teto-error').filter(has_text='INVALID AI OUTPUT').wait_for();assert page.evaluate('LifeOSCore.read().quests.length')==before+1
   state['scenario']='key';count=len(requests);prompt.locator('[type="submit"]').click();prompt.locator('.teto-job-status.teto-error').filter(has_text='NICHT KONFIGURIERT').wait_for();assert len(requests)==count+1
   if width==1440:
    state['scenario']='retry';count=len(requests);prompt.locator('[type="submit"]').click();prompt.locator('.teto-job-status').filter(has_text='BACKEND SLEEPING').wait_for();assert prompt.locator('[type="submit"]').is_disabled();prompt.locator('.teto-job-status').filter(has_text='DATA OPTIMIZED').wait_for(timeout=20000);assert len(requests)==count+2
   assert not errors,errors
   context.close()
  browser.close()
 print('PASS: four tools, German persona/style/engine prompts, safe outputs, copy, quest import without XP/duplicates, preserved inputs across tabs, stats bars, config errors, single 10s retry, 320px/desktop, legacy tools')
if __name__=='__main__':main()
