"""Owner UI publishing, visitor restrictions, live updates and optimistic concurrency."""
import os,json
from playwright.sync_api import sync_playwright
from ui_smoke import configure,cf,fw,BASE,FIREBASE
from wcu_fixtures import DATABASE,firebase_script
FAKE=firebase_script()
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('UI_BROWSER_PATH','/opt/brave.com/brave/brave'),headless=True,args=['--no-sandbox'])
    context=browser.new_context(service_workers='block');configure(context);context.add_init_script(FAKE)
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(BASE+'wcu.html#/project/example-story');f=cf(page)
    f.locator('[data-wcu-edit]:not([hidden])').wait_for();f.locator('[data-wcu-edit]').click()
    editor=f.locator('#wcu-editor');editor.locator('[name="name"]').fill('Example Story — Edited')
    editor.locator('[name="overview"]').fill('Updated by the owner. [[character:example-character|Example]] returns.')
    editor.locator('#wcu-publish').click();editor.wait_for(state='hidden')
    f.locator('#wcu-view-title').filter(has_text='Example Story — Edited').wait_for()
    assert f.locator('#wiki-overview a').inner_text()=='Example'
    saved=fw(page).evaluate("JSON.parse(localStorage.getItem('test-wcu-doc'))")
    assert saved['revision']==2 and saved['updatedBy']=='owner-uid'
    page.reload();f=cf(page);f.locator('#wcu-view-title').filter(has_text='Example Story — Edited').wait_for()
    # Permission denial keeps the draft open with a concrete setup error.
    f.locator('[data-wcu-edit]:not([hidden])').click();editor=f.locator('#wcu-editor')
    editor.locator('[name="subtitle"]').fill('Unpublished draft')
    fw(page).evaluate('window.testDenyWrite=true');editor.locator('#wcu-publish').click()
    editor.locator('#wcu-editor-status').filter(has_text='Publishing was denied').wait_for()
    assert editor.is_visible() and editor.locator('[name="subtitle"]').input_value()=='Unpublished draft'
    # Concurrent publishes cannot silently overwrite a newer revision.
    fw(page).evaluate("window.testDenyWrite=false;const d=JSON.parse(localStorage.getItem('test-wcu-doc'));d.revision=3;localStorage.setItem('test-wcu-doc',JSON.stringify(d));")
    editor.locator('#wcu-publish').click();editor.locator('#wcu-editor-status').filter(has_text='another session').wait_for()
    assert editor.locator('[name="subtitle"]').input_value()=='Unpublished draft'
    page.once('dialog',lambda d:d.accept());editor.locator('[data-editor-close]').click()
    # A new record can be authored through fields, without editing JS or JSON.
    page.reload();f=cf(page);f.locator('#wcu-manage:not([hidden])').click();editor=f.locator('#wcu-editor')
    page.once('dialog',lambda d:d.accept('new-wcu-project'));editor.locator('[data-editor-new]').click()
    editor.locator('[name="name"]').fill('New WCU Project');editor.locator('[name="overview"]').fill('A newly documented story.')
    editor.locator('[name="timelineId"]').select_option('example-era')
    editor.locator('[name="characterIds"][value="second-character"]').check()
    editor.locator('#wcu-publish').click();editor.wait_for(state='hidden')
    assert fw(page).evaluate('WCU_DATABASE.projects.some(p=>p.id==="new-wcu-project")')
    # Validation protects references and rejects malformed public data.
    assert fw(page).evaluate('''()=>{const d=JSON.parse(JSON.stringify(WCU_DATABASE));d.characters=d.characters.filter(c=>c.id!=='second-character');try{WCUStore.validate(d);return false;}catch(_){return true;}}''')
    assert fw(page).evaluate('''()=>{const d=JSON.parse(JSON.stringify(WCU_DATABASE));delete d.projects[0].id;try{WCUStore.validate(d);return false;}catch(_){return true;}}''')
    for width in [320,768,1440]:
        page.set_viewport_size({'width':width,'height':1000})
        f.locator('#wcu-manage').click();editor=f.locator('#wcu-editor')
        assert editor.evaluate('(e)=>e.scrollWidth<=e.clientWidth'),width
        assert fw(page).evaluate('document.documentElement.scrollWidth<=innerWidth'),width
        editor.locator('[data-editor-close]').click()
    # A signed-in visitor receives no edit controls and cannot publish via the store API.
    visitor=browser.new_context(service_workers='block');configure(visitor)
    visitor.add_init_script(firebase_script('visitor'))
    visitor.route('**/admin/config',lambda r:r.fulfill(status=403,json={'detail':'Admin access required.'}))
    vp=visitor.new_page();vp.goto(BASE+'wcu.html');vf=cf(vp);vf.locator('#wcu-access-message').filter(has_text='administrator only').wait_for()
    assert vf.locator('#wcu-manage').is_hidden()
    assert not fw(vp).evaluate('WCUStore.status.canEdit')
    assert fw(vp).evaluate('''async()=>{try{await WCUStore.publish(WCU_DATABASE,0);return false;}catch(_){return true;}}''')
    # First-time setup restores a private JSON backup after verification, with no public seed.
    bootstrap=browser.new_context(service_workers='block');configure(bootstrap);bootstrap.add_init_script(firebase_script(seed=False))
    bp=bootstrap.new_page();bp.goto(BASE+'wcu.html');bf=cf(bp);bf.locator('#wcu-manage:not([hidden])').click()
    be=bf.locator('#wcu-editor');be.locator('#wcu-import-file').set_input_files({'name':'private-backup.json','mimeType':'application/json','buffer':json.dumps(DATABASE).encode()})
    be.locator('#wcu-editor-status').filter(has_text='Backup loaded').wait_for();be.locator('#wcu-publish').click();be.wait_for(state='hidden')
    assert bf.locator('.wcu-project-card').count()==2
    assert not errors,errors
    print('PASS: owner editing/creation, persisted published changes, wiki-link rendering, permission failures, concurrent-edit protection, reference validation, visitor restrictions and responsive editor.')
    browser.close()
