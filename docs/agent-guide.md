# 에이전트 실행 안내

## 빠른 인계

1. `AGENTS.md`와 `docs/architecture.md`를 읽습니다.
2. `python tools/build.py`로 저장소 안의 자료만 사용해 빌드합니다.
3. `python tools/serve.py --no-build --port 18768`로 화면을 엽니다.
4. CLI는 `node tools/simulate.cjs --config examples/dust.json --out outputs/frame-001.json`입니다.
5. 변경 후 `tools/verify.py`, 관련 Node 테스트와 브라우저를 확인합니다.

Python은 표준 라이브러리만 사용합니다. Node는 내장 모듈과 동봉한 Three.js/BVH를 사용합니다. Git LFS, npm, pip, 원본 E: 드라이브나 데이터 서버 연결은 필요하지 않습니다. 모든 실행 경로는 저장소 위치에서 계산합니다. Windows에서 `py -3`를 사용할 수 있습니다. 처음 빌드는 복사본을 만들므로 여유 디스크 공간 약 1 GB를 권장합니다.

## CLI와 JavaScript 호출

```sh
node tools/simulate.cjs --kind rain --scene apartment_v2 --seed 42 --time 3
node tools/simulate.cjs --config examples/rain.json --out outputs/rain-42.json
node tools/simulate.cjs --help
```

`--out`을 생략하면 설정·점수·좌표 해시를 출력합니다. 지정하면 전체 배열도 JSON으로 저장합니다. 기존 경로에는 실패하며 덮어쓰지 않습니다. 새 이름을 쓰거나 사용자의 파일 관리 지시를 따르세요.

```js
const {createSimulator} = require('./tools/runtime.cjs');
const simulator = createSimulator();
const frame = await simulator.run({
  scene: 'construction_v1', kind: 'dust', seed: 73031, time: 3.25,
  weatherJitter: false, pose: "auto"
});
// frame.result.xyz: Float32Array, frame.result.labels: Uint8Array
```

지원 종류: `dust`, `rain`, `snow`, `fog`, `sun`, `range`, `general`. 비·눈은 `construction_*`, `crane_yard_*`, `apartment_*`에서만 허용합니다. UI는 실내에서 강수로 전환하면 같은 예시 번호의 공사장으로 자동 이동하고, CLI는 잘못된 장면을 오류로 알려줍니다.

설정 파일의 `controls`에는 UI 입력 ID를 키로 넣습니다. 예: `{"general-mode":"weak"}`, `{"general-mode":"edge"}`, `{"rainRate":5}`, `{"range-enabled":false}`. `geometry`는 자동 추출한 지면·기울기 값을 명시적으로 재정의하는 고급 입력입니다. 수치의 단위/범위는 UI와 설정 JSON을 따르세요. CLI 고급 입력은 일부 도메인 제약을 모델 내부에서만 처리하므로 임의의 범위 밖 값을 정상 실험으로 취급하지 마세요.

CLI 기본 예시는 seed 73031 / 3.25초입니다. UI 처음 열기는 seed 73017이고, 입자 운동의 시간은 3초, 비운동 모드가 읽는 별도 시간값은 0초입니다. **비교할 때 반드시 시드, 센서 위치 선택과 해당 모드의 시간을 맞추세요.** 햇빛의 난수도 시간값에 영향을 받습니다. UI에서 여러 모드를 오가며 노브를 바꿨다면 나머지 입력도 맞춰야 합니다.

## 데이터 계약

- 좌표: 미터 단위의 세계 XYZ, Z가 위쪽입니다. `xyz`는 `[x0,y0,z0,x1,y1,z1,...]`입니다.
- `labels`: 0은 유지한 표면, 1은 합성 산란·가짜 반환, 2는 경계 등에서 달라진 불확실 표면입니다. 이 숫자를 곧바로 현장 제거 정답으로 쓰지 않습니다.
- `rayIds`: 원래 광선 배열 인덱스입니다. 반환 누락이 있으므로 좌표 인덱스와 같지 않습니다.
- `nominalRanges`, `rangeErrors`, `powers`: 반환별 거리/오차/기존 모드 고유 신호값입니다. powers의 단위는 모드에 따라 다릅니다. 햇빛 powers는 v20부터 전체 NaN/JSON null입니다. 과거의 0/1은 신호가 아닌 라벨 표식이었습니다.
- `signalProxy`, `reflectivityProxy`: 반환점과 같은 길이/순서의 미교정 모델값입니다. 아래 채널 계약을 반드시 읽으세요.
- `referenceScan.ranges`, `referenceScan.surfaceReflectance`: 전체 원래 빔 순서의 효과 전 거리와 재질 반사도 가정입니다. 이는 가려진 깨끗한 배경을 포함한 디버그 참조이며 학습 입력에 넣으면 안 됩니다.
- `world`, `worldV`, `worldIds`: 운동 설명용 표본의 좌표·속도·ID입니다. 검출 반환과 별도 계층입니다.
- 출력 `config`, `geometry`, `sensorPose`, `scene`, `seed`, `time`으로 조건을 보관합니다. schema 3의 `sensorPose.world`는 실제 세계 좌표이고 `height`는 지면 위 높이입니다. `stats`에는 모드별 진단이 들어가며 공통 필드 외에는 모드에 따라 다릅니다.
- `xyz_labels_sha256`는 Float32 좌표 바이트와 라벨 바이트의 해시입니다. 같은 실행 환경에서 재현을 확인하는 용도이며 모든 JS 엔진 간 비트 단위 동일성은 보장하지 않습니다.

