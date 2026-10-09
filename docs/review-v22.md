# 첨부 문제 보고서 처리 내역

원문 측정 기준은 `3e414de`입니다. v19~v21에 이미 반영한 기능은 유지했고, v22에서는 관측 파이프라인과 데이터 계약을 수정했습니다. **정상 정지 실측과 대상 센서 metadata가 없으므로 현장 교정 완료를 뜻하지 않습니다.**

## 수정한 항목

- **D1 / R2:** 반환점과 정렬된 `surfaceRanges`, `measuredRanges`를 추가했습니다. 전자는 중심 빔의 원래 표면 거리이고 배경이 없으면 NaN/null입니다. `nominalRanges`는 혼합·날씨 검출 후, 공통 거리오차 전의 반환 거리입니다. `measuredRanges = nominalRanges + rangeErrors`입니다. 모두 광학 원점 기준이며 센서 중심에서의 XYZ 노름과 다릅니다.
- **D2:** `edgeMixing:true` / 화면의 ‘모서리 혼합’으로 모든 날씨와 조합할 수 있습니다. 실제 부광선 교차와 펄스 혼합을 날씨 앞에 적용합니다. 날씨가 꺼진 비와 단독 모서리 모드의 결과가 일치하는지 검사합니다. 날씨를 켠 뒤에도 같은 개수를 강제하면 가림·신호 경쟁을 망치므로 그 기준은 적용하지 않습니다. 2는 불확실한 표면이며 삭제 정답이 아닙니다.
- **D3 / D4:** 공통 표면 검출 문턱과 공통 거리오차를 모든 모드에 적용했습니다. 햇빛도 기본 σ=0.06m입니다. `baselineRangeErrors`와 `mechanismRangeErrors`를 분리했습니다. 약한 신호의 추가 분산, 모서리 편향, 안개 감쇠로 생기는 실제 모델 차이는 지우지 않았습니다. 같은 시드·장면·시각·빔의 기본 오차 난수는 모드와 무관합니다.
- **D5 / R1:** 장면별 40개 충돌 검증 시작점과 0~10초 연속 경로를 유지했습니다. 보고서의 과거 8초 제한으로 되돌리지 않았습니다.
- **D6:** 시퀀스마다 장면의 빈 바닥에서 발생원을 뽑고, 시퀀스 안에서는 그 위치를 유지하며 입자가 움직입니다. 매 프레임 발생원을 다시 뽑거나 센서 앞 2~15m로 제한하지 않습니다.
- **D7:** `coverage-v22` 프로필은 시퀀스별 비 U(1,20)mm/h, 눈 U(1,10)/m³, 안개 logU(50,2000)m를 사용합니다. 먼지 0.2g/s는 고정합니다. 분포·평균·표준편차·범위와 family 분할은 `configs/coverage_profile_v22.json`에 보관합니다. 기존 UI의 확정값과 선택적 std 5% 변동은 유지합니다. 3,000개 시드의 범위·양끝 도달·시간 불변성을 검사합니다.
- **D9:** 햇빛은 UI·일반 CLI 검토에 유지합니다. `coverage-v22`에서는 실제 빈도 교정 전 생성을 거절합니다. 라벨 비율을 맞추려고 가짜점을 늘리지 않습니다. 햇빛 신호·반사도 채널 전체의 NaN/null 정책도 유지합니다.
- **D10:** 장면 family 단위 분할을 고정했습니다. train은 corridor/warehouse/underground_parking/construction, validation은 department_store/crane_yard, test는 room/apartment입니다. 각 family의 v1~v3, 모든 위치·시드는 같은 분할입니다. **24개 예시를 독립된 24환경이라고 주장하지 않습니다.** 새로운 건물 구조·이동 객체 추가와 실제 다른 현장 일반화 검증은 남아 있습니다.
- **D11:** 비·눈은 세계 좌표의 Poisson 입자를 유지하고 바람·종단 낙하로 이동시켜 실제 빔과 교차합니다. `weatherParticleIds`는 검출된 물리 입자의 ID이며 0은 해당 없음입니다. ID는 Float64이며 정수로 정확히 표현됩니다. 세계 보기에는 교차 후보를 안정적으로 줄여 표시하며 광학 계산에는 모두 사용합니다. 안개는 부드러운 농도장이 바람에 이동합니다. 광자 검출은 확률적이므로 같은 방울이 다음 프레임에도 반드시 검출된다고 강제하지 않습니다.
- **D12:** 런타임의 원본 JSON 파싱을 재사용하고, 중앙 광선의 법선을 구하려고 같은 BVH 교차를 두 번 계산하던 부분을 없앴습니다. 압축 바이너리 LSF1과 Node/Python 읽기를 추가했습니다. **연속 입자 비·눈은 여전히 CPU 부담이 큽니다.** 8개 모델 경로에서 각각 20프레임을 측정했습니다. 비·눈은 최대 4개 native worker에서 평균 25.2초/17.7초이며, 장면과 설정에 따라 달라집니다. 이 수치는 학습용 대량 생성 승인이 아닙니다. [조건별 성능과 검증 기록](validation.md)을 확인하세요. `tools/benchmark.cjs`로 실제 설정에서 먼저 예산을 측정하세요.
- **D13:** `--sensor-metadata PATH`로 실제 채널별 altitude/azimuth 및 beam/lidar 변환을 읽는 경로를 추가했습니다. 128채널을 간격으로 잘라 32채널이라고 부르지 않습니다. 정확한 대상 OS1-32 metadata가 아직 없어 기본 공개 OS1-128을 교체하지 않았습니다. 32채널 가상 fixture의 각도·형상 재계산·캐시 전환 검사는 실장비 교정 검사가 아닙니다.

