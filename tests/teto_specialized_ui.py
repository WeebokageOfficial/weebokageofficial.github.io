"""Specialized Teto tools: snapshot correctness, safe spec copies and transactional Lore saves."""
import json
from playwright.sync_api import sync_playwright
from ui_smoke import configure, cf, fw, BASE, ARTIFACTS
from data_streams_ui import fixtures


def main():
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
  for width in [320,1440]:
   context=browser.new_context(viewport={'width':width,'height':1000},service_workers='block',reduced_motion='reduce',permissions=['clipboard-read','clipboard-write']);configure(context);fixtures(context,[])
   requests=[];held=[];state={'hold':True,'choice':'B','invalid':False}
   decision={'choice':'B','reason':'Das Kapitel ist dein Engpass. Das Cover kann warten.','order':'Schreibe jetzt 45 Minuten an Option B. Keine Ausreden.','minutes':45}
   specs=[{'name':f'Kohärenz-Mantel Mk.{i}','acronym':f'CSN-{i}','description':'Ein Phasenfeld tarnt synthetische Konturen. <script>window.badSpec=true</script>'} for i in range(1,6)]
   scene={'title':'Der letzte Upload','beats':[{'tag':'BURST','text':'Rohan presst die Hand auf das Terminal. „Stopp.“'},{'tag':'TEMPO SHIFT','text':'Der Gegner blickt auf. Ein halber Schritt zurück. <img src=x onerror="window.badScene=true">'},{'tag':'CLIMAX','text':'„Deine Zeit ist um.“ Das rote Licht erlischt.'}]}
   def respond(route):
    body=route.request.post_data_json;requests.append(body)
    if body['tool']=='decision' and state['hold']:held.append(route);return
    value={**decision,'choice':state['choice']} if body['tool']=='decision' else specs[:4] if state['invalid'] else specs if body['tool']=='jargon' else scene
    route.fulfill(json={'reply':json.dumps(value)})
   context.route('**/lifeos/teto-ai',respond)
   page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(BASE+'lifeos.html');f=cf(page);f.locator('[data-tab="teto"]').wait_for()
   if f.locator('#enter-lifeos').is_visible():f.locator('#enter-lifeos').click()
   f.locator('[data-tab="teto"]').click()
   decision_box=f.locator('#teto-decision-box');decision_box.locator('[name="option_a"]').fill('Cover zeichnen');decision_box.locator('[name="context_a"]').fill('Bequem, aber nicht dringend');decision_box.locator('[name="option_b"]').fill('Kapitel schreiben');decision_box.locator('[name="context_b"]').fill('Langfristiges Ziel, schwerer Einstieg')
   # Optional C can be hidden without blocking native form validation.
   decision_box.locator('[data-teto-option-c]').click();decision_box.locator('[name="option_c"]').fill('Recherche');decision_box.locator('[data-teto-option-c]').click()
   decision_box.locator('[type="submit"]').click();decision_box.locator('.teto-job-status').filter(has_text='TETO IS CALCULATING TRAJECTORY').wait_for();assert decision_box.locator('[type="submit"]').is_disabled()
   assert len(json.loads(requests[-1]['user_text'])['options'])==2
   # An edit during the request must not change what the returned choice refers to.
   decision_box.locator('[name="option_b"]').fill('Geänderte Option nach Anfrage')
   held.pop().fulfill(json={'reply':json.dumps(decision)});state['hold']=False
   decision_box.locator('.teto-command-banner').wait_for();assert 'Kapitel schreiben' in decision_box.locator('.teto-decision-result h3').inner_text();assert '45 MIN' in decision_box.locator('.teto-march-order').inner_text()
   decision_box.locator('[data-teto-option-c]').click();state['choice']='C';decision_box.locator('[type="submit"]').click();decision_box.locator('.teto-decision-result h3').filter(has_text='Recherche').wait_for()
   jargon=f.locator('#teto-jargon-box');jargon.locator('select').select_option('software');jargon.locator('textarea').fill('Neural-Protokoll für verlorene Erinnerungen');jargon.locator('[type="submit"]').click();jargon.locator('.teto-spec-card').nth(4).wait_for();assert jargon.locator('.teto-spec-card').count()==5
   assert json.loads(requests[-1]['user_text'])['category']=='software'
   assert jargon.locator('script').count()==0;assert not fw(page).evaluate('window.badSpec||false')
   jargon.locator('[data-teto-spec-copy="2"]').click();jargon.locator('[data-teto-spec-copy="2"]').filter(has_text='COPIED').wait_for();assert 'CSN-3' in page.evaluate('navigator.clipboard.readText()')
   state['invalid']=True;jargon.locator('[type="submit"]').click();jargon.locator('.teto-job-status.teto-error').filter(has_text='INVALID AI OUTPUT').wait_for();assert jargon.locator('.teto-spec-card').count()==5;state['invalid']=False
   choreography=f.locator('#teto-choreography-box');choreography.locator('[name="first"]').fill('Rohan: verzweifelt, offensiv');choreography.locator('[name="second"]').fill('Gegner: kalt, kalkuliert');choreography.locator('select').select_option('cqc');choreography.locator('textarea').fill('Rohan muss den Upload stoppen.');choreography.locator('[type="submit"]').click();choreography.locator('.teto-scene-beat').nth(2).wait_for()
   assert choreography.locator('.teto-pacing-tag').all_text_contents()==['[BURST]','[TEMPO SHIFT]','[CLIMAX]']
   assert choreography.locator('.teto-scene-output img').count()==0;assert not fw(page).evaluate('window.badScene||false')
   before=page.evaluate('LifeOSCore.read().notes.length');xp=page.evaluate('LifeOSCore.read().xp')
   choreography.locator('[data-teto-save-lore]').click();choreography.locator('[data-teto-save-lore][disabled]').wait_for();assert page.evaluate('LifeOSCore.read().notes.length')==before+1;assert page.evaluate('LifeOSCore.read().xp')==xp
   note=page.evaluate('LifeOSCore.read().notes[0]');assert note['category']=='Chapter Notes' and note['status']=='Draft';assert '[TEMPO SHIFT]' in note['content']
   f.locator('[data-tab="lore"]').click();f.locator('.note-card').filter(has_text='Der letzte Upload').wait_for()
   f.locator('[data-tab="teto"]').click();assert choreography.locator('[data-teto-save-lore]').is_disabled();assert decision_box.locator('[name="option_b"]').input_value()=='Geänderte Option nach Anfrage';assert decision_box.locator('[data-teto-option-c]').get_attribute('aria-expanded')=='true'
   assert fw(page).evaluate('document.documentElement.scrollWidth<=innerWidth')
   choreography.scroll_into_view_if_needed();page.screenshot(path=str(ARTIFACTS/f'teto-special-{width}.png'))
   page.reload();f=cf(page);f.locator('[data-tab="lore"]').click();f.locator('.note-card').filter(has_text='Der letzte Upload').wait_for();assert page.evaluate('LifeOSCore.read().notes.length')==before+1
   assert not errors,errors;context.close()
  browser.close()
 print('PASS: Decision A/B/C and request snapshots, five safe specs and clipboard, pacing tags, duplicate-safe Lore save/reload, state across tabs, mobile/desktop')
if __name__=='__main__':main()
