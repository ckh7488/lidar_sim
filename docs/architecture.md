# 소스 구조와 실행 순서

```text
src/          활성 모델·UI·worker·템플릿, injections.json이 조립 목록
configs/      확정 설정, 분포 등록부, 생성 정책
data/         실측 변환 예시, DEMO 메시·빔·이전 스캔 비교 자산
vendor/       Three.js 0.160.1, three-mesh-bvh 0.7.6 및 라이선스
reference/    이전 분석 HTML과 연결된 변환 자료·검증 기록
provenance/   인계 시 원본 파일 해시와 에셋 출처
tools/        build.py, serve.py, verify.py, runtime.cjs, simulate.cjs
tests/        worker 생명주기와 실제 시뮬레이터 회귀 검사
examples/     에이전트가 바로 실행할 조건 JSON
dist/         생성 웹 폴더, Git 제외
outputs/      프레임·검증 출력, Git 제외
```

## 조립

v24의 `review_demo.html`은 전체 환경·생성기 카탈로그와 파일 기반 재생 화면입니다. `review_demo.js`, `review_demo_viewer.js`, CSS를 별도로 복사합니다. `tools/review-server.cjs`가 실제 runtime을 실행하고 LSF를 저장하며 브라우저는 저장 좌표를 그대로 읽습니다. 물리 구현과 UI를 분리한 계약은 [review-demo.md](review-demo.md)에 있습니다.

`tools/build.py`는 `src/template.html`의 토큰을 `src/injections.json`으로 대체합니다. 클라이언트 안의 중첩 토큰도 펼칩니다. vendor 코드는 마지막에 넣습니다. build는 configs와 활성 모델/자산 해시를 반영한 새 index를 dist에 만듭니다. 원본 데이터 index를 덮어쓰지는 않습니다.

실행 페이지는 `index.html`, 호환 주소는 `measured_patch_review_v1.html`, `noise_review_lab_v1.html`입니다. `--portable`을 주면 시뮬레이터 자료를 내장한 큰 `portable.html`도 생성합니다. 연결된 역사 보고서까지 한 파일로 합치지는 않습니다.

## 관측 처리

1. `noise_lab_poses_v19.js`가 카탈로그에서 센서 위치·높이·yaw를 선택합니다. 실제 지형 높이에 설치 높이를 더합니다. `noise_lab_random_v4.js`가 장소·시드로 지면/설치각/축 진폭을 추출합니다.
2. `noise_lab_geometry_worker_v3.js`가 압축 메시와 빔 배열을 풉니다. `noise_lab_scene_v24.js`가 장소별 허용 소품을 시드로 배치해 실제 메시·재질 배열을 합칩니다. `noise_lab_freepose_v24.js`가 연속 시작점, 6DoF 경로와 먼지 발생원을 만듭니다. 지상 v21 계획기는 명시적인 `scenario:legacy-v23` 호환 실행에만 사용합니다.
3. `noise_lab_geometry_v3.js`가 BVH로 실제 교차 거리를 구합니다. 실제 빔과 복원에 쓰는 명목 빔을 구분해 축 오차를 모델링합니다.
4. `noise_lab_motion_worker_v6.js`가 종류별 모델로 전달합니다. 먼지 운송은 `motion_v6`, 비·눈·안개·햇빛의 현재 경로는 `fullrange_v11`, 약한 신호·경계 혼합은 `atmosphere_v8`입니다.
5. `observation_v22`가 선택적 모서리 혼합을 먼저 적용합니다. 비·눈은 `precipitation_v22`의 세계 입자 교차를 계산하고, `receiver_v7`과 `core_v1`이 신호 경쟁/검출을 수행합니다. 마지막에 `observation_v22`가 모든 모드의 공통 표면 검출·거리오차와 오류 분해/원래 표면 거리를 붙입니다. `metrics_v1`은 최종 결과에서 계산합니다.
6. `noise_lab_channels_v20.js`가 모든 모델 경로의 반환에 신호·반사도 proxy와 별도 referenceScan을 붙입니다. 좌표나 검출 라벨을 바꾸지 않습니다.
7. `client_v1`과 각 client 조각이 결과를 표시합니다. `jobs_v13`은 취소·오래된 결과 무시·오류·재시도를 관리합니다.

### 버전 이름의 주의점

파일명 숫자만 보고 구버전이라고 지우면 안 됩니다. v22는 여러 세대의 활성 모듈을 조립한 UI 버전입니다. 일부 함수는 뒤에서 다시 정의됩니다. 특히 `sequence_client_v21.js`는 마지막에 시퀀스 조작과 안전한 발생원 선택을 연결합니다. `fullrange_client_v10.js`의 solar 함수들이 `solar_client_v7.js`의 이전 동작을 대체합니다. 이전 함수의 설명만 읽고 현재 동작을 판단하지 말고, **조립된 실행 순서와 테스트 결과**를 확인하세요. v22의 공통 관측층은 이 순서를 명시적으로 감싸며, 비·눈의 기본 생성기는 연속 세계 입자로 교체했습니다.

### 자산 형식

`data/noise_lab_v1/index.json`의 `geometry_knobs_v3.scenes`가 현재 메시 ID를 가리킵니다. 야외 9예시는 v18, 나머지 15예시는 v3입니다. 메시의 vertices/faces/rho와 terrain 배열은 gzip 후 base64입니다. Three.js에 넣을 때 float32/uint32로 풉니다. `beam_profiles_v2.json`은 공개 OS1-128 기준 배열이며 실측 비교 표본 센서의 개별 교정이 아닙니다.

