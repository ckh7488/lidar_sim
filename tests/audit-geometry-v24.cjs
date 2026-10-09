'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {ROOT,json,loadContext,loadRaw,loadBeam}=require('../tools/geometry-assets.cjs');
const Poses=require('../src/noise_lab_poses_v19.js');
async function main(){
 const caseIndex=process.argv.indexOf('--cases'),cases=caseIndex>=0?JSON.parse(fs.readFileSync(process.argv[caseIndex+1],'utf8')):null,randomGrid=process.argv.includes('--random-grid')||!!cases,seeds=cases?[...new Set(cases.map(c=>c.seed))]:randomGrid?[0,4294967295,...Array.from({length:38},(_,i)=>(Math.imul(i+1,2654435761)>>>0))]:[11,73017];
 const ctx=loadContext();Object.assign(ctx,{Blob,Response,DecompressionStream,atob,NoiseLabPropAssets:json('asset_models_v18')});
 for(const name of ['sequence_v21','scene_v24','freepose_v24'])vm.runInContext(fs.readFileSync(path.join(ROOT,'src/noise_lab_'+name+'.js'),'utf8'),ctx);
 await ctx.NoiseLabScene.warm();const T=ctx.THREE,beam=loadBeam(),index=json('index'),catalog=json('sensor_positions_v19'),rows=[],errors=[];let paths=0,poses=0,propCount=0;
 for(const row of index.geometry_knobs_v3.scenes){
  const base=loadRaw(row.id),anchors=catalog.scenes[row.scene].positions,bounds=catalog.scenes[row.scene].sampling_bounds_xy;
  for(const seed of seeds){
   if(cases&&!cases.some(c=>c.scene===row.scene&&c.seed===seed))continue;
   const terrainCm=randomGrid?(seed%2?.5:0):.5;
   try{
    const baseEngine=ctx.NoiseLabGeometry.engine(base,beam);baseEngine.prepare(terrainCm);
    const layout=ctx.NoiseLabScene.create(baseEngine,base,row.scene,seed,bounds,anchors);assert(layout.instances.length>0,'No varied objects');
    if(!randomGrid)assert.equal(JSON.stringify(layout),JSON.stringify(ctx.NoiseLabScene.create(baseEngine,base,row.scene,seed,bounds,anchors)),'Layout reproducibility');
    if(!randomGrid)assert.notEqual(layout.key,ctx.NoiseLabScene.create(baseEngine,base,row.scene,seed+1,bounds,anchors).key,'Seed must alter actual objects');
    const raw=ctx.NoiseLabScene.compose(base,layout),engine=ctx.NoiseLabGeometry.engine(raw,beam);engine.prepare(terrainCm);propCount+=layout.instances.length;assert(raw.vertices.length>base.vertices.length);// Hollow assets need a surface-directed probe; their bounding-box center can be empty.
    let physicalHits=0;for(const p of layout.instances){const mesh=ctx.NoiseLabScene.transformed(p),f=mesh.faces,v=mesh.vertices;for(let k=0;k<f.length;k+=3*Math.max(1,Math.floor(f.length/150))){const tri=new T.Triangle(...[f[k],f[k+1],f[k+2]].map(i=>new T.Vector3().fromArray(v,3*i))),normal=tri.getNormal(new T.Vector3()),center=tri.getMidpoint(new T.Vector3());if(center.z<p.z+.04||normal.lengthSq()<.5)continue;const o=center.clone().addScaledVector(normal,.6).toArray(),d=normal.clone().negate().toArray(),a=baseEngine.castRay(o,d),b=engine.castRay(o,d);if(b&&(!a||Math.abs(a.range-b.range)>.05)){physicalHits++;break;}}if(physicalHits)break;}assert(physicalHits>0,'Random prop surfaces must change actual ray intersections');
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(raw.vertices.slice(),3));geo.setIndex(new T.BufferAttribute(raw.faces.slice(),1));const independentBVH=new ctx.MeshBVHLib.MeshBVH(geo),q=new T.Vector3();
    for(let k=randomGrid?40:0;k<41;k++){
     const randomStart=k===40,anchor=randomGrid?Poses.choose(catalog,row.scene,seed,'auto'):{...anchors[k%40],id:row.scene+':'+k,index:k%40},opts={scene:row.scene,seed:randomGrid?seed:seed+k,sourceBounds:bounds,anchors,randomStart};
     const plan=ctx.NoiseLabFreePose.plan(engine,anchor,opts);assert(plan.distanceM>0);assert(plan.peakSpeedMps<3);assert.equal(plan.waypoints.at(-1).time,10);
     const spans={x:[],y:[],worldZ:[],yawDeg:[],pitchDeg:[],rollDeg:[]};
     for(let n=0;n<=100;n++){
      const p=ctx.NoiseLabFreePose.at(plan,n/10);q.set(p.x,p.y,p.worldZ);const near=independentBVH.closestPointToPoint(q,{},0,.300001);assert(!near||near.distance>=.29999,'Sensor bounding sphere touches object');assert(p.worldZ-engine.terrainHeight(p.x,p.y)>.3);for(const key of Object.keys(spans))spans[key].push(p[key]);poses++;
     }
     for(const [key,a]of Object.entries(spans))assert(Math.max(...a)-Math.min(...a)>.0001,'Inactive DoF '+key);
     for(let j=1;j<plan.waypoints.length;j++){
      const a=plan.waypoints[j-1],b=plan.waypoints[j],box=new T.Box3(new T.Vector3(Math.min(a.x,b.x)-.3,Math.min(a.y,b.y)-.3,Math.min(a.worldZ,b.worldZ)-.3),new T.Vector3(Math.max(a.x,b.x)+.3,Math.max(a.y,b.y)+.3,Math.max(a.worldZ,b.worldZ)+.3));
      assert(!independentBVH.shapecast({intersectsBounds:b=>b.intersectsBox(box),intersectsTriangle:t=>box.intersectsTriangle(t)}),'Swept body intersects a triangle');
     }
     paths++;
    }
    rows.push({scene:row.scene,seed,props:layout.instances.length,paths:randomGrid?1:41,terrainCm});if(!randomGrid||seed===seeds.at(-1))console.log('PASS geometry '+row.scene+' '+seed+' props='+layout.instances.length);
   }catch(e){errors.push({scene:row.scene,seed,error:e.stack});console.log('FAIL '+row.scene+' '+seed+' '+e.message);}
  }
 }
 const report={randomGrid,seeds,passed:errors.length===0,paths,poses,propCount,rows,errors,fieldCalibrated:false,trainingApproved:false};const out=path.join(ROOT,'outputs','audit-geometry-v24-'+(randomGrid?'random-':'catalog-')+Date.now()+'.json');fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,paths,poses,report:out,errors:errors.length}));assert.equal(errors.length,0);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
