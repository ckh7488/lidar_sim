const weatherDefaults={rain:{weatherConcentration:40,weatherDiameter:1,weatherReturn:.02,weatherAlpha:.002},snow:{weatherConcentration:8,weatherDiameter:3,weatherReturn:.5,weatherAlpha:.004},fog:{weatherAlpha:.02}};
let weatherAutoMoved=false;
function ensureWeatherScene(){
  const precipitation=category==='rain'||category==='snow';let changedMode=false;if((motionActive()||['sun','fog','general'].includes(category))&&$('scan-mode').value!=='live'){$('scan-mode').value='live';changedMode=true;}for(const option of $('scan-mode').options)option.disabled=(motionActive()||['sun','fog','general'].includes(category))&&option.value!=='live';
  for(const option of $('sim-scene').options)option.disabled=precipitation&&!/^(construction|crane_yard|apartment)_/.test(option.value);
  weatherAutoMoved=precipitation&&!outdoor();
  if(weatherAutoMoved){const variant=$('sim-scene').value.match(/_v([123])$/)?.[1]||'1';$('sim-scene').value='construction_v'+variant;}
  return weatherAutoMoved||changedMode;
}
function weatherPreset(){if(!weatherDefaults[category])return;for(const [k,v] of Object.entries(weatherDefaults[category]))$(k).value=v;}
function weatherControls(){
  motionControls();solarControls();
  const weather=!!weatherDefaults[category]||category==='dust',particles=category==='rain'||category==='snow',allowed=!particles||outdoor();
  for(const label of $('generator-controls').querySelectorAll('label'))if(!label.querySelector('#seed'))label.hidden=true;
  $('advance').hidden=true;
  $('generator-controls').querySelector('legend').textContent='시드 · 같은 값으로 결과 재현';
  $('weather-controls').hidden=!weather;$('weather-particles').hidden=!particles;for(const k of ['weatherConcentration','weatherDiameter'])$(k).parentElement.hidden=motionActive();$('weatherAlpha').parentElement.hidden=category==='dust';
  for(const k of ['weather-enabled','weatherConcentration','weatherDiameter','weatherReturn','weatherAlpha'])$(k).disabled=!weather||!allowed;
  for(const k of ['weatherConcentration','weatherDiameter','weatherReturn','weatherAlpha'])$(k+'-out').textContent=$(k).value;
  if(weather){$('generated-title').textContent=category==='fog'?'안개 · 반환 감쇠만':(category==='rain'?'비':'눈')+' · 독립 입자 반환 후보';
    $('mode-note').textContent=!$('weather-enabled').checked?'날씨 효과가 꺼져 있습니다. 아래의 ‘날씨 효과 켜기’를 선택하면 같은 장소에 반환 후보가 표시됩니다.':particles&&!allowed?'이 실내 장소에는 강수를 넣지 않습니다. 야외 장소를 선택해 주세요.':category==='fog'?'안개는 먼 반환 신호가 약해져 빠지는 과정만 계산합니다. 안개 자체의 반환점·펄스 파형은 미구현입니다.':(weatherAutoMoved?'비·눈을 볼 수 있도록 실내 대신 같은 번호의 야외 공사현장으로 전환했습니다. ':'비·눈은 야외 9개 예시에서 생성합니다. ')+'오른쪽 주황 점이 생성 반환입니다. 왼쪽 실측에는 점별 비·눈 라벨이 없어 전체 관측을 그대로 표시합니다. 미교정 근사이며 낙하 운동은 미구현입니다.';}
  if(category==='dust'){
    $('generated-title').textContent='먼지 합성 중단 · 장소 참고';
    $('mode-note').textContent='둥근 덩어리를 만드는 이전 먼지 후보는 사용자 피드백에 따라 비활성화했습니다. 왼쪽 실측은 계속 볼 수 있고 오른쪽은 장소만 표시합니다. 대체 먼지 생성기는 아직 없습니다.';
  }
  if(motionActive())motionControls();atmosphereControls();
}
function weatherSummary(){if(atmosphereActive())return;
  if(motionActive()){motionSummary();return;}
  Object.assign(right.host.dataset,{worldPoints:'0',particles:'0',temporalCoherence:'false',motionModel:'none'});
  Object.assign(right.host.dataset,{weather:result.stats.weather.mode,weatherEnabled:String(result.stats.weather.enabled),weatherAlpha:String(result.stats.weather.alpha),weatherIntersections:String(result.stats.weather.intersections),geometryRandom:String($('geometry-random').checked)});
  if(category==='dust'){
    $('sim-overlay').textContent='먼지 합성 중단 · 생성 먼지 0점';
    $('sim-info').textContent='이전 가우시안 덩어리 후보는 형태 검토에서 부적합하여 비활성화했습니다. '+fmt(result.stats.surface)+'개 장소 표면만 표시합니다. 실측 먼지의 좌표·라벨은 보존했습니다.';
    return;
  }
  if(!weatherDefaults[category])return;
  const s=result.stats,w=s.weather,name=category==='rain'?'비':category==='snow'?'눈':'안개';
  $('sim-overlay').textContent=w.enabled?(category==='fog'?'안개 감쇠 · 추가점 0':name+' 반환 '+fmt(s.dust)+'점')+' · 시드 '+result.config.seed:'날씨 효과 끔 · 형상과 거리 오차만 표시';
  $('sim-info').textContent='유지한 표면 '+fmt(s.surface)+'점 · 산란 신호로 대체 '+fmt(s.replaced)+'점 · 검출 누락 '+fmt(s.lost)+'점 · 배경 없는 빔의 산란 '+fmt(s.skyDust)+'점. '+(category==='fog'?'균일 감쇠만 계산합니다.':'입자–빔 교차 '+fmt(w.intersections)+'건 중 가장 강한 반환만 선택합니다.')+' 실측 교정·학습 승인은 하지 않았습니다.';
  Object.assign(right.host.dataset,{weather:category,weatherEnabled:String(w.enabled),weatherIntersections:String(w.intersections),weatherAlpha:String(w.alpha),geometryRandom:String($('geometry-random').checked)});
}
function retiredDustFeatures(){
  $('features').innerHTML='<div class="card"><h3>실측 먼지</h3><p>'+(realData?fmt(realData.n)+'개 관측점 · '+realData.meta.label_status:'실측 표본 불러오는 중')+'</p><p>제공자의 라벨과 원래 좌표를 보존합니다.</p></div><div class="card"><h3>이전 후보 중단</h3><p>매끈한 가우시안 농도 묶음과 빔별 최대 신호 선택이 둥글고 조밀한 덩어리를 만들었습니다. 계산이 정상이라는 검사로 형태 적합성을 판단한 것이 잘못이었습니다.</p></div><div class="card"><h3>현재 생성 먼지 0점</h3><p>대체 생성기는 미구현입니다. 이 후보를 실측 재현이나 학습 데이터로 사용하지 않습니다.</p></div>';
  $('feature-note').textContent='재현 실패를 다른 임의의 형태로 덮지 않습니다. 실측 검토는 유지하고 합성은 중단했습니다.';
}
function weatherFeatures(){
  if(motionActive()){motionFeatures();return;}
  const s=result?.stats,w=s?.weather,name=category==='rain'?'비':category==='snow'?'눈':'안개';
  $('features').innerHTML='<div class="card"><h3>실측에서 확인되는 범위</h3><p>'+(realData?fmt(realData.n)+'개 관측점 · '+realData.meta.label_status:'대응 실측 미확보')+'</p><p class="muted">같은 장면의 깨끗한 정답이 없어 생성점 비율을 실측에 맞췄다고 볼 수 없습니다.</p></div><div class="card"><h3>'+name+' 생성 원리</h3><p>'+(category==='fog'?'신호 × exp(−2αr). 약해진 표면 반환이 검출 문턱 아래면 관측에서 빠집니다.':'빔이 훑는 부피에 비례해 입자 교차를 추출하고, 입자가 빔을 덮는 면적과 거리로 반환 세기를 계산합니다.')+'</p><p>추가 '+fmt(s?.dust||0)+'점 / 빠진 표면 '+fmt((s?.lost||0)+(s?.replaced||0))+'점</p></div><div class="card"><h3>아직 재현하지 않는 것</h3><p>'+(category==='fog'?'안개 산란의 근거리 반환, 다중 산란, 수신 파형.':'입도 분포, 입자 간 가림, 낙하·바람의 연속 운동, 젖은 지면·적설, 지붕 아래의 국소 날씨.')+'</p><p class="warn">단순화한 검토 후보이며 실제 Ouster 날씨를 재현했다는 뜻이 아닙니다.</p></div>';
  $('feature-note').textContent='실제 표면 라벨은 유지합니다. 누락은 검출 실패이며 제거 정답 점을 새로 만드는 과정이 아닙니다. 입자 표본은 빔마다 독립이고 시간적으로 연결되지 않습니다.';
}
for(const k of ['weather-enabled','weatherConcentration','weatherDiameter','weatherReturn','weatherAlpha'])$(k).oninput=()=>{weatherControls();clearTimeout(timer);++job;right.host.dataset.ready='false';timer=setTimeout(generate,180)};
