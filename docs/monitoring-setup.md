# 오류 모니터링 설정 (Sentry)

지금은 사용자가 앱에서 오류를 겪어도 직접 말해주지 않으면 알 수 없습니다.
베타 테스터를 받기 전에 오류를 자동으로 수집할 수단이 필요합니다.

---

## 1. 가입 (5분)

1. https://sentry.io/signup/ 접속 → 가입 (GitHub 계정으로 가능)
2. 조직 이름 입력 (예: `todays-plate`)
3. 플랫폼 선택 화면에서 **Browser JavaScript** 선택
   - React나 다른 프레임워크가 아니라 순수 JavaScript입니다
4. 프로젝트 이름 입력 (예: `todays-plate-web`)
5. 알림 받을 이메일 설정

### 무료 플랜
- 오류 5,000건/월, 성능 데이터 10,000건/월
- 데이터 보관 30일
- 베타 규모(50명)에서는 충분합니다

---

## 2. DSN 복사

프로젝트 생성 직후 화면에 표시됩니다. 놓쳤다면:

**Settings → Projects → (프로젝트 선택) → Client Keys (DSN)**

이런 형태입니다:
```
https://abc123def456@o1234567.ingest.sentry.io/7654321
```

`js/config.js`의 `SENTRY_DSN`에 붙여넣습니다.

```javascript
SENTRY_DSN: 'https://abc123def456@o1234567.ingest.sentry.io/7654321'
```

**DSN은 비밀값이 아닙니다.** 브라우저 코드에 들어가야 하는 값이며,
저장소에 커밋해도 됩니다. (Firebase API 키와 같은 성격입니다)

비워 두면 오류 수집이 비활성화되고 앱은 그대로 동작합니다.

---

## 3. 배포

```bash
firebase deploy --only hosting
```

`firebase.json`의 CSP에 `browser.sentry-cdn.com`을 추가해 두었습니다.
**이게 없으면 Sentry 스크립트가 CSP에 막혀 로드되지 않습니다.**

---

## 4. 동작 확인

배포된 사이트에서 개발자 도구 콘솔을 열고:

```javascript
// 동의 상태 확인
localStorage.getItem('todaysplate_analytics_consent_v1')   // 'true' 여야 함

// 테스트 오류 발생
window.appMonitoring.report(new Error('테스트 오류입니다'));
```

Sentry 대시보드 **Issues** 탭에 1~2분 안에 나타나면 정상입니다.

콘솔에 `[monitoring] 오류 수집을 시작했습니다.`가 찍히는지도 확인하세요.

---

## 5. 개인정보 보호 설계

개인정보처리방침에 "위치·사진·메모를 수집하지 않는다"고 적었습니다.
오류 리포트가 그 약속을 깨면 안 되므로, 전송 직전에 한 번 더 걸러냅니다.

| 항목 | 처리 |
|---|---|
| 이메일 주소 | `[email]`로 치환 |
| 좌표 | `[coords]`로 치환 |
| URL의 lat/lng/vote/token | `[redacted]`로 치환 |
| 사진(data URL) | `[image]`로 치환 |
| photo·memo·address 등 키 | 값 통째로 `[redacted]` |
| 사용자 IP | 전송 안 함 (`sendDefaultPii: false`) |
| 입력 내용(ui.input) | 브레드크럼에서 제외 |
| 쿠키·헤더 | 전송 안 함 |

**분석 수집에 동의하지 않은 사용자는 오류도 수집하지 않습니다.**
오류 리포트에도 이용 맥락이 담기기 때문입니다.
동의를 나중에 누르면 그 시점부터 수집이 시작됩니다.

---

## 6. 걸러내는 오류

잡음이 많으면 진짜 오류를 놓칩니다. 다음은 무시합니다.

- `ResizeObserver loop` — 브라우저 렌더링 잡음
- `Failed to fetch`, `NetworkError` — 사용자 네트워크 끊김
- `AbortError` — 사용자가 취소한 요청
- 브라우저 확장 프로그램이 던진 오류

너무 많이 걸러낸다 싶으면 `js/monitoring.js`의 `IGNORED` 배열을 조정하세요.

---

## 7. 알림 설정 (권장)

**Settings → Alerts → Create Alert Rule**

베타 기간에 유용한 설정:
- 새로운 종류의 오류가 발생하면 즉시 이메일
- 같은 오류가 1시간에 10건 이상이면 알림

기본값은 모든 오류에 알림이 오도록 되어 있어 금방 피로해집니다.

---

## 8. 릴리스 추적

`js/monitoring.js`의 `RELEASE` 값을 버전마다 올리면
어느 배포에서 오류가 늘었는지 볼 수 있습니다.

```javascript
const RELEASE = 'todays-plate@6.0.0';
```

배포할 때 이 값을 갱신하는 것을 잊지 마세요.
