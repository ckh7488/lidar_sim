'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createSimulator,ROOT}=require('../tools/runtime.cjs'),{summary}=require('../tools/frame-export.cjs');
async function main(){
 const sim=createSimulator(),base={scene:'construction_v1',kind:'dust',seed:73031},rows=[];
 async function run(options){const f=await sim.run({...base,...options});const s=summary(f);rows.push({kind:f.kind,time:f.time,pose:f.sensorPose,source:f.config.sequence?.dustSource,points:s.points,hash:s.xyz_labels_sha256,world:f.result.worldIds?.length});console.log('PASS frame: '+f.kind+' '+f.time+'s');return f;}
 const a=await run({time:3}),b=await run({time:3.1}),end=await run({time:10}),replay=await run({time:3});
 assert.equal(summary(a).xyz_labels_sha256,summary(replay).xyz_labels_sha256);
 assert.deepEqual(Array.from(a.result.world),Array.from(replay.result.world));
 assert.notDeepEqual(a.sensorPose.world,end.sensorPose.world);assert.notDeepEqual(a.sensorPose.world,b.sensorPose.world);
 for(const f of [b,end,replay])assert.equal(JSON.stringify(a.sequencePlan),JSON.stringify(f.sequencePlan));
 assert.equal(end.result.config.time,10);assert.equal(end.result.stats.motion.emissionDurationS,10);assert.equal(end.result.stats.motion.parcelsBorn,7500);
 const ids=new Map(Array.from(a.result.worldIds,(id,i)=>[id,i]));let common=0,moved=0,maxStep=0;
 for(let j=0;j<b.result.worldIds.length;j++){
  const i=ids.get(b.result.worldIds[j]);if(i===undefined)continue;common++;
  const d=Math.hypot(...[0,1,2].map(k=>b.result.world[3*j+k]-a.result.world[3*i+k]));
  if(d>.0001)moved++;maxStep=Math.max(maxStep,d);
 }
 assert(common>100);assert(moved/common>.9);assert(maxStep<.5);
 const changed=await run({time:3,seed:73071,kind:'range',pose:a.sequencePlan.startPose.index});
 assert.notDeepEqual(a.config.sequence.dustSource,changed.config.sequence.dustSource);
 // The weather field stays in world space when the sensor moves at a given instant.
 const rainA=await run({kind:'rain',time:3,geometry:{pitchDeg:0,rollDeg:0,wobbleDeg:0}});
 const rainB=await run({kind:'rain',time:3,geometry:{pitchDeg:0,rollDeg:0,wobbleDeg:0},sequence:false,dustPlacement:'manual',controls:{'motionX':a.config.emitterX,'motionY':a.config.emitterY}});
 // A static sensor's world field is anchored at its starting pose, matching this moving sequence's anchor.
 const rainIds=new Map(Array.from(rainA.result.worldIds,(id,i)=>[id,i]));let anchored=0;
 for(let j=0;j<rainB.result.worldIds.length;j++){const i=rainIds.get(rainB.result.worldIds[j]);if(i===undefined)continue;assert.deepEqual(Array.from(rainA.result.world.subarray(i*3,i*3+3)),Array.from(rainB.result.world.subarray(j*3,j*3+3)));anchored++;}
 assert(anchored>100);
 const fog=await run({kind:'fog',time:10}),weak=await run({kind:'general',time:10,controls:{'general-mode':'weak'}});
 assert.equal(fog.config.observationSeed,weak.config.observationSeed);assert.notEqual(fog.config.observationSeed,a.config.observationSeed);
 assert(fog.result.xyz.every(Number.isFinite));assert(weak.result.xyz.every(Number.isFinite));
 await assert.rejects(sim.run({time:10.1}),/time/);await assert.rejects(sim.run({sequence:'yes'}),/boolean/);await assert.rejects(sim.run({dustPlacement:'bad'}),/dustPlacement/);
 const report={passed:true,created:new Date().toISOString(),rows,dustCommonIds:common,dustMovingIds:moved,maxDustDisplacementInPoint1S:maxStep,worldWeatherAnchoredIds:anchored,replayIndependentOfRequestOrder:true,framesRecast:true,fieldCalibrated:false,trainingApproved:false};
 fs.writeFileSync(path.join(ROOT,'outputs/validation-sequence-frames-v21.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
