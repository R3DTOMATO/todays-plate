# 네이버 지도·식당 검색 전환

## 변경 범위

지도 표시, 식당 검색, 주소·역 이름 검색, 식당 선택 후 외부 지도 열기를 네이버로 통일한다. 기존 추천·로그인·기록 정책은 이 변경의 대상에 포함하지 않는다.

- 브라우저 지도: `js/naver-map.js` → 네이버 Maps JavaScript v3
- 식당 검색: `/api/nearby` → 네이버 지역 검색
- 주소·역 검색: `/api/resolve-location` → 네이버 Geocoding, 주소 검색 결과가 없으면 지역 검색
- API 서버: `server/nearby-proxy.mjs`
- 기존 `server/kakao-nearby-proxy.mjs`는 이전 배포 시작 명령을 위한 호환 진입점이며 네이버 서버만 실행한다.
- 분석·피드백·관리자·계정 삭제 API는 같은 서버에서 유지한다.

## 필요한 키

**서로 다른 서비스에서 두 세트의 키를 발급해야 한다.** 두 Client Secret은 서버 환경변수에만 저장한다.

| 설정 | 발급 위치 | 저장 위치 |
|---|---|---|
| `NAVER_SEARCH_CLIENT_ID` | NAVER Developers 애플리케이션 | Railway Variables |
| `NAVER_SEARCH_CLIENT_SECRET` | 같은 애플리케이션 | Railway Variables |
| `NAVER_MAPS_CLIENT_ID` | Naver Cloud Maps 애플리케이션 | Railway Variables와 `js/config.js`의 같은 이름 항목 |
| `NAVER_MAPS_CLIENT_SECRET` | 같은 Maps 애플리케이션 | Railway Variables |

1. NAVER Developers에서 애플리케이션의 **검색** API를 활성화한다.
2. Naver Cloud Maps에서 **Web Dynamic Map, Geocoding, Reverse Geocoding**을 활성화한다.
3. Maps 애플리케이션의 Web 서비스 URL에 실제 사용 도메인을 등록한다. 현재 프로젝트의 기본 도메인은 `https://todays-plate.web.app`과 `https://todays-plate.firebaseapp.com`이다. 로컬 개발 도메인은 테스트할 때만 추가한다.
4. `js/config.js`의 `NAVER_MAPS_CLIENT_ID`에는 Maps의 공개 Client ID만 입력한다. Search Client ID와 혼동하지 않는다. 신규 Maps SDK의 URL 파라미터는 `ncpKeyId`이다.
5. `ALLOWED_ORIGINS`, `DATA_DIR`, Firebase 관리자 설정 등 기존 서버 환경변수는 유지한다.

이 변경은 실제 키를 포함하지 않는다. 키 등록과 활성화 전에는 실서비스로 전환하지 않는다.

## 검색 동작과 한계

네이버 지역 검색 API는 요청당 최대 5개 결과, `start=1`만 지원하며 좌표·반경 검색 파라미터를 제공하지 않는다.

서버는 다음 순서로 동작한다.

1. 검색 기준 좌표를 Reverse Geocoding으로 법정동·행정동·시군구 이름으로 변환한다.
2. 중복되지 않는 지역명과 사용자 검색어를 결합한다. 요청당 지역 검색은 최대 3회이며, 각 호출은 `display=5`, `start=1`을 지킨다.
3. 반환된 WGS84 좌표를 정규화하고 검색 기준 좌표와의 직선거리를 계산한다.
4. 음식점·카페만 남기고, 같은 상호·주소·좌표의 결과와 선택 반경 밖 결과를 제거한다.
5. 기존 화면이 사용하는 장소 형식으로 최대 15개를 반환한다. 이 형식의 `FD6`·`CE7`은 앱 호환 분류이며 네이버 응답 원본 코드가 아니다.

