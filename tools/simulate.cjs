#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createSimulator}=require('./runtime.cjs');
async function main(){
  const args=process.argv.slice(2), opts={};
  if(args.includes('--help')){console.log('node tools/simulate.cjs [--config examples/dust.json] [--scene construction_v1] [--kind dust|rain|snow|fog|sun|range|general] [--pose auto|legacy|0..39] [--seed 73031] [--time 3.25] [--out outputs/frame.json]\nOutput uses metres, world XYZ with Z up. Labels are review categories, NOT removal ground truth.');return;}
  for(let i=0;i<args.length;i+=2){if(!['--config','--scene','--kind','--seed','--time','--out','--pose'].includes(args[i])||args[i+1]===undefined)throw Error('Invalid arguments; use --help');opts[args[i].slice(2)]=args[i+1];}
  const config=opts.config?JSON.parse(fs.readFileSync(opts.config,'utf8')):{};
  for(const k of ['scene','kind','pose'])if(opts[k])config[k]=opts[k];
  for(const k of ['seed','time'])if(opts[k])config[k]=Number(opts[k]);
  const frame=await createSimulator().run(config),r=frame.result;
  const hash=crypto.createHash('sha256').update(Buffer.from(r.xyz.buffer,r.xyz.byteOffset,r.xyz.byteLength)).update(Buffer.from(r.labels)).digest('hex');
  const summary={schema:2,sensorPose:frame.sensorPose,scene:frame.scene,kind:frame.kind,seed:frame.seed,time:frame.time,points:r.labels.length,xyz_labels_sha256:hash,units:'m',coordinates:'world XYZ, Z up',field_calibrated:false,training_approved:false,geometry:frame.geometry,config:frame.config,stats:r.stats};
  if(opts.out){
    const out=path.resolve(opts.out);fs.mkdirSync(path.dirname(out),{recursive:true});
    const arrays={};for(const k of ['xyz','labels','rayIds','nominalRanges','rangeErrors','powers','world','worldV','worldIds'])if(ArrayBuffer.isView(r[k]))arrays[k]=Array.from(r[k]);
    // Exclusive creation avoids overwriting a user's earlier export.
    fs.writeFileSync(out,JSON.stringify({...summary,arrays}),{flag:'wx'});
    summary.output=out;
  }
  console.log(JSON.stringify(summary,null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
