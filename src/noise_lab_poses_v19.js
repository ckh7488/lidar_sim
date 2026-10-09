/* Viewpoint choice is separate from weather. Consecutive 40 seeds visit every pose. */
(function(root){'use strict';
function choose(catalog,scene,seed,choice='auto'){
 if(choice==='legacy')return {id:'legacy',legacy:true,x:0,y:0,height:1.65,yawDeg:0};
 const row=catalog.scenes[scene];if(!row||row.positions.length<40)throw Error('Missing 40 validated sensor positions for '+scene);
 let offset=2166136261;for(const ch of scene)offset=Math.imul(offset^ch.charCodeAt(0),16777619);
 const index=choice==='auto'?((seed>>>0)+(offset>>>0))%row.positions.length:Number(choice);
 if(!Number.isInteger(index)||index<0||index>=row.positions.length)throw Error('Invalid sensor position index');
 return {...row.positions[index],index,id:scene+':'+index,catalogSeed:catalog.seed};
}
root.NoiseLabPoses={choose};if(typeof module!=='undefined')module.exports=root.NoiseLabPoses;
})(typeof self!=='undefined'?self:globalThis);
