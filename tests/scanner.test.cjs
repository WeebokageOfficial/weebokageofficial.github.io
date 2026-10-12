// Run with: node --test tests/scanner.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const vm=require('node:vm');
const model=import('../scanner-model.js');
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-10,`${actual} != ${expected}`);
test('geographic projection uses the expected cardinal axes and radius',async()=>{
  const {latLonToCartesian:project}=await model;
  for(const [lat,lon,wanted] of [[0,0,[0,0,3]],[0,90,[3,0,0]],[0,-90,[-3,0,0]],[90,0,[0,3,0]],[-90,0,[0,-3,0]],[0,180,[0,0,-3]]]){
    const p=project(lat,lon,3);[p.x,p.y,p.z].forEach((n,i)=>close(n,wanted[i]));
  }
  for(const [lat,lon] of [[51.08,7.12],[35.6997,139.7714],[-75,0],[25,-71]]){
    const p=project(lat,lon,2.045);close(Math.hypot(p.x,p.y,p.z),2.045);
    close(Math.asin(p.y/2.045)*180/Math.PI,lat);close(Math.atan2(p.x,p.z)*180/Math.PI,lon);
  }
  for(const args of [[91,0,1],[0,181,1],[0,0,0],[NaN,0,1],[0,0,Infinity]])assert.throws(()=>project(...args),RangeError);
});
test('six unique POIs preserve their exact coordinates and signal types',async()=>{
  const {scannerLocations:locations}=await model;
  assert.equal(locations.length,6);assert.equal(new Set(locations.map(l=>l.id)).size,6);
  assert.equal(locations.filter(l=>l.type==='real').length,3);assert.equal(locations.filter(l=>l.type==='rift').length,3);
  assert.deepEqual(locations.filter(l=>l.type==='real').map(l=>[l.lat,l.lon]),[[51.08,7.12],[50.9375,6.9603],[35.6997,139.7714]]);
  for(const l of locations.filter(l=>l.type==='rift'))assert.ok(l.danger>=1&&l.danger<=5);
});
test('coordinate formatting distinguishes hemispheres and retains precision',async()=>{
  const {formatCoordinate:f}=await model;
  assert.equal(f(51.08),'51.0800° N');assert.equal(f(-75),'75.0000° S');assert.equal(f(-71,false),'71.0000° W');assert.equal(f(139.7714,false),'139.7714° E');
});
test('rift links produce valid persistent LoreGraph records and preserve existing notes',async()=>{
  const {makeLoreNode,scannerLocations}=await model;
  const window={};vm.runInNewContext(readFileSync(join(__dirname,'..','lifeos-core.js'),'utf8'),{window,crypto:require('node:crypto').webcrypto,Intl,Date});
  const state=window.LifeOSCore.defaults();
  state.loreGraph.nodes=scannerLocations.filter(l=>l.type==='rift').map(makeLoreNode);
  assert.equal(window.LifeOSCore.validateState(state).loreGraph.nodes.length,3);
  assert.equal(state.loreGraph.nodes.find(n=>n.id==='scanner-vault').status,'Verschollen');
  assert.throws(()=>makeLoreNode(scannerLocations[0]));
  const restored=window.LifeOSCore.validateState(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.loreGraph.nodes[0].notes,state.loreGraph.nodes[0].notes);
});
test('local land dataset has valid coordinates and enough particles for the globe',()=>{
  const land=JSON.parse(readFileSync(join(__dirname,'..','assets/scanner/earth-land.json'),'utf8'));
  assert.ok(land.points.length>3000);assert.ok(land.coastlines.length>100);
  for(const point of [...land.points,...land.coastlines.flat()])assert.ok(point.length===2&&point[0]>=-90&&point[0]<=90&&point[1]>=-180&&point[1]<=180);
});
