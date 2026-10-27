"""Direct shop portraits, plain navigation, category transitions and static hadith."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
from ui_smoke import configure,cf,fw,BASE


def main():
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,args=['--no-sandbox'],**({'executable_path':os.environ['UI_BROWSER_PATH']} if os.environ.get('UI_BROWSER_PATH') else {}))
  context=browser.new_context(viewport={'width':1280,'height':1000},service_workers='block');configure(context)
  # Deterministic tilt SDK: any attempt to initialize the hadith is observable.
  context.route('**/vanilla-tilt.min.js',lambda route:route.fulfill(body="window.VanillaTilt={init(card){card.vanillaTilt={destroy(){delete card.vanillaTilt;}};}};",content_type='application/javascript'))
  page=context.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
  page.goto(BASE+'shop.html');f=cf(page);f.locator('#shop-entrance').wait_for()
  for theme in ['miku','teto']:
   assert f.locator(f'#shop-entrance [data-shopkeeper="{theme}"]').get_attribute('src')==f'assets/shopkeeper/{theme}_shopkeeper.png'
  assert 'data-shopkeeper="miku" src="assets/splash/' not in Path('shop.html').read_text()
  f.locator('#skip-entrance').click()
  f.locator('[data-category="workspace"] summary').click()
  assert f.locator('.cyber-nav img,.nav-character,.nav-companion-line').count()==0
  f.locator('[data-category="workspace"] summary').press('Escape')
  f.locator('.nav-lifeos').click();f.locator('#dashboard').wait_for()
  if f.locator('#enter-lifeos').is_visible():f.locator('#enter-lifeos').click()
  for tab in ['lore','finance','teto','imam','organisation','lifestyle']:
   result=fw(page).evaluate('''tab=>{
    document.querySelector(`[data-tab="${tab}"]`).click();
    return {panel:document.querySelector('#module-panel').getAnimations().map(a=>a.effect.getTiming().duration),sprite:document.querySelector('#persona-sprite').getAnimations().map(a=>a.effect.getTiming().duration)};
   }''',tab)
   assert 260 in result['panel'],(tab,result)
  f.locator('[data-tab="imam"]').click()
  assert f.locator('.imam-bismillah').inner_text()=='بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ'
  assert f.locator('.imam-bismillah').get_attribute('lang')=='ar'
  assert f.locator('.imam-bismillah').get_attribute('dir')=='rtl'
  assert f.locator('.imam-bismillah').bounding_box()['y']<f.locator('[data-holo-card="hadith"]').bounding_box()['y']
  hadith=f.locator('[data-holo-card="hadith"]');hadith.locator('.holo-copy').wait_for();hadith.hover()
  assert hadith.evaluate("el=>!el.vanillaTilt && getComputedStyle(el).transform==='none' && getComputedStyle(el).animationName==='none'")
  context.set_offline(True)
  page.emulate_media(reduced_motion='reduce')
  f.locator('[data-tab="finance"]').click()
  assert f.locator('#module-panel').evaluate('el=>el.getAnimations().length')==0
  assert not errors,errors
  browser.close()
 print('PASS: shopkeeper-only entrance, sprite-free navigation, transitions for every LifeOS category, reduced motion, Bismillah heading and static hadith')


if __name__=='__main__':main()
