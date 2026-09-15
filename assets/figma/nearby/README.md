# 주변 식당 화면 에셋 (Figma 172:472)

## 상태

| 파일 | 상태 |
|---|---|
| `map-art.svg` | ⚠️ 기존 프로젝트 에셋(393×210) 재사용 중. 디자인은 **393×390**이라 늘어나 보입니다 |
| `icon-search.svg` | ❌ 자리표시 |
| `icon-filter.svg` | ❌ 자리표시 |
| `current-location.svg` | ❌ 자리표시 |

## 다운로드

```bash
cd assets/figma/nearby

curl -L -o map-art.svg          "https://www.figma.com/api/mcp/asset/fff6416e-7619-4747-af4b-14e30e313aad.svg"
curl -L -o current-location.svg "https://www.figma.com/api/mcp/asset/9e59e61c-cf82-4c37-98e9-c1afd3ce2e08.svg"
curl -L -o icon-search.svg      "https://www.figma.com/api/mcp/asset/d58546ac-153d-4a02-abab-514fc91edcee.svg"
curl -L -o icon-filter.svg      "https://www.figma.com/api/mcp/asset/2cbae2f3-a003-41de-abda-314599fac374.svg"
```

URL은 발급 후 약 7일이면 만료됩니다. 만료 시 Figma에서 직접 Export하세요.

| Figma 레이어 | 파일명 | 크기 |
|---|---|---|
| Map Artwork | `map-art.svg` | 393×390 |
| Current Location | `current-location.svg` | 24×24 |
| Icon / Search | `icon-search.svg` | 20×20 |
| Icon / Filter | `icon-filter.svg` | 20×20 |

확인: `grep -l PLACEHOLDER assets/figma/nearby/*.svg` → 출력 없으면 정상

---

## 디자인과 실제 데이터가 다른 부분

디자인에는 다음이 있지만 **네이버 지역 검색 API는 제공하지 않습니다.**
없는 값을 지어내면 사용자를 오도하므로, 실제로 아는 값으로 대체했습니다.

| 디자인 | 대체 | 이유 |
|---|---|---|
| ★ 4.6 · 리뷰 312 | 카테고리 · 직선 거리 | 평점·리뷰 수 미제공 |
| 영업 중 / 영업 중 8곳 | 상호 일치 / 메뉴 검색 (검증 tier) | 영업 상태 미제공 |
| 9,900원 · 마커의 "9.9천" | 주소 / 마커는 거리(270m) | 가격 미제공 |
| 취향 96% | 적합도 라벨(fitLabel) | 실제 계산되는 값 사용 |

메뉴·가격·영업 상태는 이 검색 API에서 제공하지 않습니다. 추가 정보는 별도로 확인한 데이터가 필요합니다.

---

## 네이버 지도 연결

지도 모듈은 `js/naver-map.js`입니다. 키 발급과 배포 설정은 [네이버 전환 안내](../../../docs/naver-maps-migration.md)를 참고하세요.
