'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('app/client.js','utf8');
function setup(fetch,key='a'.repeat(64)) { const ctx={RABEL_APP_KEY:key,fetch,URLSearchParams,crypto:{randomUUID:()=> 'test-uuid'},JSON,Error}; vm.createContext(ctx); vm.runInContext(source,ctx); return ctx.RabelClient; }
const res=(data,status=200)=>({ok:status>=200&&status<300,status,text:async()=>JSON.stringify(data)});
test('passwordless client uses only the scoped proxy and its embedded capability',async()=>{
  const calls=[];const api=setup(async(url,options)=>{calls.push({url,options});return res([{id:1}]);});
  await api.mutate('rabel_dishes','PATCH',{name:'Test'},{id:'eq.1'});
  assert.match(calls[0].url,/\/functions\/v1\/rabel-app\/rest\/v1\/rabel_dishes/);
  assert.equal(calls[0].options.headers['x-rabel-app-key'],'a'.repeat(64));
  assert.equal(calls[0].options.headers.Authorization,undefined);
});
test('missing capability and unsuccessful writes are reported',async()=>{
  await assert.rejects(setup(async()=>res([]),'').table('rabel_dishes'),/chiave tecnica/);
  await assert.rejects(setup(async()=>res([])).mutate('rabel_dishes','PATCH',{name:'A'},{id:'eq.9'}),/Nessuna modifica/);
});