추천 메뉴 검색에서 별칭을 조회할 때는 같은 검색어의 결과를 한 검색 작업 안에서 재사용한다. 반경과 정렬 변경으로 동일한 네이버 검색을 반복하거나 존재하지 않는 페이지를 요청하지 않는다.

이 방식은 네이버 검색에 반환된 후보를 거리로 걸러내는 방식이다. **주변 전체 식당을 열거하거나 네이버 지도 앱과 동일한 결과·순서를 보장하지 않는다.** 행정구역 경계의 이웃 지역 식당이나 검색 순위 밖 식당은 누락될 수 있다.

메뉴판·가격·영업 상태·품절·배달 가능 여부는 해당 API에서 제공하지 않는다. 상호나 검색어 일치는 판매 확인으로 처리하지 않는다. 직선거리를 실제 도보 소요 시간으로 표시하지 않는다. 결과가 부족하면 네이버 지도 검색 링크를 제공한다.

## 실패 처리

- API 키 누락·인증 오류·호출 한도·시간 초과는 검색 실패로 처리한다. 성공한 0건 결과와 구분한다.
- 지도 키 누락·SDK 로드 실패 시 식당 목록과 네이버 링크를 유지한다. 일러스트 위에 임의의 식당 위치를 표시하지 않는다.
- 새 검색이 완료되면 이전 지도 마커와 클릭 핸들러를 제거한다.
- 위치 권한을 거부해도 지역·주소·역 이름을 직접 입력할 수 있다. 추천 메뉴가 없는 상태와 직접 검색어가 있는 상태도 지원한다.
- 식당 링크는 네이버 지도 도메인으로 제한한다. 외부 업체 URL을 신뢰해 임의의 URL로 이동하지 않는다.
- `/api/health`의 `naverSearchConfigured`, `naverMapsConfigured`, `naverConfigured`는 키 존재 여부다. 실제 API 인증 성공 여부를 뜻하지 않는다.

## 적용과 확인

1. 위 키·API 활성화·허용 도메인을 설정한다.
2. 로컬에서는 `.env.example`을 복사한 `.env`를 채우고 `node --env-file=.env server/nearby-proxy.mjs`로 실행할 수 있다. `.env`는 커밋하지 않는다.
3. 새 백엔드와 프런트를 같은 릴리스로 적용한다. 카카오 응답을 반환하는 이전 백엔드에 새 프런트만 연결하면 화면은 연결 오류를 표시한다.
4. `/api/health`에서 `placesProvider: "naver"`, `naverConfigured: true`를 확인한다.
5. 실제 키로 현재 위치, 주소 입력, 역 입력, 메뉴 검색, 식당 선택 후 네이버 이동, 모바일 지도 표시를 확인한다. 알려진 식당의 누락 사례도 다시 비교한다.

자동 검증:

```bash
npm run check
npm run test:naver
npm run test:analytics
npm run validate:v4.6
npm run validate:v4.9
```

네이버 단위 테스트는 가짜 API/SDK 응답을 사용하며 실제 계정과 네트워크 호출이 없다. 별도 `test:responsive`의 지도 모의 객체도 네이버 SDK 형식으로 갱신했다. 이번 작업에서는 브라우저의 로컬 주소 접근이 차단되어 실제 화면 검증을 수행하지 못했으며, 실제 키도 없어 네이버 API·지도 타일·허용 도메인 인증은 검증하지 않았다.

## 공식 참고 자료

- [네이버 지역 검색 API](https://developers.naver.com/docs/serviceapi/search/local/local.md)
- [Maps API 개요](https://api.ncloud-docs.com/docs/application-maps-overview)
- [Geocoding](https://api.ncloud-docs.com/docs/application-maps-geocoding)
- [Reverse Geocoding](https://api.ncloud-docs.com/docs/application-maps-reversegeocoding)
- [Maps JavaScript v3 시작하기](https://navermaps.github.io/maps.js.ncp/docs/tutorial-2-Getting-Started.html)
