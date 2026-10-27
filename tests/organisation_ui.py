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
        f.locator('#persona-sprite').wait_for(state='visible')
        assert f.locator('#persona-sprite').get_attribute('src') == 'assets/lifeos/sprite_organisation.png'
        assert fw(page).evaluate("document.querySelector('#persona-sprite').naturalWidth > 0")
        assert f.locator('#customs-hud').count() == 0
        f.locator('[data-tab="teto"]').click()
        assert f.locator('#persona-name').inner_text() == 'KASANE TETO'
        assert f.locator('#customs-hud').count() == 1
        assert f.locator('#counter-text').count() == 1
        purchase = f.locator('[data-org-form="purchase"]')

        def buy(title, price):
            purchase.locator('[name="title"]').fill(title)
            purchase.locator('[name="price"]').fill(str(price))
            purchase.locator('[name="price"]').press('Enter')
            assert purchase.locator('[name="title"]').evaluate('el => el === document.activeElement')

        # Exact cent boundaries of the requested simplified budget model.
        assert 'Geschätzte Gebühren: 0,00 €' in f.locator('.org-duty-amount').inner_text()
        for amount, duty, payable, taxable, rate_tag in [
            (430, '0,00', None, False, None),
            (430.01, '0,00', '430,01', True, '17,5 %'),
            (500, '12,25', '512,25', True, '17,5 %'),
            (700, '47,25', '747,25', True, '17,5 %'),
            (700.01, '59,40', '759,41', True, '~19 % EUSt'),
        ]:
            buy('Boundary test', round(amount*165, 3))
            assert duty in f.locator('.org-duty-amount').inner_text()
            if payable:
                assert payable in f.locator('.org-duty-amount').inner_text()
            assert ('ZOLLPFLICHTIG' if taxable else 'STEUERFREI') in f.locator('.org-status').inner_text()
            assert f.locator('.org-red-lane').count() == int(taxable)
            if rate_tag:
                assert rate_tag in f.locator('.org-duty-amount').inner_text()
                assert duty in f.locator('.org-teto').inner_text()
                assert f.locator('.org-red-lane a').get_attribute('href').startswith('https://www.zoll.de/')
            else:
                assert 'Verbleibender Freibetrag: 0,00' in f.locator('.org-duty-tile').inner_text()
            assert f.locator('#customs-hud progress').get_attribute('value') == '43000'
            page.set_viewport_size({'width':390,'height':844})
            assert fw(page).evaluate('document.documentElement.scrollWidth <= innerWidth')
            f.locator('[data-org-delete="purchases"]').last.click()
            assert 'Geschätzte Gebühren: 0,00 €' in f.locator('.org-duty-amount').inner_text()
            assert f.locator('.org-red-lane').count() == 0
            assert 'All green on the shopping budget' in f.locator('.org-teto').inner_text()
        page.set_viewport_size({'width':1280,'height':900})

        purchase.locator('[name="price"]').fill('5000')
        assert '30,30 €' in f.locator('.org-conversion').inner_text()
        buy('Test Souvenir', 5000)
        assert 'Another 30,30 €' in f.locator('.org-teto').inner_text()
        f.locator('[data-org-delete="purchases"]').last.click()
        assert '0 ¥' in f.locator('.org-hud').inner_text()
        buy('Miku <script>probe</script>', 49500)
        assert 'Oof!' in f.locator('.org-teto').inner_text()
        assert '49.500 ¥' in f.locator('.org-table').inner_text()
        assert '300,00' in f.locator('.org-hud').inner_text()
        assert f.locator('.org-customs.safe').count() == 1
        buy('Snacks', 165)
        assert 'Peanuts.' in f.locator('.org-teto').inner_text()
        assert f.locator('.org-customs.safe').count() == 1
        purchase.locator('.org-settings').evaluate('el=>el.open=true')
        purchase.locator('[data-org-rate]').fill('200')
        purchase.locator('[data-org-rate]').press('Tab')
        assert '301,00' in f.locator('.org-hud').inner_text()
        buy('Near limit', 9800)
        assert 'You’ve got 80,00' in f.locator('.org-teto').inner_text()
        f.locator('[data-org-delete="purchases"]').last.click()
        assert 'All green on the shopping budget' in f.locator('.org-teto').inner_text()
        buy('Tech', 25800)
        assert f.locator('.org-customs.safe').count() == 1
        buy('Extra', 200)
        assert f.locator('.org-customs.alarm').count() == 1
        assert 'Congratulations, you’re over the limit!' in f.locator('.org-teto').inner_text()
        f.locator('[data-org-filter]').select_option('Elektronik')
        assert 'Noch keine' in f.locator('.org-table').inner_text()
        assert '431,00' in f.locator('.org-hud').inner_text()
        f.locator('[data-org-filter]').select_option('all')
        with page.expect_download() as download:
            f.locator('[data-org-export]').click()
        text = open(download.value.path(), encoding='utf-8').read()
        assert '431,00' in text and '49500 JPY' in text and '165 JPY' in text
        f.locator('[data-org-delete="purchases"]').last.click()
        assert f.locator('.org-customs.safe').count() == 1
        f.locator('[data-tab="organisation"]').click()
        assert f.locator('#customs-hud').count() == 0
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
        items = fw(page).evaluate("JSON.parse(localStorage.getItem('weebokage_japan_items'))")
        assert len(items) == 3 and items[0]['priceJpy'] == 49500 and items[0]['priceEur'] == 300
        assert items[0]['timestamp'] and items[0]['name'] == 'Miku <script>probe</script>'
        assert fw(page).evaluate("localStorage.getItem('weebokage_japan_rate')") == '200'
        page.reload()
        f.locator('.organisation').wait_for()
        if f.locator('#enter-lifeos').is_visible():
            f.locator('#enter-lifeos').click()
        assert f.locator('[data-org-vault="notes"]').input_value() == 'Offline eSIM note'
        assert f.locator('[data-org-done]').first.is_checked()
        page.set_viewport_size({'width':390,'height':844})
        assert fw(page).evaluate('document.documentElement.scrollWidth <= innerWidth'), 'mobile overflow'
        f.locator('[data-tab="teto"]').click()
        assert '430,00' in f.locator('.org-hud').inner_text()
        # Invalid numeric values cannot change totals or enter the saved document.
        purchase.locator('.org-settings').evaluate('el=>el.open=true')
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
        f.locator('[data-tab="organisation"]').click()
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
