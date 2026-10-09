function fullRangeConfig(){return {fullRange:true,sunEnabled:$('sun-enabled').checked,sunProbability:+$('sunProbability').value,sunWidth:+$('sunWidth').value};}
function fullRangeSummary(){
 if(!result)return;const s=result.stats,q=s.review||{},m=s.motion;
 const enabled=['rain','snow','fog','sun','dust'].includes(category);$('range-support').hidden=!enabled;if(!enabled)return;
 const candidate=q.rangeHistogram||m?.rangeHistogram||[0,0,0,0,0],observed=[0,0,0,0,0];
 for(let i=0;i<result.labels.length;i++)if(result.labels[i]===1)observed[Math.min(4,Math.floor(result.nominalRanges[i]/20))]++;
 $('distance-bins').innerHTML=['0–20m','20–40m','40–60m','60–80m','80–100m'].map((label,i)=>'<span><b>'+label+'</b><br>'+fmt(observed[i])+'점'+(['rain','snow'].includes(category)?'<small>교차 후보 '+fmt(candidate[i])+'</small>':'')+'</span>').join('');
 $('support-note').textContent=category==='dust'?'먼지는 발생원 주변의 이동·침강 영역에만 있습니다. 발생 위치 X/Y를 바꾸어 먼 곳의 구름도 검토할 수 있습니다. 100m 안이어도 가림과 감도 때문에 안 찍힐 수 있습니다.':category==='sun'?'햇빛의 가짜 거리는 수신 시간의 오류입니다. 태양 방향의 오류를 0.3~100m에서 추출하며 실제 물체 뒤의 가짜 거리도 나올 수 있습니다.':category==='fog'?'0.3~100m의 가림 없는 경로에서 산란 신호가 양수인 거리에는 발생 가능성이 있습니다. 감쇠와 거리 손실 때문에 먼 반환은 드뭅니다. 모든 구간에 점을 강제로 채우지 않습니다.':'0.5~100m의 첫 물체 앞까지 빔의 부피에 따라 입자 교차를 계산합니다. 34m 잘림은 없습니다. 교차 후보가 있어도 약한 신호는 센서에 찍히지 않을 수 있습니다.';
 Object.assign(right.host.dataset,{fullRange:'true',rangeSupport:'100',rangeBins:JSON.stringify(observed),candidateBins:JSON.stringify(candidate),uiRevision:'12'});
}
function solarControls(){
 $('pattern-controls').hidden=!motionActive();$('legacy-source-label').hidden=true;$('solar-controls').hidden=category!=='sun';if(category!=='sun')return;
 for(const id of ['sunAz','sunEl','sunWidth','sunProbability'])$(id+'-out').textContent=$(id).value;
 $('generated-title').textContent='햇빛 · 태양 방향의 가짜 거리 후보';$('noise-only').disabled=false;
 $('mode-note').textContent='햇빛 방향에 따라 가짜 거리가 생기는 통계 후보입니다. 실측 논문의 현상을 참고했으며 발생률·각도 폭은 조절 가정입니다. Ouster에 교정한 결과는 아닙니다.';
}
function solarSummary(){
 if(category!=='sun'||!result?.stats.review)return;const q=result.stats.review,s=result.stats;
 $('sim-overlay').textContent='햇빛 가짜 반환 '+fmt(s.dust)+'점 · 태양 '+$('sunAz').value+'° / '+$('sunEl').value+'°';
 $('sim-info').textContent='같은 장소의 표면 '+fmt(s.surface)+'점 · 햇빛으로 대체 '+fmt(s.replaced)+'점 · 빈 방향의 가짜 반환 '+fmt(s.skyDust)+'점. 점은 태양 방향을 따라 0.3~100m의 가짜 거리로 배치됩니다.';
 $('solar-stats').textContent=!q.enabled?'햇빛 효과 꺼짐':!q.clearSunPath?'태양이 지형·물체에 가려졌거나 지평선 아래입니다. 현재 직사광 반환 0점.':'확률 합으로 예상 '+q.expectedFalseReturns.toFixed(1)+'점 · 이번 시드 '+fmt(q.falseReturns)+'점 · 각도 폭과 발생률은 실측 적합값이 아닙니다.';
}
function solarFeatures(){
 $('features').innerHTML='<div class="card"><h3>실측에 근거한 부분</h3><p>태양 방향에 오류가 집중되고, 일부 센서의 가짜 거리는 측정 범위 전체에 분포했습니다.</p></div><div class="card"><h3>이번 구현의 가정</h3><p>각도 확률은 부드러운 종 모양, 가짜 거리는 균등 분포입니다. 각도 폭·빈도는 노브로 조절합니다. 단일 반환 방식이며 센서별 수광 회로는 재현하지 않습니다.</p></div><div class="card"><h3>학습 판단</h3><p>실측 교정 전 검토 후보입니다. 해당 연구의 OS1-32에는 햇빛 가짜점이 관찰되지 않았으므로 Ouster의 실제 오류율로 사용하면 안 됩니다.</p></div>';
 $('feature-note').textContent='원리를 확인할 수 있도록 구현한 후보입니다. 실제 태양 실측에 맞춘 분포·학습 유용성 검증은 아직 없습니다.';
}
for(const id of ['sun-enabled','sunProbability','sunWidth','sunAz','sunEl'])$(id).oninput=()=>{motionPause();solarControls();clearTimeout(timer);++job;right.host.dataset.ready='false';timer=setTimeout(generate,220);};
$('dust-random-location').onclick=()=>{let s=(+$('seed').value+1)>>>0;$('seed').value=s;const a=(s*2.399963)%6.283185,r=8+80*((Math.imul(s,1664525)>>>0)/4294967296);$('motionX').value=(r*Math.cos(a)).toFixed(1);$('motionY').value=(r*Math.sin(a)).toFixed(1);generate();};

for(const [id,prob] of [["sun-soft-preset",.05],["sun-v10-preset",.6]])$(id).onclick=()=>{motionPause();$("sunProbability").value=prob;$("sun-enabled").checked=true;solarControls();generate();};
