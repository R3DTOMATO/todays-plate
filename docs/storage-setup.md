# 사진 저장소(Storage) 설정 가이드

피드에 공개하는 사진을 Firebase Storage에 올리기 위한 설정입니다.

---

## 왜 필요한가

기존 식사 기록은 사진을 base64 dataURL로 **`localStorage`에만** 저장합니다.
개인 기록으로는 충분하지만 피드에는 쓸 수 없습니다.

| 문제 | 설명 |
|---|---|
| 공유 불가 | 다른 사람 기기에서 볼 수 없다 |
| 문서 크기 한도 | Firestore 문서는 1MB 제한. base64는 원본보다 약 33% 커진다 |
| 느린 피드 | CDN 캐싱이 안 되어 스크롤할 때마다 전부 새로 받는다 |

따라서 **피드에 공개하는 사진만** Storage로 올리고 문서에는 URL만 남깁니다.
공개하지 않는 기록은 기존처럼 `localStorage`에 그대로 둡니다.

---

## 1. Storage 활성화

Firebase 콘솔 → **Storage** → 시작하기

- 위치는 Firestore와 **같은 리전**으로 맞추세요 (다르면 지연이 늘고 비용이 붙습니다)
- 한국 서비스라면 `asia-northeast3`(서울)가 적합합니다
- **위치는 나중에 바꿀 수 없습니다**

---

## 2. 보안 규칙 배포

규칙 파일: 저장소 루트의 `storage.rules`

```bash
firebase deploy --only storage
```

또는 콘솔 → Storage → Rules 탭에 붙여넣고 게시.

**규칙 없이 두면 버킷이 열려 있어 누구나 파일을 올리고 지울 수 있습니다.**
Firestore 규칙과 별개이므로 따로 배포해야 합니다.

### 규칙이 막는 것

| 항목 | 동작 |
|---|---|
| 비로그인 업로드 | 차단 |
| 남의 폴더에 업로드 | 차단 (경로에 uid 포함) |
| 800KB 초과 파일 | 차단 |
| 이미지가 아닌 파일 | 차단 (contentType 검증) |
| 덮어쓰기 | 차단 (CDN 캐시 불일치 방지) |
| `feedPhotos/` 외 경로 | 전면 차단 |

클라이언트 압축은 개발자 도구로 우회할 수 있으므로 규칙에서 다시 검증합니다.

---

## 3. CORS 설정 (필요한 경우)

`getDownloadURL()`로 받은 URL은 CORS 설정 없이 `<img>`에 바로 쓸 수 있습니다.
다만 canvas로 이미지를 다시 가공하는 등 JS에서 직접 fetch해야 한다면 설정이 필요합니다.

```bash
# cors.json
[{ "origin": ["https://todays-plate.web.app"], "method": ["GET"], "maxAgeSeconds": 3600 }]

gsutil cors set cors.json gs://todays-plate.firebasestorage.app
```

현재 구현은 `<img src>`만 쓰므로 **지금은 필요 없습니다.**

---

## 4. 사용법

```javascript
import { uploadFeedPhoto, deleteFeedPhoto, describeUploadError } from './photo-storage.js';

// 기존 압축 결과(dataURL)를 그대로 넘긴다
try {
  const { url, path } = await uploadFeedPhoto(pendingMealPhoto);
  // url  → posts 문서의 photoUrl 에 저장
  // path → 나중에 삭제할 때 필요하므로 함께 저장
} catch (error) {
  showToast(describeUploadError(error));
  // 사진 업로드가 실패해도 기록 저장 자체는 계속 진행한다
}
```

`app.js`의 `compressMealPhoto()`가 이미 1280px·WebP·520KB로 압축하므로
**압축 로직을 중복 구현하지 않습니다.** 그 결과를 받아서 올리기만 합니다.

---

## 5. 비용

무료 할당량(Spark 요금제) 기준:

| 항목 | 무료 한도 |
|---|---|
| 저장 용량 | 5GB |
| 다운로드 | 1GB/일 |
| 업로드 작업 | 20,000회/일 |

사진 1장을 약 400KB로 잡으면 5GB는 **약 13,000장**입니다.
베타 규모(50명)에서는 여유롭지만, 피드가 커지면 다운로드 한도가 먼저 걸립니다.
그 시점에는 썸네일 생성(Cloud Functions)이나 Blaze 요금제 전환을 검토하세요.

---

## 6. 다음 작업

이 모듈은 업로드 수단만 제공합니다. 실제 피드가 동작하려면:

- [ ] 식사 기록 모달에 "피드에 공개" 토글 추가
- [ ] 공개 시 `uploadFeedPhoto()` 호출 → `posts` 문서 생성
- [ ] `posts` Firestore 규칙 추가 (`docs/firestore-rules-setup.md` 참고)
- [ ] 피드 화면 구현 (`rankFeed()` 연결)
- [ ] 공개 취소 시 `deleteFeedPhoto()`로 사진 정리
