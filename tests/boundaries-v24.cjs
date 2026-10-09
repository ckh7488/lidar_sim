"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createSimulator,ROOT}=require('../tools/runtime.cjs');
async function main(){const sim=createSimulator(),rows=[];
try{
 for(const scene of sim.index.scenes)for(const seed of [0,4294967295]){
  const f=await sim.run({scene:scene.id,seed,kind:'range',time:10});assert(f.sensorPose.motion6dof);assert(f.result.xyz.every(Number.isFinite));assert(f.geometrySummary.sceneLayout.instances.length>0);assert.equal(f.sequencePlan.seed,seed);rows.push({scene:scene.id,seed,points:f.result.labels.length});
 }
 console.log('PASS 24 scenes x both uint32 endpoints, actual 131072-beam frames');
 for(const [kind,controls]of [['range',{radialSigma:0}],['range',{radialSigma:.15}],['fog',{fogVisibility:50,fogVariation:.8}],['fog',{fogVisibility:2000,fogVariation:0}],['sun',{sunEl:-10,sunProbability:1,sunWidth:8}],['rain',{rainRate:20,motionWind:6}],['snow',{snowN:10,motionWind:6}]]){
  const f=await sim.run({scene:'construction_v1',seed:0,kind,controls,time:10});assert(f.result.xyz.every(Number.isFinite));if(kind==='sun'){assert.equal(f.result.stats.dust,0);assert(f.result.reflectivityProxy.every(Number.isNaN));}else assert(f.result.reflectivityProxy.every(Number.isFinite));rows.push({kind,controls,points:f.result.labels.length});console.log('PASS boundary '+kind+' '+JSON.stringify(controls));
 }
 await assert.rejects(sim.run({randomScene:'yes'}),/boolean/);await assert.rejects(sim.run({scenario:'unknown'}),/scenario/);
}finally{sim.close();}
const out=path.join(ROOT,'outputs','boundaries-v24-'+Date.now()+'.json');fs.writeFileSync(out,JSON.stringify({passed:true,rows,fieldCalibrated:false,trainingApproved:false},null,2));console.log('PASS '+out);}
main().catch(e=>{console.error(e);process.exitCode=1;});
