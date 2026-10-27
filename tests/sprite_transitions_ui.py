"""Delayed image loads cannot flash old sprites or supersede the latest tab."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
from ui_smoke import configure,cf,fw,BASE


def main():
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,args=['--no-sandbox'],**({'executable_path':os.environ['UI_BROWSER_PATH']} if os.environ.get('UI_BROWSER_PATH') else {}))
  context=browser.new_context(service_workers='block');configure(context)
  context.route('**/vanilla-tilt.min.js',lambda route:route.fulfill(body='window.VanillaTilt={init(card){card.vanillaTilt={};}};',content_type='application/javascript'))
  pending={}
  def hold(tab):
   return lambda route:pending.update({tab:route})
  for tab in ['finance','lore']:
   context.route(f'**/assets/lifeos/sprite_{tab}.png',hold(tab))
  page=context.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
  page.goto(BASE+'lifeos.html');f=cf(page);f.locator('#dashboard').wait_for()
  if f.locator('#enter-lifeos').is_visible():f.locator('#enter-lifeos').click()
  fw(page).wait_for_function("document.querySelector('#persona-sprite').dataset.loadState==='ready'")
  old=f.locator('#persona-sprite').get_attribute('src')
  f.locator('[data-tab="finance"]').click()
  assert f.locator('#persona-sprite').get_attribute('src')==old
  assert f.locator('#persona-sprite').evaluate("img=>getComputedStyle(img).visibility==='hidden'")
  f.locator('[data-tab="lore"]').click()
  for _ in range(100):
   if 'lore' in pending and 'finance' in pending:break
   page.wait_for_timeout(20)
  assert f.locator('#persona-sprite').evaluate("img=>getComputedStyle(img).visibility==='hidden'")
  pending['lore'].fulfill(body=Path('assets/lifeos/sprite_lore.png').read_bytes(),content_type='image/png')
  fw(page).wait_for_function("document.querySelector('#persona-sprite').dataset.loadState==='ready'")
  assert f.locator('#persona-sprite').get_attribute('src')=='assets/lifeos/sprite_lore.png'
  assert f.locator('#persona-sprite').evaluate('img=>img.complete && img.naturalWidth>0')
  pending['finance'].fulfill(body=Path('assets/lifeos/sprite_finance.png').read_bytes(),content_type='image/png')
  page.wait_for_timeout(100)
  assert f.locator('#persona-sprite').get_attribute('src')=='assets/lifeos/sprite_lore.png'
  quote=f.locator('.quote-bubble');quote.locator('.holo-copy').wait_for();quote.hover()
  assert quote.evaluate("el=>!el.vanillaTilt && getComputedStyle(el).transform==='none'")
  assert quote.evaluate("el=>!el.classList.contains('holo-card') && !el.querySelector('.js-tilt-glare')")
  page.emulate_media(reduced_motion='reduce');f.locator('[data-tab="finance"]').click()
  fw(page).wait_for_function("document.querySelector('#persona-sprite').dataset.loadState==='ready'")
  assert f.locator('#persona-sprite').get_attribute('src')=='assets/lifeos/sprite_finance.png'
  assert f.locator('#persona-sprite').evaluate('img=>img.getAnimations().length===0')
  assert not errors,errors
  browser.close()
 print('PASS: hidden pending sprites, decode-before-display, stale-load protection, reduced motion and static text cards with copy controls')


if __name__=='__main__':main()
