from playwright.sync_api import sync_playwright
import sys, json

BASE='http://localhost:9090'
results=[]; page_errors=[]

def check(name, ok, detail=''):
    results.append((name, ok, detail))
    print(f"{'✓' if ok else '✗'} {name}" + (f" — {detail}" if detail else ''))

with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':393,'height':900})
    pg.on('pageerror', lambda e: page_errors.append(str(e)))
    pg.goto(f'{BASE}/index.html', wait_until='domcontentloaded')
    pg.wait_for_timeout(2500)

    print('\n─── 1. 기본 로드 ───')
    check('페이지 오류 없음', len(page_errors)==0, ' | '.join(page_errors[:3]))
    check('홈 패널', pg.evaluate("document.body.dataset.panel")=='home')
    check('메뉴 197개', pg.evaluate("menus.length")==197)
    check('레시피 전부 연결', pg.evaluate("menus.filter(m=>m.recipe&&m.recipe.name).length")==197)
    check('delivery 속성', pg.evaluate("menus.filter(m=>m.delivery).length")==197)

    print('\n─── 2. 전체 패널 순회 ───')
    for panel in ['home','result','menudetail','recipe','nearby','favorites','diary','profile','group']:
        pg.evaluate(f"switchPanel('{panel}')"); pg.wait_for_timeout(250)
        cur=pg.evaluate("document.body.dataset.panel")
        check(f'패널 {panel}', cur==panel, '' if cur==panel else f'→{cur}')

    print('\n─── 3. 추천 알고리즘 ───')
    combo=pg.evaluate("""()=>{const T=['한식','양식','중식','일식','세계음식',null],N=['spicy','hangover','light','full','mild',null],
      B=['8000','12000','20000',null],M=['집밥','외식','배달',null];let t=0,z=0,u=0;
      for(const type of T)for(const need of N)for(const budget of B)for(const mode of M){
        const c=filterMenusSoft({situation:'혼밥',type,need,budget,mode});t++;
        if(!c.length)z++;else if(c.length<3)u++;}
      return {t,z,u};}""")
    check(f"조합 {combo['t']}개 결과 0개 없음", combo['z']==0, f"0개:{combo['z']} 3개미만:{combo['u']}")
    q=pg.evaluate("""()=>{const a={situation:'혼밥',type:'한식',need:'spicy',budget:'8000',mode:'외식'};
      return filterMenusSoft(a).map(m=>({n:m.name,s:scoreMenu(m,a)})).sort((x,y)=>y.s-x.s).slice(0,3).map(m=>m.n);}""")
    check('한식·매콤·8천·외식 추천', len(q)==3, ', '.join(q))

    print('\n─── 4. 5단계 질문 흐름 ───')
    pg.evaluate("startQuiz()"); pg.wait_for_timeout(500)
    steps=0
    for i in range(5):
        if not pg.evaluate("!!document.querySelector('#optionsContainer .option')"): break
        steps+=1
        if i==0:
            pg.evaluate("document.querySelector('#optionsContainer .option').click()"); pg.wait_for_timeout(200)
            pg.evaluate("document.getElementById('occasionNext')?.click()")
        else:
            pg.evaluate("document.querySelector('#optionsContainer .option').click()")
        pg.wait_for_timeout(450)
    check('5단계 진행', steps==5, f'{steps}단계')
    check('결과 도달', pg.evaluate("document.body.dataset.panel")=='result')
    pick=pg.evaluate("document.querySelector('.pick-name')?.textContent")
    check('추천 메뉴 표시', bool(pick), pick or '')

    print('\n─── 5. 결정 후 동작 ───')
    pg.evaluate("acceptCurrentMenu()"); pg.wait_for_timeout(500)
    check('기록모달 자동열림 안함', not pg.evaluate("document.getElementById('recordModal').classList.contains('show')"))
    check('결정 배너', bool(pg.evaluate("document.querySelector('.decided-banner strong')?.textContent")))
    d=pg.evaluate("Array.from(document.querySelectorAll('.decided-btn b')).map(e=>e.textContent)")
    check('메뉴정보·주변식당 버튼', d==['메뉴 정보','주변 식당'], ', '.join(d))
    pg.evaluate("answers={contextTime:'저녁'}; showResult();"); pg.wait_for_timeout(500)
    check('새 추천 시 배너 초기화', pg.evaluate("document.getElementById('resultDecidedActions').hidden"))

    print('\n─── 6. 메뉴 상세 ───')
    pg.evaluate("switchPanel('favorites'); window.openMenuDetail('김치찌개');"); pg.wait_for_timeout(700)
    check('검색→상세', pg.evaluate("document.body.dataset.panel")=='menudetail')
    check('제목', pg.evaluate("document.getElementById('mdTitle')?.textContent")=='김치찌개')
    t=pg.evaluate("document.querySelectorAll('.md-trait').length"); check('특성 칩', t>=3, f'{t}개')
    check('추천 이유', pg.evaluate("document.querySelectorAll('.md-reason').length")>0)
    pg.evaluate("goBackFromMenuDetail()"); pg.wait_for_timeout(400)
    check('뒤로→검색 복귀', pg.evaluate("document.body.dataset.panel")=='favorites')

    print('\n─── 7. 레시피 ───')
    pg.evaluate("showResultForMenu(findMenuByName('김치찌개')); goRecipe();"); pg.wait_for_timeout(900)
    check('레시피 패널', pg.evaluate("document.body.dataset.panel")=='recipe')
    check('제목', pg.evaluate("document.querySelector('.rc-name')?.textContent")=='김치찌개')
    st=pg.evaluate("Array.from(document.querySelectorAll('.rc-stat')).map(e=>e.textContent.trim())")
    check('통계 칩 3개', len(st)==3, ' / '.join(st))
    check('재료 렌더', pg.evaluate("document.querySelectorAll('.rc-ingredient-name').length")>0)
    stt=pg.evaluate("Array.from(document.querySelectorAll('.rc-block-title')).map(e=>e.textContent).find(t=>t.includes('단계'))")
    import re; check('N단계로 완성', bool(re.match(r'^\d+단계로 완성$', stt or '')), stt or '')
    pg.evaluate("document.getElementById('rcStartBtn')?.click()"); pg.wait_for_timeout(300)
    check('요리 시작 토글', pg.evaluate("document.getElementById('rcStartBtn')?.textContent.trim()")=='요리 끝내기')

    print('\n─── 8. 주변 식당 ───')
    pg.evaluate("showResultForMenu(findMenuByName('김치찌개')); goNearby();"); pg.wait_for_timeout(900)
    check('주변 패널', pg.evaluate("document.body.dataset.panel")=='nearby')
    check('검색바 메뉴명', pg.evaluate("document.getElementById('nbSearchLabel')?.textContent")=='김치찌개')
    body=pg.inner_text('body')
    check('검색전략 제거', '메뉴명을 바꾸지 않고 검색합니다' not in body)
    check('Restaurant Strategy 제거', '근처에서 먹는다면 이렇게 고르세요' not in body)
    sheet=pg.evaluate("""async()=>{const f=[
      {id:'1',name:'A식당',dist:'270m',lat:37.62,lng:127.07,subcategory:'한식',addr:'주소1',fitLabel:'적합도 높음',tier:'verified_name_match',emoji:'🍚',placeUrl:'#'},
      {id:'2',name:'B식당',dist:'470m',lat:37.63,lng:127.08,subcategory:'한식',addr:'주소2',tier:'cuisine_candidate',emoji:'🍚',placeUrl:'#'},
      {id:'3',name:'C식당',dist:'670m',subcategory:'백반',addr:'주소3',tier:'cuisine_candidate',emoji:'🍚',placeUrl:'#'},
      {id:'4',name:'D식당',dist:'800m',subcategory:'한식',addr:'주소4',tier:'cuisine_candidate',emoji:'🍚',placeUrl:'#'},
      {id:'5',name:'E식당',dist:'900m',subcategory:'한식',addr:'주소5',tier:'cuisine_candidate',emoji:'🍚',placeUrl:'#'},
      {id:'6',name:'F식당',dist:'1.1km',subcategory:'한식',addr:'주소6',tier:'cuisine_candidate',emoji:'🍚',placeUrl:'#'}];
      await renderNearbyMapMarkers(f,{lat:37.62,lng:127.07});
      document.getElementById('nearbyContent').innerHTML=renderNearbySheet(f,'광운대');
      return {title:document.querySelector('.nb-title')?.textContent,
        featured:document.querySelector('.nb-featured-name')?.textContent,
        ranks:Array.from(document.querySelectorAll('.nb-rank')).map(e=>e.textContent),
        viewAll:document.querySelector('.nb-view-all')?.textContent.trim(),
        canvasHidden:document.getElementById('nbMapCanvas')?.hidden};}""")
    check('헤더 개수', sheet['title']=='가까운 식당 6곳', sheet['title'])
    check('대표=1순위', sheet['featured']=='A식당', sheet['featured'])
    check('순위 2~5', sheet['ranks']==['2','3','4','5'], ','.join(sheet['ranks']))
    check('전체보기', '전체 6곳 보기' in (sheet['viewAll'] or ''), sheet['viewAll'])
    check('키없음→일러스트 폴백', sheet['canvasHidden']==True)

    print('\n─── 9. 좌표 보존 ───')
    c=pg.evaluate("""()=>{const p=formatPlace({place_name:'T',x:'127.0276',y:'37.4979',category_name:'음식점 > 한식',distance:'300'},findMenuByName('김치찌개'));return {lat:p.lat,lng:p.lng};}""")
    check('formatPlace 좌표', c['lat']==37.4979 and c['lng']==127.0276, json.dumps(c))

    print('\n─── 10. 그룹 투표 ───')
    pg.evaluate("switchPanel('group')"); pg.wait_for_timeout(500)
    check('만들기 화면', not pg.evaluate("document.getElementById('groupCreateView')?.hidden"))
    check('목업 잔재 없음', '제육볶음 정식' not in pg.inner_text('body'))
    gs=pg.evaluate("window.searchMenusByName('김치',3).map(m=>m.name)")
    check('메뉴 검색', len(gs)==3, ', '.join(gs))

    print('\n─── 11. 전역 API ───')
    for fn in ['goMenuDetail','goBackFromMenuDetail','goBackFromRecipe','goBackFromNearby','openMenuDetail','searchMenusByName','getDiaryForTaste','openNearbyExternalSearch','goRecipe','goNearby']:
        check(f'window.{fn}', pg.evaluate(f"typeof window.{fn}")=='function')

    print('\n─── 12. 최종 오류 확인 ───')
    check('누적 페이지 오류 없음', len(page_errors)==0, ' | '.join(page_errors[:5]))
    b.close()

failed=[r for r in results if not r[1]]
print('\n'+'═'*50)
print(f'총 {len(results)}건 · 통과 {len(results)-len(failed)} · 실패 {len(failed)}')
if failed:
    print('\n실패 목록:')
    for n,_,d in failed: print(f'  ✗ {n}' + (f' — {d}' if d else ''))
    sys.exit(1)
