// Run the same built worker programs and configuration functions as the browser.
'use strict';
const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const ROOT=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const json=p=>JSON.parse(read(p));
const Parameters=require('../src/noise_lab_parameters_v18.js');
const Random=require('../src/noise_lab_random_v4.js');
const Poses=require('../src/noise_lab_poses_v19.js');
const Sequence=require('../src/noise_lab_sequence_v21.js');
function createSimulator(){
  if(!fs.existsSync(path.join(ROOT,'dist/index.html')))throw Error('Run python tools/build.py first');
  const html=read('dist/index.html'), index=json('dist/assets/noise_lab_v1/index.json');
  function script(id){const match=html.match(new RegExp('<script id="'+id+'"[^>]*>([\\s\\S]*?)</script>'));if(!match)throw Error('Missing script '+id);return match[1];}
  function worker(id){
    const ctx={console:{log(){},warn(){},error:console.error},Math,Number,Object,Array,JSON,Date,Map,Set,performance,setTimeout,clearTimeout,Float32Array,Float64Array,Uint8Array,Uint32Array,Int32Array,ArrayBuffer,Blob,Response,DecompressionStream,atob};
    ctx.self=ctx;vm.createContext(ctx);vm.runInContext(script('three-runtime')+'\n'+script(id),ctx,{filename:id});
    return async data=>{let value;ctx.postMessage=message=>{value=message};await ctx.onmessage({data});if(!value)throw Error(id+' produced no response');if(value.error)throw Error(value.error);return value;};
  }
  const cast=worker('geometry-worker'), simulate=worker('lab-worker');
  const functions={
    'noise_lab_client_v1.js':['activeCategory','outdoor','cfg'],
    'noise_lab_motion_client_v6.js':['motionActive','motionConfig'],
    'noise_lab_solar_client_v7.js':['solarConfig'],
    'noise_lab_atmosphere_client_v8.js':['atmosphereConfig'],
    'noise_lab_fullrange_client_v10.js':['fullRangeConfig'],
    'noise_lab_sequence_client_v21.js':['sequenceConfig']
  };
  let configSource='';
  for(const [file,names] of Object.entries(functions)){
    const source=read('src/'+file);
    for(const name of names){const line=source.split(/\r?\n/).find(line=>line.startsWith('function '+name+'('));if(!line||!line.endsWith('}'))throw Error('Update runtime extraction for '+name);configSource+=line+'\n';}
  }
  // These declarations are shared verbatim with the browser. Fail if a refactor changes them.
  for(const [file,prefix] of [['noise_lab_motion_client_v6.js','const motionIds='],['noise_lab_atmosphere_client_v8.js','const atmosphereIds='],['noise_lab_weather_client_v4.js','const weatherDefaults=']]){
    const line=read('src/'+file).split(/\r?\n/).find(line=>line.startsWith(prefix));if(!line)throw Error('Missing '+prefix);configSource+=line+'\n';
  }
  let id=0;
  async function run(options={}){
    const scene=options.scene||'construction_v1',kind=options.kind||'dust';
    if(!index.scenes.some(s=>s.id===scene))throw Error('Unknown DEMO scene: '+scene);
    if(!['dust','rain','snow','fog','sun','range','general'].includes(kind))throw Error('Unsupported kind: '+kind);
    if(['rain','snow'].includes(kind)&&! /^(construction|crane_yard|apartment)_/.test(scene))throw Error('Rain/snow require an outdoor DEMO scene');
    const seed=options.seed??73031,time=options.time??3.25;
    if(!Number.isInteger(seed)||seed<0||seed>4294967295)throw Error('seed must be a uint32');
    if(!Number.isFinite(time)||time<0||time>10)throw Error('time must be in [0, 10] seconds');
    if(options.sequence!==undefined&&typeof options.sequence!=='boolean')throw Error('sequence must be boolean');
    if(options.dustPlacement!==undefined&&!['auto','manual'].includes(options.dustPlacement))throw Error('dustPlacement must be auto or manual');
    if(options.dustEmissionS!==undefined&&![8,10].includes(options.dustEmissionS))throw Error('dustEmissionS must be 8 (legacy) or 10');
    const controls=json('dist/ui-controls.json');
    controls['sim-scene']={value:scene};controls.seed.value=seed;
    controls.time.value=controls['motion-time'].value=time;
    controls.fogBackscatter.checked=true; // initAvailability() in the browser.
    controls['weather-jitter'].checked=options.weatherJitter===true;
    const ctx={category:kind,simData:{id:scene},D:index,NoiseLabParameters:Parameters,NoiseLabSequence:Sequence,$:key=>{if(!controls[key])throw Error('Missing control '+key);return controls[key];}};
    vm.createContext(ctx);vm.runInContext(configSource+'\nif(weatherDefaults[category])for(const [k,v] of Object.entries(weatherDefaults[category]))$(k).value=v;',ctx);
    for(const [key,value] of Object.entries(options.controls||{})){
      if(!controls[key])throw Error('Unknown control '+key);
      controls[key][controls[key].type==='checkbox'?'checked':'value']=value;
    }
    // Scene/seed/time are explicit API arguments, not overridable through generic controls.
    controls['sim-scene'].value=scene;controls.seed.value=seed;controls.time.value=controls['motion-time'].value=controls['sequence-time'].value=time;
    controls['sequence-enabled'].checked=options.sequence!==false;controls['dust-auto'].checked=options.dustPlacement!=='manual';controls['dust-emission-s'].value=options.dustEmissionS??10;
    const geometry={...Random.sample(seed,scene,index.parameter_distributions_v18.parameters),...(options.geometry||{}),sensorPose:Poses.choose(index.sensor_positions_v19,scene,seed,options.pose??'auto')};
    delete geometry.sequence;
    if(controls['sequence-enabled'].checked||controls['dust-auto'].checked)geometry.sequence={scene,seed,time,enabled:controls['sequence-enabled'].checked,sourceBounds:index.sensor_positions_v19.scenes[scene].sampling_bounds_xy};
    const raw=json('data/noise_lab_v1/'+index.geometry_knobs_v3.scenes.find(s=>s.scene===scene).id+'.json'),beam=json('data/noise_lab_v1/beam_profiles_v2.json');
    const geometryResult=await cast({id:++id,raw,beam,config:geometry});
    ctx.simData.scanGeometry=geometryResult.summary;
    vm.runInContext('this.resultConfig=cfg()',ctx);
    const config=ctx.resultConfig;
    const result=(await simulate({id:++id,input:geometryResult.input,config,raw,beam,terrainCm:geometry.terrainCm})).result;
    return {scene,kind,seed,time,config,geometry:geometryResult.summary.config,sequencePlan:geometryResult.summary.sequencePlan||null,sensorPose:geometryResult.summary.sensorPose,geometrySummary:geometryResult.summary,result};
  }
  return {run,index}; // Calls must be awaited sequentially; workers keep a geometry cache.
}
module.exports={createSimulator,ROOT};
