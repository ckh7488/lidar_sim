'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {ROOT,createSimulator}=require('../tools/runtime.cjs');
async function main(){
 const folder=path.join(ROOT,'outputs','channel-export-'+Date.now());fs.mkdirSync(folder,{recursive:true});const rows=[];
 for(const kind of ['range','sun']){
  const file=path.join(folder,kind+'.json'),p=spawnSync(process.execPath,['tools/simulate.cjs','--kind',kind,'--out',file],{cwd:ROOT,encoding:'utf8'});
  assert.equal(p.status,0,p.stderr);const d=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.equal(d.schema,6);assert.equal(d.arrays.reflectivityProxy.length,d.points);assert.equal(d.arrays.signalProxy.length,d.points);
  assert.equal(d.referenceScan.surfaceReflectance.length,131072);assert.equal(d.referenceScan.ranges.length,131072);
  if(kind==='sun')for(const key of ['powers','signalProxy','reflectivityProxy'])assert(d.arrays[key].every(x=>x===null));
  else assert(d.arrays.reflectivityProxy.every(x=>Number.isFinite(x)&&x>=0));
  rows.push({kind,points:d.points,channels:d.channels.reflectivityProxy.available,referenceRays:d.referenceScan.ranges.length});
 }
 const fog=await createSimulator().run({kind:'fog',controls:{'review-enabled':false}});
 assert.equal(fog.result.stats.dust,0);assert(fog.result.signalProxy.some(x=>x>0));assert(fog.result.reflectivityProxy.every(Number.isFinite));
 const report={passed:true,created:new Date().toISOString(),json_exports:rows,fog_disabled_has_surface_signal:true,files:path.relative(ROOT,folder)};
 fs.writeFileSync(path.join(ROOT,'outputs/channel-export-validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e);process.exitCode=1});