`tools/runtime.cjs`는 빌드한 HTML의 실제 두 worker 프로그램을 실행합니다. UI의 `cfg()`와 순수 설정 함수도 원문에서 읽습니다. 이 함수들을 여러 줄로 리팩터링하면 명시적 추출 검사가 실패하므로 runtime과 테스트를 함께 수정해야 합니다. 모델을 별도로 복사해 구현하지 마세요.

## 자동 브라우저 검증 지점

- `#sim-view[data-ready="true"]`: 현재 결과 준비 완료. `data-ready="error"`와 `#view-status`는 실패를 알립니다.
- `#sim-view`의 dataset: scene, category, seed, time, surface, noise, training, range/geometry 값, displayState.
- `#real-view`: 참고 실측 또는 같은 합성 장면의 효과 전 결과. 두 경우를 구분하세요.
- `#sensor-pose`: `auto`, `legacy`, `0`~`39` 선택. dataset의 sensorPose/sensorXYZ/sensorYaw는 완료한 관측의 설치값입니다.
- `#category`, `#sim-scene`, `#seed`, `#motion-view`, `#weather-jitter`: 주요 입력.
- `[data-tab="confirmed"]`: 확정 내용 탭. 첫 페이지로 설명을 다시 옮기지 마세요.

종류를 연속 변경하고 탭을 왕복해도 최종 선택의 결과만 표시되어야 합니다. WebGL 또는 worker 실패는 빈 화면으로 숨기지 않고 재시도 안내로 표시해야 합니다.

## 다른 프로젝트에 연결할 때

이 인계본은 고정 DEMO 장면에 대해 선택한 설치 위치의 단일 시점 관측을 계산합니다. 임의 PCD 입력, 이동 궤적, 장치 전체 36RPM 회전의 시각별 자세는 제공하지 않습니다. 다른 에이전트의 Scan Studio/SLAM 프로젝트를 이 저장소의 구현이라고 가정하지 마세요. 연결할 때 별도 브랜치에서 좌표계, 빔별 시각, 자세 적용 순서, 라벨 정책부터 합의하고 기존 인터페이스를 보존하세요.

## 장면별 40곳 사용하기 (v19)

```sh
node tools/simulate.cjs --scene room_v1 --kind range --pose 0 --seed 42
node tools/simulate.cjs --scene room_v1 --kind range --pose 39 --seed 42
node tools/simulate.cjs --kind range --pose legacy --seed 73031 --time 3.25
```

CLI/API의 번호는 **0~39**, 화면의 번호는 **1~40**입니다. 생략하면 `auto`이며 장면·시드로 선택합니다. 같은 번호에서 날씨 시드를 바꾸려면 `pose`를 고정하세요. 지면 굴곡은 시드에 따라 달라지므로 같은 XY/설치높이여도 세계 Z는 조금 바뀔 수 있습니다. 연속 40개 uint32 시드(범위 안, 순환 경계 제외)는 모든 위치를 한 번씩 사용합니다. 임의의 시드 40개는 중복될 수 있으므로 전체 위치 생성에는 다음 순차 루프를 사용하세요.

```js
for (let pose = 0; pose < 40; pose++) {
  const frame = await simulator.run({scene: 'construction_v1', kind: 'rain', pose, seed: 42, time: 3});
  // Consume or export this frame before the next call. Do not retain every frame in memory.
}
```

`geometry.sensorPose`를 직접 주입하는 인터페이스는 제공하지 않습니다. runtime은 `pose` 선택을 우선합니다. 원점 기준 과거 결과는 반드시 `legacy`를 지정해야 재현됩니다. 이전 scan profile을 고르면 UI도 원점 비교로 명시적으로 전환합니다. 카메라 이동과 센서 이동은 다릅니다.

카탈로그는 `data/noise_lab_v1/sensor_positions_v19.json`, 설정은 `configs/sensor_sampling_v19.json`입니다. 모델/설정 SHA-256가 달라지면 빌드가 실패하여 오래된 위치를 쓰지 못하게 합니다. 메시나 설치 범위를 바꿀 때 순서:

