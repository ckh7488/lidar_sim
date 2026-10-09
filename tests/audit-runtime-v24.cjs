'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createSimulator,ROOT}=require('../tools/runtime.cjs'),{summary}=require('../tools/frame-export.cjs');
async function main(){
 const sim=createSimulator(),rows=[],errors=[];let runs=0;const only=process.argv[2]?.split(',');if(only)assert(only.every(id=>sim.index.scenes.some(s=>s.id===id)));
 const out=path.join(ROOT,'outputs','audit-runtime-v24-'+Date.now()+'.json');
 try{for(const scene of sim.index.scenes.filter(s=>!only||only.includes(s.id))){
  const modes=['range','dust','fog','sun','edge','weak'];if(/^(construction|crane_yard|apartment)_/.test(scene.id))modes.push('rain','snow');
  for(const mode of modes){
   const options={scene:scene.id,seed:73017,time:3,kind:['edge','weak'].includes(mode)?'general':mode,controls:['edge','weak'].includes(mode)?{'general-mode':mode}:{}};
   const started=performance.now();
   try{
    const f=await sim.run(options),m=summary(f),r=f.result;runs++;
    assert.equal(m.schema,6);assert.equal(m.sequencePlan.revision,24);assert(m.sceneLayout.instances.length>0);assert.equal(m.sensorPose.motion6dof,true);assert.equal(m.sensorPose.index,null);assert(m.sensorPose.world.every(Number.isFinite));assert(r.xyz.every(Number.isFinite));assert.equal(r.xyz.length,r.labels.length*3);assert.equal(r.rayIds.length,r.labels.length);assert.equal(r.reflectivityProxy.length,r.labels.length);
    assert.deepEqual(m.routePreview[30].world,m.sensorPose.world);assert(r.rayIds.every(i=>i<131072));
    const a=m.sensorPose.bodyRotation;for(let i=0;i<3;i++)for(let j=0;j<3;j++){let dot=0;for(let k=0;k<3;k++)dot+=a[3*k+i]*a[3*k+j];assert(Math.abs(dot-(i===j?1:0))<1e-12);}
    if(mode==='sun')assert(r.reflectivityProxy.every(Number.isNaN));else{assert(r.reflectivityProxy.every(Number.isFinite));assert(r.reflectivityProxy.some(v=>v>0));}
    assert(m.stats.rangeError.baselineSurface.std>.05&&m.stats.rangeError.baselineSurface.std<.07);assert.equal(m.field_calibrated,false);assert.equal(m.training_approved,false);
    if(mode==='range'){
     const first=await sim.run({...options,time:0}),last=await sim.run({...options,time:10}),replay=await sim.run(options);runs+=3;
     assert.notDeepEqual(first.sensorPose.world,last.sensorPose.world);assert.notEqual(first.sensorPose.pitchDeg,last.sensorPose.pitchDeg);assert.notEqual(first.sensorPose.rollDeg,last.sensorPose.rollDeg);assert.equal(summary(replay).xyz_labels_sha256,m.xyz_labels_sha256);assert.equal(first.geometrySummary.sceneLayout.key,last.geometrySummary.sceneLayout.key);
    }
    rows.push({scene:scene.id,mode,points:m.points,noise:m.stats.dust,uncertain:m.stats.uncertain,props:m.sceneLayout.instances.length,hash:m.xyz_labels_sha256,seconds:(performance.now()-started)/1000});console.log('PASS '+scene.id+' '+mode+' points='+m.points+' noise='+m.stats.dust);
   }catch(e){errors.push({scene:scene.id,mode,error:e.stack});console.log('FAIL '+scene.id+' '+mode+' '+e.message);}
   fs.writeFileSync(out,JSON.stringify({complete:false,runs,rows,errors},null,2));
  }
 }}finally{sim.close();}
 const report={complete:true,passed:!errors.length,runs,rows,errors,fullRaysPerFrame:131072,fieldCalibrated:false,trainingApproved:false};fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,runs,conditions:rows.length,errors:errors.length,report:out}));assert.equal(errors.length,0);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
