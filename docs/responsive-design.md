# 모바일·태블릿·PC 화면

디자인 기준: [Today’s Plate · Screen](https://www.figma.com/design/iTjCLmEbFfmjvGHYKbrvDp/Today-s-Plate?node-id=1-3).
모바일 프레임의 색상·간격·카드 구성에 맞추고, 기존 웹앱에 넓은 화면 배치를 추가했습니다.

| 화면 폭 | 탐색 메뉴 | 콘텐츠 배치 |
| --- | --- | --- |
| 320–767px | 하단 아이콘 메뉴 | 한 열, 지도·레시피 시트가 이미지 아래에 겹침 |
| 768–1023px | 왼쪽 88px 메뉴 | 넓은 선택 카드, 로그인·입맛 설정 두 열 |
| 1024–1199px | 왼쪽 88px 메뉴 | 지도·목록 및 레시피 이미지·본문 두 열 |
| 1200px 이상 | 왼쪽 232px 메뉴 | 홈 추천·보조 행동 두 열, 질문·선택지 두 열 |

본문은 화면별 최대 1000–1240px로 제한합니다. 설문 중에는 탐색 메뉴를 숨기고,
모바일 하단 버튼과 넓은 화면 본문 버튼을 구분합니다. 로그인·계정별 입맛 저장,
추천 점수·예산 선택값, 실제 메뉴 사진은 기존 동작을 유지합니다.
홈의 장식 그림·예시 조건 칩과 결과의 고정된 ‘18초’ 문구는 제거했습니다.

`css/responsive.css`는 기존 스타일 뒤에서 반응형 배치를 담당합니다.
동일한 탐색 버튼을 CSS로 재배치하므로 모바일·PC 간 이벤트가 중복되지 않습니다.
지도 캔버스는 ResizeObserver로 크기 변화를 감지하고 현재 중심을 유지합니다.
새 아이콘을 임의 제작하지 않고 기존 로고·탐색·레시피·지도 SVG를 재사용합니다.

## 검증

```sh
npm run check
node --check js/kakao-map.js
python -m http.server 9154
```

다른 터미널에서 Playwright가 설치된 Python으로 실행합니다.

```sh
python scripts/test-entry-flow.py
python scripts/test-responsive.py
```

필요 시 `PLATE_BROWSER`에 Chromium 실행 파일, `PLATE_TEST_URL`에 서버 주소,
`PLATE_SCREENSHOTS`에 스크린샷 폴더를 지정합니다. `PLATE_FONT_DIR`에는
`@fontsource/noto-sans-kr` 폴더를 지정해 네트워크 없이 한글 글꼴을 로드할 수 있습니다.

반응형 검증은 320·393·768·1024·1440px에서 로그인·홈·추천·결과·레시피·주변·탐색·기록·프로필·그룹 투표·입맛 설정을 확인합니다.
인증 창, 화면 간 이동, 요리 단계 완료, 지도 회전 시 중심 유지도 확인합니다.
Firebase와 지도 SDK는 테스트 대역입니다. 실제 지도 타일·위치 권한,
iPad Safari·Android 브라우저의 실기기 동작은 별도 배포 전 확인이 필요합니다.

이 변경은 웹 반응형 화면입니다. Figma 파일에 태블릿·PC 프레임을 추가하거나
네이티브 앱·푸시 알림을 구현하는 변경은 포함하지 않습니다.