```sh
node tools/generate-sensor-poses.cjs
python tools/build.py
node tests/sensor-poses.cjs
node tests/simulator.cjs
```

생성기는 기존 원점과 연결된 빈 격자(실내 0.5m, 야외 1m)를 탐색하고, 격자 내 좌표를 흔들어 넓게 분산된 무작위 40곳을 고릅니다. 정확한 공간 균등분포가 아닙니다. 최소 수평 간격은 실내 1m, 야외 3m입니다. 연결된 바닥의 보수적 충돌 여유는 폭 0.7m, 지면 위 0.08~2.4m입니다. 닫힌 실내는 천장 아래, 천장 없는 ㄱ자 복도는 명시된 바닥 영역, 야외는 메시·지형 범위 안입니다. 높이는 균등 1.2~2.1m(평균 1.65m, std 0.259808m), yaw는 원형 균등 0~360°입니다. 이는 지상 설치 다양성 가정이며 크레인 고소 설치 분포는 아닙니다.

먼지 발생원과 태양 방향은 세계 좌표에 고정됩니다. 멀리 이동하면 먼지가 가려지거나 100m 밖일 수 있으며, 생성점 0도 정상입니다. 비·눈의 운동 설명 표본은 현재 센서 주변 100m를 보여줍니다. 센서 관측은 실제 새 빔/원점에서 계산하며 이 설명 표본과 1:1이 아닙니다.


## 신호·반사도 출력 계약 (v20, CLI schema 3)

CLI `arrays.signalProxy`와 `arrays.reflectivityProxy`는 `arrays.xyz`의 점 순서에 대응합니다. JS API에서는 `frame.result.signalProxy`와 `frame.result.reflectivityProxy`입니다. 반사도 추정값은 다음 단순 거리 보상으로 만들며, 진짜 재질 반사도 또는 Ouster Reflectivity로 명명하지 않습니다.

```text
r_observed = nominalRanges + rangeErrors
signalProxy = powers                         (대부분의 모드)
signalProxy = powers / (1600 * weakPhotons)   (약한 신호 모드)
reflectivityProxy = signalProxy * r_observed²
```

`powers`는 모델이 선택한 후보의 세기 또는 기대 광자 수입니다. 실제 센서의 측정 광자 수가 아닙니다. 약한 신호는 기존 기대 광자 수를 상대 신호 단위로 변환합니다. 안개는 파형 적분값이므로 다른 모드와 같은 척도가 아니며, `channels.crossModeCalibration=false`입니다. 입사각·감쇠를 역보정하지 않으며, 0~1 또는 0~255로 강제로 자르지 않습니다. `channels.reflectivityProxy.range`에서 실제 범위를 확인할 수 있습니다.

햇빛은 반환 위치만 생성하는 현재 모델에 신호 세기 모형이 없습니다. 기존 powers=정상점 0/가짜점 1은 정답을 노출하는 표식이라 v20에서 전체 채널을 NaN으로 바꿨습니다. JSON은 null로 기록합니다. 이는 0 반사도나 강도 0 측정이 아닙니다. 모델 학습에 쓰려면 이런 미지원 채널을 데이터 전체에서 일관되게 제외하거나 실측 기반 신호 모델을 먼저 구현해야 합니다. 노이즈 점만 누락시키거나 null을 0으로 채우지 마세요.

`referenceScan`은 point 배열과 길이가 다릅니다. CLI의 최상위 referenceScan, JS의 result.referenceScan에 있으며, 전체 131,072빔 기준 `ranges`, `surfaceReflectance`가 있습니다. 미교차 빔/재질 미제공 구버전 프로필의 반사도는 NaN/JSON null입니다. 이는 **노이즈가 없었을 때의 배경 재질**로, 먼지나 비 반환의 재질 값을 뜻하지 않습니다. 학습 feature로 쓰면 보이지 않는 배경 정보가 유출됩니다. 검토/디버그용으로만 분리 보관하세요.

재질 반사도는 현재 메시의 rho와 고정된 공간 변화에서 계산한 가정값입니다. 관측 위치가 바뀌면 관측되는 재질과 입사각이 달라지지만 날씨 시드마다 재질 자체를 다시 무작위화하지는 않습니다. 실제 재질 분포/센서 감도/양자화 교정은 미구현입니다.

공식 구분: [Ouster calibrated reflectivity](https://docs.ouster.com/sensor-docs/firmware/calibrated-reflectivity)는 측정 신호에 거리와 센서 감도 보정을 적용하는 채널입니다. 이 시뮬레이터의 거리² 보상만으로 해당 장비의 교정값을 재현했다고 간주하지 않습니다.
