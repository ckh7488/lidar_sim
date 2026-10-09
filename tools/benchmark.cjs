'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createSimulator}=require('./runtime.cjs'),{summary,writeFrame}=require('./frame-export.cjs');
async function main(){
 const args=process.argv.slice(2),opt={};for(let i=0;i<args.length;i+=2){if(!['--frames','--kinds','--out','--profile'].includes(args[i])||!args[i+1])throw Error('Use --frames 20 --kinds range,rain,snow,fog,dust,sun,general --out outputs/benchmark-new');opt[args[i].slice(2)]=args[i+1];}
 const count=Number(opt.frames??20);if(!Number.isInteger(count)||count<2||count>101)throw Error('frames must be 2..101');
 if(os.totalmem()>20*1024**3&&os.freemem()<16*1024**3)throw Error('Preserve 16 GiB free RAM');
 const out=path.resolve(opt.out||'outputs/benchmark-'+Date.now());fs.mkdirSync(out,{recursive:false});const sim=createSimulator(),rows=[];
 for(const kind of (opt.kinds||'range,rain,snow,fog,dust,sun,general').split(',')){
  const times=[],exportMs=[],bytes=[];
  for(let i=0;i<count;i++){
   const t=performance.now(),frame=await sim.run({kind:kind==='weak'?'general':kind,controls:kind==='weak'?{'general-mode':'weak'}:{},seed:11,time:10*i/(count-1),profile:opt.profile||'review'});times.push(performance.now()-t);
   const e=performance.now(),file=path.join(out,kind+'-'+String(i).padStart(3,'0')+'.lsf.gz');bytes.push(writeFrame(file,frame,summary(frame)).bytes);exportMs.push(performance.now()-e);
   console.log(JSON.stringify({kind,frame:i+1,count,seconds:times.at(-1)/1000,bytes:bytes.at(-1)}));
  }
  const mean=a=>a.reduce((s,v)=>s+v,0)/a.length,meanS=mean(times)/1000,exportS=mean(exportMs)/1000;
  rows.push({kind,frames:count,meanSimulationS:meanS,meanExportS:exportS,meanBytes:mean(bytes),projected101FramesS:101*(meanS+exportS),timesMs:times});
  fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify({complete:false,rows},null,2));
 }
 const report={complete:true,node:process.version,logicalCPUs:os.cpus().length,sequential:true,rows,fieldCalibrated:false};fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
