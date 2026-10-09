'use strict';
const {keyed}=require('../src/noise_lab_parameters_v18.js');
const registry=require('../configs/coverage_profile_v22.json'),splits=registry.familySplits,distributions=registry.parameters,families=Object.values(splits).flat();
function family(scene){const f=scene.replace(/_v\d+$/,'');if(!families.includes(f))throw Error('Unknown scene family '+f);return f;}
function split(scene){const f=family(scene);return Object.keys(splits).find(s=>splits[s].includes(f));}
function apply(options){
 if(!options.profile||options.profile==='review')return options;
 if(options.profile!=='coverage-v22')throw Error('Unknown profile '+options.profile);
 if(options.kind==='sun')throw Error('Solar is review-only until measured false-return frequency is calibrated');
 const scene=options.scene||'construction_v1',seed=options.seed??73031,u=k=>keyed(seed,scene,k),controls={...options.controls};
 const values={};for(const [key,d] of Object.entries(distributions)){const q=u(registry.seedKeys[key]||key);values[key]=d.distribution==='constant'?d.mean:d.distribution==='uniform'?d.min+(d.max-d.min)*q:Math.exp(Math.log(d.min)+q*Math.log(d.max/d.min));}
 for(const [k,v] of Object.entries(values))controls[k]=v;
 controls['edge-mixing']=options.edgeMixing!==false;controls['weather-jitter']=false;
 return {...options,weatherJitter:false,temporalWeather:true,controls,datasetProfile:{name:'coverage-v22',scope:'scene+seed; distributions across sequences, settings constant within each 10-second sequence',values,distributions,family:family(scene),split:split(scene),trainingApproved:false,fieldCalibrated:false}};
}
module.exports={apply,family,split,splits};
