'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),B=require('../tools/binary-frame.cjs');
const hash=a=>crypto.createHash('sha256').update(JSON.stringify(a)).digest('hex');
function inspect(folder){
 const report=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'))),cases=report.cases.filter(c=>c.passed),groups={},starts=new Set(),layouts=new Set(),routes=new Set(),dustSources=new Set();
 const result={complete:report.complete,cases:cases.length,frames:0,points:0,hashChecks:0,pairedWeatherParticles:0,movingDustPairs:0,maxWeatherMotionErrorM:0,maxRangeDecompositionErrorM:0,minimumRouteGroundClearanceM:Infinity,props:{min:Infinity,max:0},peakSpeedMps:0,peakAngularSpeedDegps:{yaw:0,pitch:0,roll:0},generators:groups};
 for(const c of cases){
  const g=groups[c.generator]??={cases:0,frames:0,returns:0,mechanismErrorPoints:0,lostSurfaces:0,noise:0,uncertain:0,minNoise:Infinity,maxNoise:0,zeroNoiseFrames:0,allZeroCases:[],noiseRangeBins:[0,0,0,0,0],sunExpected:[],sourceDistancesM:[]};g.cases++;let sum=0,previous,source,dustProfile,dustSource;
  result.minimumRouteGroundClearanceM=Math.min(result.minimumRouteGroundClearanceM,c.route.minimumGroundClearanceM);result.props.min=Math.min(result.props.min,c.props);result.props.max=Math.max(result.props.max,c.props);
  for(const item of c.frames){
   const {metadata:m,arrays:a}=B.read(path.join(folder,item.file)),n=a.labels.length;result.frames++;result.points+=n;g.frames++;g.returns+=n;g.lostSurfaces+=m.stats.lost;g.noise+=item.labels[1];g.uncertain+=item.labels[2];sum+=item.labels[1];g.minNoise=Math.min(g.minNoise,item.labels[1]);g.maxNoise=Math.max(g.maxNoise,item.labels[1]);g.zeroNoiseFrames+=item.labels[1]===0;item.noiseRangeBins.forEach((v,k)=>g.noiseRangeBins[k]+=v);
   const h=crypto.createHash('sha256').update(Buffer.from(a.xyz.buffer)).update(Buffer.from(a.labels)).digest('hex');assert.equal(h,item.hash);assert.equal(h,m.xyz_labels_sha256);result.hashChecks++;
   assert.equal(m.time,item.time);assert.equal(m.scene,c.options.scene);assert.equal(m.seed,c.options.seed);
   if(item.time===0){
    const pts=m.sequencePlan.waypoints;for(let j=1;j<pts.length;j++){const x=pts[j-1],y=pts[j],dt=y.time-x.time,speed=1.875*Math.hypot(y.x-x.x,y.y-x.y,y.worldZ-x.worldZ)/dt;assert(dt>0&&speed<3);result.peakSpeedMps=Math.max(result.peakSpeedMps,speed);for(const axis of ['yaw','pitch','roll']){const rate=1.875*Math.abs(y[axis+'Deg']-x[axis+'Deg'])/dt;assert(rate<=(axis==='yaw'?90:40)+1e-8);result.peakAngularSpeedDegps[axis]=Math.max(result.peakAngularSpeedDegps[axis],rate);}}
    starts.add(hash(m.sensorPose.world));layouts.add(hash(m.sceneLayout.instances));routes.add(hash(m.routePreview));source=m.sequencePlan.dustSource;if(c.generator==='dust'){dustSources.add(hash(source));g.sourceDistancesM.push(Math.hypot(source.x-m.sensorPose.world[0],source.y-m.sensorPose.world[1],source.z-m.sensorPose.world[2]));}}
   else assert.deepEqual(m.sequencePlan.dustSource,source);
   if(c.generator==='sun')g.sunExpected.push(m.stats.review.expectedFalseReturns);
   for(let i=0;i<n;i++){
    const measured=a.measuredRanges[i],nominal=a.nominalRanges[i],baseline=a.baselineRangeErrors[i],mechanism=a.mechanismRangeErrors[i];
    g.mechanismErrorPoints+=mechanism!==0;const err=Math.abs(measured-Math.max(.3,nominal+baseline+mechanism));result.maxRangeDecompositionErrorM=Math.max(result.maxRangeDecompositionErrorM,err);assert(err<.00003,'Range decomposition '+c.id);
    assert(Math.abs(measured-nominal-a.rangeErrors[i])<.00002);assert(a.weatherParticleIds[i]===0||Number.isSafeInteger(a.weatherParticleIds[i]));
    const surface=a.surfaceRanges[i];if(Number.isFinite(surface))assert(Math.abs(surface-a['referenceScan.ranges'][a.rayIds[i]])<.00002);
    if(['dust','rain','snow','fog'].includes(c.generator)&&a.labels[i]===1&&Number.isFinite(surface))assert(nominal<=surface+.0001,'Optical scatter behind first surface '+c.id);
   }
   if(c.generator==='dust'){
    const motion=m.stats.motion;assert.equal(motion.parcelsBorn,motion.particles+motion.deposited+motion.escaped);assert(Math.abs(motion.airborneMassKg-motion.particles*motion.parcelMassKg)<1e-9);
    if(item.time===0){assert.equal(motion.parcelsBorn,0);assert.equal(item.labels[1],0);dustProfile=motion.sourceProfile;dustSource=motion.sourceWorld;}else{assert.deepEqual(motion.sourceProfile,dustProfile);assert.deepEqual(motion.sourceWorld,dustSource);}
    assert(a.world.every(Number.isFinite)&&a.worldV.every(Number.isFinite));assert.equal(new Set(a.worldIds).size,a.worldIds.length);const ids=new Map(Array.from(a.worldIds,(id,i)=>[id,i]));
    for(let j=0;j<a.worldIds.length;j++){const i=previous?.ids.get(a.worldIds[j]);if(i!==undefined&&Math.hypot(...[0,1,2].map(k=>a.world[3*j+k]-previous.a.world[3*i+k]))>1e-5)result.movingDustPairs++;}previous={ids,a};
   }
   if(['rain','snow'].includes(c.generator)&&a.worldIds){
    assert.equal(a.world.length,a.worldIds.length*3);assert.equal(a.worldV.length,a.world.length);assert(a.world.every(Number.isFinite));assert(a.worldV.every(Number.isFinite));
    const ids=new Map(Array.from(a.worldIds,(id,i)=>[id,i]));
    for(let j=0;j<a.worldIds.length;j++){assert(a.worldV[3*j+2]<0);const i=previous?.ids.get(a.worldIds[j]);if(i===undefined)continue;
     result.pairedWeatherParticles++;for(let k=0;k<3;k++){const e=Math.abs(a.world[3*j+k]-previous.a.world[3*i+k]-previous.a.worldV[3*i+k]);result.maxWeatherMotionErrorM=Math.max(result.maxWeatherMotionErrorM,e);assert(e<.0001,'Particle not following world velocity '+c.id);}
    }previous={ids,a};
   }
  }if(sum===0)g.allZeroCases.push(c.id);
 }
 result.uniqueStarts=starts.size;result.uniqueLayouts=layouts.size;result.uniqueRoutes=routes.size;result.uniqueDustSources=dustSources.size;
 for(const set of [starts,layouts,routes])assert.equal(set.size,cases.length,'Repeated scenario');assert.equal(dustSources.size,groups.dust?.cases||0);
 if(report.complete){assert.equal(cases.length,100);assert.equal(result.frames,1100);assert.equal(report.errors.length,0);}
 result.passed=true;fs.writeFileSync(path.join(folder,'saved-data-check.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));return result;
}
if(require.main===module)inspect(path.resolve(process.argv[2]));module.exports={inspect};
