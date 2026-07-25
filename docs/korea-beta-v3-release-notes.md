# 오늘의 식탁 한국 베타 v3 변경 내역

## 사용자 경험

- 첫 실행 시 취향 설정 화면을 강제로 띄우지 않습니다.
- 로그인 없이 바로 추천을 체험할 수 있습니다.
- 추천 질문을 7개에서 3개로 줄였습니다.
  1. 외식·배달·집밥·편의점
  2. 가볍게·든든하게·해장/국물·매콤하게
  3. 한 끼 예산
- 현재 시간대는 강제 필터가 아니라 추천 점수로 사용합니다. 사용자가 늦은 아침이나 이른 저녁을 먹는 경우에도 후보가 사라지지 않습니다.
- 첫 사용자의 식사 기록에 예시 데이터를 자동으로 넣지 않습니다.
- `다른 메뉴` 선택 시 거절 이유를 수집합니다.
- 식사 기록을 처음 완료한 뒤에만 취향 설정을 제안합니다.
- 위치 권한은 `주변 식당 찾기` 기능 안에서 목적을 설명한 후 요청합니다.

## 브랜드와 디자인

- 생성된 콘셉트를 기반으로 코랄 클로슈·포크·숟가락·초록 잎 심볼을 벡터로 제작했습니다.
- 상단 브랜드를 `Today's Plate`에서 `오늘의 식탁` 중심으로 변경했습니다.
- favicon, Apple Touch Icon, PWA 192/512px, 1024px 원본 아이콘을 추가했습니다.
- 로고의 핵심 색상은 Coral `#FF684E`, Green `#19B78D`, Charcoal `#34363A`입니다.

## 제품 분석

브라우저 로컬 큐에 최대 250개의 이벤트를 보관합니다. 이는 실제 분석 SDK가 연결되기 전 퍼널 구조를 검증하기 위한 임시 구현입니다.

- `app_opened`
- `recommendation_started`
- `recommendation_question_answered`
- `recommendation_completed`
- `menu_decided`
- `menu_rejected`
- `meal_recorded`
- `recipe_opened`
- `nearby_opened`
- `location_permission_prompted`
- `location_permission_granted`
- `location_permission_failed`
- `taste_profile_saved`

운영 배포 전 Firebase Analytics, Amplitude 또는 PostHog 중 하나로 전송 계층을 교체해야 합니다.

## 보안

- 브라우저의 Kakao REST API 직접 호출을 비활성화했습니다.
- `js/config.js`에는 API 키가 아니라 `NEARBY_PROXY_URL`만 설정합니다.
- `server/kakao-nearby-proxy.mjs`에 입력 검증, 허용 Origin, 간단한 요청 제한, API 키 환경변수 처리를 포함했습니다.

## 아직 구현되지 않은 항목

다음 항목은 Firebase 프로젝트 정보와 배포 환경이 필요하므로 이번 정적 프로젝트 수정에는 포함하지 않았습니다.

- Firebase Auth 로그인
- 익명 사용자와 로그인 계정 데이터 병합
- Firestore 동기화
- 앱 내 계정 삭제
- 실제 분석 플랫폼 전송
- 운영용 프록시 배포와 HTTPS
- 앱스토어 네이티브 패키징
