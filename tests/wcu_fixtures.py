"""Synthetic test records only. Actual archive content must never be placed here."""
import json
from ui_smoke import FIREBASE
DATABASE={
 'timelines':[{'id':'example-era','name':'Example era','era':'Example year','description':'Synthetic test timeline.'}],
 'projects':[
  {'id':'example-story','title':'Example Story','subtitle':'A synthetic test record','status':'Draft','timelineId':'example-era','connectedProjectIds':['second-story'],'characterIds':['example-character'],'infobox':{'lead':'Example Character'},'synopsis':'A synthetic overview.','sections':[{'title':'Example section','content':'A link to [[character:example-character]].'}]},
  {'id':'second-story','title':'Second Story','subtitle':'Another synthetic record','status':'Planned','timelineId':'example-era','connectedProjectIds':[],'characterIds':['example-character','second-character'],'infobox':{},'synopsis':'Another overview.','sections':[]}
 ],
 'characters':[
  {'id':'example-character','name':'Example Character','subtitle':'Synthetic character','aliases':['Example'], 'summary':'A test biography.','infobox':{},'sections':[{'title':'Background','content':'Appears in [[project:example-story]].'}],'relationships':[{'characterId':'second-character','type':'Test connection','description':'A synthetic connection.'}]},
  {'id':'second-character','name':'Second Character','subtitle':'Another synthetic character','summary':'Another test biography.','infobox':{},'sections':[],'relationships':[]}
 ]
}

def firebase_script(role='owner',seed=True):
    initial={'schemaVersion':1,'revision':1,'databaseJson':json.dumps(DATABASE),'updatedBy':'owner-uid','updatedAt':'test-time'} if seed else None
    return FIREBASE+'''(()=>{
 const role=localStorage.getItem('test-auth-signed-out')?'anonymous':ROLE,initial=INITIAL;
 firebase.auth().currentUser=role==='anonymous'?null:{uid:role==='owner'?'owner-uid':'visitor-uid',getIdToken:async()=> 'test-only'};
 const auth=firebase.auth(),subscribers=new Set();
 auth.onAuthStateChanged=fn=>{subscribers.add(fn);setTimeout(()=>fn(auth.currentUser),0);return()=>subscribers.delete(fn);};
 window.testAuthSignOut=()=>{localStorage.setItem('test-auth-signed-out','yes');auth.currentUser=null;for(const fn of subscribers)fn(null);};
 const listeners=new Set();window.testArchiveReads=0;
 if(initial&&!localStorage.getItem('test-wcu-doc'))localStorage.setItem('test-wcu-doc',JSON.stringify(initial));
 function snapshot(){const raw=localStorage.getItem('test-wcu-doc');return {exists:!!raw,data:()=>JSON.parse(raw)};}
 const doc=path=>({path,get:async()=>path==='site_config/access'?{exists:true,data:()=>({ownerUid:'owner-uid'})}:snapshot(),onSnapshot(fn){window.testArchiveReads++;listeners.add(fn);setTimeout(()=>fn(snapshot()),0);return()=>listeners.delete(fn);}});
 const factory=()=>({doc,async runTransaction(fn){if(window.testDenyWrite){const e=new Error('denied');e.code='permission-denied';throw e;}const tx={get:async()=>snapshot(),set(ref,data){localStorage.setItem('test-wcu-doc',JSON.stringify(data));for(const listener of listeners)listener(snapshot());}};return fn(tx);}});
 factory.FieldValue={serverTimestamp:()=> 'test-time'};firebase.firestore=factory;
})();'''.replace('ROLE',json.dumps(role)).replace('INITIAL',json.dumps(initial))
