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

`tools/build.py`는 `src/template.html`의 토큰을 `src/injections.json`으로 대체합니다. 클라이언트 안의 중첩 토큰도 펼칩니다. vendor 코드는 마지막에 넣습니다. build는 configs와 활성 모델/자산 해시를 반영한 새 index를 dist에 만듭니다. 원본 데이터 index를 덮어쓰지는 않습니다.

실행 페이지는 `index.html`, 호환 주소는 `measured_patch_review_v1.html`, `noise_review_lab_v1.html`입니다. `--portable`을 주면 시뮬레이터 자료를 내장한 큰 `portable.html`도 생성합니다. 연결된 역사 보고서까지 한 파일로 합치지는 않습니다.

## 관측 처리

1. `noise_lab_poses_v19.js`가 카탈로그에서 센서 위치·높이·yaw를 선택합니다. 실제 지형 높이에 설치 높이를 더합니다. `noise_lab_random_v4.js`가 장소·시드로 지면/설치각/축 진폭을 추출합니다.
2. `noise_lab_geometry_worker_v3.js`가 압축 메시와 빔 배열을 풉니다.
3. `noise_lab_geometry_v3.js`가 BVH로 실제 교차 거리를 구합니다. 실제 빔과 복원에 쓰는 명목 빔을 구분해 축 오차를 모델링합니다.
4. `noise_lab_motion_worker_v6.js`가 종류별 모델로 전달합니다. 먼지 운송은 `motion_v6`, 비·눈·안개·햇빛의 현재 경로는 `fullrange_v11`, 약한 신호·경계 혼합은 `atmosphere_v8`입니다.
5. `receiver_v7`과 `core_v1`이 신호 경쟁/검출 및 적용 가능한 거리 오차를 계산합니다. `metrics_v1`은 검토 특징을 계산합니다.
6. `client_v1`과 각 client 조각이 결과를 표시합니다. `jobs_v13`은 취소·오래된 결과 무시·오류·재시도를 관리합니다.

### 버전 이름의 주의점

파일명 숫자만 보고 구버전이라고 지우면 안 됩니다. v19는 여러 세대의 활성 모듈을 조립한 UI 버전입니다. 일부 함수는 뒤에서 다시 정의됩니다. 특히 `fullrange_client_v10.js`의 solar 함수들이 `solar_client_v7.js`의 이전 동작을 대체합니다. 이전 함수의 설명만 읽고 현재 동작을 판단하지 말고, **조립된 실행 순서와 테스트 결과**를 확인하세요. 이번 인계는 물리 모델 변경을 최소화하려고 이 순서를 보존했습니다.

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
