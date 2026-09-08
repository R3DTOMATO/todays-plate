# 메뉴 이미지

**197개 메뉴 전부** 전용 사진을 갖고 있습니다. 외부 CDN 의존은 없습니다.

## 규격

- 1024×768 (4:3), WebP
- 평면 요리(덮밥·샐러드·피자)는 탑뷰, 높이·질감이 중요한 요리(국물·면·버거·고기)는 45도
- 따뜻한 아이보리 배경, 사람·손·텍스트·로고·워터마크 없음
- 총 12MB (평균 60KB)

## 연결 방식

`data/menus.json`의 각 메뉴에 `image` 필드가 있습니다.

```json
{ "id": "김치찌개", "image": "assets/menu/037_김치찌개_45deg.webp" }
```

`js/app.js`의 `getMenuImage()`가 `menu.image`를 반환합니다.
사용자가 직접 입력한 메뉴처럼 사진이 없는 경우에만 빈 값을 돌려주고,
그때는 `renderMenuPhoto()`가 이모지로 대체합니다.

## 메뉴를 추가할 때

1. 같은 규격으로 이미지 생성 (파일명: `{번호}_{메뉴명}_{topview|45deg}.webp`)
2. `assets/menu/`에 넣기
3. `data/menus.json`의 해당 메뉴에 `image` 경로 추가

## 원본 PNG

체크포인트의 `original_png/`(248MB)는 저장소에 포함하지 않았습니다.
배포 용량과 무관한 원본이므로 별도 보관하세요.
`firebase.json`의 hosting ignore에 `**/original_png/**`를 추가해 두었습니다.
