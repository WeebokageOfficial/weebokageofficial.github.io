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
  {id:'home',name:'Home Node // Sector West',place:'Burscheid / Rheinland',type:'real',lat:51.08,lon:7.12,altitude:152,status:'OPERATIONAL',color:'#39C5BB',timezone:'Europe/Berlin',weather:'Leicht bewölkt',temperature:17,description:'Persönlicher Uplink im Rheinland. Ursprungssignal des LifeOS-Netzwerks.'},
  {id:'cologne',name:'Cologne Cyber Hub',place:'Köln / Deutschland',type:'real',lat:50.9375,lon:6.9603,altitude:53,status:'OPERATIONAL',color:'#39C5BB',timezone:'Europe/Berlin',weather:'Bedeckt',temperature:18,description:'Urbaner Transit-Knoten am Rhein. Synchronisiert regionale Signalströme und Verbindungen.'},
  {id:'tokyo',name:'Akihabara Vocaloid Core',place:'Tokio / Japan',type:'real',lat:35.6997,lon:139.7714,altitude:12,status:'OPERATIONAL',color:'#39C5BB',timezone:'Asia/Tokyo',weather:'Klar',temperature:22,description:'Vocaloid-Frequenzen, Neon und unzählige Geschichten. Der östliche Core des Netzwerks.'},
  {id:'rohan',name:'Rohan Singularity // Void Gate',place:'Bermuda-Sektor / WCU',type:'rift',lat:25,lon:-71,altitude:-420,status:'RIFT DETECTED',color:'#D83232',danger:5,dimension:'WCU // Void Sector',description:'Ein instabiler Durchgang faltet Raum und Erinnerung übereinander. Rohe Nullsignale weisen auf die Rohan-Singularität hin. Annäherung nur über einen verankerten Lore-Link.'},
  {id:'neo',name:'Neo-Cyber City Rift',place:'Äquatorialer Sektor / WCU',type:'rift',lat:0,lon:100,altitude:340,status:'RIFT DETECTED',color:'#9d4edd',danger:3,dimension:'WCU // Neo-Cyber City',description:'Hinter der schimmernden Bruchlinie liegt eine Stadt aus synthetischen Erinnerungen. Wiederkehrende Vocaloid-Signaturen halten den Übergang im Takt.'},
  {id:'vault',name:'Sub-Zero Neural Vault',place:'Antarktischer Sektor / WCU',type:'rift',lat:-75,lon:0,altitude:-180,status:'OFFLINE',color:'#9d4edd',danger:4,dimension:'WCU // Sub-Zero',description:'Ein eingefrorenes Bewusstseinsarchiv unter dem südlichen Eis. Der letzte Handshake endete mitten in einer Nachricht. Derzeit ist kein aktiver Uplink verfügbar.'}
];
export function makeLoreNode(location) {
  if (location.type !== 'rift') throw new Error('Only dimensional rifts can be linked to the lore graph');
  return {id:`scanner-${location.id}`,name:location.name,type:'dimension',status:location.status==='OFFLINE'?'Verschollen':'Aktiv',home:location.dimension,attributes:[`Gefahrenstufe ${location.danger}/5`,formatCoordinate(location.lat),formatCoordinate(location.lon,false)],notes:`${location.description}\n\nScanner-Koordinaten: ${location.lat}, ${location.lon}. Fiktiver Dimensions-Rift; keine realen Sensordaten.`};
}
