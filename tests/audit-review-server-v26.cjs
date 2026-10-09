'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{once}=require('node:events'),{serve}=require('../tools/audit-review-server.cjs');
async function main(){
 const folder=path.resolve(__dirname,'../outputs/audit-server-race-'+Date.now());fs.mkdirSync(folder,{recursive:true});
 const file=path.join(folder,'manifest.json');fs.writeFileSync(file,'{"complete":false}');
 const server=serve(folder,0);await once(server,'listening');
 try{
  const url='http://127.0.0.1:'+server.address().port;
  fs.writeFileSync(file,'{"complete":');
  const pending=fetch(url+'/audit/manifest.json');
  setTimeout(()=>fs.writeFileSync(file,'{"complete":true}'),25);
  assert.deepEqual(await (await pending).json(),{complete:true});
  assert.equal((await fetch(url+'/',{method:'POST'})).status,404);
  assert.equal((await fetch(url+'/audit/..%2F..%2FREADME.md')).status,404);
  console.log('PASS concurrent manifest read, read-only method, path containment');
 }finally{server.close();server.closeAllConnections();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
