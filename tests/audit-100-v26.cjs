'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os');
const {createSimulator,ROOT}=require('../tools/runtime.cjs'),{summary,writeFrame}=require('../tools/frame-export.cjs'),Binary=require('../tools/binary-frame.cjs');
const Assets=require('../tools/geometry-assets.cjs');
function plannedCases(index){
 let state=20261009;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;},cases=[];
 for(let round=0;round<4;round++)for(const [i,scene]of index.scenes.entries()){
  const outside=/^(construction|crane_yard|apartment)_/.test(scene.id),modes=outside?['rain','snow','sun','dust','fog','range','edge','weak']:['range','dust','fog','edge','weak'];
  const selection=outside?index.scenes.filter(s=>/^(construction|crane_yard|apartment)_/.test(s.id)).findIndex(s=>s.id===scene.id):i;
  const generator=modes[(selection+round*(outside?2:1))%modes.length],sensor=['os1-32-u','os1-32-g','os1-32-u','os1-32-g','os1-128'][(i+round)%5],seed=(random()*4294967296)>>>0,unit=(random()*4294967296)>>>0,controls={};
  if(generator==='dust')Object.assign(controls,{dustFlux:.08+.22*random(),motionWind:2*random(),motionAngle:-180+360*random()});
  if(generator==='rain')Object.assign(controls,{rainRate:1+Math.floor(9*random()),motionWind:3*random(),motionAngle:-180+360*random()});
  if(generator==='snow')Object.assign(controls,{snowN:1+4*random(),motionWind:3*random(),motionAngle:-180+360*random()});
  if(generator==='fog')Object.assign(controls,{fogVisibility:250+750*random(),fogVariation:.1+.5*random(),motionWind:3*random()});
  if(generator==='sun')Object.assign(controls,{sunAz:-180+360*random(),sunEl:5+55*random(),sunProbability:.005+.07*random()});
  if(['edge','weak'].includes(generator))controls['general-mode']=generator;
  cases.push({id:String(cases.length+1).padStart(3,'0'),generator,options:{scene:scene.id,kind:['edge','weak'].includes(generator)?'general':generator,seed,sensor,pose:'random',sequence:true,randomScene:true,beamUnit:{enabled:cases.length%13!==0,seed:unit,boundDeg:cases.length%7===0?.005:.01},weatherJitter:cases.length%2===0,controls,precipWorkers:2}});
 }
 for(const [scene,generator,seed,sensor,controls]of [['construction_v3','rain',0,'os1-32-u',{rainRate:20}],['apartment_v2','snow',4294967295,'os1-32-g',{snowN:10}],['crane_yard_v2','fog',0,'os1-32-g',{fogVisibility:50}],['room_v3','range',4294967295,'os1-32-u',{'range-enabled':false}]])cases.push({id:String(cases.length+1).padStart(3,'0'),generator,options:{scene,kind:generator,seed,sensor,pose:'random',sequence:true,randomScene:true,beamUnit:{enabled:true,seed,boundDeg:.01},controls,precipWorkers:2}});
 assert.equal(cases.length,100);return cases;
}
async function independentGeometry(){
 const c=Assets.loadContext();Object.assign(c,{Blob,Response,DecompressionStream,atob,NoiseLabPropAssets:Assets.json('asset_models_v18')});vm.runInContext(fs.readFileSync(path.join(ROOT,'src/noise_lab_scene_v24.js'),'utf8'),c);await c.NoiseLabScene.warm();return c;
}
function inspectRoute(frame,c,index){
 const m=summary(frame),T=c.THREE,base=Assets.loadRaw(index.geometry_knobs_v3.scenes.find(s=>s.scene===m.scene).id),raw=c.NoiseLabScene.compose(base,m.sceneLayout);
 const object=new T.BufferGeometry().setAttribute('position',new T.BufferAttribute(raw.vertices,3));object.setIndex(new T.BufferAttribute(raw.faces,1));const bvh=new c.MeshBVHLib.MeshBVH(object);
 const tv=raw.terrain.vertices.slice();for(let i=2;i<tv.length;i+=3)tv[i]*=m.geometry.terrainCm/100/raw.terrain.base_std_m;
 const ground=new T.BufferGeometry().setAttribute('position',new T.BufferAttribute(tv,3));ground.setIndex(new T.BufferAttribute(raw.terrain.faces,1));const groundBVH=new c.MeshBVHLib.MeshBVH(ground),ray=new T.Ray();
 let minimumClearance=Infinity;assert.equal(m.routePreview.length,101);assert(m.sceneLayout.instances.length>0);
 for(const p of m.routePreview){
  const v=new T.Vector3(...p.world),hit=bvh.closestPointToPoint(v,{},0,.30001);assert(!hit||hit.distance>=.29999,'Body collision at '+p.time);
  ray.origin.set(p.world[0],p.world[1],50);ray.direction.set(0,0,-1);const g=groundBVH.raycastFirst(ray,T.DoubleSide,0,100);assert(g,'Missing ground under route');const clearance=p.world[2]-g.point.z;assert(clearance>.29999,'Ground collision');minimumClearance=Math.min(minimumClearance,clearance);
  assert(Math.abs(p.pitchDeg)<=25.00001&&Math.abs(p.rollDeg)<=25.00001);
 }
 for(let i=1;i<m.sequencePlan.waypoints.length;i++){
  const a=m.sequencePlan.waypoints[i-1],b=m.sequencePlan.waypoints[i],box=new T.Box3(new T.Vector3(Math.min(a.x,b.x)-.3,Math.min(a.y,b.y)-.3,Math.min(a.worldZ,b.worldZ)-.3),new T.Vector3(Math.max(a.x,b.x)+.3,Math.max(a.y,b.y)+.3,Math.max(a.worldZ,b.worldZ)+.3));
  for(const tree of [bvh,groundBVH])assert(!tree.shapecast({intersectsBounds:b=>b.intersectsBox(box),intersectsTriangle:t=>box.intersectsTriangle(t)}),'Swept route collision');
 }
 const dimensions=[...['x','y','worldZ','yawDeg','pitchDeg','rollDeg'].map(k=>{const a=m.sequencePlan.waypoints.map(p=>p[k]);const span=Math.max(...a)-Math.min(...a);assert(span>.0001,'Inactive degree of freedom '+k);return [k,span];})];
 assert(m.sequencePlan.peakSpeedMps<3);object.dispose();ground.dispose();return {poses:101,minimumGroundClearanceM:minimumClearance,span:Object.fromEntries(dimensions),distanceM:m.sequencePlan.distanceM};
}
function inspectFrame(f,entry){
 const m=summary(f),r=f.result,n=r.labels.length,rays=m.config.sensorProfile.rows*m.config.sensorProfile.columns;
 assert.equal(r.xyz.length,n*3);assert(n>0&&n<=rays);assert(r.xyz.every(Number.isFinite));assert.equal(r.rayIds.length,n);assert.equal(new Set(r.rayIds).size,n);assert(r.rayIds.every(id=>id<rays));assert(r.labels.every(v=>v<=2));
 for(const k of ['reflectivityProxy','signalProxy','nominalRanges','rangeErrors','baselineRangeErrors','measuredRanges'])assert.equal(r[k].length,n,k);
 assert(r.measuredRanges.every(v=>Number.isFinite(v)&&v>0&&v<102));assert.equal(r.referenceScan.ranges.length,rays);
 if(entry.generator==='sun'){for(const k of ['reflectivityProxy','signalProxy','powers'])assert(r[k].every(Number.isNaN),k);}
 else for(const k of ['reflectivityProxy','signalProxy'])assert(r[k].every(v=>Number.isFinite(v)&&v>=0),k);
 assert(m.geometry.terrainCm>=0&&m.geometry.terrainCm<=.5);assert(Math.abs(m.geometry.pitchDeg)<=.6&&Math.abs(m.geometry.rollDeg)<=.6);assert(m.geometry.wobbleDeg>=0&&m.geometry.wobbleDeg<=.7);
 assert.equal(m.routePreview[m.time*10].world.join(','),m.sensorPose.world.join(','));
 if(entry.options.controls['range-enabled']===false)assert(r.baselineRangeErrors.every(v=>v===0));
 else if(m.stats.rangeError.baselineSurface.n>200)assert(m.stats.rangeError.baselineSurface.std>.045&&m.stats.rangeError.baselineSurface.std<.075);
 const unit=m.config.sensorProfile.unit;assert.equal(unit.seed,entry.options.beamUnit.seed);assert([...unit.altitudeDeg,...unit.azimuthDeg].every(v=>Math.abs(v)<=entry.options.beamUnit.boundDeg));
 const bins=[0,0,0,0,0],counts=[0,0,0];for(let i=0;i<n;i++){counts[r.labels[i]]++;if(r.labels[i]===1){const d=r.measuredRanges[i],j=d<5?0:d<20?1:d<50?2:d<80?3:4;bins[j]++;}}
 return {time:m.time,points:n,labels:counts,noiseRangeBins:bins,rangeStd:m.stats.rangeError.baselineSurface.std,hash:m.xyz_labels_sha256,sensorXYZ:m.sensorPose.world};
}
async function main(){
 const argument=process.argv.indexOf('--out'),out=argument<0?path.join(ROOT,'outputs','audit-100-v26-'+Date.now()):path.resolve(process.argv[argument+1]);fs.mkdirSync(path.dirname(out),{recursive:true});fs.mkdirSync(out,{recursive:false});
 const sim=createSimulator(),index=sim.index,ctx=await independentGeometry(),cases=plannedCases(index),report={revision:26,created:new Date().toISOString(),masterSeed:20261009,complete:false,passed:false,caseCount:100,framesPerCase:11,frameIntervalS:1,continuousRouteStepS:.1,fieldCalibrated:false,trainingApproved:false,cases:[],errors:[],visualReview:'pending'};
 fs.writeFileSync(path.join(out,'plan.json'),JSON.stringify(cases,null,2));console.log('AUDIT_OUTPUT '+out);
 const save=()=>fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(report,null,2));save();
 try{for(const entry of cases){
  if(os.freemem()<16*1024**3)throw Error('RAM reserve reached');
  const start=performance.now(),row={...entry,frames:[],passed:false};report.cases.push(row);fs.mkdirSync(path.join(out,entry.id));let previous,unit,layout,plan,midHash;
  try{
   for(let time=0;time<=10;time++){
    const f=await sim.run({...entry.options,time}),m=summary(f);if(time===0){row.route=inspectRoute(f,ctx,index);unit=f.config.sensorProfile.unit;layout=f.geometrySummary.sceneLayout;plan=f.sequencePlan;row.props=layout.instances.length;}
    else {assert.deepEqual(f.config.sensorProfile.unit,unit);assert.deepEqual(f.geometrySummary.sceneLayout,layout);assert.deepEqual(f.sequencePlan,plan);assert.notDeepEqual(f.sensorPose.world,previous);}
    previous=f.sensorPose.world;const stats=inspectFrame(f,entry),file=entry.id+'/'+String(time).padStart(2,'0')+'.lsf.gz';writeFrame(path.join(out,file),f,m);
    const decoded=Binary.read(path.join(out,file));assert.deepEqual(decoded.arrays.xyz,f.result.xyz);assert.deepEqual(decoded.arrays.labels,f.result.labels);if(time===5)midHash=m.xyz_labels_sha256;
    row.frames.push({...stats,file});save();
   }
   const again=await sim.run({...entry.options,time:5});assert.equal(summary(again).xyz_labels_sha256,midHash,'Replay changed');row.replayExact=true;row.passed=true;
  }catch(e){row.error=e.stack;report.errors.push({id:entry.id,scene:entry.options.scene,kind:entry.generator,error:e.stack});}
  row.seconds=(performance.now()-start)/1000;console.log((row.passed?'PASS ':'FAIL ')+entry.id+' '+entry.options.scene+' '+entry.generator+' '+entry.options.sensor+' '+row.frames.length+'f '+row.seconds.toFixed(1)+'s'+(row.error?' '+row.error.split('\n')[0]:''));save();global.gc?.();
 }}finally{sim.close();}
 report.complete=true;report.passed=report.errors.length===0;report.elapsedS=report.cases.reduce((a,r)=>a+r.seconds,0);report.frames=report.cases.reduce((a,r)=>a+r.frames.length,0);report.replays=report.cases.filter(r=>r.replayExact).length;save();console.log(JSON.stringify({passed:report.passed,frames:report.frames,replays:report.replays,output:out,errors:report.errors.length}));if(!report.passed)process.exitCode=1;
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={plannedCases};
