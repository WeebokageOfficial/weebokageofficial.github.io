"""Luggage tools live in Teto Tools and preserve saved weights across reloads."""
from playwright.sync_api import sync_playwright
from ui_smoke import configure, cf, fw, BASE
import os

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('UI_BROWSER_PATH','/opt/brave.com/brave/brave'),headless=True,args=['--no-sandbox'])
    context=browser.new_context(service_workers='block');configure(context)
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(BASE+'lifeos.html?tab=organisation');f=cf(page)
    f.locator('[data-tab="teto"][aria-selected="true"]').wait_for()
    if f.locator('#enter-lifeos').is_visible():f.locator('#enter-lifeos').click()
    assert f.locator('[data-tab="organisation"]').count()==0
    assert f.locator('.org-luggage').count()==1
    assert f.locator('#customs-hud').count()==1
    assert f.locator('[data-org-form="route"], [data-org-vault], [data-org-copy]').count()==0
    form=f.locator('[data-org-form="gear"]');form.locator('[name="title"]').fill('Test suitcase')
    form.locator('button').click()
    row=f.locator('.org-gear').filter(has_text='Test suitcase')
    row.locator('[data-org-weight]').fill('24');row.locator('[data-org-weight]').dispatch_event('change')
    assert 'LIMIT EXCEEDED' in f.locator('.org-weight').first.inner_text()
    f.locator('[data-org-limit="checked"]').fill('30');f.locator('[data-org-limit="checked"]').dispatch_event('change')
    assert 'LIMIT EXCEEDED' not in f.locator('.org-weight').first.inner_text()
    page.reload();f=cf(page);f.locator('.org-luggage').wait_for()
    row=f.locator('.org-gear').filter(has_text='Test suitcase')
    assert row.locator('[data-org-weight]').input_value()=='24'
    assert f.locator('[data-org-limit="checked"]').input_value()=='30'
    row.locator('[data-org-delete="gear"]').click()
    assert f.locator('.org-gear').filter(has_text='Test suitcase').count()==0
    page.set_viewport_size({'width':375,'height':812})
    assert fw(page).evaluate('document.documentElement.scrollWidth<=innerWidth')
    assert not errors,errors
    print('Luggage relocation, legacy URL, add/edit/delete, limits, persistence and mobile checks passed.')
    browser.close()
