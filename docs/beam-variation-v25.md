# OS1-32의 개체별 빔 각도

실제 공개 채널 교정값 위에 **가상 기기마다 고정된 작은 각도 변화**를 더합니다. 변경한 방향으로 장면을 다시 쏘고 같은 교정값으로 좌표를 복원합니다. 완성된 점군에 XYZ 잡음을 더하는 기능이 아닙니다.

## 기준 센서와 출처

- `os1-32-u`: Ouster 공식 SDK의 OS-1-32-U0, 펌웨어 2.0.0-rc.2 공개 fixture. 원래 32채널 × 512열, 고도 약 +20.55°~-21.48°를 보존합니다.
- `os1-32-g`: 공식 SDK의 OS-1-32-G, 펌웨어 2.1.1 공개 fixture. 원래 32채널 × 1,024열, +12.75°~-15.32°의 지평선 집중 배치를 보존합니다.
- `os1-128`: 기존 공개 128×1,024 기준을 계속 선택할 수 있습니다.

U/G는 **서로 다른 빔 배치**이며 동일 제품의 두 개체 표본이 아닙니다. 128개 채널을 임의로 줄이지 않았습니다. 특정 사용 중인 OS1-32의 리비전·배치와 일치한다고 가정하지 마세요.

원본 metadata, 고정한 upstream commit 및 SHA-256은 [provenance](../provenance/ouster-beams-v25.json)에 있습니다. [U형 원본](https://github.com/ouster-lidar/ouster-sdk/blob/46b7bceee7995914e2f3f3facf4d78418335b2d7/tests/metadata/2_0_rc2_os-992011000121-32U0_legacy.json), [G형 원본](https://github.com/ouster-lidar/ouster-sdk/blob/46b7bceee7995914e2f3f3facf4d78418335b2d7/tests/pcaps/OS-1-32-G_v2.1.1_1024x10.json), [BSD-3-Clause 고지](../vendor/ouster-sdk-LICENSE.txt). PCAP 다운로드나 실제 장치 접속 없이 공개 JSON만 사용했습니다.

과거 metadata의 `lidar_origin_to_beam_origin_mm`는 X 방향 광학 원점으로 변환합니다. 명시적인 `beam_to_lidar_transform`가 있으면 이를 우선합니다. 광선 방향과 원점은 모두 `lidar_to_sensor_transform`을 적용하며, packet range와 광학 원점 기준 거리를 혼동하지 않습니다.

## 수치와 의미

각 채널의 고도·방위각에 독립적인 균등분포 `U(-b,+b)`를 사용합니다.

- 기본 `b = 0.01°`, 조절 범위 `0 ≤ b ≤ 0.01°`.
- 모집단 평균 `0°`, 표준편차 `b / √3`, 기본 약 `0.0057735°`. 한 기기의 32개 표본 평균은 정확히 0일 필요가 없습니다.
- 난수는 `beamUnit.seed`와 채널·축만 사용합니다. 프레임 시간, 장면, 날씨, 환경 시드, 광선 열과 무관하게 유지됩니다.
- 추가 변동을 끄거나 `b=0`이면 기존 방향 배열을 변경하지 않습니다.
- 변동은 광선 발사와 좌표 복원에 함께 적용하는 **알려진 교정값 변화**입니다. 추가적인 미교정 잔차와 매 발사의 흰색 각도 잡음은 0입니다. 별도의 설치각·회전축 흔들림은 기존 설정대로 적용됩니다.

[OS1 Rev05, 펌웨어 2.1.x 데이터시트(2021-08-24)](https://data.ouster.io/downloads/datasheets/datasheet-rev05-v2p1-os1.pdf)는 수직·수평 Angular Sampling Accuracy를 각각 ±0.01°로 기재합니다. 이것은 **제품 사이 교정값의 분산이나 정규분포 σ가 아닙니다**. 문서 자체에도 engineering targets 관련 단서가 있습니다. 이 구현은 작은 시험 크기를 정할 때만 해당 수치를 참고했으며 제조사 보증 분포로 간주하지 않습니다. 실제 제품 간 차이는 더 클 수 있고, 여러 장비의 metadata를 모아 분포를 다시 정해야 합니다.

같은 데이터시트의 0.18° FWHM 빔 발산은 빛의 폭이며 채널 중심의 각도 오차가 아닙니다. 0.01° 방향 차이는 50m에서 약 8.7mm의 횡방향 광선 간격에 해당합니다. 교정된 표면의 XYZ 오차가 곧바로 8.7mm 생긴다는 뜻은 아닙니다. 기존 거리오차 σ=6cm가 표시상 더 두드러질 수 있습니다.

[Ouster beam intrinsics API](https://docs.ouster.com/sensor-docs/firmware/api-reference/ouster-http-api/sensor-metadata/get-beam-intrinsics)는 채널 수만큼의 개별 고도·방위각 배열을 제공합니다. 실제 장비의 정확한 배열이 있다면 가상 변동보다 그 metadata를 우선하세요.

## 사용과 재현

두 웹 화면의 **센서 종류 · 개체별 빔 각도**에서 센서, 추가 변동 on/off, 기기 번호, 범위를 조절합니다. 웹 기본은 U형·기기 1·변동 켜짐입니다. ‘새 시드’는 환경을 바꾸고 ‘다른 기기’는 빔 각도만 바꿉니다. 기존 비교용 저장 스캔은 당시 OS1-128/이상적 64빔으로 유지되며, 센서 설정을 변경하면 직접 광선 계산 모드로 전환합니다.

기존 CLI/API 호출은 호환을 위해 센서 미지정 시 OS1-128, `beamUnit` 미지정 시 추가 변동 끔입니다. 새 실험에는 아래처럼 명시하세요.

```sh
node tools/simulate.cjs --sensor os1-32-u --sensor-unit 42 --beam-bound-deg 0.01 --kind rain
node tools/sequence.cjs --sensor os1-32-g --sensor-unit 42 --fps 1 --out outputs/os1g-unit42-sequence
node tools/simulate.cjs --sensor-metadata device.json --sensor-unit 42 --kind range
```

```js
await simulator.run({
  scene: 'construction_v1', kind: 'dust', seed: 73017, time: 3,
  sensor: 'os1-32-u',
  beamUnit: {enabled: true, seed: 42, boundDeg: 0.01}
});
```

`sensor`와 `sensorMetadata`는 동시에 지정하지 않습니다. 정확한 실제 장비 metadata를 그대로 쓸 때는 `beamUnit`을 생략하거나 `enabled:false`로 지정하세요. seed는 0~4294967295 정수이며 각도 범위를 벗어난 입력은 오류가 됩니다.

설정 저장/불러오기, review API, CLI와 10초 sequence가 같은 worker를 사용합니다. 내보낸 `config.sensorProfile`에는 원본 metadata 해시, 채널·열 수, 각 기기의 채널별 delta, 분포 평균·표준편차와 가정 여부를 기록합니다. 이 실험 설정은 기존 정책대로 학습 관측 feature와 구분합니다. 입력 XYZ·신호 배열에 기기 번호나 정답 각도 오차를 섞지 않습니다.

## 검증 범위와 한계

`node tests/beam-unit-v25.cjs`는 원본 해시·프로젝션, 전체 열의 채널 각도, 단위벡터, 고정 난수, 다른 기기, on/off, 세 센서 간 캐시 전환, 24개 장면 × 두 OS1-32 형식, 8종 생성기, 시퀀스 고정값, LSF 왕복을 검사합니다. `tests/review-demo.cjs`는 기존 128채널 웹/API·취소·저장·재현 경로를 검사합니다. 결과는 [v25 검사 기록](validation-v25.json)에 정리합니다.

이 구현은 개체 변화에 대한 학습·평가 조건을 늘리지만 **모든 실제 동일 모델에서 성능을 보장하지 않습니다**. 여러 실제 기기의 metadata와 측정 데이터를 확보하고, 학습에 쓰지 않은 기기를 테스트에 남겨야 합니다. 합성 unit seed 분할만으로 실제 기기 일반화를 입증할 수 없습니다. 이번 작업에서 모델 학습이나 성능 개선 검증은 하지 않았습니다.
