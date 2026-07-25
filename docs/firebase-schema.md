# Firebase 저장 구조 설계

## 컬렉션 구조

```text
users/{uid}
  displayName: string
  createdAt: timestamp
  updatedAt: timestamp

users/{uid}/profile/settings
  preferredTypes: string[]
  avoidIngredients: string[]
  dietRestrictions: string[]
  defaultWeight: string
  budget: number | null
  preferredSituations: string[]

users/{uid}/menuStats/{menuName}
  chosen: number
  rejected: number
  viewed: number
  lastChosenAt: timestamp | null
  lastRejectedAt: timestamp | null

users/{uid}/bannedMenus/{menuName}
  name: string
  reason: string
  createdAt: timestamp

users/{uid}/diary/{yyyyMMdd}_{mealTime}
  date: string
  mealTime: string
  menuName: string
  menuType: string
  kcal: number
  createdAt: timestamp

users/{uid}/favorites/{menuName}
  name: string
  type: string
  createdAt: timestamp

users/{uid}/feedback/{feedbackId}
  menuName: string
  action: 'like' | 'neutral' | 'dislike' | 'ate' | 'ban'
  answers: object
  createdAt: timestamp
```

## 설계 원칙

1. 메뉴 원본 DB는 정적 JSON으로 유지합니다.
2. 사용자 개인화 데이터만 Firebase에 저장합니다.
3. 추천 계산은 MVP 단계에서는 클라이언트에서 처리하고, 사용자가 늘면 Cloud Functions로 이전합니다.
4. 알레르기/식단 제한은 추천 후보 제외 조건이므로 `profile/settings`에 별도로 저장합니다.
5. `menuStats`는 메뉴명 기준으로 시작하되, 실제 서비스에서는 menuId 기준으로 바꾸는 것이 안전합니다.
