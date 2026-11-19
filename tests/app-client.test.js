'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app/client.js','utf8');
function setup(fetch) {
  const data = new Map();
  const localStorage = {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  const ctx = {localStorage,fetch,URLSearchParams,crypto:{randomUUID:()=> 'test-uuid'},Date,JSON,Error};
  vm.createContext(ctx); vm.runInContext(source,ctx);
  return {api:ctx.RabelClient,data};
}
const res = (value, status=200) => ({ok:status>=200&&status<300,status,json:async()=>value,text:async()=>JSON.stringify(value)});
test('login stores a session, never the password, and writes use the user token', async () => {
  const calls=[]; const {api,data} = setup(async (url,options)=>{calls.push({url,options}); if(url.includes('grant_type=password')) return res({access_token:'user-jwt',refresh_token:'refresh',expires_in:3600}); if(url.includes('rabel_is_owner')) return res(true); return res([{id:1}]);});
  await api.login('secret'); assert.equal(api.hasSession(),true);
  assert.equal([...data.values()].some(v=>v.includes('secret')),false);
  await api.mutate('rabel_dishes','PATCH',{name:'Test'},{id:'eq.1'});
  const write=calls.find(c=>c.url.includes('rabel_dishes'));
  assert.equal(write.options.headers.Authorization,'Bearer user-jwt');
  assert.match(write.options.headers.apikey,/^sb_publishable_/);
});
test('non-owner sessions are rejected and deleted',async()=>{
  const {api,data}=setup(async url=>url.includes('grant_type=password')?res({access_token:'jwt',refresh_token:'refresh',expires_in:3600}):res(false));
  await assert.rejects(api.login('secret'),/non autorizzato/);
  assert.equal(api.hasSession(),false); assert.equal(data.size,0);
});
test('a no-op write is reported as an error',async()=>{
  const {api}=setup(async url=>url.includes('grant_type=password')?res({access_token:'jwt',refresh_token:'refresh',expires_in:3600}):url.includes('rabel_is_owner')?res(true):res([]));
  await api.login('secret'); await assert.rejects(api.mutate('rabel_dishes','PATCH',{name:'A'},{id:'eq.9'}),/Nessuna modifica/);
});
