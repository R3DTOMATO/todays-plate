# 로그인 설정 가이드

구글 / 애플 / 이메일+비밀번호 로그인을 사용합니다.
**게이트 방식**이므로 메뉴 추천·검색·기록은 로그인 없이 그대로 쓸 수 있고,
그룹 투표와 소셜 피드에서만 로그인을 요구합니다.

---

## 1. 웹 앱 설정값 채우기

Firebase 콘솔 → 프로젝트 설정(톱니) → 내 앱 → 웹 앱(`</>`)
→ "SDK 설정 및 구성" → **구성** 선택 → `firebaseConfig` 값 복사

`js/config.js`의 `window.FIREBASE_CONFIG`에 붙여넣습니다.

```javascript
window.FIREBASE_CONFIG = {
  apiKey: 'AIza...',
  authDomain: '프로젝트.firebaseapp.com',
  projectId: '프로젝트',
  storageBucket: '프로젝트.appspot.com',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:abcdef'
};
```

이 값들은 비밀값이 아니며 저장소에 커밋해도 됩니다.
실제 접근 제어는 Firestore 보안 규칙이 담당합니다.

**비워두면** 로그인 UI가 자동으로 숨겨지고 기존 앱은 그대로 동작합니다.

---

## 2. 로그인 수단 활성화

Authentication → Sign-in method 에서 아래 3개를 사용 설정합니다.

### 이메일/비밀번호
그냥 사용 설정하면 됩니다. (이메일 링크 로그인은 꺼둬도 됩니다)

### Google
사용 설정 후 프로젝트 지원 이메일만 선택하면 됩니다. 추가 설정 없음.

### Apple
**Apple Developer 계정(연 $99)이 필요합니다.**

1. Apple Developer → Certificates, Identifiers & Profiles
2. Identifiers에서 App ID 생성, "Sign in with Apple" 활성화
3. Services ID 생성 → Sign in with Apple 설정
   - Return URL에 `https://<프로젝트>.firebaseapp.com/__/auth/handler` 입력
4. Keys에서 Sign in with Apple 키 생성 → `.p8` 파일 다운로드
5. Firebase 콘솔 Apple 설정에 Services ID, Team ID, Key ID, 키 내용 입력

**참고:** iOS 앱에 다른 소셜 로그인(Google)이 있으면
App Store 심사에서 Apple 로그인이 **필수**입니다. 웹만 배포할 때는 선택입니다.

---

## 3. 승인된 도메인 등록

Authentication → Settings → 승인된 도메인

배포 도메인을 추가합니다. 없으면 로그인 팝업이 차단됩니다.

- `localhost` (기본 포함, 개발용)
- Firebase Hosting 도메인 (기본 포함)
- 커스텀 도메인을 쓴다면 직접 추가

---

## 4. Firestore 보안 규칙

`users` 컬렉션 규칙을 추가합니다. 그룹 투표 규칙은
`docs/group-vote-design.md` 3번 섹션을 참고하세요.

```javascript
match /users/{userId} {
  // 표시 이름·프로필 사진은 피드에서 보여야 하므로 로그인 사용자에게 공개
  allow read: if request.auth != null;
  // 본인만 수정 가능
  allow create, update: if request.auth != null && request.auth.uid == userId;
  allow delete: if false;
}
```

---

## 5. 동작 방식

### 게이트
`js/auth.js`의 `requireAuth(reason)`가 유일한 관문입니다.
계정이 필요한 기능은 이 함수만 호출하면 됩니다.

```javascript
import { requireAuth } from './auth.js';

const user = await requireAuth('그룹 투표는 로그인이 필요해요');
if (!user) return;   // 사용자가 취소함
```

로그인되어 있으면 즉시 사용자를 반환하고,
아니면 로그인 모달을 띄운 뒤 결과를 기다립니다.

### 팝업 차단 대응
카카오톡 인앱 브라우저 등에서 팝업이 막히면
자동으로 리다이렉트 방식으로 전환됩니다. 별도 처리가 필요 없습니다.

### 사용자 문서
로그인 시 `users/{uid}` 문서가 자동 생성됩니다.
**이메일은 저장하지 않습니다** — Auth가 이미 보관하고 있고,
Firestore에 두면 다른 사용자에게 노출될 위험이 있기 때문입니다.

---

## 6. 남은 작업

- [ ] 이용약관 / 개인정보처리방침 실제 페이지 작성
      (로그인 모달의 동의 문구가 이 문서를 가리켜야 합니다)
- [ ] 계정 삭제(탈퇴) UI 연결 — `deleteAccount()`는 구현되어 있으나
      프로필 화면에 버튼이 아직 없습니다. **개인정보보호법과 App Store 심사 모두 요구하는 기능입니다.**
- [ ] 소셜 피드 도입 시 신고·차단 기능 (`docs/social-feed-design.md` 4번)