## 실측이 있어야 끝낼 항목

**D8, D9의 빈도 교정, D13의 실제 대상 프로필 확인**에는 정상 장비의 정지 캡처와 동일 센서 metadata가 필요합니다. 과거 제공된 경로는 이번 실행 PC에서 찾을 수 없었습니다. 고장 상태·외부 36RPM 회전의 점군을 정상 정지 오차로 간주하면 이동·각도·기계 이상까지 거리 노이즈에 섞입니다.

`tools/calibrate_range.py`는 검토된 평면 패치에서 방사 방향 거리 잔차를 계산하고 `sqrt(sigma0² + (k*r)²)` 후보를 적합합니다. 평면 수직 잔차를 방사 오차로 착각하지 않습니다. 각 패치 ≥4m²·≥500점, 정상·정지 선언, 원본/metadata 해시, 표면 요철 상한 ≤5mm를 요구하고 입사각 cos<0.5는 제외합니다. 5개 거리 구간마다 ≥500점이 필요합니다. 독립 캡처 검증과 반사도별 잔차 검토가 끝나기 전에는 적용·교정·학습 승인 모두 false입니다. 합성 검사는 알고리즘 검사일 뿐 실측 결과가 아닙니다.

**R3:** `training_approved:false`와 `field_calibrated:false`를 유지합니다. **R4:** 축 흔들림을 보정하지 않은 XYZ에는 각도 오차가 포함됩니다. XYZ-평면 잔차와 거리 노브의 σ를 바로 비교하면 안 됩니다.

## 다른 에이전트의 실행 예

```sh
python tools/build.py
node tools/simulate.cjs --kind rain --profile coverage-v22 --seed 11 --out outputs/rain-11.lsf.gz
node tools/sequence.cjs --kind dust --profile coverage-v22 --seed 12 --out outputs/dust-12
node tools/simulate.cjs --kind range --sensor-metadata /path/to/metadata.json --out outputs/exact-sensor.lsf.gz
node tools/benchmark.cjs --frames 20 --kinds range,rain,snow,fog,dust,sun,general --out outputs/benchmark-new
python tools/read_lsf.py outputs/rain-11.lsf.gz
```

시퀀스 기본은 `.lsf.gz`이며 JSON이 필요하면 `--format json.gz`를 지정합니다. LSF1은 4바이트 magic, uint32 little-endian JSON 헤더 길이, UTF-8 헤더, 연속 typed-array payload입니다. Node는 `tools/binary-frame.cjs.read`, Python은 `tools/read_lsf.py.read_lsf`로 읽습니다. `referenceScan.*`, `surfaceRanges`, `weatherParticleIds`, 오차 분해는 학습 입력이 아닌 숨겨진 진단/정답 정보입니다. 출력 폴더는 Git 제외이며 기존 파일을 덮어쓰지 않습니다.

## 물리 근거와 근사의 경계

[Ouster 좌표·거리 공식](https://static.ouster.dev/sensor-docs/image_route1/image_route2/sensor_data/sensor-data.html)에 따라 빔 각도와 광학 원점, lidar-to-sensor 변환을 분리합니다. Ouster 패킷 range는 광학 경로 상수를 더한 값이므로 현재 광학 원점 기준 거리와 혼동하지 마세요.

[공식 논문 페이지](https://openaccess.thecvf.com/content/CVPR2022/html/Hahner_LiDAR_Snowfall_Simulation_for_Robust_3D_Object_Detection_CVPR_2022_paper.html)의 입자-빔 교차 접근을 참고했지만, 이 코드는 논문 구현을 포팅하거나 그 정확도를 재현한 것이 아닙니다. 현재 비·눈은 각 종류의 대표 종단속도, 지붕 가림 0.5m 근사, 순간 스캔입니다. 눈송이의 개별 자세·flutter, 젖은 표면·적설, 작은 빗방울의 개별 반환은 미구현입니다. 안개는 이동하는 절차적 농도장이며 CFD가 아닙니다.
