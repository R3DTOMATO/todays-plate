# 내 입맛 화면 에셋 (Figma 136:139)

| 파일 | 상태 |
|---|---|
| `hero-accent.svg` | ❌ 자리표시 (168×168) |
| 마스코트 배지 | `assets/figma/menu-detail/taste-badge-spicy-korean.svg` 재사용 |

## 다운로드

```bash
cd assets/figma/taste
curl -L -o hero-accent.svg "https://www.figma.com/api/mcp/asset/5ed20c4e-d0c7-4ee4-90de-b5cd46ceca87.svg"
```

URL은 발급 후 약 7일이면 만료됩니다.
만료 시 Figma 노드 `136:139`의 **Hero Accent** 레이어를 168×168 SVG로 Export 하세요.

확인: `grep -l PLACEHOLDER assets/figma/taste/*.svg` → 출력 없으면 정상

---

## 디자인과 실제 데이터

디자인의 '매콤한 한식 탐험가 / 86% / 78% / 66%'는 더미 값입니다.
실제 식사 기록에서 계산합니다.

| 항목 | 계산 방식 |
|---|---|
| 아키타입 | 최근 30번의 최다 음식 종류 + 매운맛·든든함·탐색 비율 조합 |
| 첫 번째 지표 | 최다 음식 종류의 비율 |
| 매운맛 | spicy(0~3) 평균을 100분율로 |
| 든든함 | 든든 1.0 / 중간 0.5 가중 평균 |
| 칩 | 국물 비율, 탐색 비율, 평균 지출대, 제외 재료 수 |
| 인사이트 | 다음 추천에 반영될 조건을 문장으로 |

**기록이 5번 미만이면 아키타입을 확정하지 않습니다.**
데이터가 적을 때 단정하면 틀린 취향이 고착됩니다.
