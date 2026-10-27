"""Shop XP transactions, cosmetics, shell navigation, persistence and accessibility."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
from ui_smoke import configure, cf, fw, BASE


def main():
    with sync_playwright() as p:
        options={'headless':True,'args':['--no-sandbox']}
        if os.environ.get('UI_BROWSER_PATH'):
            options['executable_path']=os.environ['UI_BROWSER_PATH']
        browser=p.chromium.launch(**options)
        context=browser.new_context(viewport={'width':1440,'height':1100},service_workers='block')
        configure(context)
        page=context.new_page()
        errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.goto(BASE+'shop.html')
        f=cf(page)
        f.locator('#shop-entrance').wait_for(state='visible')
        f.locator('[data-enter="miku"]').click()
        assert f.locator('.product-card').count()==3
        assert f.locator('#wallet-xp').inner_text()=='0'
        # Insufficient XP cannot purchase or change a loadout.
        f.locator('[data-item="miku-encore"]').click()
        assert f.locator('#item-action').is_disabled()
        f.locator('#close-item').click()
        fw(page).evaluate('LifeOSCore.update(s=>{s.xp=95;},{activity:false})')
        assert f.locator('#wallet-xp').inner_text()=='95'
        f.locator('[data-item="miku-encore"]').click()
        f.locator('#preview-motion').click()
        assert f.locator('#preview-motion').get_attribute('aria-pressed')=='true'
        f.locator('#item-action').click()
        f.locator('#shop-item-dialog').wait_for(state='hidden')
        assert f.locator('#wallet-xp').inner_text()=='50'
        page.wait_for_function("document.querySelector('#player-character-stage').dataset.spriteStyle==='encore'")
        assert 'assets/shop/items/miku/encore.png' in page.locator('#player-bop-sprite').get_attribute('src')
        assert fw(page).evaluate('LifeOSCore.read().level')==1
        # A duplicate purchase is rejected atomically, even outside UI controls.
        duplicate=fw(page).evaluate("async()=>{try{await LifeOSShop.change('buy','miku-encore');return false;}catch(e){return e.message;}}")
        assert 'already own' in duplicate
        assert f.locator('#wallet-xp').inner_text()=='50'
        f.locator('[data-item="miku-frequency"]').click()
        f.locator('#item-action').click()
        f.locator('#shop-item-dialog').wait_for(state='hidden')
        assert page.locator('#cyberdeck').get_attribute('data-shop-accent')=='miku'
        assert f.locator('#wallet-xp').inner_text()=='30'
        f.locator('[data-department-select="teto"]').click()
        f.locator('[data-item="teto-hologram"]').click()
        f.locator('#item-action').click()
        f.locator('#shop-item-dialog').wait_for(state='hidden')
        assert f.locator('#wallet-xp').inner_text()=='0'
        page.wait_for_function("document.querySelector('#player-character-stage').dataset.spriteStyle==='hologram'")
        assert 'assets/shop/items/teto/hologram_idle.png' in page.locator('#player-bop-sprite').get_attribute('src')
        # Playback still resolves equipped animation frames.
        page.evaluate('updatePlayerSprite(true)')
        page.wait_for_function("document.querySelector('#player-bop-sprite').src.endsWith('assets/shop/items/teto/hologram_bop.png')")
        assert page.locator('#player-bop-sprite').evaluate("el=>el.classList.contains('is-bopping')")
        page.evaluate('updatePlayerSprite(false)')
        page.wait_for_function("document.querySelector('#player-bop-sprite').src.endsWith('assets/shop/items/teto/hologram_idle.png')")
        saved=fw(page).evaluate('LifeOSCore.read()')
        assert len(saved['shop']['owned'])==3 and saved['xp']==0
        assert fw(page).evaluate('LifeOSCore.validateState(LifeOSCore.read()).shop.owned.length')==3
        # Reload persists department, inventory, player and XP.
        page.reload()
        f.locator('#shop-products').wait_for()
        f.locator('#shop-entrance').wait_for(state='visible')
        f.locator('#skip-entrance').click()
        assert f.locator('body').get_attribute('data-department')=='teto'
        f.locator('[data-view="owned"]').click()
        assert f.locator('.product-card').count()==3
        f.locator('[data-item="miku-encore"]').click()
        f.locator('#item-action').click()
        f.locator('#shop-item-dialog').wait_for(state='hidden')
        assert f.locator('#wallet-xp').inner_text()=='0'
        page.wait_for_function("document.querySelector('#player-bop-sprite').src.endsWith('assets/shop/items/miku/encore.png')")
        # Keep the shell/player alive when navigating to LifeOS and back.
        page.evaluate('window.shopPlayerMarker=document.querySelector("#cyberdeck")')
        f.locator('.shop-topline a').click()
        f.locator('#dashboard').wait_for()
        if f.locator('#enter-lifeos').is_visible():f.locator('#enter-lifeos').click()
        assert page.evaluate('window.shopPlayerMarker===document.querySelector("#cyberdeck")')
        assert fw(page).evaluate('LifeOSCore.read().shop.owned.length')==3
        f.locator('.nav-shop').click()
        f.locator('#shop-products').wait_for()
        f.locator('#shop-entrance').wait_for(state='visible')
        f.locator('#skip-entrance').click()
        f.locator('[data-reset="sprite"]').click()
        page.wait_for_function("document.querySelector('#player-character-stage').dataset.spriteStyle==='classic'")
        f.locator('[data-reset="accent"]').click()
        page.wait_for_function("document.querySelector('#cyberdeck').dataset.shopAccent===''")
        assert fw(page).evaluate('LifeOSCore.read().shop.owned.length')==3
        f.locator('#replay-entrance').click()
        f.locator('[data-enter="teto"]').click()
        fw(page).wait_for_function("document.querySelector('#shopkeeper-art').complete && document.querySelector('#shopkeeper-art').naturalWidth>0")
        # Use uploaded portraits when available, otherwise the existing fallback.
        portrait='assets/shopkeeper/teto_shopkeeper.png' if Path('assets/shopkeeper/teto_shopkeeper.png').exists() else 'assets/splash/teto_victory.png'
        assert portrait in f.locator('#shopkeeper-art').get_attribute('src')
        page.emulate_media(reduced_motion='reduce')
        assert f.locator('#shopkeeper-art').evaluate('el=>getComputedStyle(el).animationName')=='none'
        for width in [390,320]:
            page.set_viewport_size({'width':width,'height':950})
            assert fw(page).evaluate('document.documentElement.scrollWidth<=innerWidth'), 'mobile overflow'
            f.locator('[data-item="teto-encore"]').click()
            assert f.locator('#item-action').is_disabled()
            f.locator('#close-item').click()
        page.set_viewport_size({'width':1440,'height':1100})
        page.emulate_media(reduced_motion='no-preference')
        Path('/tmp/weebokage-ui').mkdir(exist_ok=True)
        page.screenshot(path='/tmp/weebokage-ui/shop-desktop.png',full_page=True)
        assert not errors,errors
        browser.close()
    print('PASS: splash, departments, XP purchases, duplicate/insufficient funds, equip/reset, animation frames, persistent player, save/restore schema, mobile and reduced motion')


if __name__=='__main__':
    main()
