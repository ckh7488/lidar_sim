/* One baseline observation layer, after mechanism-specific return selection. */
(function(root){'use strict';
const rng=s=>{let a=s>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;}};
function seed(c){let h=(c.observationSeed??c.seed)>>>0;for(const ch of c.dustShapeKey||'')h=Math.imul(h^ch.charCodeAt(0),16777619);return h^Math.imul(Math.round((c.time||0)*1000)+1,0x85ebca6b);}
function prepare(input,cfg,castRay,F){
 if(!(cfg.edgeMixing||(cfg.reviewKind==='edge'&&cfg.reviewEnabled!==false)))return {input,edge:null};
 const edge=F.edge(input,{...cfg,reviewEnabled:true,radialSigma:0,radialSlope:0},castRay),ranges=new Float32Array(input.ranges.length),response=new Float32Array(ranges.length),labels=new Uint8Array(ranges.length);
 for(let j=0;j<edge.rayIds.length;j++){const id=edge.rayIds[j],r=edge.nominalRanges[j];ranges[id]=r;response[id]=edge.powers[j]*r*r;labels[id]=edge.labels[j];}
 return {input:{...input,ranges,response,edgeLabels:labels},edge:edge.stats.review};
}
function finish(result,original,prepared,cfg,edge){
 const fields={xyz:[],labels:[],rayIds:[],powers:[],nominalRanges:[],rangeErrors:[],surfaceRanges:[],measuredRanges:[],baselineRangeErrors:[],mechanismRangeErrors:[],weatherParticleIds:[],timeOffsets:[]},dust=[],removed=[];
 const rs=[[],[]],baseline=[[],[]],seen=new Set();let uncertain=0,replaced=0,sky=0,clipped=0,baselineMisses=0;
 const frameSeed=seed(cfg),origins=original.reportedOrigins||original.origins,directions=original.reportedDirections||original.directions;
 for(let j=0;j<result.rayIds.length;j++){
  const id=result.rayIds[j],nominal=result.nominalRanges[j],geometric=original.ranges[id];let lab=result.labels[j];
  if(lab===0&&prepared.edgeLabels?.[id])lab=2;
  // This common threshold never opens a physical surface to rays behind it.
  const target=prepared.ranges[id],response=prepared.response?.[id]??.35;
  if(lab!==1&&cfg.surfaceModel&&target>0&&response/(target*target)<(cfg.threshold??2e-6)){baselineMisses++;continue;}
  const random=rng(frameSeed^Math.imul(id+1,0x6c8e9cf5)),gaussian=Math.sqrt(-2*Math.log(Math.max(1e-12,random())))*Math.cos(2*Math.PI*random());
  const base=gaussian*Math.hypot(cfg.radialSigma||0,(cfg.radialSlope||0)*nominal),mechanism=result.rangeErrors[j]||0,measured=Math.max(.3,nominal+mechanism+base),error=measured-nominal;
  clipped+=nominal+mechanism+base<.3?1:0;seen.add(id);rs[lab===1?1:0].push(error);baseline[lab===1?1:0].push(base);
  fields.timeOffsets.push(original.timeOffsets?.[id]??0);
  fields.weatherParticleIds.push(result.weatherParticleIds?.[j]||0);fields.labels.push(lab);fields.rayIds.push(id);fields.powers.push(result.powers[j]);fields.nominalRanges.push(nominal);fields.rangeErrors.push(error);fields.surfaceRanges.push(geometric||NaN);fields.measuredRanges.push(measured);fields.baselineRangeErrors.push(base);fields.mechanismRangeErrors.push(mechanism);
  for(let a=0;a<3;a++){const p=(origins?origins[3*id+a]:original.sensor[a])+measured*directions[3*id+a];fields.xyz.push(p);if(lab===1)dust.push(p);}
  if(lab===2)uncertain++;if(lab===1){if(geometric>0)replaced++;else sky++;}
 }
 let clean=0,lost=0;for(let id=0;id<original.ranges.length;id++)if(original.ranges[id]>0){clean++;if(!seen.has(id))lost++;}
 for(let id=0;id<original.ranges.length;id++)if(original.ranges[id]>0&&!seen.has(id))for(let a=0;a<3;a++)removed.push((original.origins?.[3*id+a]??original.sensor[a])+original.ranges[id]*original.directions[3*id+a]);
 for(const [k,v] of Object.entries(fields))result[k]=k==='labels'?new Uint8Array(v):k==='rayIds'?new Uint32Array(v):['weatherParticleIds','timeOffsets'].includes(k)?new Float64Array(v):new Float32Array(v);
 const describe=v=>{const n=v.length,mean=n?v.reduce((a,b)=>a+b,0)/n:0,rms=n?Math.sqrt(v.reduce((a,b)=>a+b*b,0)/n):0;return {n,mean,rms,std:Math.sqrt(Math.max(0,rms*rms-mean*mean))};};
 result.dust=new Float32Array(dust);result.removed=new Float32Array(removed);result.config={...cfg};
 Object.assign(result.stats,{clean,lost,replaced,skyDust:sky,surface:rs[0].length,dust:rs[1].length,uncertain,noiseFraction:rs[1].length/Math.max(1,fields.labels.length),training:false,
  rangeError:{enabled:!!(cfg.radialSigma||cfg.radialSlope||cfg.reviewKind==='weak'),surface:describe(rs[0]),dust:describe(rs[1]),baselineSurface:describe(baseline[0]),baselineNoise:describe(baseline[1]),sigma0:cfg.radialSigma||0,slope:cfg.radialSlope||0,clipped,application:'common post-detection baseline plus separately recorded mechanism error'},
  observation:{revision:22,baselineMisses,edgeMixing:!!edge,edge,cleanRange:'surfaceRanges; NaN means no central-ray surface',rangeDefinition:'measuredRanges = nominalRanges + rangeErrors; rangeErrors includes minimum-range clipping',trainingApproved:false}});
 return result;
}
root.NoiseLabObservation={prepare,finish};if(typeof module!=='undefined')module.exports=root.NoiseLabObservation;
})(typeof self!=='undefined'?self:globalThis);
