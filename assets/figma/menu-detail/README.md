# 메뉴 상세 화면 에셋 다운로드 (필수)

`assets/figma/menu-detail/` 안의 SVG는 **레이아웃 확인용 자리표시(PLACEHOLDER)** 입니다.
아래 명령으로 실제 Figma 에셋을 받아 덮어써야 화면이 완성됩니다.

> **URL은 발급 후 약 7일 뒤 만료됩니다.** 만료되면 Figma에서 다시 내보내야 합니다.

---

## 다운로드

저장소 루트에서 실행하세요.

### macOS / Linux / Git Bash

```bash
cd assets/figma/menu-detail

curl -L -o icon-bookmark.svg              "https://www.figma.com/api/mcp/asset/2908bec7-758d-4cb7-beb0-c2f1a7ea6c86.svg"
curl -L -o mascot-base.svg                "https://www.figma.com/api/mcp/asset/1c76d853-3086-4ace-85ee-8e446ca49c16.svg"
curl -L -o taste-badge-spicy-korean.svg   "https://www.figma.com/api/mcp/asset/7122c394-7aa1-490f-a6e4-8b79ecefc98b.svg"
curl -L -o halo.svg                       "https://www.figma.com/api/mcp/asset/4455b9c5-724b-4202-bb49-a30a8c2ff17f.svg"
curl -L -o decision-plate.svg             "https://www.figma.com/api/mcp/asset/51390d25-227d-4ce3-9e5c-40017265c87f.svg"
curl -L -o bowl.svg                       "https://www.figma.com/api/mcp/asset/c8bc3f93-7b3e-42d3-8da0-362b268514bd.svg"
curl -L -o food-accent-1.svg              "https://www.figma.com/api/mcp/asset/4075b9c0-fd94-4312-9005-53c7554f869b.svg"
curl -L -o food-accent-2.svg              "https://www.figma.com/api/mcp/asset/1bfa5ab6-d8fd-4d28-ab95-ce69e4945cfe.svg"
curl -L -o food-accent-3.svg              "https://www.figma.com/api/mcp/asset/bc84bbc8-8951-47ea-8fd0-52862f6ad872.svg"
curl -L -o food-accent-4.svg              "https://www.figma.com/api/mcp/asset/e9a29642-1240-4f71-9529-969eee13056f.svg"
```

### PowerShell

```powershell
cd assets\figma\menu-detail

$assets = @{
  "icon-bookmark"            = "2908bec7-758d-4cb7-beb0-c2f1a7ea6c86"
  "mascot-base"              = "1c76d853-3086-4ace-85ee-8e446ca49c16"
  "taste-badge-spicy-korean" = "7122c394-7aa1-490f-a6e4-8b79ecefc98b"
  "halo"                     = "4455b9c5-724b-4202-bb49-a30a8c2ff17f"
  "decision-plate"           = "51390d25-227d-4ce3-9e5c-40017265c87f"
  "bowl"                     = "c8bc3f93-7b3e-42d3-8da0-362b268514bd"
  "food-accent-1"            = "4075b9c0-fd94-4312-9005-53c7554f869b"
  "food-accent-2"            = "1bfa5ab6-d8fd-4d28-ab95-ce69e4945cfe"
  "food-accent-3"            = "bc84bbc8-8951-47ea-8fd0-52862f6ad872"
  "food-accent-4"            = "e9a29642-1240-4f71-9529-969eee13056f"
}
foreach ($k in $assets.Keys) {
  Invoke-WebRequest -Uri "https://www.figma.com/api/mcp/asset/$($assets[$k]).svg" -OutFile "$k.svg"
}
```

---

## 확인

받은 파일에 `PLACEHOLDER` 글자가 없어야 합니다.

```bash
grep -l PLACEHOLDER assets/figma/menu-detail/*.svg
```

아무것도 출력되지 않으면 정상입니다.

---

## URL이 만료된 경우

Figma에서 직접 내보내세요.

1. 파일 열기 → 노드 `147:470` (Award Screen / Menu Detail)
2. 아래 레이어를 각각 선택 → 우측 Export 패널 → SVG → Export

| 레이어 이름 | 저장 파일명 | 크기 |
|---|---|---|
| Halo | `halo.svg` | 270×270 |
| Taste Archetype Badge | `taste-badge-spicy-korean.svg` | 82×82 |
| Decision Plate | `decision-plate.svg` | 278×142 |
| Bowl | `bowl.svg` | 180×98 |
| Food Accent (4개) | `food-accent-1~4.svg` | 38×23, 42×25, 39×23, 34×21 |
| __Icon/Bookmark | `icon-bookmark.svg` | 24×24 |

**크기를 바꾸지 마세요.** CSS가 이 치수를 기준으로 배치합니다.

---

## 구현 메모

- 히어로 요소는 Figma 좌표를 그대로 절대 배치했습니다.
  브라우저에서 실측한 결과 **halo, 배지, 접시, 그릇, 액센트 4개, 상단 액션이 모두 1px 오차 이내**로 일치합니다.
- 시트는 히어로 위로 45px 겹칩니다(히어로 330 + 시트 top 285).
- 색상은 전부 기존 `--tt-*` 토큰을 씁니다. Figma 변수명과 이름이 같아 그대로 매핑됐습니다.
- 타이포는 디자인의 Heading/01, Body/02, Caption/01, Title/01, Label/01 스펙을 따랐습니다.
- 더미 텍스트("고추장 삼겹 덮밥", "연남동 식당명")는 실제 메뉴 데이터로 채워집니다.
  추천 이유도 사용자가 고른 조건(종류·입맛·예산)에서 문장을 만듭니다.
