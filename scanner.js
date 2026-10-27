import {scannerLocations, latLonToCartesian, formatCoordinate, makeLoreNode} from './scanner-model.js?v=private-1';

let THREE;
export function latLonToVector3(lat, lon, radius = 1) {
  const {x,y,z} = latLonToCartesian(lat,lon,radius);
  return new THREE.Vector3(x,y,z);
}
const $ = id => document.getElementById(id);
const escape = value => String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const host = $('scanner-canvas-host'), stage = $('scanner-stage');
const lifetime = new AbortController(), listeners = {signal:lifetime.signal};
let selected = null, filter = 'all', engine = null, disposed = false, clockTimer;
let autoEnabled = !reducedMotion.matches, rotationBeforeFocus = autoEnabled;

function announce(text) { $('scanner-announcement').textContent = text; }
function visibleLocations() { return scannerLocations.filter(location=>filter==='all'||location.type===filter); }
function renderDirectory() {
  $('scanner-location-list').innerHTML = visibleLocations().map(location=>`<button type="button" class="scanner-location" data-scanner-location="${location.id}" aria-pressed="${selected?.id===location.id}" style="--signal:${location.color}"><span class="scanner-location-number">${String(scannerLocations.indexOf(location)+1).padStart(2,'0')}</span><span><strong>${escape(location.name)}</strong><small>${escape(location.place)}</small><span class="scanner-location-type">${location.type==='real'?'◈ REAL NODE':'◇ DIMENSION RIFT'}</span></span></button>`).join('');
  $('scanner-count').textContent = String(visibleLocations().length).padStart(2,'0');
}
function syncAuto() {
  const active = autoEnabled && !selected;
  $('scanner-auto').setAttribute('aria-pressed',String(active));
  $('scanner-auto').textContent = `↻ Auto-Rotate: ${selected?'paused':active?'on':'off'}`;
  engine?.setAuto(active);
}
function tick() {
  const now = new Date();
  $('scanner-utc').textContent = now.toISOString().slice(11,19)+' UTC';
  if (!selected) return;
  const altitude = selected.altitude + (reducedMotion.matches?0:Math.sin(now.getTime()/5500)*1.4);
  $('scanner-altitude').textContent = `${altitude.toFixed(1)} m`;
  $('scanner-sampled-at').textContent = now.toISOString().slice(11,19)+' UTC';
  if (selected.type==='real') $('scanner-local-time').textContent = new Intl.DateTimeFormat('de-DE',{timeZone:selected.timezone,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(now);
}
function linked(location) {
  try { return window.LifeOSCore.read().loreGraph.nodes.some(node=>node.id===`scanner-${location.id}`); } catch (_) { return false; }
}
function renderHud(location) {
  const hud = $('scanner-hud');
  hud.style.setProperty('--signal',location.color);
  const sensors = location.type==='real'
    ? `<h3>SIMULATED TELEMETRY</h3><div class="scanner-sensors"><div><small>LOCAL TIME</small><strong id="scanner-local-time"></strong><p>${escape(location.timezone)}</p></div><div><small>DEMO WEATHER</small><strong>${location.temperature} °C</strong><p>${escape(location.weather)}</p></div></div><p class="scanner-simulation">Weather and altitude are simulated sensor data. Local time is calculated live from the indicated time zone.</p><a class="scanner-hud-link" href="transit.html">Open transit / timetable ↗</a>`
    : `<h3>SIMULATION // SIGNAL SIGNATURE</h3><p class="scanner-description">${escape(location.dimension)}</p><h3>DANGER LEVEL</h3><div class="scanner-danger" aria-label="Danger level ${location.danger} of 5">${Array.from({length:5},(_,i)=>`<i class="${i<location.danger?'active':''}" aria-hidden="true"></i>`).join('')}<span>LV. ${location.danger} / 5</span></div><p class="scanner-simulation">Fictional dimensional rift. All signatures and readings belong to the WCU lore system.</p><button type="button" class="scanner-hud-link" id="scanner-lore-link">${linked(location)?'Open in lore graph':'Save and open in lore graph'} ↗</button><p id="scanner-link-status" class="scanner-simulation" role="status"></p>`;
  $('scanner-hud-body').innerHTML = `<span class="scanner-status-badge">${location.status}</span><h2 id="scanner-hud-title">${escape(location.name)}</h2><p class="scanner-place">${escape(location.place)}</p><dl class="scanner-coordinates"><div><dt>LATITUDE</dt><dd>${formatCoordinate(location.lat)}</dd></div><div><dt>LONGITUDE</dt><dd>${formatCoordinate(location.lon,false)}</dd></div><div><dt>ALTITUDE / SIM</dt><dd id="scanner-altitude"></dd></div><div><dt>LAST SAMPLE</dt><dd id="scanner-sampled-at"></dd></div></dl><p class="scanner-description">${escape(location.description)}</p>${sensors}`;
  hud.classList.add('open');hud.inert=false;hud.setAttribute('aria-hidden','false');
  $('scanner-close').focus({preventScroll:true});tick();
  if(matchMedia('(max-width:700px)').matches) hud.scrollIntoView({block:'nearest',behavior:reducedMotion.matches?'instant':'smooth'});
}
function selectLocation(id) {
  const location = scannerLocations.find(item=>item.id===id);if(!location)return;
  if(filter!=='all'&&filter!==location.type)setFilter('all');
  if(!selected)rotationBeforeFocus=autoEnabled;
  selected=location;renderDirectory();renderHud(location);syncAuto();
  engine?.focus(location);
  $('scanner-view-status').textContent = `LOCK / ${location.id.toUpperCase()}`;
  announce(`${location.name} · ${location.status} · ${formatCoordinate(location.lat)}, ${formatCoordinate(location.lon,false)}`);
}
function closeHud({reset=false,restoreFocus=true}={}) {
  const previous=selected;
  selected=null;$('scanner-hud').classList.remove('open');$('scanner-hud').inert=true;$('scanner-hud').setAttribute('aria-hidden','true');
  autoEnabled=reset?!reducedMotion.matches:rotationBeforeFocus;
  renderDirectory();syncAuto();engine?.reset();
  $('scanner-view-status').textContent = engine?'ORBIT / OVERVIEW':'DIRECTORY MODE';
  announce('Overview restored. Choose a signal to scan the sector.');
  if(previous&&restoreFocus)$('scanner-location-list').querySelector(`[data-scanner-location="${previous.id}"]`)?.focus({preventScroll:true});
  if(previous&&matchMedia('(max-width:700px)').matches)stage.scrollIntoView({block:'nearest',behavior:reducedMotion.matches?'instant':'smooth'});
}
function setFilter(next) {
  if(selected&&next!=='all'&&selected.type!==next)closeHud({restoreFocus:false});
  filter=next;document.querySelectorAll('[data-scanner-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.scannerFilter===next)));
  engine?.filter(next);renderDirectory();announce(`${visibleLocations().length} signals in the current filter.`);
}
function openLore() {
  if(!selected||selected.type!=='rift')return;
  const location=selected,node=makeLoreNode(location);
  try {
    if(!linked(location))window.LifeOSCore.update(state=>{if(!state.loreGraph.nodes.some(existing=>existing.id===node.id))state.loreGraph.nodes.push(node);},{activity:false});
    const url=`lifeos.html?tab=lore&node=${encodeURIComponent(node.id)}`;
    if(window.parent.LifeOSShell)window.parent.LifeOSShell.navigate(url);else window.location.assign(url);
  } catch(error) {const text=`Could not save the lore link: ${error.message}`;announce(text);$('scanner-link-status').textContent=text;}
}
$('scanner-location-list').addEventListener('click',event=>{const button=event.target.closest('[data-scanner-location]');if(button)selectLocation(button.dataset.scannerLocation);},listeners);
document.querySelectorAll('[data-scanner-filter]').forEach(button=>button.addEventListener('click',()=>setFilter(button.dataset.scannerFilter),listeners));
$('scanner-auto').addEventListener('click',()=>{if(selected){closeHud({reset:true});autoEnabled=true;}else autoEnabled=!autoEnabled;syncAuto();},listeners);
$('scanner-reset').addEventListener('click',()=>closeHud({reset:true}),listeners);
$('scanner-close').addEventListener('click',()=>closeHud(),listeners);
$('scanner-hud-body').addEventListener('click',event=>{if(event.target.closest('#scanner-lore-link'))openLore();},listeners);
// The global shell owns Escape; keep scanner interactions out of text-input shortcuts.
reducedMotion.addEventListener('change',()=>{if(reducedMotion.matches)autoEnabled=false;syncAuto();engine?.motionChanged();},listeners);
renderDirectory();syncAuto();tick();clockTimer=setInterval(tick,1000);

class DimensionScanner {
  constructor(OrbitControls) {
    this.geometries=new Set();this.materials=new Set();this.textures=new Set();this.markers=[];this.gimbals=[];
    this.lastInteraction=performance.now()-6000;this.interacting=false;this.auto=autoEnabled;this.flight=null;this.elapsed=0;this.lastFrame=0;this.frame=0;this.stopped=false;this.dead=false;this.hovered=null;this.pointerInside=false;
    this.pointer=new THREE.Vector2();this.raycaster=new THREE.Raycaster();this.occludingSphere=new THREE.Sphere(new THREE.Vector3(),2);this.occlusionPoint=new THREE.Vector3();
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#05070a');
    this.camera=new THREE.PerspectiveCamera(40,1,.1,100);this.homeCamera=new THREE.Vector3(0,.45,8.5);this.camera.position.copy(this.homeCamera);
    try {this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});}catch(error){throw new Error('WebGL 2 is unavailable. Signals remain accessible in the directory.');}
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,matchMedia('(max-width:700px)').matches?1.5:2));this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.domElement.setAttribute('aria-label','Holographic globe: drag to rotate, scroll or pinch to zoom. Signals can also be selected in the directory.');this.renderer.domElement.tabIndex=0;host.append(this.renderer.domElement);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;this.controls.dampingFactor=.065;this.controls.enablePan=false;this.controls.minDistance=4.6;this.controls.maxDistance=12;this.controls.minPolarAngle=.12;this.controls.maxPolarAngle=Math.PI-.12;this.controls.autoRotateSpeed=.36;this.controls.zoomSpeed=.7;this.controls.rotateSpeed=.6;this.controls.touches.TWO=THREE.TOUCH.DOLLY_ROTATE;
    this.onControlsStart=()=>{this.lastInteraction=performance.now();this.interacting=true;this.flight=null;};this.onControlsEnd=()=>{this.lastInteraction=performance.now();this.interacting=false;};
    this.controls.addEventListener('start',this.onControlsStart);this.controls.addEventListener('end',this.onControlsEnd);
    this.globe=new THREE.Group();this.homeRotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(.04,-.22,-.08));this.globe.quaternion.copy(this.homeRotation);this.scene.add(this.globe);
    this.makeGlobe();this.makeStars();this.makeGimbals();this.makeMarkers();this.bindPointers();
    this.onResize=()=>this.resize();window.addEventListener('resize',this.onResize,listeners);this.observer=new ResizeObserver(this.onResize);this.observer.observe(host);this.resize();
    this.onVisibility=()=>{if(document.hidden)this.pause();else this.resume();};document.addEventListener('visibilitychange',this.onVisibility,listeners);
    this.renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();this.pause();unavailable('WebGL context lost. Reload the scanner; the signal directory remains available.');},listeners);
    this.animate=this.animate.bind(this);this.resume();
  }
  geometry(value){this.geometries.add(value);return value;}
  material(value){this.materials.add(value);return value;}
  makeGlobe() {
    const sphere=this.geometry(new THREE.SphereGeometry(2,64,40));
    this.globe.add(new THREE.Mesh(sphere,this.material(new THREE.MeshBasicMaterial({color:'#06141c',transparent:true,opacity:.92,depthWrite:true}))));
    const wire=new THREE.Mesh(this.geometry(new THREE.SphereGeometry(2.008,48,28)),this.material(new THREE.MeshBasicMaterial({color:'#39C5BB',wireframe:true,transparent:true,opacity:.13,depthWrite:false})));wire.renderOrder=1;this.globe.add(wire);
    this.atmosphereMaterial=this.material(new THREE.ShaderMaterial({uniforms:{uColor:{value:new THREE.Color('#39C5BB')},uTime:{value:0}},vertexShader:`varying vec3 vNormal; varying vec3 vView; void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);vNormal=normalize(normalMatrix*normal);vView=-mv.xyz;gl_Position=projectionMatrix*mv;}`,fragmentShader:`uniform vec3 uColor; uniform float uTime; varying vec3 vNormal; varying vec3 vView; void main(){float rim=pow(1.0-abs(dot(normalize(vNormal),normalize(vView))),3.4);gl_FragColor=vec4(uColor,rim*(0.48+0.03*sin(uTime*0.7)));}`,side:THREE.BackSide,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));
    const atmosphere=new THREE.Mesh(this.geometry(new THREE.SphereGeometry(2.15,64,40)),this.atmosphereMaterial);atmosphere.renderOrder=3;this.globe.add(atmosphere);
    const equator=[];for(let i=0;i<=180;i++)equator.push(...Object.values(latLonToCartesian(0,i*2-180,2.017)));
    const equatorGeometry=this.geometry(new THREE.BufferGeometry());equatorGeometry.setAttribute('position',new THREE.Float32BufferAttribute(equator,3));this.globe.add(new THREE.Line(equatorGeometry,this.material(new THREE.LineBasicMaterial({color:'#39C5BB',transparent:true,opacity:.5,depthWrite:false}))));
  }
  async land() {
    const response=await fetch('assets/scanner/earth-land.json',{signal:lifetime.signal});if(!response.ok)throw new Error('Could not load continent data.');const data=await response.json();if(this.dead||disposed)return;
    const positions=[];for(const [lat,lon] of data.points){const p=latLonToCartesian(lat,lon,2.025);positions.push(p.x,p.y,p.z);}
    const geometry=this.geometry(new THREE.BufferGeometry());geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    this.landMaterial=this.material(new THREE.PointsMaterial({color:'#6ef8e2',size:.027,sizeAttenuation:true,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false}));
    const particles=new THREE.Points(geometry,this.landMaterial);particles.renderOrder=2;this.globe.add(particles);
    const segments=[];for(const ring of data.coastlines)for(let i=1;i<ring.length;i++){
      const from=latLonToCartesian(...ring[i-1],2.023),to=latLonToCartesian(...ring[i],2.023);segments.push(from.x,from.y,from.z,to.x,to.y,to.z);
    }
    const coast=this.geometry(new THREE.BufferGeometry());coast.setAttribute('position',new THREE.Float32BufferAttribute(segments,3));
    this.globe.add(new THREE.LineSegments(coast,this.material(new THREE.LineBasicMaterial({color:'#39C5BB',transparent:true,opacity:.46,depthWrite:false}))));
  }
  makeStars() {
    const positions=[],mobile=matchMedia('(max-width:700px)').matches;let seed=3904;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<(mobile?650:1200);i++){const y=random()*2-1,angle=random()*Math.PI*2,radius=19+random()*13,s=Math.sqrt(1-y*y);positions.push(radius*s*Math.cos(angle),radius*y,radius*s*Math.sin(angle));}
    const geometry=this.geometry(new THREE.BufferGeometry());geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    this.starsMaterial=this.material(new THREE.PointsMaterial({color:'#8aaebc',size:.04,transparent:true,opacity:.55,sizeAttenuation:true,depthWrite:false}));this.scene.add(new THREE.Points(geometry,this.starsMaterial));
  }
  makeGimbals() {
    const ringMaterial=this.material(new THREE.MeshBasicMaterial({color:'#39C5BB',transparent:true,opacity:.48,blending:THREE.AdditiveBlending,depthWrite:false}));
    const tickMaterial=this.material(new THREE.LineBasicMaterial({color:'#39C5BB',transparent:true,opacity:.55,depthWrite:false}));
    for(let index=0;index<2;index++){
      const group=new THREE.Group(),radius=index?2.57:2.36;
      group.rotation.set(index?1.15:.65,index ? 0.3 : -0.25,index?-.5:.3);
      group.add(new THREE.Mesh(this.geometry(new THREE.TorusGeometry(radius,.006,6,180)),ringMaterial));
      const ticks=[];for(let i=0;i<72;i++){const angle=i/72*Math.PI*2,length=i % 6 === 0 ? 0.085 : 0.028;ticks.push(Math.cos(angle)*radius,Math.sin(angle)*radius,0,Math.cos(angle)*(radius+length),Math.sin(angle)*(radius+length),0);}
      const geometry=this.geometry(new THREE.BufferGeometry());geometry.setAttribute('position',new THREE.Float32BufferAttribute(ticks,3));group.add(new THREE.LineSegments(geometry,tickMaterial));
      const arc=[];for(let i=0;i<=20;i++){const angle=i/20*.32+index;arc.push(new THREE.Vector3(Math.cos(angle)*radius,Math.sin(angle)*radius,0));}
      group.add(new THREE.Line(this.geometry(new THREE.BufferGeometry().setFromPoints(arc)),this.material(new THREE.LineBasicMaterial({color:index?'#9d4edd':'#c6fff4',transparent:true,opacity:.95,depthWrite:false}))));
      this.scene.add(group);this.gimbals.push(group);
    }
  }
  makeMarkers() {
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const ctx=canvas.getContext('2d');
    const gradient=ctx.createRadialGradient(32,32,0,32,32,32);gradient.addColorStop(0,'rgba(255,255,255,1)');gradient.addColorStop(.18,'rgba(255,255,255,.8)');gradient.addColorStop(.5,'rgba(255,255,255,.12)');gradient.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
    const texture=new THREE.CanvasTexture(canvas);this.textures.add(texture);
    const coreGeometry=this.geometry(new THREE.SphereGeometry(.035,12,8)),beamGeometry=this.geometry(new THREE.CylinderGeometry(.005,.009,.32,6)),ringGeometry=this.geometry(new THREE.RingGeometry(.055,.063,40)),hitGeometry=this.geometry(new THREE.SphereGeometry(.095,10,8));
    const hitMaterial=this.material(new THREE.MeshBasicMaterial({visible:false}));
    for(const [index,location] of scannerLocations.entries()){
      const normal=latLonToVector3(location.lat,location.lon,1),group=new THREE.Group();group.position.copy(normal).multiplyScalar(2.045);group.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),normal);
      const material=this.material(new THREE.MeshBasicMaterial({color:location.color,transparent:true,opacity:1,blending:THREE.AdditiveBlending,depthWrite:false}));
      group.add(new THREE.Mesh(coreGeometry,material));const beam=new THREE.Mesh(beamGeometry,material);beam.position.y=.16;group.add(beam);
      const pulseMaterial=this.material(new THREE.MeshBasicMaterial({color:location.color,transparent:true,opacity:.6,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false}));
      const pulse=new THREE.Mesh(ringGeometry,pulseMaterial);pulse.rotation.x=-Math.PI/2;pulse.position.y=.008;group.add(pulse);
      const glow=new THREE.Sprite(this.material(new THREE.SpriteMaterial({map:texture,color:location.color,transparent:true,opacity:.85,blending:THREE.AdditiveBlending,depthWrite:false})));glow.scale.set(.29,.29,1);group.add(glow);
      const hit=new THREE.Mesh(hitGeometry,hitMaterial);hit.userData.location=location;group.add(hit);this.globe.add(group);
      this.markers.push({location,group,hit,pulse,pulseMaterial,material,glow,phase:index*.37});
    }
  }
  filter(next){for(const marker of this.markers)marker.group.visible=next==='all'||marker.location.type===next;this.setHover(null);}
  setAuto(active){this.auto=active;this.controls.autoRotate=false;}
  motionChanged(){if(reducedMotion.matches&&this.flight){this.camera.position.copy(this.flight.toCamera);this.globe.quaternion.copy(this.flight.toRotation);this.flight=null;this.controls.enabled=true;this.controls.update();}}
  fly(toCamera,toRotation) {
    this.controls.autoRotate=false;this.controls.enableDamping=false;this.controls.update();this.controls.enableDamping=true;this.controls.enabled=false;
    this.flight={start:performance.now(),fromCamera:this.camera.position.clone(),toCamera,fromRotation:this.globe.quaternion.clone(),toRotation,duration:reducedMotion.matches?0:1250};this.lastInteraction=performance.now();this.setHover(null);
  }
  focus(location) {
    const direction=this.camera.position.clone().normalize();const current=latLonToVector3(location.lat,location.lon,1).applyQuaternion(this.globe.quaternion);
    const rotation=new THREE.Quaternion().setFromUnitVectors(current,direction).multiply(this.globe.quaternion.clone());
    this.fly(direction.multiplyScalar(5.6),rotation);
  }
  reset(){this.fly(this.homeCamera.clone(),this.homeRotation.clone());}
  bindPointers() {
    const canvas=this.renderer.domElement;let down=null,multitouch=false;const pointers=new Set();
    const coords=event=>{const rect=canvas.getBoundingClientRect();this.pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);this.tooltipPosition={x:event.clientX-rect.left,y:event.clientY-rect.top};};
    canvas.addEventListener('pointermove',event=>{this.pointerInside=event.pointerType!=='touch';coords(event);if(this.pointerInside)this.pick();},listeners);
    canvas.addEventListener('pointerleave',()=>{this.pointerInside=false;this.setHover(null);},listeners);
    canvas.addEventListener('pointerdown',event=>{pointers.add(event.pointerId);if(pointers.size>1)multitouch=true;down={x:event.clientX,y:event.clientY,id:event.pointerId};coords(event);},listeners);
    canvas.addEventListener('pointerup',event=>{
      coords(event);const click=down&&down.id===event.pointerId&&!multitouch&&Math.hypot(event.clientX-down.x,event.clientY-down.y)<6;
      pointers.delete(event.pointerId);if(!pointers.size)multitouch=false;down=null;
      if(click){const marker=this.pick();if(marker)selectLocation(marker.location.id);}
    },listeners);
    canvas.addEventListener('pointercancel',event=>{pointers.delete(event.pointerId);down=null;if(!pointers.size)multitouch=false;this.setHover(null);},listeners);
  }
  pick() {
    if(this.flight)return null;
    this.scene.updateMatrixWorld(true);this.camera.updateMatrixWorld(true);this.raycaster.setFromCamera(this.pointer,this.camera);
    const surface=this.raycaster.ray.intersectSphere(this.occludingSphere,this.occlusionPoint);
    const surfaceDistance=surface?this.camera.position.distanceTo(surface):Infinity;
    const hits=this.raycaster.intersectObjects(this.markers.filter(marker=>marker.group.visible).map(marker=>marker.hit),false);
    const hit=hits.find(candidate=>candidate.distance<=surfaceDistance+.035);
    const marker=hit?this.markers.find(item=>item.hit===hit.object):null;this.setHover(marker);return marker;
  }
  setHover(marker) {
    this.hovered=marker;this.renderer.domElement.style.cursor=marker?'pointer':this.interacting?'grabbing':'grab';
    const tooltip=$('scanner-tooltip');tooltip.hidden=!marker;
    if(!marker)return;
    this.lastInteraction=performance.now();tooltip.textContent=marker.location.name;tooltip.style.setProperty('--signal',marker.location.color);
    const position=this.tooltipPosition||{x:24,y:24};tooltip.style.left=Math.max(12,Math.min(position.x+16,stage.clientWidth-tooltip.offsetWidth-12))+'px';tooltip.style.top=Math.max(45,Math.min(position.y+16,stage.clientHeight-tooltip.offsetHeight-12))+'px';
  }
  resize() {
    if(this.dead)return;const rect=host.getBoundingClientRect();if(rect.width<1||rect.height<1)return;
    this.camera.aspect=rect.width/rect.height;this.camera.updateProjectionMatrix();this.renderer.setSize(rect.width,rect.height,false);
  }
  animate(now) {
    if(this.stopped||this.dead)return;
    const delta=Math.min(.05,this.lastFrame?(now-this.lastFrame)/1000:0);this.lastFrame=now;this.elapsed+=delta;this.frame++;
    const time=reducedMotion.matches?0:this.elapsed;
    if(this.flight){const flight=this.flight,t=flight.duration?Math.min(1,(now-flight.start)/flight.duration):1,eased=t*t*(3-2*t);this.camera.position.lerpVectors(flight.fromCamera,flight.toCamera,eased);this.globe.quaternion.slerpQuaternions(flight.fromRotation,flight.toRotation,eased);this.camera.lookAt(0,0,0);if(t===1){this.flight=null;this.controls.enabled=true;this.controls.update();}}
    else{this.controls.autoRotate=this.auto&&!this.interacting&&!this.hovered&&now-this.lastInteraction>4500;this.controls.update(delta);}
    this.gimbals[0].rotation.z=.3+time*.12;this.gimbals[1].rotation.z=-.5-time*.085;
    this.atmosphereMaterial.uniforms.uTime.value=time;this.starsMaterial.opacity=.52+Math.sin(time*.35)*.05;
    for(const marker of this.markers){
      const progress=(time*.7+marker.phase)%1;marker.pulse.scale.setScalar(reducedMotion.matches?1.5:1+progress*2.4);marker.pulseMaterial.opacity=reducedMotion.matches ? 0.45 : (1-progress)*.65;
      const warning=marker.location.type==='rift'?(.75+Math.sin(time*5+marker.phase)*.18):1;marker.material.opacity=marker.location.status==='OFFLINE'?warning*.42:warning;
      const target=this.hovered===marker||selected?.id===marker.location.id?1.45:1;marker.group.scale.setScalar(reducedMotion.matches?target:marker.group.scale.x+(target-marker.group.scale.x)*.16);
    }
    if(this.pointerInside&&!this.interacting&&this.frame%3===0)this.pick();
    this.renderer.render(this.scene,this.camera);this.request=requestAnimationFrame(this.animate);
  }
  pause(){this.stopped=true;cancelAnimationFrame(this.request);this.lastFrame=0;}
  resume(){if(this.dead||document.hidden)return;this.stopped=false;cancelAnimationFrame(this.request);this.lastFrame=0;this.request=requestAnimationFrame(this.animate);}
  dispose() {
    if(this.dead)return;this.dead=true;this.pause();this.observer?.disconnect();this.controls.removeEventListener('start',this.onControlsStart);this.controls.removeEventListener('end',this.onControlsEnd);this.controls.dispose();
    for(const geometry of this.geometries)geometry.dispose();for(const material of this.materials)material.dispose();for(const texture of this.textures)texture.dispose();
    this.scene.clear();this.renderer.dispose();this.renderer.forceContextLoss();this.renderer.domElement.remove();
  }
}
function unavailable(reason) {
  $('scanner-system-status').textContent='DIRECTORY MODE';$('scanner-view-status').textContent='3D UNAVAILABLE';
  $('scanner-loading').hidden=false;$('scanner-loading').classList.add('failed');$('scanner-loading').querySelector('strong').textContent='Signal directory available';$('scanner-loading').querySelector('span').textContent=reason;
  announce(reason);
}
async function boot() {
  try{
    const modules=await Promise.all([import('three'),import('three/addons/controls/OrbitControls.js')]);if(disposed)return;
    THREE=modules[0];engine=new DimensionScanner(modules[1].OrbitControls);engine.filter(filter);syncAuto();if(selected)engine.focus(selected);
    $('scanner-loading').hidden=true;$('scanner-system-status').textContent='CONNECTED';$('scanner-view-status').textContent=selected?`LOCK / ${selected.id.toUpperCase()}`:'ORBIT / OVERVIEW';
    try{await engine.land();}catch(error){if(error.name!=='AbortError')announce('Globe active; continent data unavailable. Markers and coordinates still work.');}
  }catch(error){if(!disposed)unavailable(error.message?.includes('WebGL')?error.message:'3D library unavailable. Check your connection and reload. All six signals remain available in the directory.');}
}
function dispose() {if(disposed)return;disposed=true;clearInterval(clockTimer);lifetime.abort();engine?.dispose();engine=null;}
window.addEventListener('pagehide',event=>{if(event.persisted)engine?.pause();else dispose();});
window.addEventListener('pageshow',event=>{if(event.persisted)engine?.resume();});
export {scannerLocations, dispose};
void boot();
