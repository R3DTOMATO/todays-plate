# 신고 검토 관리자 도구

신고는 Firestore 규칙상 **클라이언트가 읽을 수 없습니다**(신고자 보호).
따라서 검토는 서비스 계정 권한이 있는 서버에서만 가능합니다.

- API: `server/admin-reports.mjs` (기존 Railway 서버에 라우트로 연결됨)
- 화면: `admin/reports.html` (Firebase Hosting에 함께 배포)

---

## 1. 서비스 계정 키 발급

Firebase 콘솔 → 프로젝트 설정 → **서비스 계정** → 새 비공개 키 생성
→ JSON 파일이 다운로드됩니다.

**이 파일은 절대 저장소에 커밋하지 마세요.** Firestore 보안 규칙을 전부 우회하는 키입니다.

JSON에서 세 값을 씁니다:
```json
{
  "project_id": "todays-plate",
  "client_email": "firebase-adminsdk-xxxxx@todays-plate.iam.gserviceaccount.com",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
}
```

---

## 2. 관리자 uid 확인

본인 계정의 uid가 필요합니다. Firebase 콘솔 → Authentication → 사용자 목록에서
관리자로 쓸 계정의 **사용자 UID**를 복사하세요.

앱에 한 번도 로그인하지 않았다면 계정이 없으니, 먼저 앱에서 구글 로그인을 한 번 하세요.

---

## 3. Railway 환경변수 설정

Railway 대시보드 → 프로젝트 → Variables

| 변수 | 값 |
|---|---|
| `FIREBASE_PROJECT_ID` | `todays-plate` |
| `FIREBASE_CLIENT_EMAIL` | JSON의 `client_email` |
| `FIREBASE_PRIVATE_KEY` | JSON의 `private_key` 전체 |
| `ADMIN_UIDS` | 관리자 uid (쉼표로 여러 개) |

**`FIREBASE_PRIVATE_KEY` 주의:** 줄바꿈이 `\n` 문자로 들어갑니다.
JSON에서 복사한 그대로 붙여넣으면 되고, 서버가 실제 줄바꿈으로 복원합니다.

설정 후 확인:
```
https://todays-plate.up.railway.app/api/health
```
→ `"adminConfigured": true` 가 나와야 합니다.

---

## 4. 관리자 페이지 설정

`admin/reports.html` 상단의 두 곳을 채웁니다.

```javascript
const FIREBASE_CONFIG = { ... };   // js/config.js와 같은 값
const API_BASE = 'https://todays-plate.up.railway.app';
```

배포:
```bash
firebase deploy --only hosting
```

접속: `https://todays-plate.web.app/admin/reports.html`

---

## 5. 동작 방식

```
관리자 → 구글 로그인 → Firebase ID 토큰 발급
      → Railway 서버로 토큰 전송
      → 서버가 구글 공개키로 서명 검증
      → uid가 ADMIN_UIDS에 있는지 확인
      → 통과하면 서비스 계정 권한으로 Firestore 조회
```

**별도 관리자 비밀번호를 두지 않았습니다.** 자격증명을 하나 더 만들면
관리 대상과 유출 지점이 함께 늘기 때문입니다. 앱과 같은 구글 계정을 쓰되,
서버가 uid 목록으로 권한을 판단합니다.

페이지 자체는 공개 URL에 있지만 데이터는 토큰 없이 볼 수 없습니다.
`noindex` 메타 태그로 검색 노출은 막아 두었습니다.

---

## 6. 사용법

| 탭 | 내용 |
|---|---|
| 대기 중 | 아직 처리하지 않은 신고 |
| 조치함 | 숨김 처리한 것 |
| 검토함 | 문제 없다고 판단한 것 |

각 신고에는 **신고 사유, 대상 원문(사진 포함), 누적 신고 건수**가 함께 표시됩니다.
같은 대상이 여러 번 신고되면 카드 테두리가 강조됩니다.

**조치**
- **숨기기** — `status`를 `hidden`으로 바꿉니다. **삭제하지 않습니다.**
  오판이었을 때 복원할 수 있어야 하고, 분쟁 시 기록이 남아야 하기 때문입니다.
- **문제 없음** — 신고만 처리 완료로 표시하고 게시물은 그대로 둡니다.
- **복원** — 숨긴 것을 다시 보이게 합니다.

---

## 7. 보안 점검

- [ ] 서비스 계정 JSON 파일이 저장소에 없는지 (`git status`로 확인)
- [ ] `.gitignore`에 `*.json` 키 파일 패턴이 있는지
- [ ] `ADMIN_UIDS`에 필요한 사람만 있는지
- [ ] Railway `ALLOWED_ORIGINS`에 배포 도메인이 포함되어 있는지
      (없으면 관리자 페이지에서 CORS 오류가 납니다)

---

## 8. 남은 개선 (선택)

- **신고 누적 자동 숨김** — 현재는 수동입니다. Cloud Functions로
  `reportCount >= 3`이면 자동으로 `hidden` 처리하면 대응이 빨라집니다.
- **사용자 정지** — 지금은 게시물 단위 조치만 있습니다.
  반복 위반자를 계정 단위로 막으려면 별도 설계가 필요합니다.
- **조치 이력** — 누가 언제 무엇을 했는지는 `reports` 문서의
  `reviewedBy`/`reviewedAt`에 남지만, 별도 감사 로그는 없습니다.
