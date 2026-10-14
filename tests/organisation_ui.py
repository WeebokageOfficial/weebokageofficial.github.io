"""Organisation flows against a local server, with mocked remote services.
Run: UI_BROWSER_PATH=/path/to/chromium python tests/organisation_ui.py
"""
import os
from playwright.sync_api import sync_playwright
from ui_smoke import configure, cf, fw, BASE


def main():
    with sync_playwright() as p:
        options = {'headless': True, 'args': ['--no-sandbox']}
        if os.environ.get('UI_BROWSER_PATH'):
            options['executable_path'] = os.environ['UI_BROWSER_PATH']
        browser = p.chromium.launch(**options)
        context = browser.new_context(viewport={'width': 1280, 'height': 900}, service_workers='block', accept_downloads=True)
        configure(context)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(BASE + 'lifeos.html?tab=organisation')
        f = cf(page)
        f.locator('.organisation').wait_for()
        if f.locator('#enter-lifeos').is_visible():
            f.locator('#enter-lifeos').click()
        assert f.locator('#persona-sprite').get_attribute('src') == 'assets/sprites/sprite_organisation.png'
        assert fw(page).evaluate("document.querySelector('#persona-sprite').naturalWidth > 0")
        purchase = f.locator('[data-org-form="purchase"]')

        def buy(title, price, currency='JPY'):
            purchase.locator('[name="title"]').fill(title)
            purchase.locator('[name="price"]').fill(str(price))
            purchase.locator('[name="currency"]').select_option(currency)
            purchase.locator('button').click()

        buy('Miku <script>probe</script>', 49500)
        assert '300,00' in f.locator('.org-hud').inner_text()
        assert f.locator('.org-customs.safe').count() == 1
        buy('Snacks', 1, 'EUR')
        assert f.locator('.org-customs.warning').count() == 1
        purchase.locator('[data-org-rate]').fill('200')
        purchase.locator('[data-org-rate]').press('Tab')
        assert '301,00' in f.locator('.org-hud').inner_text()
        buy('Tech', 129, 'EUR')
        assert f.locator('.org-customs.warning').count() == 1
        buy('Extra', 1, 'EUR')
        assert f.locator('.org-customs.alarm').count() == 1
        assert 'überschritten' in f.locator('#persona-quote').inner_text()
        f.locator('[data-org-filter]').select_option('Elektronik')
        assert 'Noch keine' in f.locator('.org-table').inner_text()
        assert '431,00' in f.locator('.org-hud').inner_text()
        f.locator('[data-org-filter]').select_option('all')
        with page.expect_download() as download:
            f.locator('[data-org-export]').click()
        text = open(download.value.path(), encoding='utf-8').read()
        assert '431,00' in text and '49500 JPY' in text and '165 JPY' in text
        f.locator('[data-org-delete="purchases"]').last.click()
        assert f.locator('.org-customs.warning').count() == 1
        gear = f.locator('[data-org-form="gear"]')
        gear.locator('[name="title"]').fill('Koffer Eigengewicht')
        gear.locator('button').click()
        f.locator('[data-org-weight]').last.fill('24')
        f.locator('[data-org-weight]').last.press('Tab')
        assert f.locator('.org-weight.alarm').count() == 1
        f.locator('[data-org-done]').first.check()
        assert f.locator('.org-done').count() == 1
        route = f.locator('[data-org-form="route"]')
        for key, value in {'date':'2026-11-01','time':'09:30','title':'Kyoto','transport':'Nozomi','notes':'Booking ABC'}.items():
            route.locator(f'[name="{key}"]').fill(value)
        route.locator('button').click()
        f.locator('[data-org-route]').select_option('COMPLETED')
        f.locator('[data-org-vault="hotelJP"]').fill('東京都 テストホテル')
        f.locator('[data-org-vault="notes"]').fill('Offline eSIM note')
        saved = fw(page).evaluate("LifeOSCore.validateState(JSON.parse(localStorage.getItem(LifeOSCore.STORAGE_KEY)))")
        assert saved['organisation']['routes'][0]['status'] == 'COMPLETED'
        assert saved['organisation']['rate'] == 200
        page.reload()
        f.locator('.organisation').wait_for()
        if f.locator('#enter-lifeos').is_visible():
            f.locator('#enter-lifeos').click()
        assert f.locator('[data-org-vault="notes"]').input_value() == 'Offline eSIM note'
        assert f.locator('[data-org-done]').first.is_checked()
        page.set_viewport_size({'width':390,'height':844})
        assert fw(page).evaluate('document.documentElement.scrollWidth <= innerWidth'), 'mobile overflow'
        # Invalid numeric values cannot change totals or enter the saved document.
        purchase.locator('[name="price"]').fill('-1')
        assert not purchase.locator('[name="price"]').evaluate('(el)=>el.checkValidity()')
        purchase.locator('[name="price"]').fill('10')
        assert not purchase.locator('[data-org-rate]').evaluate("el=>{el.value='0';return el.checkValidity();}")
        assert fw(page).evaluate("JSON.parse(localStorage.getItem(LifeOSCore.STORAGE_KEY)).organisation.rate") == 200
        assert fw(page).evaluate("""() => {
            const state=JSON.parse(localStorage.getItem(LifeOSCore.STORAGE_KEY));
            state.organisation.limits.checked=NaN;
            try {LifeOSCore.validateState(state);return false;} catch (_) {return true;}
        }""")
        purchase.locator('[data-org-rate]').fill('200')
        # Browser offline mode exercises the fully local companion and editing flows.
        context.set_offline(True)
        f.locator('[data-org-vault="notes"]').fill('Offline edited note')
        assert 'Gewichts-Alarm' in f.locator('#persona-quote').inner_text()
        assert fw(page).evaluate("JSON.parse(localStorage.getItem(LifeOSCore.STORAGE_KEY)).organisation.vault.notes") == 'Offline edited note'
        context.set_offline(False)
        for tab in ['lifestyle','finance','organisation']:
            f.locator(f'[data-tab="{tab}"]').click()
        assert f.locator('.organisation').count() == 1
        assert not errors, errors
        browser.close()
    print('PASS: customs thresholds, fixed exchange rates, export/filter/delete, luggage, route status, persistence, escaping, mobile and tab switching')


if __name__ == '__main__':
    main()
