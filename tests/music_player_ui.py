"""On-demand Music room and persistent mini player, with a mocked Spotify SDK."""
import os
from playwright.sync_api import sync_playwright
from ui_smoke import configure,cf,BASE

SDK='''window.Spotify={Player:class{
 constructor(){this.listeners={};this.state=null;window.mockSpotifyPlayer=this;}
 addListener(name,fn){this.listeners[name]=fn;}
 async connect(){setTimeout(()=>this.listeners.ready({device_id:'test-device'}),0);return true;}
 disconnect(){}
 async activateElement(){}
 async getCurrentState(){return this.state;}
 async togglePlay(){this.state=this.state?{...this.state,paused:!this.state.paused}:{paused:false,position:0,duration:180000,shuffle:false,track_window:{current_track:{id:'test-track',name:'A test soundtrack',artists:[{name:'Miku'}],album:{images:[]}}}};this.listeners.player_state_changed(this.state);}
 async setVolume(){} async getVolume(){return .5;}
}};window.onSpotifyWebPlaybackSDKReady();'''


def main():
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,args=['--no-sandbox'],**({'executable_path':os.environ['UI_BROWSER_PATH']} if os.environ.get('UI_BROWSER_PATH') else {}))
  context=browser.new_context(viewport={'width':1440,'height':1000},service_workers='block');configure(context)
  context.add_init_script("localStorage.setItem('weebokage.lifeos.spotify.token',JSON.stringify({access_token:'mock',expires_at:Date.now()+3600000}))")
  sdk_requests=[]
  def sdk(route):
   sdk_requests.append(route.request.url);route.fulfill(body=SDK,content_type='application/javascript')
  context.route('https://sdk.scdn.co/spotify-player.js',sdk)
  context.route('https://api.spotify.com/**',lambda route:route.fulfill(status=204))
  page=context.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
  page.goto(BASE+'games.html');f=cf(page);f.locator('.nav-category-bar').wait_for()
  assert page.locator('#cyberdeck').is_hidden()
  assert sdk_requests==[], 'Ordinary browsing must not initialize Spotify'
  assert page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--deck-height').trim()")=='0px'
  def open_music():
   f.locator('[data-category="music"] summary').click()
   f.locator('[data-open-music]').click()
   page.locator('#music-room[open]').wait_for()
  open_music()
  assert page.locator('#cyberdeck').is_visible()
  page.locator('#music-room-close').click()
  assert page.locator('#cyberdeck').is_hidden(), 'Opening without playing must not create a mini player'
  open_music()
  page.locator('#deck-play:not([disabled])').wait_for()
  page.locator('#deck-play').click()
  page.wait_for_function("document.querySelector('#player-bop-sprite').classList.contains('is-bopping')")
  page.screenshot(path='/tmp/weebokage-ui/music-room.png')
  page.locator('#music-room-close').click()
  page.wait_for_function("document.querySelector('#cyberdeck').dataset.playerMode==='mini' && !document.querySelector('#cyberdeck').hidden")
  assert page.locator('#player-character-stage').is_visible()
  assert page.locator('#deck-title').inner_text()=='A test soundtrack'
  assert page.locator('#cyberdeck').bounding_box()['height']<=85
  page.evaluate('window.retainedPlayer=mockSpotifyPlayer;window.retainedDeck=document.querySelector("#cyberdeck")')
  page.evaluate("LifeOSShell.navigate('chat.html')");f.locator('body[data-page="chat"]').wait_for()
  assert page.evaluate('retainedPlayer===mockSpotifyPlayer && retainedDeck===document.querySelector("#cyberdeck")')
  assert page.locator('#player-bop-sprite').evaluate('el=>el.classList.contains("is-bopping")')
  for width in [1440,768,390,320]:
   page.set_viewport_size({'width':width,'height':1000})
   assert page.locator('#cyberdeck').bounding_box()['width']<=460
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   assert page.locator('#player-character-stage').is_visible()
  page.screenshot(path='/tmp/weebokage-ui/music-mini-mobile.png')
  page.locator('#deck-play').click()
  page.wait_for_function("!document.querySelector('#player-bop-sprite').classList.contains('is-bopping')")
  assert page.locator('#cyberdeck').is_visible(), 'Paused mini player stays available for resume'
  page.locator('#deck-size-toggle').click()
  page.locator('#music-room[open]').wait_for()
  assert page.locator('#deck-connect').is_hidden(), 'Existing Spotify session retained'
  page.locator('#music-room-close').click()
  page.evaluate('mockSpotifyPlayer.listeners.not_ready()')
  page.locator('#cyberdeck').wait_for(state='hidden')
  assert not errors,errors
  browser.close()
 print('PASS: hidden default, on-demand Music room, playback-triggered mini, navigation continuity, sprites/bop, pause/resume and disconnect')


if __name__=='__main__':main()
