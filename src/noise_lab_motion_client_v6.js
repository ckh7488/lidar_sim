let motionPlaying=false,motionPlayTimer=null,motionLines=null;
const motionIds=['motion-time','motionWind','motionAngle','motionEddy','rainRate','snowN','dustFlux','dustSize','motionX','motionY'];
function motionActive(){return ['rain','snow','dust'].includes(category);}
function motionConfig(){const c={motionEnabled:motionActive()};for(const id of motionIds)if(id!=='motion-time')c[id]=+$(id).value;return c;}
function motionPause(){sequencePause();motionPlaying=false;clearTimeout(motionPlayTimer);$('motion-play').textContent='연속 재생';}
function motionControls(){
  const active=motionActive();$('motion-controls').hidden=!active;$('dust-shape-note').hidden=category!=='dust';
  $('dust-random-location').hidden=category!=='dust';if(!active)return;
  for(const id of motionIds)if($(id+'-out'))$(id+'-out').textContent=$(id).value;
  for(const name of ['rain','snow','dust'])$('motion-'+name).hidden=category!==name;
  $('generated-title').textContent=($('motion-view').value==='world'?'공간 속 입자':'라이다 관측')+' · '+({rain:'비',snow:'눈',dust:'먼지'}[category]);
  $('mode-note').textContent=(!$('weather-enabled').checked?'날씨 효과가 꺼져 있습니다. ':'')+(weatherAutoMoved?'강수를 볼 수 있도록 야외 공사현장으로 전환했습니다. ':'')+'공간 속 입자와 센서에 찍힌 점은 다릅니다. 오른쪽 표시를 바꾸어 둘 다 확인하세요. 운동 화면의 주황 점은 제거 정답 라벨이 아닙니다. 실측과 생성은 다른 장소이며 센서 재현은 미검증입니다.';
  $('motion-note').textContent=category==='rain'?'비: 관측 범위 100m까지 1.5~6mm 입자의 빔 교차를 통계적으로 계산합니다. 더 작은 빗방울의 개별 반환은 생략하고 평균 감쇠로만 근사합니다. 종단속도는 현재 입도 분포의 대표값입니다. 운동 보기는 교차 입자의 0.5% 표본과 0.04초 이동선을 표시하며 관측 정답이 아닙니다.':category==='snow'?'눈: 관측 범위 100m까지 분산된 입자를 가정하며, 종단속도 0.8m/s와 지정 바람으로 이동합니다. 눈송이의 개별 흔들림은 미구현입니다. 크기·속도는 대표 가정이며 적설량 교정값이 아닙니다. 이동선은 0.25초 길이입니다.':'먼지: 시퀀스별로 뽑은 한 발생원에서 10초간 방출합니다. 발생원은 세계 좌표에 머물고 입자들이 이동합니다. 점 하나는 여러 미세 입자를 묶은 추적 표본이며, 라이다 반환점이 아닙니다. 중력·공기저항·바람·회오리·국소 상승류를 계산합니다. 굵은 먼지, 재비산과 장비 주변 유동은 미구현입니다.';
}
function clearMotionLines(){if(motionLines){right.scene.remove(motionLines);motionLines.geometry.dispose();motionLines.material.dispose();motionLines=null;}}
function renderSimulation(){
  if(!result||!simData?.scanInput)return;clearMotionLines();
  const world=motionActive()&&$('motion-view').value==='world'&&result.world;
  if(!world){cloud(right,result.xyz,result.labels);Object.assign(right.host.dataset,{backgroundSource:'detected-surface-shared',backgroundPoints:String(result.stats.surface),backgroundRangeRms:String(result.stats.rangeError.surface.rms)});return;}
  const xyz=[],labels=[];
  // Share measured surface coordinates; rebuilding raw rays silently removed the configured errors.
  for(let i=0;i<result.labels.length;i++)if(result.labels[i]!==1){const k=i*3;xyz.push(result.xyz[k],result.xyz[k+1],result.xyz[k+2]);labels.push(result.labels[i]);}
  const background=labels.length;
  for(let i=0;i<result.world.length;i++)xyz.push(result.world[i]);for(let i=0;i<result.worldIds.length;i++)labels.push(1);
  cloud(right,new Float32Array(xyz),new Uint8Array(labels));
  const points=right.clouds.find(o=>o.userData.type===1);if(points){points.material.size=category==='dust'?2:1.5;points.material.opacity=category==='dust'?.65:.8;points.material.transparent=true;}
  const lines=[],dt=category==='rain'?.04:.25,stride=category==='dust'?8:4;
  for(let i=0;i<result.worldIds.length;i+=stride){const k=i*3;lines.push(result.world[k],result.world[k+1],result.world[k+2],result.world[k]-result.worldV[k]*dt,result.world[k+1]-result.worldV[k+1]*dt,result.world[k+2]-result.worldV[k+2]*dt);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(lines,3));motionLines=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:category==='dust'?0xffbf73:0xa2d7ff,transparent:true,opacity:.5}));right.scene.add(motionLines);
  Object.assign(right.host.dataset,{view:'world',worldPoints:String(result.worldIds.length),backgroundPoints:String(background),backgroundSource:'detected-surface-shared',backgroundRangeRms:String(result.stats.rangeError.surface.rms)});draw();
}
function motionSummary(){
  const m=result.stats.motion,s=result.stats,world=$('motion-view').value==='world',name={rain:'비',snow:'눈',dust:'먼지'}[category];
  Object.assign(right.host.dataset,{view:world?'world':'lidar',weather:category,weatherEnabled:String(!!m),motionModel:category==='dust'?'v15':'v7',receiverMode:result.config.receiverMode,patternLegacy:String(result.config.patternLegacy),time:String(result.config.time),worldPoints:String(result.worldIds?.length||0),particles:String(m?.particles||0),temporalCoherence:String(!!m?.temporalCoherence),training:'false'});
  $('sim-overlay').textContent=!m?'날씨 효과 끔':name+' · '+result.config.time.toFixed(2)+'초 · '+(world?'운동 표본 '+fmt(m.displayed)+'개':'라이다 반환 '+fmt(s.dust)+'점');
  $('sim-info').textContent=world?'청록은 거리 오차·축 흔들림·검출 누락까지 반영한 라이다 표면이며, ‘라이다 관측점’ 보기의 표면 좌표와 같습니다. 주황은 공간 속 입자 운동 표본입니다. 입자에는 센서 거리 오차나 검출 문턱을 적용하지 않으며, 표시 크기와 이동선은 실제 크기가 아닙니다.':'관측 후보를 OS1 빔 배열과 미교정 수광기 가정으로 계산했습니다. 비·눈은 세계 좌표에 유지되는 입자와 빔의 교차를 계산합니다. 운동 보기는 교차 입자의 일부이며 검출 문턱 전 후보입니다. 유지한 표면 '+fmt(s.surface)+'점 · 산란 반환 '+fmt(s.dust)+'점 · 대체 '+fmt(s.replaced)+'점 · 누락 '+fmt(s.lost)+'점. 빔당 반환 하나를 선택합니다. 검출 방식에서 광자 수 변동과 이전 문턱을 비교할 수 있습니다. 수신 파형·다중 에코는 미구현입니다.';
  $('motion-stats').textContent=!m?'날씨 효과를 켜면 운동 계산을 시작합니다.':category==='dust'?'공중 계산 묶음 '+fmt(m.particles)+'개 / 화면 표본 '+fmt(m.displayed)+'개 · 지형·장비에 닿아 멈춘 묶음 '+fmt(m.deposited)+'개 · 공중 질량 '+(m.airborneMassKg*1000).toFixed(3)+'g · 센서 반환 '+fmt(s.dust)+'점':'빔 교차 후보 '+fmt(m.intersections)+'개 · 운동 예시 '+fmt(m.displayed)+'개 · 센서 반환 '+fmt(s.dust)+'점 · 계산 '+(m.simulationMs/1000).toFixed(2)+'초';
  if(category==='dust'&&m)Object.assign(right.host.dataset,{dustFlux:String(result.config.dustFlux),dustDisplayFraction:String(m.displayFraction),dustShapeSeed:String(m.shapeSeed),dustSourceProfile:JSON.stringify(m.sourceProfile)});
  if(m?.particles&&s.dust===0)$('motion-stats').textContent+=' · 입자는 있지만 현재 빔·가림·검출 문턱에서 반환이 없습니다. ‘공간 속 입자’로 운동을 확인할 수 있습니다.';
}
function motionFeatures(){
  const name={rain:'비',snow:'눈',dust:'먼지'}[category];
  $('features').innerHTML='<div class="card"><h3>실측 '+name+'</h3><p>'+(realData?fmt(realData.n)+'개 관측 · '+realData.meta.label_status:'실측 표본 불러오는 중')+'</p><p>좌표와 제공자 라벨은 보존합니다. 이 장면의 풍속·입도·농도를 역추정한 결과는 아닙니다.</p></div><div class="card"><h3>공간 운동과 관측 계산</h3><p>'+(category==='dust'?'국소 방출 → 공기 흐름에 따라 이동 → 중력 침강 → 표면 접촉 시 정지. 묶음의 질량을 격자에 배분해 광학 두께를 계산합니다.':'0.5~100m에서 빔 부피에 따른 입자 교차를 추출 → 표면 신호와 경쟁. 같은 입자의 세계 좌표·식별자를 시간에 걸쳐 유지하며, 광자 검출 변동은 매 프레임 새로 계산합니다.')+'</p></div><div class="card"><h3>아직 가정인 부분</h3><p>'+(category==='dust'?'발생원의 길이·폭·굴곡과 상승류를 장소·시드로 바꿉니다. 화면 표본 수는 발생량에 연동하지만 광선 계산은 모든 질량 묶음을 사용합니다. 실제 난류·장비 주위 유동을 푸는 CFD가 아니며 이 파라미터 분포와 반환 세기는 미교정 가정입니다.':'비의 작은 입자 반환, 눈 결정의 실제 형상·질량·자세, 젖은 표면·쌓인 눈은 생략합니다. 비·눈은 종류별 대표 종단속도를 사용하며 지붕 가림을 0.5m 격자로 근사합니다.')+'</p><p class="warn">현장 재현·학습 승인 없음</p></div>';
  $('feature-note').textContent='정지 화면 한 장으로 운동의 현실성을 판정하지 않습니다. 같은 시드에서 재생하고 공간 운동과 라이다 관측을 각각 검토해 주세요. 비·눈의 두 화면은 같은 개별 입자를 추적한 결과가 아닙니다. 전 스캔은 같은 순간으로 계산하며 회전 중 시간차는 아직 없습니다.';
}
function motionAfterResult(){if(motionActive()){motionControls();motionSummary();if(motionPlaying)motionPlayTimer=setTimeout(motionAdvance,100);}}
function motionAdvance(){if(!motionActive())return motionPause();const t=+$('motion-time').value;if(t>=10)return motionPause();$('motion-time').value=Math.min(10,t+.25);generate();}
$('motion-play').onclick=()=>{if(motionPlaying)motionPause();else{motionPlaying=true;$('motion-play').textContent='일시정지';if(+$('motion-time').value>=10)$('motion-time').value=0;if(right.host.dataset.ready==='true')motionAdvance();}};
$('motion-step').onclick=()=>{motionPause();motionAdvance();};
$('motion-view').onchange=()=>{motionControls();if(right.host.dataset.ready==='true'&&result&&simData?.scanInput){renderSimulation();motionSummary();}else if(right.host.dataset.ready!=='error')viewBusy('계산 완료 후 선택한 보기로 표시합니다.');};
for(const id of motionIds)$(id).oninput=()=>{motionPause();motionControls();clearTimeout(timer);++job;right.host.dataset.ready='false';timer=setTimeout(generate,220);};
