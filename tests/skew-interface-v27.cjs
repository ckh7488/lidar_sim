'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const {createReviewServer}=require('../tools/review-server.cjs'),{ROOT,createSimulator}=require('../tools/runtime.cjs'),Binary=require('../tools/binary-frame.cjs');
async function main(){
 const out=path.join(ROOT,'outputs','skew-interface-v27-'+Date.now());fs.mkdirSync(out,{recursive:true});const app=createReviewServer({port:0,outputRoot:out}),addr=await app.listen(),base='http://127.0.0.1:'+addr.port,rows=[];
 const body={scene:'room_v1',generator:'range',seed:73017,sensor:'os1-32-u',mode:'frame',time:3,fps:1};
 const post=async b=>fetch(base+'/api/jobs',{method:'POST',headers:{'X-Lidar-Review':'1','Content-Type':'application/json'},body:JSON.stringify(b)});
 async function run(b){const res=await post(b);assert.equal(res.status,202,await(res.status!==202?res.text():Promise.resolve('')));const initial=await res.json();for(let k=0;k<1200;k++){const j=await(await fetch(base+'/api/jobs/'+initial.id)).json();if(j.status!=='running'){assert.equal(j.status,'complete',j.error);rows.push({id:j.id,frames:j.frames.length,request:j.request});return j;}await new Promise(r=>setTimeout(r,50));}throw Error('API timeout');}
 try{
  for(const motionSkew of [null,true,{enabled:'on'},{scanHz:15},{scanHz:20,extra:1}])assert.equal((await post({...body,motionSkew})).status,400);
  const off=await run(body),on=await run({...body,motionSkew:{enabled:true,scanHz:20}}),again=await run({...body,motionSkew:{enabled:false,scanHz:20}});
  assert.equal(off.request.motionSkew.enabled,false);assert.notEqual(off.frames[0].hash,on.frames[0].hash);assert.equal(off.frames[0].hash,again.frames[0].hash);
  const context={window:{},fetch,Response,Blob,DecompressionStream,TextDecoder,atob,crypto:crypto.webcrypto,Uint8Array,Uint32Array,Float32Array,Float64Array,DataView,Map,setTimeout};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(ROOT,'src/review_demo_viewer.js'),'utf8'),context);
  const display=await context.window.ReviewDisplay.readFrame(base+on.frames[0].url),saved=Binary.read(path.join(out,on.id,'0000.lsf.gz'));assert.deepEqual(display.arrays.xyz,saved.arrays.xyz);assert.deepEqual(display.arrays.timeOffsets,saved.arrays.timeOffsets);assert.equal(display.metadata.scanTiming.scanHz,20);
  const seq=await run({...body,mode:'sequence',motionSkew:{enabled:true,scanHz:10}});assert.equal(seq.frames.length,11);assert.deepEqual(seq.frames.map(f=>f.time),Array.from({length:11},(_,i)=>i));let plan;
  for(let i=0;i<11;i++){const f=Binary.read(path.join(out,seq.id,String(i).padStart(4,'0')+'.lsf.gz'));assert.equal(f.metadata.scanTiming.referenceTimeS,i);assert.equal(f.metadata.scanTiming.scanDurationS,.1);if(plan)assert.deepEqual(plan,f.metadata.sequencePlan);plan=f.metadata.sequencePlan;}
  const manifest=await(await fetch(base+seq.manifestUrl)).json();assert.deepEqual(manifest.request.motionSkew,{enabled:true,scanHz:10});
  const pending=await(await post({...body,generator:'dust',mode:'sequence',motionSkew:{enabled:true}})).json();const cancel=await fetch(base+'/api/jobs/'+pending.id+'/cancel',{method:'POST',headers:{'X-Lidar-Review':'1'}});assert.equal((await cancel.json()).status,'cancelled');
 }finally{app.server.close();app.server.closeAllConnections();}
 const cli=(tool,args)=>{const p=spawnSync(process.execPath,[tool,...args],{cwd:ROOT,encoding:'utf8',timeout:120000,maxBuffer:1000000});assert.equal(p.status,0,p.stderr);return p.stdout;};
 const file=path.join(out,'cli.lsf.gz'),text=cli('tools/simulate.cjs',['--sensor','os1-32-u','--kind','range','--motion-skew','on','--scan-hz','20','--out',file]),meta=JSON.parse(text);assert.equal(meta.scanTiming.scanHz,20);assert.equal(meta.scanTiming.enabled,true);assert(Binary.read(file).arrays.timeOffsets.some(v=>v!==0));
 const folder=path.join(out,'cli-sequence');cli('tools/sequence.cjs',['--sensor','os1-32-u','--kind','range','--motion-skew','on','--scan-hz','20','--fps','1','--out',folder]);const m=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'),'utf8'));assert.equal(m.frameCount,11);assert.equal(m.fps,1);assert.equal(m.scanTiming.scanHz,20);assert.equal(m.scanTiming.enabled,true);
 const defaults=JSON.parse(cli('tools/simulate.cjs',['--sensor','os1-32-u','--kind','range','--scan-hz','20']));assert.equal(defaults.scanTiming.enabled,false);
 const p=spawnSync(process.execPath,['tools/simulate.cjs','--motion-skew','maybe'],{cwd:ROOT,encoding:'utf8',timeout:10000});assert.notEqual(p.status,0);
 const sim=createSimulator(),staticModes=[];
 try{for(const generator of ['range','dust','rain','snow','fog','sun','edge','weak']){
  const opts={sensor:'os1-32-u',scene:'construction_v1',kind:['edge','weak'].includes(generator)?'general':generator,controls:{'general-mode':generator},sequence:false,time:3,seed:73017,precipWorkers:1};
  const off=await sim.run(opts),on=await sim.run({...opts,motionSkew:{enabled:true}});assert.deepEqual(off.result.xyz,on.result.xyz);assert.deepEqual(off.result.labels,on.result.labels);assert.deepEqual(off.result.measuredRanges,on.result.measuredRanges);staticModes.push(generator);console.log('PASS static '+generator);
 }}finally{sim.close();}
 const report={passed:true,staticModes,apiRows:rows,browserDecoderExact:true,apiSequenceFrames:11,cliSequenceFrames:11,cancelled:true,malformedRejected:true,output:out};fs.writeFileSync(path.join(out,'validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
