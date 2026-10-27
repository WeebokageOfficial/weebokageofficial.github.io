"""Groq reactions: latest update wins, text output, focus and offline fallback."""
import json
import os
from playwright.sync_api import sync_playwright
from ui_smoke import configure, cf, BASE


def main():
    with sync_playwright() as p:
        options = {'headless': True, 'args': ['--no-sandbox']}
        if os.environ.get('UI_BROWSER_PATH'):
            options['executable_path'] = os.environ['UI_BROWSER_PATH']
        browser = p.chromium.launch(**options)
        context = browser.new_context(service_workers='block')
        configure(context)
        pending = []
        context.route('**/lifeos/customs-reaction', lambda route: pending.append(route))
        page = context.new_page()
        page.goto(BASE + 'lifeos.html?tab=teto')
        f = cf(page)
        f.locator('#customs-hud').wait_for()
        if f.locator('#enter-lifeos').is_visible():
            f.locator('#enter-lifeos').click()
        form = f.locator('[data-org-form="purchase"]')

        def buy(name):
            form.locator('[name="title"]').fill(name)
            form.locator('[name="price"]').fill('5000')
            form.locator('[name="price"]').press('Enter')

        buy('First souvenir')
        page.wait_for_timeout(650)
        assert len(pending) == 1
        assert json.loads(pending[0].request.post_data)['item_name'] == 'First souvenir'
        buy('Second souvenir')
        page.wait_for_timeout(650)
        assert len(pending) == 2
        pending[1].fulfill(json={'quote':'Fresh baguette joke <img src=x onerror=alert(1)>'})
        page.wait_for_timeout(100)
        assert 'Fresh baguette joke' in f.locator('.org-teto p').inner_text()
        assert f.locator('.org-teto img').count() == 0
        pending[0].fulfill(json={'quote':'Stale joke'})
        page.wait_for_timeout(100)
        assert 'Fresh baguette joke' in f.locator('.org-teto p').inner_text()
        assert form.locator('[name="title"]').evaluate('el=>el===document.activeElement')
        assert 'GROQ // LIVE' in f.locator('[data-org-reaction-source]').inner_text()
        context.set_offline(True)
        buy('Offline souvenir')
        assert 'Another 30,30' in f.locator('.org-teto p').inner_text()
        assert f.locator('[data-org-reaction-source]').inner_text() == 'LOCAL'
        context.set_offline(False)
        f.locator('[data-org-delete="purchases"]').last.click()
        page.wait_for_timeout(650)
        assert json.loads(pending[2].request.post_data)['action'] == 'removed'
        pending[2].fulfill(status=503,json={'detail':'Groq unavailable'})
        page.wait_for_timeout(100)
        assert 'GROQ UNAVAILABLE' in f.locator('[data-org-reaction-source]').inner_text()
        assert 'All green' in f.locator('.org-teto p').inner_text()
        browser.close()
    print('PASS: Groq context, stale replies, safe text rendering, focus, deletion and offline/error fallback')


if __name__ == '__main__':
    main()
