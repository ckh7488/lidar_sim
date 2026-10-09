#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {createSimulator}=require('./runtime.cjs'),{summary,writeFrame}=require('./frame-export.cjs');
async function main(){
 const args=process.argv.slice(2),opts={};
 if(args.includes('--help')){console.log('node tools/sequence.cjs --out outputs/sequence-001 [--config examples/dust.json] [--scene construction_v1] [--kind dust] [--seed 73031] [--pose auto|legacy|0..39] [--profile review|coverage-v22] [--sensor-metadata path.json] [--fps 10] [--format lsf.gz|lsf|json.gz|json]\n10 seconds, endpoint-inclusive: 10 Hz = 101 frames. A fresh output directory is required. Sequential generation; no training.');return;}
 for(let i=0;i<args.length;i+=2){if(!['--config','--scene','--kind','--seed','--pose','--fps','--format','--out','--profile','--sensor-metadata'].includes(args[i])||args[i+1]===undefined)throw Error('Invalid arguments; use --help');opts[args[i].slice(2)]=args[i+1];}
 if(!opts.out)throw Error('--out is required');
 const fps=Number(opts.fps??10),format=opts.format??'lsf.gz';
 if(!Number.isInteger(fps)||fps<1||fps>20)throw Error('fps must be an integer in [1,20]');
 if(!['lsf','lsf.gz','json','json.gz'].includes(format))throw Error('format must be lsf, lsf.gz, json or json.gz');
 const config=opts.config?JSON.parse(fs.readFileSync(opts.config,'utf8')):{};
 for(const k of ['scene','kind','pose','profile'])if(opts[k])config[k]=opts[k];
 if(opts.seed!==undefined)config.seed=Number(opts.seed);
 if(opts['sensor-metadata'])config.sensorMetadata=opts['sensor-metadata'];
 config.sequence=true;config.dustEmissionS=10;
 const out=path.resolve(opts.out),sim=createSimulator(),count=10*fps+1,started=performance.now(),frames=[];
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.mkdirSync(out); // Never reuse another sequence's directory.
 let sequencePlan,datasetProfile=null;
 for(let i=0;i<count;i++){
  const frame=await sim.run({...config,time:i/fps}),meta=summary(frame),file=String(i).padStart(4,'0')+'.'+format;
  if(!sequencePlan){sequencePlan=frame.sequencePlan;datasetProfile=frame.config.datasetProfile||null;}
  if(JSON.stringify(sequencePlan)!==JSON.stringify(frame.sequencePlan))throw Error('Sequence plan changed between frames');
  const saved=writeFrame(path.join(out,file),frame,meta);
  frames.push({index:i,time:frame.time,file,bytes:saved.bytes,points:meta.points,xyz_labels_sha256:meta.xyz_labels_sha256,sensorPose:frame.sensorPose,dustSource:frame.config.sequence.dustSource});
  console.log(JSON.stringify({frame:i+1,total:count,time:frame.time,points:meta.points,file}));
 }
 const manifest={schema:1,complete:true,scene:sequencePlan.scene,seed:sequencePlan.seed,kind:config.kind||'dust',durationS:10,fps,endpointInclusive:true,frameCount:count,format,elapsedS:(performance.now()-started)/1000,
  sequencePlan,datasetProfile,frames,scanTiming:sequencePlan.scanTiming,field_calibrated:false,training_approved:false,splitPolicy:'Keep a sequence together; split scenes/source families before assigning train/test.'};
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
 console.log('COMPLETE '+path.join(out,'manifest.json'));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
