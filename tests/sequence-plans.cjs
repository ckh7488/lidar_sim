'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {ROOT,json,loadContext,loadRaw,loadBeam}=require('../tools/geometry-assets.cjs');
const Sequence=require('../src/noise_lab_sequence_v21.js'),Poses=require('../src/noise_lab_poses_v19.js');
const index=json('index'),catalog=json('sensor_positions_v19'),ctx=loadContext(),beam=loadBeam(),rows=[];
let paths=0,poses=0,maxSpeed=0,maxYawRate=0;
for(const row of index.geometry_knobs_v3.scenes){
 const engine=ctx.NoiseLabGeometry.engine(loadRaw(row.id),beam),positions=catalog.scenes[row.scene].positions;
 for(const terrainCm of [0,.5]){
  engine.prepare(terrainCm);
  for(let j=0;j<positions.length;j++){
   const start=Poses.choose(catalog,row.scene,73031,j);
   const options={scene:row.scene,seed:73031+start.index,sourceBounds:catalog.scenes[row.scene].sampling_bounds_xy},p=Sequence.plan(engine,start,options);
   assert.equal(JSON.stringify(p),JSON.stringify(Sequence.plan(engine,start,options)));
   assert.notDeepEqual(p.dustSource,Sequence.plan(engine,start,{...options,seed:options.seed+40}).dustSource);
   assert(Sequence.inside(engine,row.scene,p.dustSource.x,p.dustSource.y,.35));
   assert.equal(p.waypoints[0].time,0);assert.equal(p.waypoints.at(-1).time,10);assert(p.distanceM>0);
   let previous;
   for(let i=0;i<=100;i++){
    const pose=Sequence.at(p,i/10);assert(Sequence.inside(engine,row.scene,pose.x,pose.y));
    if(previous){maxSpeed=Math.max(maxSpeed,Math.hypot(pose.x-previous.x,pose.y-previous.y)*10);maxYawRate=Math.max(maxYawRate,Math.abs(pose.yawDeg-previous.yawDeg)*10);}
    previous=pose;poses++;
   }
   for(let i=1;i<p.waypoints.length;i++)assert(Sequence.clearSegment(engine,row.scene,p.waypoints[i-1],p.waypoints[i]));
   const atZero=Sequence.at(p,0);assert.equal(atZero.x,start.x);assert.equal(atZero.y,start.y);
   assert.equal(Sequence.at(p,10).x,p.waypoints.at(-1).x);paths++;
  }
 }
 rows.push({scene:row.scene,starts:positions.length,terrainCm:[0,.5]});console.log('PASS paths: '+row.scene);
}
assert(maxSpeed<1.5);assert(maxYawRate<=30.00001);
const report={passed:true,created:new Date().toISOString(),paths,framePoses:poses,maxSpeedMps:maxSpeed,maxYawRateDegS:maxYawRate,scenes:rows,sameSeedExact:true,newSeedChangesSource:true,sweptCollisionChecks:true,fieldCalibrated:false,trainingApproved:false};
fs.mkdirSync(path.join(ROOT,'outputs'),{recursive:true});fs.writeFileSync(path.join(ROOT,'outputs/validation-sequence-plans-v21.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
