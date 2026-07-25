# Recipe rendering policy

## 원칙

앱의 레시피 화면은 `data/recipes.json`에 등록된 데이터를 최우선으로 표시한다.

이전 버전의 문제:
- `recipes.json`은 로드했지만 `ingredients`와 `steps` 일부만 메뉴 객체에 복사했다.
- 실제 레시피 화면은 `renderSourceBackedRecipe()`가 음식 계열별 템플릿을 다시 생성했다.
- 그래서 `recipes.json`을 수정해도 화면에는 `주재료`, `마늘/대파`, `물 또는 육수` 같은 fallback 템플릿이 표시될 수 있었다.

수정 후:
- `mergeMenusWithRecipes()`가 원본 recipe 객체를 `menu.recipe`로 보존한다.
- `renderRecipe()`는 `menu.recipe.ingredients` 또는 `menu.recipe.steps`가 있으면 무조건 `recipes.json` 데이터를 먼저 표시한다.
- recipes.json 데이터가 없을 때만 계열별 fallback 레시피를 표시한다.

## 지원하는 recipes.json 스키마

```json
{
  "소고기 미역국": {
    "title": "소고기 미역국",
    "summary": "초보자용 설명",
    "servings": "1인분",
    "ingredients": [
      ["마른 미역", "8g"],
      ["소고기 국거리", "100g"]
    ],
    "steps": [
      {
        "time": "10분",
        "main": "미역을 찬물에 불린다.",
        "why": "미역의 비린 향과 모래감을 줄인다."
      }
    ],
    "checks": ["국물이 맑고 고소하다"],
    "mistakes": ["참기름을 센 불에서 태우지 않는다"],
    "sources": [
      {
        "title": "Korean Bapsang · Miyeok Guk",
        "url": "https://www.koreanbapsang.com/miyeok-guk-beef-seaweed-soup/",
        "note": "미역국 참고"
      }
    ]
  }
}
```