실측 `xyz`/`labels`와 기존 장면의 `ranges`는 gzip 없는 base64입니다. `scan_*`의 payload는 이전 빔/지면 프로필 비교를 위해 포함했습니다. 형식이 다른 두 데이터를 같은 디코더로 읽지 마세요.

### 변경 유형별 위치

- UI 이동/문구: template 또는 해당 client / principle 조각.
- 날씨 강도 분포: parameter registry + parameters_v18. 기하 추출: random_v4.
- 물리/수신 가정: 위 관측 처리에 나온 활성 모델. 수정 전 관련 limits 확인.
- 새 장면: scene 데이터 + geometry 데이터 + index 참조. 메시 생성용 과거 원본 파이프라인은 이번 실행 패키지의 일부가 아닙니다. 원본을 다시 수집하는 대신 형식과 출처를 갖춰 추가하세요.
- 에셋 보기: asset_preview.html + asset_models_v18.json.

실행에 사용하지 않는 이전 야외 geometry_v3 중복본, 연구 학습 코드, 임시 다운로드, 원본 PCAP은 패키지에서 제외했습니다. 원본 작업 폴더에서는 삭제하지 않았습니다.


## CLI 실행과 프레임 저장 (v22)

`runtime.cjs`는 작은 UI 설정 함수만 VM에서 평가합니다. 계산량이 큰 실제 빌드 worker는 `worker-thread.cjs`의 native Node worker에서 실행합니다. 한 simulator에는 기하/관측 worker와 원본 JSON 캐시가 유지됩니다. `run()`을 순서대로 기다리고 사용 후 `close()`할 수 있습니다. 비·눈은 자원 여유에 따라 최대 4개 ray 분할 worker를 사용하며 분할 전후 좌표·라벨·입자 ID가 동일해야 합니다. 프레임을 무제한 병렬 실행하지 마세요.

`coverage_profile_v22.json`은 광범위한 날씨 설정과 family 분할의 단일 등록부입니다. `dataset-profile.cjs`가 시퀀스별로 추출합니다. UI의 약한 기본값과 혼동하지 마세요. `frame-export.cjs`와 `binary-frame.cjs`는 schema 6을 내보내며, JSON에서는 NaN이 null로 바뀌고 LSF1에서는 보존됩니다.

## v24 배치·자세의 단일 계산 경로

scene_v24는 동봉된 공개 에셋과 절차적 가구를 같은 좌표계로 정규화합니다. 배치 후보는 기존 구조·앞서 배치한 물체와의 여유, 바닥 연결성, 기존 40개 앵커 보존을 검사합니다. 기본 건물 전체를 재생성하지 않습니다. geometry worker의 sceneLayout을 weather worker와 LSF/뷰어에 그대로 전달하므로 추가 물체도 가림과 충돌에 참여합니다. 배치 키에는 실제 높이/변환이 포함됩니다.

freepose_v24는 네 직선 구간에 5차 easing을 적용합니다. 센서 반경 0.3m가 지나가는 전체 선분을 AABB로 보수적으로 감싸 삼각형 교차를 검사합니다. 몸체는 회전해도 이 구 안에 있다고 가정합니다. 자세 적용은 `Rz(yaw) * Ry(pitch) * Rx(roll)` 이후 별도 설치 오차, 축 흔들림 순서입니다. 경로 worldZ는 직접 보간하며 height는 실제 지형에 대한 높이입니다.

경로 후보 높이는 실내 0.8..2.2m / 야외 0.8..6m, pitch·roll은 ±25°입니다. 10초 네 구간에서 최고 이동속도는 3m/s 아래이며 yaw 90°/s, pitch·roll 40°/s 이하로 제한합니다. 여유 없는 후보는 거절하므로 최종 분포는 정확한 균등분포가 아닙니다. 드론/차량의 동역학과 다층 경로 탐색은 구현하지 않습니다. v27부터 스캔 내부 센서 이동은 별도 스큐 옵션으로 구현합니다.


## OS1-32 및 개체별 고정 빔 각도 (v25)

[설계·분포·API·검사](beam-variation-v25.md)를 읽으세요. 웹은 OS1-32 U와 각도 변동이 기본이고, 기존 CLI/API는 호환을 위해 OS1-128·추가 변동 끔을 유지합니다. CLI/API에서는 sensor와 beamUnit을 명시합니다. src/noise_lab_beam_unit_v25.js가 단일 분포/추출 구현이며 전체 시퀀스·장면·날씨에 동일한 sensor-unit을 유지합니다. tests/beam-unit-v25.cjs로 광선과 내보내기를 확인합니다.

## Motion skew (v27)

Read [motion-skew-v27.md](motion-skew-v27.md). `motionSkew:{enabled:false,scanHz:10}` is the default for every entry point. OFF must preserve existing XYZ/label hashes. ON casts each raw measurement column from its acquisition pose but reconstructs at the reference pose, so it must not silently deskew. Preserve per-return Float64 `timeOffsets`, reference-time metadata, endpoint pose hold, and the explicit frozen-within-scan weather limitation. Scan frequency is independent of export FPS. Run `node tests/motion-skew-v27.cjs` and `node tests/skew-interface-v27.cjs` after changing this mechanism. No IMU or external rotor is implied.
