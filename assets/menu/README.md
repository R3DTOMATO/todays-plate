# 메뉴 이미지

197개 중 **113개**에 메뉴 전용 사진이 있습니다. 나머지 84개는 종류별 대표 이미지로 대체됩니다.

## 규격

- 1024×768 (4:3), WebP
- 평면 요리(덮밥·샐러드·피자)는 탑뷰, 높이·질감이 중요한 요리(국물·면·버거·고기)는 45도
- 따뜻한 아이보리 배경, 사람·손·텍스트·로고·워터마크 없음
- 총 7.9MB (평균 69KB, 최대 149KB)

## 연결 방식

`data/menus.json`의 각 메뉴에 `image` 필드가 있습니다.

```json
{ "id": "김치찌개", "image": "assets/menu/037_김치찌개_45deg.webp" }
```

`js/app.js`의 `getMenuImage()`가 `menu.image`를 우선하고,
없으면 종류별 Unsplash 이미지로 대체합니다.

## 남은 84개 추가 방법

1. 같은 규격으로 이미지 생성 (파일명: `{번호}_{메뉴명}_{topview|45deg}.webp`)
2. `assets/menu/`에 넣기
3. `data/menus.json`의 해당 메뉴에 `image` 경로 추가

전부 채워지면 `MENU_IMAGE_BY_TYPE`(Unsplash 대체 이미지)을 제거할 수 있습니다.

## 원본 PNG

체크포인트의 `original_png/`(248MB)는 저장소에 포함하지 않았습니다.
배포 용량과 무관한 원본이므로 별도 보관하세요.
`firebase.json`의 hosting ignore에 `**/original_png/**`를 추가해 두었습니다.
