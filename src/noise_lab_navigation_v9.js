function usesBeforeView(){return ['range','fog','general','sun'].includes(category);}
function beforeView(){
 if(!usesBeforeView()){$('real-title').textContent='실측 표본 · 원본 라벨';return;}
 $('real-title').textContent='효과 적용 전 · 같은 합성 장소';
 $('real-sample').replaceChildren(new Option('같은 장소 · 효과 전후 비교',''));$('real-sample').disabled=true;
 realData=null;const input=simData?.scanInput;
 if(!input?.directions){cloud(left,new Float32Array(),new Uint8Array());$('real-overlay').textContent='같은 장소 계산 중…';return;}
 const xyz=[],o=input.reportedOrigins||input.origins,d=input.reportedDirections||input.directions;
 for(let i=0;i<input.ranges.length;i++){const r=input.ranges[i];if(!(r>0&&r<100))continue;const k=i*3;for(let a=0;a<3;a++)xyz.push((o?o[k+a]:input.sensor[a])+r*d[k+a]);}
 const n=xyz.length/3;cloud(left,new Float32Array(xyz),new Uint8Array(n));
 $('real-overlay').textContent='효과 전 표면 '+fmt(n)+'점 · 실측 아님';
 $('real-info').textContent='오른쪽과 같은 지면·기울기·축 흔들림 설정의 합성 장소입니다. 선택한 신호 효과와 추가 거리 오차를 적용하기 전입니다. 실제 정상 관측을 뜻하지 않습니다.';
 Object.assign(left.host.dataset,{sample:'simulation-before',points:String(n),noise:'0',category,measured:'false'});
}
function availabilitySummary(){
 beforeView();right.host.dataset.uiRevision='9';
 $('availability-note').textContent=category==='fog'?'안개: 산란 반환과 표면 누락을 함께 비교합니다. 거리별 검출점에서 근거리 편중과 먼 거리 반환을 확인하세요.':category==='range'?'같은 장소의 효과 전후 비교입니다. 거리 흔들림은 표면 위치를 바꾸며 삭제 정답을 만들지 않습니다.':category==='sun'?'햇빛: 태양 방향은 제한되지만 가짜 거리는 전체 측정 범위에서 나올 수 있습니다. 아래에서 각도·발생률을 조절하세요.':category==='general'?'같은 장소의 효과 전후 비교입니다. 노란색은 경계에서 달라진 반환이며, 약한 신호에서는 표면 흔들림·누락을 확인합니다.':'공간 속 입자와 라이다에 찍힌 점은 다릅니다. 검출점이 0이어도 입자 운동이 계산될 수 있습니다. 오른쪽 표시에서 두 보기를 선택할 수 있습니다.';
 if(category==='fog'&&result){$('sim-overlay').textContent='안개 산란 '+fmt(result.stats.dust)+'점 · 표면 누락 '+fmt(result.stats.lost+result.stats.replaced)+'점';}
}
function rangeFeaturesV9(){
 $('features').innerHTML='<div class="card"><h3>비교 방식</h3><p>같은 합성 장소에서 빔 방향 거리 오차를 적용하기 전과 후를 비교합니다.</p></div><div class="card"><h3>오차의 의미</h3><p>기본 60mm는 시각 검토용 가정입니다. 실제 센서의 거리 정밀도를 측정한 값이 아닙니다.</p></div><div class="card"><h3>라벨 정책</h3><p>실제 표면을 흔든 점이므로 삭제 정답은 만들지 않습니다. 위치 보정·불확실성 후보입니다.</p></div>';
 $('feature-note').textContent='실측 교정·학습 승인은 하지 않았습니다.';
}
function initAvailability(){
 const kind=new URLSearchParams(location.search).get('kind');
 if(['spray','reflection'].includes(kind)){
  const id={sun:'sun-status',spray:'spray-status',reflection:'reflection-status'}[kind];$(id).open=true;
  $('redirect-note').hidden=false;$('redirect-note').textContent='이전 링크의 항목은 아래 ‘생성 보류·조사 결과’로 옮겼습니다. 3D는 비 시뮬레이션으로 시작합니다.';
 }
 $('fogBackscatter').checked=true;$('fogBackscatter').disabled=false;
}
