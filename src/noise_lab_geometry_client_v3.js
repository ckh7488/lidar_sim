const geometryIds=['terrainCm','pitchDeg','rollDeg','wobbleDeg','wobbleCycles','wobblePhase','opticalOffset','compensateWobble'];
const geometryURL=URL.createObjectURL(new Blob([$('three-runtime').textContent,$('geometry-worker').textContent],{type:'text/javascript'}));
const geometryWorker=new LatestTaskWorker(geometryURL,handleGeometry,e=>{geoPending='';viewFailure('형상 계산',e);});
let geoJob=0,geoPending='',lastKnobScene='',geometryTimer,randomGeometryKey='';
function geometryConfig(){const c={};for(const k of geometryIds)c[k]=$(k).type==='checkbox'?$(k).checked:+$(k).value;return c}
function geometryKey(){return JSON.stringify([$('sim-scene').value,geometryConfig()])}
function resetGeometryKnobs(id){const c=NoiseLabRandom.sample(+$('seed').value,id,D.parameter_distributions_v18.parameters);for(const k of geometryIds){if($(k).type==='checkbox')$(k).checked=c[k];else $(k).value=c[k]}randomGeometryKey=id+':'+$('seed').value;updateKnobLabels()}
function syncGeometryRandom(){if($('geometry-random').checked&&randomGeometryKey!==$('sim-scene').value+':'+$('seed').value)resetGeometryKnobs($('sim-scene').value)}
function updateKnobLabels(){for(const k of geometryIds)if($(k+'-out'))$(k+'-out').textContent=$(k).value;const a=+$('wobbleDeg').value;$('wobble-note').textContent='축 흔들림 '+a.toFixed(3)+'°: 20m에서 약 '+(20*Math.tan(a*Math.PI/180)*100).toFixed(2)+'cm의 옆방향 차이에 해당합니다. 사용자 지정 실험 범위이며 장비의 실제 진동값이 아닙니다.'}
function setGeometryEnabled(){const live=$('scan-mode').value==='live';for(const k of geometryIds)$(k).disabled=!live;for(const k of ['range-enabled','radialSigma','radialSlope'])$(k).disabled=!activeCategory();$('surface-response').disabled=!activeCategory()||$('scan-mode').value==='ideal';}
function liveGeometrySummary(){const g=simData.scanGeometry,c=g?.config||geometryConfig();$('scan-summary').textContent='OS1 128×1,024 빔 · 원점 반경 '+(c.opticalOffset?'16.721':'0')+'mm · 지면 σ '+c.terrainCm+'cm · 앞뒤 '+c.pitchDeg+'° / 좌우 '+c.rollDeg+'° · 축 진폭 '+c.wobbleDeg+'°'+(g.castMs?' · 전체 광선 계산 '+(g.castMs/1000).toFixed(2)+'초':'')+'. 지형·각도 오차는 가정이며 왼쪽 실측 센서의 교정값이 아닙니다.';}
function requestGeometry(){const key=geometryKey();if(geoPending===key)return;geoPending=key;const id=++geoJob;++job;right.host.dataset.ready='false';$('sim-overlay').textContent='새 지면·각도로 전체 광선 재계산 중…';geometryWorker.run({id,raw:simData.liveRaw,beam:simData.liveBeam,config:geometryConfig()})}
function handleGeometry(e){if(e.data.id!==geoJob||!simData||simData.scanProfile!=='live')return;const key=geoPending;geoPending='';if(key!==geometryKey()){generate();return;}if(e.data.error){viewFailure('형상 계산',e.data.error);return;}simData.scanInput=e.data.input;simData.geometryKey=key;simData.scanGeometry={profile:'live',...e.data.summary,geometry_asset_sha256:D.geometry_knobs_v3.scenes.find(s=>s.scene===simData.id).sha256,beam_profile_sha256:D.beam_profile_sha256};liveGeometrySummary();generate();};
for(const k of geometryIds)$(k).oninput=()=>{$('geometry-random').checked=false;updateKnobLabels();clearTimeout(geometryTimer);++job;right.host.dataset.ready='false';geometryTimer=setTimeout(generate,220)};
for(const k of ['range-enabled','radialSigma','radialSlope'])$(k).oninput=()=>{clearTimeout(timer);++job;right.host.dataset.ready='false';timer=setTimeout(generate,180)};
$('geometry-random').onchange=()=>{if($('geometry-random').checked)resetGeometryKnobs($('sim-scene').value);generate()};
$('geometry-reset').onclick=()=>{const p=D.confirmed_observation_defaults_v16;$('geometry-random').checked=p.geometry_random_enabled;$('range-enabled').checked=p.range_enabled;$('radialSigma').value=p.radial_sigma_m;$('radialSlope').value=1000*p.radial_slope_m_per_m;resetGeometryKnobs($('sim-scene').value);$('scan-mode').value=p.scan_profile;geoPending='';loadScene()};
$('geometry-flat').onclick=()=>{$('geometry-random').checked=false;for(const k of ['terrainCm','pitchDeg','rollDeg','wobbleDeg'])$(k).value=0;updateKnobLabels();$('scan-mode').value='live';geoPending='';loadScene()};
function observationSummary(){
  if(!simData||!result)return;const c=simData.scanGeometry?.config;
  const geometry=c?'지면 σ '+c.terrainCm+'cm · 앞뒤 '+c.pitchDeg+'° · 좌우 '+c.rollDeg+'° · 축 진폭 '+c.wobbleDeg+'°':'이전 측정 형상';
  const q=result.stats.rangeError;
  $('observation-active').textContent='현재 적용: '+geometry+' · 거리 오차 '+(q.enabled?'표면 RMS '+(q.surface.rms*1000).toFixed(1)+'mm':'끔')+' · '+($('geometry-random').checked?'확정 범위에서 시드별 추출':'직접 조절 중');
  $('observation-active').dataset.profile=D.confirmed_observation_defaults_v16.revision;
}
updateKnobLabels();
