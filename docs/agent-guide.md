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
  weatherJitter: false
});
// frame.result.xyz: Float32Array, frame.result.labels: Uint8Array
```

지원 종류: `dust`, `rain`, `snow`, `fog`, `sun`, `range`, `general`. 비·눈은 `construction_*`, `crane_yard_*`, `apartment_*`에서만 허용합니다. UI는 실내에서 강수로 전환하면 같은 예시 번호의 공사장으로 자동 이동하고, CLI는 잘못된 장면을 오류로 알려줍니다.

설정 파일의 `controls`에는 UI 입력 ID를 키로 넣습니다. 예: `{"general-mode":"weak"}`, `{"general-mode":"edge"}`, `{"rainRate":5}`, `{"range-enabled":false}`. `geometry`는 자동 추출한 지면·기울기 값을 명시적으로 재정의하는 고급 입력입니다. 수치의 단위/범위는 UI와 설정 JSON을 따르세요. CLI 고급 입력은 일부 도메인 제약을 모델 내부에서만 처리하므로 임의의 범위 밖 값을 정상 실험으로 취급하지 마세요.

CLI 기본 예시는 seed 73031 / 3.25초입니다. UI 처음 열기는 seed 73017이고, 입자 운동의 시간은 3초, 비운동 모드가 읽는 별도 시간값은 0초입니다. **비교할 때 반드시 시드와 해당 모드의 시간을 맞추세요.** 햇빛의 난수도 시간값에 영향을 받습니다. UI에서 여러 모드를 오가며 노브를 바꿨다면 나머지 입력도 맞춰야 합니다.

## 데이터 계약

- 좌표: 미터 단위의 세계 XYZ, Z가 위쪽입니다. `xyz`는 `[x0,y0,z0,x1,y1,z1,...]`입니다.
- `labels`: 0은 유지한 표면, 1은 합성 산란·가짜 반환, 2는 경계 등에서 달라진 불확실 표면입니다. 이 숫자를 곧바로 현장 제거 정답으로 쓰지 않습니다.
- `rayIds`: 원래 광선 배열 인덱스입니다. 반환 누락이 있으므로 좌표 인덱스와 같지 않습니다.
- `nominalRanges`, `rangeErrors`, `powers`: 반환별 거리/오차/모델 신호값입니다. `powers`를 실측 intensity 단위로 해석하지 않습니다.
- `world`, `worldV`, `worldIds`: 운동 설명용 표본의 좌표·속도·ID입니다. 검출 반환과 별도 계층입니다.
- 출력 `config`, `geometry`, `scene`, `seed`, `time`으로 조건을 보관합니다. `stats`에는 모드별 진단이 들어가며 공통 필드 외에는 모드에 따라 다릅니다.
- `xyz_labels_sha256`는 Float32 좌표 바이트와 라벨 바이트의 해시입니다. 같은 실행 환경에서 재현을 확인하는 용도이며 모든 JS 엔진 간 비트 단위 동일성은 보장하지 않습니다.

`tools/runtime.cjs`는 빌드한 HTML의 실제 두 worker 프로그램을 실행합니다. UI의 `cfg()`와 순수 설정 함수도 원문에서 읽습니다. 이 함수들을 여러 줄로 리팩터링하면 명시적 추출 검사가 실패하므로 runtime과 테스트를 함께 수정해야 합니다. 모델을 별도로 복사해 구현하지 마세요.

## 자동 브라우저 검증 지점

- `#sim-view[data-ready="true"]`: 현재 결과 준비 완료. `data-ready="error"`와 `#view-status`는 실패를 알립니다.
- `#sim-view`의 dataset: scene, category, seed, time, surface, noise, training, range/geometry 값, displayState.
- `#real-view`: 참고 실측 또는 같은 합성 장면의 효과 전 결과. 두 경우를 구분하세요.
- `#category`, `#sim-scene`, `#seed`, `#motion-view`, `#weather-jitter`: 주요 입력.
- `[data-tab="confirmed"]`: 확정 내용 탭. 첫 페이지로 설명을 다시 옮기지 마세요.

종류를 연속 변경하고 탭을 왕복해도 최종 선택의 결과만 표시되어야 합니다. WebGL 또는 worker 실패는 빈 화면으로 숨기지 않고 재시도 안내로 표시해야 합니다.

## 다른 프로젝트에 연결할 때

이 인계본은 고정 DEMO 장면의 단일 시점 관측을 계산합니다. 임의 PCD 입력, 이동 궤적, 장치 전체 36RPM 회전의 시각별 자세는 제공하지 않습니다. 다른 에이전트의 Scan Studio/SLAM 프로젝트를 이 저장소의 구현이라고 가정하지 마세요. 연결할 때 별도 브랜치에서 좌표계, 빔별 시각, 자세 적용 순서, 라벨 정책부터 합의하고 기존 인터페이스를 보존하세요.
