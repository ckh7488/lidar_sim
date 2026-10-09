'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createSimulator,ROOT}=require('../tools/runtime.cjs'),{summary,writeFrame}=require('../tools/frame-export.cjs'),Binary=require('../tools/binary-frame.cjs'),Profile=require('../tools/dataset-profile.cjs');
async function main(){
 const sim=createSimulator(),rows=[],base={scenario:'legacy-v23',scene:'construction_v1',seed:11,time:2,sequence:false,dustPlacement:'manual',pose:'legacy'};
 let clear;
 for(const [kind,controls] of [['range',{}],['sun',{'sun-enabled':false}],['fog',{'review-enabled':false}],['general',{'general-mode':'edge','review-enabled':false}],['general',{'general-mode':'weak'}]]){
  const f=await sim.run({...base,kind,controls}),r=f.result;
  if(kind==='fog')assert.equal(f.config.fogVariation,.25,'active UI/CLI must enable the advected density field');
  assert(Math.abs(r.stats.rangeError.baselineSurface.std-.06)<.002);
  assert(r.xyz.every(Number.isFinite));assert.equal(r.surfaceRanges.length,r.labels.length);
  for(let i=0;i<r.labels.length;i++){
   assert(Math.abs(r.measuredRanges[i]-r.nominalRanges[i]-r.rangeErrors[i])<1e-5);
   assert(Math.abs(r.surfaceRanges[i]-r.referenceScan.ranges[r.rayIds[i]])<.001);
  }
  if(!clear)clear=f;
  if(kind!=='general'||controls['general-mode']!=='weak'){
   assert.deepEqual(Array.from(r.rayIds),Array.from(clear.result.rayIds),'clear-air surface detection must match across modes');
   assert.deepEqual(Array.from(r.xyz),Array.from(clear.result.xyz),'same ray/time baseline stream must match');
  }
  if(controls['general-mode']==='weak')assert(r.mechanismRangeErrors.some(x=>Math.abs(x)>.001));
  rows.push({kind,controls,points:r.labels.length,std:r.stats.rangeError.baselineSurface.std});console.log('PASS baseline '+kind+' '+JSON.stringify(controls));
 }
 const edge=await sim.run({...base,kind:'general',controls:{'general-mode':'edge'}}),mixedRain=await sim.run({...base,kind:'rain',edgeMixing:true,controls:{'weather-enabled':false}});
 assert(edge.result.stats.uncertain>0);assert.equal(edge.result.stats.uncertain,mixedRain.result.stats.uncertain);
 assert.deepEqual(Array.from(edge.result.nominalRanges),Array.from(mixedRain.result.nominalRanges));
 let changed=0;for(let i=0;i<edge.result.labels.length;i++)if(edge.result.labels[i]===2){changed++;assert(Math.abs(edge.result.nominalRanges[i]-edge.result.surfaceRanges[i])>.049||Number.isNaN(edge.result.surfaceRanges[i]));}
 assert(changed>0);
 const folder=path.join(ROOT,'outputs','review-v22-'+Date.now());fs.mkdirSync(folder,{recursive:true});
 const file=path.join(folder,'frame.lsf.gz');writeFrame(file,edge);const loaded=Binary.read(file);
 for(const k of ['xyz','labels','rayIds','surfaceRanges','measuredRanges','baselineRangeErrors','mechanismRangeErrors','weatherParticleIds'])assert.deepEqual(loaded.arrays[k],edge.result[k]);
 assert.equal(loaded.metadata.schema,6);assert.throws(()=>writeFrame(file,edge),/EEXIST/);
 const sun=await sim.run({...base,kind:'sun'});assert(sun.result.signalProxy.every(Number.isNaN));assert(sun.result.stats.rangeError.baselineSurface.std>.058);
 const sunfile=path.join(folder,'sun.lsf');writeFrame(sunfile,sun);assert(Binary.read(sunfile).arrays.signalProxy.every(Number.isNaN));
 const samples={rainRate:[],snowN:[],fogVisibility:[]};for(let seed=0;seed<3000;seed++){
  const a=Profile.apply({profile:'coverage-v22',scene:'construction_v1',kind:'rain',seed,time:0}),b=Profile.apply({profile:'coverage-v22',scene:'construction_v1',kind:'rain',seed,time:10});assert.deepEqual(a.datasetProfile,b.datasetProfile);
  for(const key of Object.keys(samples))samples[key].push(a.controls[key]);
 }
 for(const [k,lo,hi] of [['rainRate',1,20],['snowN',1,10],['fogVisibility',50,2000]]){assert(Math.min(...samples[k])>=lo&&Math.max(...samples[k])<=hi);assert(Math.min(...samples[k])<lo+.1*(hi-lo));assert(Math.max(...samples[k])>hi-.1*(hi-lo));}
 assert.throws(()=>Profile.apply({profile:'coverage-v22',kind:'sun'}),/review-only/);
 const groups={};for(const scene of sim.index.scenes){const family=Profile.family(scene.id),split=Profile.split(scene.id);if(groups[family])assert.equal(groups[family],split);groups[family]=split;}
 const report={passed:true,rows,edgeLabels:changed,edgeRainDisabledExact:true,referenceMaxErrorM:0,binaryRoundtrip:true,binarySample:path.relative(ROOT,file),profileSamples:3000,familySplits:groups,fieldCalibrated:false,trainingApproved:false};
 fs.writeFileSync(path.join(ROOT,'outputs/review-v22-validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
