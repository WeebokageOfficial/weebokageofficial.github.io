// Geographic convention: +Y north, +Z Greenwich, +X 90° east; right-handed sphere.
export function latLonToCartesian(lat, lon, radius = 1) {
  if (![lat, lon, radius].every(Number.isFinite) || lat < -90 || lat > 90 || lon < -180 || lon > 180 || radius <= 0) throw new RangeError('Invalid latitude, longitude or radius');
  const latitude = lat * Math.PI / 180, longitude = lon * Math.PI / 180;
  return {x:radius * Math.cos(latitude) * Math.sin(longitude),y:radius * Math.sin(latitude),z:radius * Math.cos(latitude) * Math.cos(longitude)};
}
export function formatCoordinate(value, latitude = true) {
  return `${Math.abs(value).toFixed(4)}° ${latitude ? (value < 0 ? 'S' : 'N') : (value < 0 ? 'W' : 'E')}`;
}
export const scannerLocations = [
  {id:'home',name:'Home Node // Sector West',place:'Burscheid / Rhineland',type:'real',lat:51.08,lon:7.12,altitude:152,status:'OPERATIONAL',color:'#39C5BB',timezone:'Europe/Berlin',weather:'Partly cloudy',temperature:17,description:'Personal uplink in the Rhineland. The origin signal of the LifeOS network.'},
  {id:'cologne',name:'Cologne Cyber Hub',place:'Cologne / Germany',type:'real',lat:50.9375,lon:6.9603,altitude:53,status:'OPERATIONAL',color:'#39C5BB',timezone:'Europe/Berlin',weather:'Overcast',temperature:18,description:'Urban transit node on the Rhine. Synchronizes regional signals and connections.'},
  {id:'tokyo',name:'Akihabara Vocaloid Core',place:'Tokyo / Japan',type:'real',lat:35.6997,lon:139.7714,altitude:12,status:'OPERATIONAL',color:'#39C5BB',timezone:'Asia/Tokyo',weather:'Clear',temperature:22,description:'Vocaloid frequencies, neon and countless stories. The eastern core of the network.'},
  {id:'rift-alpha',name:'Simulation Alpha // Void Gate',place:'Bermuda sector / Simulation',type:'rift',lat:25,lon:-71,altitude:-420,status:'RIFT DETECTED',color:'#D83232',danger:5,dimension:'SIM // Void Sector',description:'An unstable passage folds space and memory together. Raw null signals point toward a simulated signal source. Approach only through an anchored lore link.'},
  {id:'neo',name:'Neo-Cyber City Rift',place:'Equatorial sector / Simulation',type:'rift',lat:0,lon:100,altitude:340,status:'RIFT DETECTED',color:'#9d4edd',danger:3,dimension:'SIM // Neo-Cyber City',description:'Beyond the shimmering fault lies a city of synthetic memories. Recurring Vocaloid signatures keep the passage in rhythm.'},
  {id:'vault',name:'Sub-Zero Neural Vault',place:'Antarctic sector / Simulation',type:'rift',lat:-75,lon:0,altitude:-180,status:'OFFLINE',color:'#9d4edd',danger:4,dimension:'SIM // Sub-Zero',description:'A frozen consciousness archive beneath the southern ice. The last handshake ended mid-message. No active uplink is currently available.'}
];
export function makeLoreNode(location) {
  if (location.type !== 'rift') throw new Error('Only dimensional rifts can be linked to the lore graph');
  return {id:`scanner-${location.id}`,name:location.name,type:'dimension',status:location.status==='OFFLINE'?'Missing':'Active',home:location.dimension,attributes:[`Danger level ${location.danger}/5`,formatCoordinate(location.lat),formatCoordinate(location.lon,false)],notes:`${location.description}\n\nScanner coordinates: ${location.lat}, ${location.lon}. Fictional dimensional rift; no real sensor data.`};
}
