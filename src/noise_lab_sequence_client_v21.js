let sequencePlaying=false,sequenceTimer=null;
function sequenceConfig(base){const plan=simData?.scanGeometry?.sequencePlan;return plan?NoiseLabSequence.apply(base,plan,{enabled:$('sequence-enabled').checked,dustPlacement:$('dust-auto').checked?'auto':'manual',dustEmissionS:+$('dust-emission-s').value}):{...base,dustEmissionS:+$('dust-emission-s').value};}
function sequencePause(){sequencePlaying=false;clearTimeout(sequenceTimer);$('sequence-play').textContent='10초 재생';}
function sequenceControls(){const enabled=$('sequence-enabled').checked;$('sequence-time').disabled=!enabled;for(const id of ['motion-play','motion-step','motion-time'])$(id).disabled=enabled;$('motionX').disabled=$('motionY').disabled=$('dust-auto').checked;$('sequence-time-out').textContent=(+$('sequence-time').value).toFixed(1);}
function sequenceAfterResult(){
 sequenceControls();const p=simData?.scanGeometry?.sequencePlan,c=latestConfig?.sequence,enabled=!!c?.enabled;
 Object.assign(right.host.dataset,{sequenceEnabled:String(enabled),sequenceId:c?.id||'',sequenceTime:String(latestConfig?.time),dustSource:JSON.stringify([latestConfig?.emitterX,latestConfig?.emitterY]),sequenceDistance:String(p?.distanceM??0)});
 $('sequence-note').textContent=enabled?'시작 '+(p.startPose.index==null?'연속 랜덤':(p.startPose.index+1)+'/40')+' · 이동 '+p.distanceM.toFixed(1)+'m · 0.1초씩 계산 후 표시':'센서 위치 고정';
 if($('dust-auto').checked&&c){$('motionX').value=c.dustSource[0].toFixed(3);$('motionY').value=c.dustSource[1].toFixed(3);}
 if(sequencePlaying&&enabled){if(+$('sequence-time').value>=10)sequencePause();else sequenceTimer=setTimeout(sequenceAdvance,50);}
}
function sequenceAdvance(){if(!$('sequence-enabled').checked)return sequencePause();$('sequence-time').value=Math.min(10,Math.round((+$('sequence-time').value+.1)*10)/10);sequenceControls();generate();}
$('sequence-play').onclick=()=>{if(sequencePlaying)return sequencePause();motionPause();$('sequence-enabled').checked=true;$('scan-mode').value='live';if(+$('sequence-time').value>=10)$('sequence-time').value=0;sequencePlaying=true;$('sequence-play').textContent='일시정지';if(simData?.scanProfile!=='live'){sequencePause();loadScene();return;}sequenceControls();generate();};
$('sequence-time').oninput=()=>{motionPause();sequenceControls();clearTimeout(timer);++job;right.host.dataset.ready='false';timer=setTimeout(generate,180);};
$('sequence-enabled').onchange=()=>{motionPause();sequenceControls();if($('sequence-enabled').checked&&$('scan-mode').value!=='live'){$('scan-mode').value='live';loadScene();}else generate();};
$('dust-auto').onchange=()=>{motionPause();sequenceControls();if($('dust-auto').checked&&$('scan-mode').value!=='live'){$('scan-mode').value='live';loadScene();}else generate();};
$('dust-random-location').onclick=()=>{motionPause();$('dust-auto').checked=true;$('scan-mode').value='live';$('seed').value=(+$('seed').value+1)>>>0;right.host.dataset.focused='';sequenceControls();if(simData?.scanProfile!=='live')loadScene();else generate();};
$('new-seed').onclick=()=>{motionPause();$('seed').value=(+$('seed').value+1)>>>0;right.host.dataset.focused='';generate();};
$('seed').addEventListener('input',()=>{motionPause();right.host.dataset.focused='';});
$('scan-mode').addEventListener('change',()=>{if($('scan-mode').value!=='live'){$('sequence-enabled').checked=false;$('dust-auto').checked=false;}sequenceControls();});
sequenceControls();
