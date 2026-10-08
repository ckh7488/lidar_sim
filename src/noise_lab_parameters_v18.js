/* Scenario parameters are reproducible; redraws do not resample the world. */
(function(root){'use strict';
function keyed(seed,scene,key){let h=(2166136261^(seed>>>0))>>>0;for(const ch of scene+'|'+key)h=Math.imul(h^ch.charCodeAt(0),16777619);let x=h>>>0;x+=0x6D2B79F5;let t=x;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;}
function apply(config,registry,scene,enabled){
 const out={...config},rows={},keys={rain:'rainRate',snow:'snowN',fog:'fogVisibility'},key=keys[config.weather];
 if(key){
  const mean=Number(config[key]),relative=enabled?registry.weather_relative_std:0,std=Math.abs(mean)*relative,width=Math.sqrt(3)*std;
  const value=mean+width*(2*keyed(config.seed,scene,key)-1);
  const limits=registry.parameters[key].limits,clamped=Math.max(limits[0],Math.min(limits[1],value));
  out[key]=clamped;
  rows[key]={mean,std,min:mean-width,max:mean+width,value:clamped,distribution:enabled?'uniform':'constant',clipped:clamped!==value};
 }
 out.parameterSampling={revision:18,enabled:!!enabled,scene,seed:config.seed,parameters:rows};
 return out;
}
root.NoiseLabParameters={keyed,apply};if(typeof module!=='undefined')module.exports=root.NoiseLabParameters;
})(typeof self!=='undefined'?self:globalThis);
