"""Shared navigation: destinations, keyboard focus, theme colors and removed Dex."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
from ui_smoke import configure, cf, fw, BASE


def main():
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,args=['--no-sandbox'],**({'executable_path':os.environ['UI_BROWSER_PATH']} if os.environ.get('UI_BROWSER_PATH') else {}))
        context=browser.new_context(viewport={'width':1440,'height':1000},service_workers='block',reduced_motion='reduce')
        configure(context)
        context.add_init_script("const d=new Date();localStorage.setItem('weebokage_splash_date',`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`)")
        page=context.new_page();errors=[];requests=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.on('request',lambda request:requests.append(request.url))
        page.goto(BASE+'index.html');f=cf(page)
        f.locator('.nav-category-bar').wait_for()
        # Skip the home page's existing theme splash if it appears.
        if f.locator('#theme-splash-overlay').is_visible():
            f.locator('[data-splash-theme="miku"]').click()
            f.locator('#theme-splash-overlay').wait_for(state='hidden')
        assert f.locator('.nav-category').count()==4
        assert f.locator('.nav-category-bar > a').last.get_attribute('href')=='lifeos.html'
        assert f.locator('.nav-lifeos').count()==1
        assert 'Explore' not in f.locator('.cyber-nav').text_content()
        assert f.locator('.cyber-nav a[href="pokemon.html"]').count()==0
        assert f.locator('.nav-home[aria-current="page"]').inner_text().endswith('Home')
        f.locator('[data-category="entertainment"] summary').click()
        assert f.locator('[data-category="entertainment"] .nav-panel').is_visible()
        f.locator('[data-category="entertainment"] summary').press('Escape')
        assert not f.locator('[data-category="entertainment"]').evaluate('el=>el.open')
        f.locator('[data-category="entertainment"] summary').click()
        Path('/tmp/weebokage-ui').mkdir(exist_ok=True)
        page.screenshot(path='/tmp/weebokage-ui/navigation-desktop.png')
        f.locator('.nav-destinations a[href="games.html"]').click()
        f.locator('body[data-page="games"]').wait_for()
        assert f.locator('.nav-more.has-current').count()==1
        assert f.locator('.nav-destinations a[aria-current="page"]').get_attribute('href')=='games.html'
        f.locator('.nav-shop').click()
        f.locator('#shop-products').wait_for()
        if f.locator('#shop-entrance').is_visible():f.locator('#skip-entrance').click()
        for width in [1024,390,320]:
            page.set_viewport_size({'width':width,'height':1000})
            fw(page).wait_for_function("document.querySelector('.cyber-nav').inert")
            f.locator('.menu-toggle').click()
            assert f.locator('.menu-toggle').get_attribute('aria-expanded')=='true'
            f.locator('[data-category="about"] summary').click()
            assert f.locator('[data-category="about"] .nav-panel').is_visible()
            f.locator('[data-category="workspace"] summary').click()
            assert f.locator('[data-category="workspace"] .nav-panel').is_visible()
            assert not f.locator('[data-category="about"]').evaluate('el=>el.open')
            assert not f.locator('.cyber-nav').evaluate('el=>el.inert')
            f.locator('.cyber-theme').focus()
            f.locator('.cyber-theme').press('Tab')
            assert f.locator('.menu-toggle').evaluate('el=>el===document.activeElement')
            f.locator('.menu-toggle').press('Escape')
            assert f.locator('.menu-toggle').get_attribute('aria-expanded')=='false'
            assert f.locator('.cyber-nav').evaluate('el=>el.inert')
            f.locator('.menu-toggle').click()
            f.locator('.cyber-theme').click()
            page.locator('#theme-switch-overlay').wait_for(state='hidden')
            assert f.locator('.cyber-theme span').text_content().strip() in ['MIKU','TETO']
            f.locator('.menu-toggle').click()
            assert fw(page).evaluate('document.documentElement.scrollWidth<=innerWidth')
            if width==390:page.screenshot(path='/tmp/weebokage-ui/navigation-mobile.png')
            f.locator('.menu-toggle').press('Escape')
        for query, dept, count in [('department=miku','miku',3),('department=teto','teto',3),('view=owned',None,0)]:
            page.evaluate(f"LifeOSShell.navigate('shop.html?{query}')")
            f.locator('#shop-products').wait_for()
            f.locator('#shop-entrance').wait_for(state='visible')
            f.locator('#skip-entrance').click()
            if dept: assert f.locator('body').get_attribute('data-department')==dept
            assert f.locator('.product-card').count()==count
        assert page.locator('#cyberdeck #deck-shop, #cyberdeck #terminal-toggle').count()==0
        f.locator('.menu-toggle').click()
        f.locator('[data-category="workspace"] summary').click()
        f.locator('[data-open-terminal]').click()
        page.locator('#quake-terminal.open').wait_for()
        page.locator('#terminal-input').fill('help')
        page.locator('#terminal-input').press('Enter')
        page.locator('#terminal-close').click()
        assert page.locator('#quake-terminal').get_attribute('aria-hidden')=='true'
        page.evaluate("LifeOSShell.navigate('lifeos.html')")
        f.locator('#dashboard').wait_for()
        if f.locator('#enter-lifeos').is_visible():f.locator('#enter-lifeos').click()
        assert f.locator('[data-cyberdex-widget]').count()==0
        assert page.locator('#cyberdex-modal').count()==0
        assert not any('pokeapi' in url or 'cyberdex.js' in url for url in requests)
        assert page.evaluate("!LifeOSShell.pages.includes('pokemon')")
        page.evaluate("LifeOSShell.navigate('pokemon.html')")
        f.locator('#dashboard').wait_for()
        assert page.url.endswith('lifeos.html')
        assert not errors,errors
        browser.close()
    print('PASS: desktop/mobile navigation, active links, focus containment, Escape, themes and Cyber-Dex removal')


if __name__=='__main__':main()
