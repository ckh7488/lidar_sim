#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {summary:frameSummary,writeFrame}=require('./frame-export.cjs');
const {createSimulator}=require('./runtime.cjs');
async function main(){
  const args=process.argv.slice(2), opts={};
  if(args.includes('--help')){console.log('node tools/simulate.cjs [--config examples/dust.json] [--scene construction_v1] [--kind dust|rain|snow|fog|sun|range|general] [--pose auto|legacy|0..39] [--sequence on|off] [--dust-placement auto|manual] [--seed 73031] [--time 3.25] [--out outputs/frame.json]\nOutput uses metres, world XYZ with Z up. Labels are review categories, NOT removal ground truth.');return;}
  for(let i=0;i<args.length;i+=2){if(!['--config','--scene','--kind','--seed','--time','--out','--pose','--sequence','--dust-placement'].includes(args[i])||args[i+1]===undefined)throw Error('Invalid arguments; use --help');opts[args[i].slice(2)]=args[i+1];}
  const config=opts.config?JSON.parse(fs.readFileSync(opts.config,'utf8')):{};
  for(const k of ['scene','kind','pose'])if(opts[k])config[k]=opts[k];
  for(const k of ['seed','time'])if(opts[k])config[k]=Number(opts[k]);
  if(opts.sequence!==undefined){if(!['on','off'].includes(opts.sequence))throw Error('sequence must be on or off');config.sequence=opts.sequence==='on';}
  if(opts['dust-placement'])config.dustPlacement=opts['dust-placement'];
  const frame=await createSimulator().run(config);
  const summary=frameSummary(frame);
  if(opts.out){
    const out=path.resolve(opts.out);fs.mkdirSync(path.dirname(out),{recursive:true});
    writeFrame(out,frame,summary);
    summary.output=out;
  }
  console.log(JSON.stringify(summary,null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
