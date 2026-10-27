import sys,re,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from ui_smoke import configure,cf,fw
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/opt/brave.com/brave/brave',headless=True,args=['--no-sandbox'])
 c=b.new_context(service_workers='block');configure(c)
 page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 for path in ['index.html','lifeos.html','scanner.html','transit.html','shop.html']:
  page.goto('http://127.0.0.1:8765/'+path);page.wait_for_timeout(1400)
  if path=='lifeos.html':
   f=cf(page)
   if f.locator('#enter-lifeos').is_visible():f.locator('#enter-lifeos').click()
   for tab in ['lifestyle','lore','finance','teto','imam']:
    f.locator('[data-tab="'+tab+'"]').click();page.wait_for_timeout(200)
    assert not re.search(r'\b(Bitte|Speichern|Löschen|Noch|Knoten|Neuer|Keine|Gesamt)\b',f.locator('body').inner_text()),tab
   core=page.evaluate('''()=>{const s=LifeOSCore.defaults();s.organisation={rate:165,purchases:[{id:'p',title:'My purchase',category:'Figuren/Merch',currency:'JPY',price:165,rate:165,cents:100}],limits:{checked:23,cabin:7},gear:[{id:'g',title:'Reisepass',group:'Dokumente & Finanzen',bag:'cabin',weight:0,done:false}],routes:[],vault:{hotelEN:'',hotelJP:'',notes:''}};s.loreGraph={nodes:[{id:'test',name:'User story',type:'dimension',status:'Verschollen',home:'',notes:'Keep my text',attributes:[]}],edges:[]};const v=LifeOSCore.validateState(s);return {node:v.loreGraph.nodes[0],organisation:v.organisation};}''')
   assert core['node']['status']=='Missing' and core['node']['notes']=='Keep my text'
   assert core['organisation']['purchases'][0]['category']=='Figures/Merch'
   assert core['organisation']['gear'][0]['title']=='Passport'
   assert core['organisation']['gear'][0]['group']=='Documents & Finance'
 print('Pages and all six LifeOS tabs loaded; legacy lore migration passed. Errors:',errors)
 assert not errors
 b.close()
