
  // ─── Menu Database ───
  let menus = [];

  const DATA_PATHS = {
    menus: './data/menus.json',
    recipes: './data/recipes.json',
    restaurantKeywords: './data/restaurant-keywords.json',
    recipeSources: './data/recipe-sources.json'
  };

  async function loadJsonFile(path) {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${path} 로드 실패: HTTP ${response.status}`);
    return response.json();
  }

  function mergeMenusWithRecipes(menuData, recipeData) {
    const recipeMap = recipeData && typeof recipeData === 'object' ? recipeData : {};
    return (Array.isArray(menuData) ? menuData : []).map(menu => {
      // 중요: recipes.json의 원본 레시피 객체를 보존합니다.
      // 이전 버전은 ingredients/steps만 메뉴에 복사한 뒤, 실제 레시피 화면에서는
      // 별도 템플릿(renderSourceBackedRecipe)을 다시 계산해서 보여줬기 때문에
      // recipes.json을 수정해도 화면에 반영되지 않는 문제가 있었습니다.
      const recipe = recipeMap[menu.id] || recipeMap[menu.name] || {};
      return {
        ...menu,
        recipe,
        ingredients: recipe.ingredients || menu.ingredients || [],
        steps: recipe.steps || menu.steps || [],
        nutrition: recipe.nutrition || menu.nutrition || { p: 25, c: 50, f: 25 }
      };
    });
  }

  async function loadAppData() {
    try {
      const [menuData, recipeData, keywordData, sourceData] = await Promise.all([
        loadJsonFile(DATA_PATHS.menus),
        loadJsonFile(DATA_PATHS.recipes),
        loadJsonFile(DATA_PATHS.restaurantKeywords),
        loadJsonFile(DATA_PATHS.recipeSources)
      ]);
      menus = mergeMenusWithRecipes(menuData, recipeData);
      DISH_TO_RESTAURANT_KEYWORDS = keywordData || {};
      TRUSTED_RECIPE_SOURCES = (sourceData && sourceData.trusted) || {};
      CURATED_RECIPE_SOURCES = (sourceData && sourceData.curated) || {};
    } catch (error) {
      console.error('앱 데이터 로드 실패:', error);
      const home = document.getElementById('panel-home');
      if (home) {
        home.innerHTML = `
          <div class="home">
            <div class="empty-state">
              <div class="empty-icon">⚠️</div>
              <p class="empty-text">데이터 파일을 불러오지 못했습니다.<br>이 버전은 <strong>로컬 서버</strong>에서 실행해야 합니다.</p>
              <p class="empty-text" style="font-size:12px;">터미널에서 <code>python -m http.server 5500</code> 실행 후 <code>http://localhost:5500</code>으로 접속하세요.</p>
            </div>
          </div>`;
      }
      throw error;
    }
  }


  // ─── Cuisine normalization layer ───
  // Research 기준: 한식은 한국 고유/현지화 메뉴, 중식은 중국 지역요리 및 한국식 중화요리, 일식은 일본식 면·덮밥·초밥·전골, 양식은 유럽/미국식 중심, 세계음식은 태국·베트남·멕시코·인도·중동·동남아 음식으로 분리합니다.
  // 화면에 보이는 음식 분류와 추천 필터가 같은 기준을 쓰도록 메뉴 DB를 시작 시점에 정규화합니다.
  // 핵심 원칙:
  // 1) 한식/중식/일식/양식은 좁게 분류한다.
  // 2) 멕시칸·태국·베트남·중동 등은 억지로 양식에 넣지 않고 '세계음식'으로 분리한다.
  // 3) 사용자가 특정 분류를 선택하면 추천 결과에서 그 분류를 절대 함부로 풀지 않는다.
  const CUISINE_OVERRIDES = {
    // 한식
    '주먹밥':'한식', '잔치국수':'한식', '제육덮밥':'한식', '김치찌개':'한식', '된장찌개':'한식',
    '삼겹살':'한식', '치킨':'한식', '부대찌개':'한식', '비빔밥':'한식', '순두부찌개':'한식',
    '미음':'한식', '냉면':'한식', '국밥':'한식', '칼국수':'한식', '쌈밥 정식':'한식',
    '닭갈비':'한식', '어묵탕':'한식', '곱창전골':'한식', '설렁탕':'한식', '고등어구이':'한식',
    '족발':'한식', '김밥':'한식', '떡볶이':'한식', '순대국':'한식', '팥빙수':'한식',
    '갈비탕':'한식', '육개장':'한식', '경단':'한식', '소시지 볶음':'한식', '계란말이':'한식',
    '쭈꾸미 볶음':'한식', '전주비빔밥':'한식', '전골':'한식',

    // 중식
    '만두':'중식', '마라탕':'중식', '딤섬':'중식', '마라샹궈':'중식', '양꼬치':'중식',
    '짜장면':'중식', '짬뽕':'중식', '탕수육':'중식', '군만두':'중식', '멘보샤':'중식',

    // 일식
    '카레라이스':'일식', '초밥':'일식', '새우튀김':'일식', '규동':'일식', '라멘':'일식',
    '우동':'일식', '돈까스':'일식', '규카츠':'일식', '마키롤':'일식', '사시미':'일식',
    '덴푸라 정식':'일식', '샤브샤브':'일식', '우니동':'일식', '오야코동':'일식',

    // 양식: 유럽/미국식 중심
    '아보카도 토스트':'양식', '오트밀 볼':'양식', '스크램블 에그':'양식', '바나나 팬케이크':'양식',
    '그래놀라 요거트':'양식', '시저 샐러드':'양식', '알리오 올리오':'양식', '클럽 샌드위치':'양식',
    '수제버거':'양식', '마르게리타 피자':'양식', '토마토 파스타':'양식', '스테이크':'양식',
    '그릭 샐러드':'양식', '감바스':'양식', '프렌치 토스트':'양식', '베이글 샌드위치':'양식',
    '크루아상':'양식', '야채 스무디 보울':'양식', '에그 베네딕트':'양식', '고구마 라떼':'양식',
    '키쉬':'양식', '핫도그':'양식', '까르보나라':'양식', '치즈버거':'양식', '페스토 파스타':'양식',
    '라자냐':'양식', '랍스터':'양식', '페퍼로니 피자':'양식', '아사이볼':'양식', '스콘':'양식',
    '푸딩':'양식', '콥 샐러드':'양식', '볼로네제':'양식', '에그 샌드위치':'양식',
    '아보카도 샐러드':'양식', '아침 머핀':'양식', '크림 파스타':'양식', '알리오 감바스':'양식',
    '미트파이':'양식',

    // 세계음식: 멕시칸/태국/베트남/중동/하와이안 등. 예전처럼 전부 양식 처리하지 않습니다.
    '타코':'세계음식', '부리또':'세계음식', '아침 부리또':'세계음식', '반미':'세계음식',
    '팟타이':'세계음식', '케밥':'세계음식', '월남쌈':'세계음식', '케사디야':'세계음식',
    '베트남 쌀국수':'세계음식', '연어 포케볼':'세계음식', '포케볼':'세계음식'
  };

  const CUISINE_ICONS = {
    '한식':'🇰🇷', '중식':'🇨🇳', '일식':'🇯🇵', '양식':'🍝', '세계음식':'🌏'
  };


  // ─── Home cuisine by country ───
  // '집밥'은 단순히 집에서 조리 가능한 음식이 아니라 사용자의 생활권에서 익숙한 가정식을 뜻합니다.
  // 한국 사용자는 한식, 일본 사용자는 일식, 중국권 사용자는 중식을 대표 집밥으로 우선합니다.
  const HOME_COUNTRY_CONFIG = {
    KR: { label:'대한민국', flag:'🇰🇷', cuisine:'한식' },
    JP: { label:'일본', flag:'🇯🇵', cuisine:'일식' },
    CN: { label:'중국', flag:'🇨🇳', cuisine:'중식' },
    TW: { label:'대만', flag:'🇹🇼', cuisine:'중식' },
    HK: { label:'홍콩', flag:'🇭🇰', cuisine:'중식' },
    US: { label:'미국', flag:'🇺🇸', cuisine:'양식' },
    CA: { label:'캐나다', flag:'🇨🇦', cuisine:'양식' },
    GB: { label:'영국', flag:'🇬🇧', cuisine:'양식' },
    FR: { label:'프랑스', flag:'🇫🇷', cuisine:'양식' },
    IT: { label:'이탈리아', flag:'🇮🇹', cuisine:'양식' },
    DE: { label:'독일', flag:'🇩🇪', cuisine:'양식' },
    ES: { label:'스페인', flag:'🇪🇸', cuisine:'양식' },
    VN: { label:'베트남', flag:'🇻🇳', cuisine:'세계음식' },
    TH: { label:'태국', flag:'🇹🇭', cuisine:'세계음식' },
    IN: { label:'인도', flag:'🇮🇳', cuisine:'세계음식' },
    MX: { label:'멕시코', flag:'🇲🇽', cuisine:'세계음식' },
    OTHER: { label:'기타 지역', flag:'🌏', cuisine:'세계음식' }
  };

  // ─── Flexible budget tiers ───
  // 메뉴 가격은 매장·지역에 따라 달라질 수 있으므로 선택 금액을 절대 상한으로 쓰지 않습니다.
  // 화면에는 1·3·5만원의 이해하기 쉬운 구간을 보여주고, 실제 후보는 소폭의 여유 범위까지 허용합니다.
  const BUDGET_TIERS = {
    10000: { label:'약 1만 원', ceiling:12000, hint:'최대 1만 2천 원 정도' },
    30000: { label:'약 3만 원', ceiling:33000, hint:'최대 3만 3천 원 정도' },
    50000: { label:'약 5만 원', ceiling:55000, hint:'최대 5만 5천 원 정도' }
  };

  function normalizeBudgetTarget(value) {
    if (value === null || value === undefined || value === '') return null;
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    if (amount <= 10000) return 10000;
    if (amount <= 30000) return 30000;
    if (amount <= 50000) return 50000;
    return null;
  }

  function getBudgetTier(value) {
    const normalized = normalizeBudgetTarget(value);
    return normalized ? BUDGET_TIERS[normalized] : null;
  }

  function getBudgetCeiling(value) {
    const tier = getBudgetTier(value);
    return tier ? tier.ceiling : Number.POSITIVE_INFINITY;
  }

  function budgetLabel(value) {
    const tier = getBudgetTier(value);
    return tier ? tier.label : '가격 상관없음';
  }

  function isWithinBudget(price, value) {
    if (value === null || value === undefined) return true;
    return Number(price || 0) <= getBudgetCeiling(value);
  }

  function detectHomeCountry() {
    try {
      const locale = String((navigator.languages && navigator.languages[0]) || navigator.language || '').replace('_', '-');
      const region = locale.split('-')[1]?.toUpperCase();
      if (region && HOME_COUNTRY_CONFIG[region]) return region;
      const language = locale.split('-')[0]?.toLowerCase();
      if (language === 'ko') return 'KR';
      if (language === 'ja') return 'JP';
      if (language === 'zh') return 'CN';
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      if (timezone === 'Asia/Seoul') return 'KR';
      if (timezone === 'Asia/Tokyo') return 'JP';
      if (/Asia\/(Shanghai|Chongqing|Harbin|Urumqi)/.test(timezone)) return 'CN';
    } catch (_) { /* 한국 베타 기본값 사용 */ }
    return 'KR';
  }

  function getHomeCountryCode() {
    const code = personalProfile?.homeCountry || detectHomeCountry();
    return HOME_COUNTRY_CONFIG[code] ? code : 'KR';
  }

  function getHomeCountryInfo() {
    return HOME_COUNTRY_CONFIG[getHomeCountryCode()] || HOME_COUNTRY_CONFIG.KR;
  }

  function getHomeCuisineType() {
    return getHomeCountryInfo().cuisine;
  }


  // 실제 음식 사진을 활용한 모던 미니멀 UI용 이미지 매핑.
  // 메뉴별 사진이 없을 때 음식 분류별 대표 이미지를 사용합니다.
  const MENU_IMAGE_BY_TYPE = {
    '한식': 'https://images.unsplash.com/photo-1498654896293-37aacf113fd9?auto=format&fit=crop&w=900&q=82',
    '중식': 'https://images.unsplash.com/photo-1525755662778-989d0524087e?auto=format&fit=crop&w=900&q=82',
    '일식': 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=900&q=82',
    '양식': 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=82',
    '세계음식': 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=82',
    '기타': 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=900&q=82'
  };

  function getMenuImage(menu, width = 900) {
    const base = menu?.image || MENU_IMAGE_BY_TYPE[menu?.type] || MENU_IMAGE_BY_TYPE['기타'];
    if (!base) return '';
    return base.replace(/w=\d+/, `w=${width}`);
  }

  function renderMenuPhoto(menu, className = 'menu-photo', altPrefix = '') {
    const src = getMenuImage(menu);
    const alt = `${altPrefix}${menu?.name || '음식'} 사진`;
    return `<span class="${className}"><img src="${src}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async" onerror="this.style.display='none'"><span class="menu-photo-fallback" aria-hidden="true">${menu?.emoji || '🍽️'}</span></span>`;
  }

  function renderTopPickCard(menu, score) {
    return `
      <div class="top-pick-photo-wrap">
        ${renderMenuPhoto(menu, 'top-pick-photo')}
        <div class="match-score">추천 적합도 ${toMatchPercent(score)}%</div>
      </div>
      <div class="top-pick-content">
        <div class="pick-overline">${escapeHtml(menu.type || '오늘의 메뉴')}</div>
        <div class="pick-name">${escapeHtml(menu.name)}</div>
        <div class="pick-en">${escapeHtml(menu.en || '')}</div>
        <div class="pick-meta">
          <span><strong>${menu.cook === 0 ? '외식' : menu.cook + '분'}</strong><small>준비 시간</small></span>
          <span><strong>${Number(menu.kcal || 0).toLocaleString()}kcal</strong><small>예상 열량</small></span>
          <span><strong>약 ${Number(menu.price || 0).toLocaleString()}원</strong><small>한 끼 예산</small></span>
        </div>
        <p class="pick-desc">${escapeHtml(menu.desc || '')}</p>
      </div>
    `;
  }


  function sanitizeMenuDatabase() {
    // Some generated menu arrays can contain sparse slots or invalid entries.
    // Array.prototype.find() still visits sparse slots as undefined in modern JS,
    // so every invalid slot must be removed before recommendation/profile logic runs.
    const seen = new Set();
    for (let i = menus.length - 1; i >= 0; i--) {
      const menu = menus[i];
      if (!menu || typeof menu !== 'object' || !menu.name) {
        menus.splice(i, 1);
        continue;
      }
      const key = String(menu.name).trim();
      if (!key || seen.has(key)) {
        menus.splice(i, 1);
        continue;
      }
      seen.add(key);
      menu.name = key;
      menu.en = menu.en || key;
      menu.emoji = menu.emoji || '🍽️';
      menu.time = menu.time || '점심';
      menu.type = menu.type || '기타';
      menu.weight = menu.weight || '중간';
      menu.method = menu.method || '외식';
      menu.spicy = Number.isFinite(Number(menu.spicy)) ? Number(menu.spicy) : 0;
      menu.soup = Boolean(menu.soup);
      menu.cook = Number.isFinite(Number(menu.cook)) ? Number(menu.cook) : 0;
      menu.kcal = Number.isFinite(Number(menu.kcal)) ? Number(menu.kcal) : 500;
      menu.price = Number.isFinite(Number(menu.price)) ? Number(menu.price) : 8000;
      menu.desc = menu.desc || `${menu.name} 메뉴입니다.`;
      menu.ingredients = Array.isArray(menu.ingredients) ? menu.ingredients : [['메뉴', '1인분']];
      menu.steps = Array.isArray(menu.steps) ? menu.steps : ['주문하거나 조리해 맛있게 먹는다.'];
      menu.nutrition = menu.nutrition || { p:25, c:50, f:25 };
    }
  }

  function findMenuByName(menuName) {
    if (!menuName) return null;
    return menus.find(m => m && m.name === menuName) || null;
  }

  function compactProfileAgainstMenuDatabase() {
    if (!personalProfile) return;
    const existingNames = new Set(menus.filter(Boolean).map(m => m.name));
    personalProfile.bannedMenus = (personalProfile.bannedMenus || []).filter(name => existingNames.has(name));
    const nextStats = {};
    Object.entries(personalProfile.menuStats || {}).forEach(([name, stats]) => {
      if (existingNames.has(name)) nextStats[name] = stats;
    });
    personalProfile.menuStats = nextStats;
    Object.keys(personalProfile.timePatterns || {}).forEach(time => {
      const next = {};
      Object.entries(personalProfile.timePatterns[time] || {}).forEach(([name, count]) => {
        if (existingNames.has(name)) next[name] = count;
      });
      personalProfile.timePatterns[time] = next;
    });
  }

  function normalizeCuisineCategories() {
    menus.filter(Boolean).forEach(menu => {
      const normalized = CUISINE_OVERRIDES[menu.name] || menu.type || '기타';
      menu.originalType = menu.originalType || menu.type;
      menu.type = normalized;
      menu.cuisine = normalized;
      menu.cuisineIcon = CUISINE_ICONS[normalized] || '🍽️';
      if (!menu.origin) menu.origin = normalized;
    });
  }


  // ─── Curated-only recommendation policy ───
  // IMPORTANT: 이 버전은 조건 조합을 채우기 위해 메뉴를 자동 생성하지 않습니다.
  // 추천 후보는 data/menus.json에 직접 등록된 실제 메뉴만 사용합니다.
  // 후보가 0~2개로 적게 나오면 가짜 메뉴를 만들지 않고, 사용자에게 조건을 조금 완화하라고 안내합니다.
  const MIN_CURATED_CANDIDATE_NOTICE = 3;

  function getCuratedCoverageReport() {
    const total = menus.filter(Boolean).length;
    const byType = {};
    const byTypeTime = {};
    menus.filter(Boolean).forEach(menu => {
      byType[menu.type] = (byType[menu.type] || 0) + 1;
      const key = `${menu.type || '기타'} · ${menu.time || '시간대미정'}`;
      byTypeTime[key] = (byTypeTime[key] || 0) + 1;
    });
    return {
      policy: 'curated-only',
      totalMenus: total,
      byType,
      byTypeTime,
      note: '자동 생성 메뉴 없음. 메뉴 추가는 data/menus.json과 data/recipes.json에 실제 음식명으로만 등록합니다.'
    };
  }

  function countStrictCandidatesIgnoringUserExclusions(ans = {}) {
    return menus.filter(Boolean).filter(m => {
      if (ans.time && m.time !== ans.time) return false;
      if (ans.type && m.type !== ans.type) return false;
      if (ans.weight && m.weight !== ans.weight) return false;
      if (ans.soup !== undefined && ans.soup !== null && m.soup !== ans.soup) return false;
      if (ans.spicy) {
        if (ans.spicy === 'mild' && m.spicy > 0) return false;
        if (ans.spicy === 'mid' && (m.spicy < 1 || m.spicy > 2)) return false;
        if (ans.spicy === 'hot' && m.spicy < 2) return false;
      }
      if (ans.method && m.method !== ans.method) return false;
      if (ans.mode === '외식' && m.method !== '외식') return false;
      if (ans.mode === '배달' && m.method !== '외식') return false;
      if (ans.mode === '집밥' && !['간단','요리'].includes(m.method)) return false;
      if (ans.mode === '편의점' && !(m.method === '간단' && Number(m.price || 0) <= 7000)) return false;
      if (!ans.time && ans.contextTime && ans.contextTime !== '아침' && isBreakfastOnlyMenu(m)) return false;
      if (!isWithinBudget(m.price, ans.budget)) return false;
      return true;
    }).length;
  }

  // ─── Premium menu detail layer ───
  const premiumMenuCopy = {
    '김치찌개': {
      tagline: '묵은지의 산미와 돼지고기의 고소함이 균형을 이루는 집밥형 스테디셀러.',
      story: '김치찌개는 단순히 매운 국물이 아니라, 김치의 발효 산미·돼지고기의 지방감·두부의 부드러움이 층을 만드는 메뉴예요. 피곤한 저녁이나 밥이 당기는 날 만족도가 높습니다.',
      chefNote: '김치를 먼저 볶아 산미를 눌러주고, 마지막 5분에 두부를 넣으면 국물은 진하고 식감은 무너지지 않아요.',
      texture: ['부드러운 두부', '아삭한 김치', '진한 국물'],
      pairings: ['흰쌀밥', '계란말이', '김가루', '오이무침']
    },
    '된장찌개': {
      tagline: '구수한 된장 향과 채소의 단맛이 편안하게 올라오는 균형형 한식.',
      story: '된장찌개는 자극이 강하지 않으면서도 포만감을 주는 메뉴입니다. 국물의 구수함이 중심이라 식사 리듬을 안정적으로 잡고 싶을 때 좋습니다.',
      chefNote: '된장은 오래 끓이면 향이 날아가므로 육수가 끓은 뒤 풀고, 마지막에 대파를 넣어 향을 살리세요.',
      texture: ['구수한 국물', '부드러운 두부', '채소의 단맛'],
      pairings: ['보리밥', '생선구이', '김치', '나물반찬']
    },
    '제육덮밥': {
      tagline: '고추장 양념의 강한 흡입력과 밥의 포만감이 만나는 점심형 에너지 메뉴.',
      story: '제육덮밥은 매콤함·단맛·기름기가 한 번에 들어와 짧은 점심 시간에도 만족도가 큽니다. 오후 활동량이 많을 때 특히 어울립니다.',
      chefNote: '고기는 센 불에 짧게 볶아야 물이 덜 생기고, 마지막에 참기름을 아주 소량만 넣으면 향이 살아납니다.',
      texture: ['쫄깃한 고기', '촉촉한 밥', '매콤달콤 양념'],
      pairings: ['상추', '계란후라이', '미소국', '단무지']
    },
    '비빔밥': {
      tagline: '채소·밥·고추장의 비율로 컨디션을 조절하기 좋은 균형형 한 그릇.',
      story: '비빔밥은 재료 구성이 넓어 가볍게도, 든든하게도 만들 수 있습니다. 야채 섭취가 부족했던 날 좋은 선택입니다.',
      chefNote: '고추장은 한 번에 많이 넣지 말고 절반만 넣어 비빈 뒤 간을 조절하면 맛이 과해지지 않아요.',
      texture: ['아삭한 나물', '고소한 참기름', '부드러운 계란'],
      pairings: ['된장국', '동치미', '계란후라이', '김부각']
    },
    '마라탕': {
      tagline: '얼얼한 향신료와 원하는 재료 선택의 재미가 강한 스트레스 해소형 메뉴.',
      story: '마라탕은 매운맛보다 향신료의 마비감과 재료 조합이 핵심입니다. 자극적인 메뉴가 당기는 날 만족감이 크지만, 피곤한 위장 상태라면 맵기 조절이 필요합니다.',
      chefNote: '숙주·청경채처럼 수분감 있는 채소를 충분히 넣으면 향신료의 무게가 조금 가벼워집니다.',
      texture: ['얼얼한 국물', '쫄깃한 당면', '아삭한 채소'],
      pairings: ['꿔바로우', '빙홍차', '흰쌀밥', '유부']
    },
    '초밥': {
      tagline: '밥의 산미와 생선의 감칠맛이 깔끔하게 떨어지는 외식형 선택.',
      story: '초밥은 무겁지 않으면서도 식사의 만족도를 높이기 좋습니다. 깔끔한 점심, 기분 전환용 저녁 외식에 잘 맞습니다.',
      chefNote: '흰살생선처럼 담백한 것부터 시작하고, 기름진 생선은 뒤쪽에 먹으면 맛의 흐름이 좋아요.',
      texture: ['쫀득한 샤리', '부드러운 생선', '깔끔한 산미'],
      pairings: ['미소국', '가리', '녹차', '우동']
    },
    '스테이크': {
      tagline: '단백질 중심의 고급스러운 포만감과 굽기 조절의 만족감이 큰 메뉴.',
      story: '스테이크는 메뉴 자체가 단순해 보이지만 굽기, 휴지, 소스에 따라 완성도가 크게 달라집니다. 든든한 저녁이나 보상 식사에 적합합니다.',
      chefNote: '굽고 바로 자르지 말고 5분 정도 휴지시키면 육즙 손실이 줄어듭니다.',
      texture: ['겉은 바삭', '속은 촉촉', '진한 육향'],
      pairings: ['매시드 포테이토', '구운 버섯', '레드와인 소스', '샐러드']
    },
    '연어 포케볼': {
      tagline: '신선한 연어와 곡물, 채소가 균형을 이루는 세련된 한 그릇.',
      story: '포케볼은 가볍지만 단백질과 지방이 충분해 포만감이 오래 갑니다. 부담스럽지 않은 저녁이나 운동 후 식사로 좋습니다.',
      chefNote: '간장은 적게, 참기름과 레몬즙을 소량 더하면 느끼함이 줄고 향이 선명해집니다.',
      texture: ['부드러운 연어', '고소한 아보카도', '아삭한 채소'],
      pairings: ['미소국', '와사비마요', '김가루', '레몬워터']
    },
    '알리오 올리오': {
      tagline: '마늘 향과 올리브유의 질감으로 완성되는 미니멀 파스타.',
      story: '알리오 올리오는 재료가 단순해서 오히려 조리 완성도가 중요합니다. 가볍게 먹고 싶지만 풍미는 포기하기 싫을 때 좋습니다.',
      chefNote: '마늘은 태우지 말고 약불에서 향을 내고, 면수로 오일을 유화시키는 게 핵심입니다.',
      texture: ['탱글한 면', '은은한 마늘향', '가벼운 오일감'],
      pairings: ['그린 샐러드', '구운 새우', '레몬에이드', '바게트']
    },
    '토마토 파스타': {
      tagline: '토마토 산미와 면의 탄력이 부담 없이 어우러지는 안정적인 선택.',
      story: '토마토 파스타는 느끼함이 적고 산뜻한 편이라 점심과 저녁 모두 무난합니다. 양식이 당기지만 너무 무겁지 않게 가고 싶을 때 적합합니다.',
      chefNote: '소스를 한 번 끓여 산미를 정리하고, 면을 소스에서 1분 더 익히면 맛이 잘 배어요.',
      texture: ['탱글한 면', '산뜻한 소스', '부드러운 향'],
      pairings: ['루꼴라 샐러드', '마늘빵', '파마산', '탄산수']
    },
    '수제버거': {
      tagline: '패티의 육즙과 번의 부드러움이 직접적인 만족감을 주는 외식형 메뉴.',
      story: '수제버거는 빠른 한 끼처럼 보이지만 패티, 소스, 채소의 밸런스가 중요합니다. 강한 포만감과 기분 전환이 필요할 때 좋습니다.',
      chefNote: '소스가 많은 버거는 감자튀김보다 피클이나 샐러드를 곁들이면 전체 밸런스가 좋아집니다.',
      texture: ['육즙 있는 패티', '부드러운 번', '아삭한 채소'],
      pairings: ['피클', '코울슬로', '감자튀김', '제로콜라']
    },
    '치킨': {
      tagline: '바삭함과 짭짤함으로 즉각적인 만족감을 주는 저녁형 메뉴.',
      story: '치킨은 조리 부담이 없고 공유하기 좋아 저녁 메뉴로 강합니다. 다만 칼로리와 기름기가 높은 편이라 최근 식단과 균형을 보는 게 좋습니다.',
      chefNote: '후라이드는 소스보다 소금·후추 계열과 잘 맞고, 양념은 무나 샐러드로 산미를 보완하면 좋아요.',
      texture: ['바삭한 튀김', '촉촉한 속살', '짭짤한 풍미'],
      pairings: ['치킨무', '양배추 샐러드', '콘샐러드', '탄산음료']
    },
    '삼겹살': {
      tagline: '고소한 지방감과 쌈 채소의 신선함이 대비되는 강한 저녁 메뉴.',
      story: '삼겹살은 기름진 맛이 중심이지만 쌈, 마늘, 김치와 조합하면 맛의 리듬이 살아납니다. 하루를 마무리하는 보상 식사로 적합합니다.',
      chefNote: '한 번에 많이 올리기보다 간격을 두고 구워야 육즙과 바삭한 가장자리가 살아납니다.',
      texture: ['바삭한 가장자리', '고소한 지방', '아삭한 쌈'],
      pairings: ['상추쌈', '구운 김치', '파채', '된장찌개']
    },
    '냉면': {
      tagline: '차가운 육수와 탄력 있는 면이 입맛을 깨우는 산뜻한 선택.',
      story: '냉면은 더운 날이나 입맛이 없는 날 강점이 있습니다. 무겁지 않지만 면의 탄력과 육수의 산미로 만족감을 줍니다.',
      chefNote: '겨자와 식초는 처음부터 많이 넣지 말고 중간부터 조금씩 더하는 게 좋습니다.',
      texture: ['쫄깃한 면', '차가운 육수', '새콤한 마무리'],
      pairings: ['만두', '수육', '무절임', '삶은 달걀']
    },
    '라멘': {
      tagline: '국물 농도와 면의 탄력으로 만족감을 주는 일식형 한 그릇.',
      story: '라멘은 국물의 깊이와 토핑 조합이 핵심입니다. 따뜻한 국물과 면이 당기는 날 안정적인 선택입니다.',
      chefNote: '국물 맛이 진할수록 숙주나 파 같은 산뜻한 토핑을 곁들이면 균형이 좋아집니다.',
      texture: ['탄력 있는 면', '진한 국물', '부드러운 차슈'],
      pairings: ['교자', '반숙란', '김', '차가운 보리차']
    },
    '팟타이': {
      tagline: '새콤달콤한 소스와 견과류의 고소함이 살아있는 태국식 볶음면.',
      story: '팟타이는 단맛·산미·고소함이 동시에 있어 입맛 전환에 좋습니다. 평소와 다른 메뉴를 먹고 싶을 때 만족도가 높습니다.',
      chefNote: '라임즙을 마지막에 뿌리면 단맛이 정리되고 전체 맛이 더 선명해집니다.',
      texture: ['쫄깃한 면', '아삭한 숙주', '고소한 땅콩'],
      pairings: ['쏨땀', '타이 밀크티', '새우튀김', '라임']
    },
    '갈비탕': {
      tagline: '맑은 국물과 고기의 깊은 맛으로 든든함을 주는 회복형 메뉴.',
      story: '갈비탕은 자극이 강하지 않으면서도 포만감이 크기 때문에 피로감이 있는 날 잘 맞습니다. 따뜻한 국물이 필요한 저녁에 좋습니다.',
      chefNote: '후추는 먹기 직전에 넣어야 향이 살아나고, 파를 넉넉히 넣으면 국물이 가볍게 느껴집니다.',
      texture: ['맑은 국물', '부드러운 고기', '담백한 마무리'],
      pairings: ['깍두기', '공깃밥', '다진 파', '당면']
    }
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function clamp(num, min, max) {
    return Math.min(max, Math.max(min, num));
  }

  function spiceLabel(menu) {
    const labels = ['맵지 않음', '은은한 매콤함', '매콤함', '강한 매운맛'];
    return labels[menu.spicy] || '취향 조절';
  }

  function priceTier(menu) {
    if (menu.price <= 5000) return '가성비';
    if (menu.price <= 9000) return '보통';
    if (menu.price <= 15000) return '프리미엄 캐주얼';
    return '고급 외식';
  }

  function cookDifficulty(menu) {
    if (menu.method === '외식') return '외식 추천';
    if (menu.method === '간단' || menu.cook <= 10) return '쉬움';
    if (menu.cook <= 25) return '보통';
    return '정성 필요';
  }

  function mealOccasion(menu) {
    if (menu.time === '아침' && menu.weight === '가벼움') return '부담 없이 하루를 시작하고 싶은 아침';
    if (menu.time === '아침') return '아침부터 에너지가 필요한 날';
    if (menu.weight === '든든' && menu.time === '점심') return '오후 일정이 길거나 활동량이 많은 점심';
    if (menu.weight === '든든' && menu.time === '저녁') return '하루를 마무리하는 보상 식사';
    if (menu.soup) return '따뜻한 국물로 컨디션을 회복하고 싶은 날';
    if (menu.method === '외식') return '조리 없이 기분 전환이 필요한 날';
    return '과하지 않게 만족스러운 한 끼가 필요한 날';
  }

  function baseTagline(menu) {
    const typeMap = {
      '한식': '익숙한 감칠맛과 밥의 안정감이 중심이 되는 메뉴.',
      '일식': '깔끔한 간과 정돈된 식감이 강점인 메뉴.',
      '중식': '강한 화력감과 풍성한 소스가 매력인 메뉴.',
      '양식': '향·소스·식감의 조합으로 분위기를 만드는 메뉴.',
      '세계음식': '각 지역의 향신료와 소스 개성이 분명한 메뉴.'
    };
    return typeMap[menu.type] || '오늘의 취향에 맞춰 균형 있게 추천된 메뉴.';
  }

  function buildStory(menu) {
    const spicy = menu.spicy >= 2 ? '매콤한 자극이 있어 입맛을 확실히 끌어올립니다. ' : '';
    const soup = menu.soup ? '국물감이 있어 식사 만족도와 안정감이 높습니다. ' : '';
    const weight = menu.weight === '든든'
      ? '포만감이 큰 편이라 식사를 제대로 챙기고 싶은 날에 어울립니다.'
      : menu.weight === '가벼움'
        ? '부담이 적고 산뜻하게 먹기 좋아 컨디션을 무겁게 만들지 않습니다.'
        : '무겁지도 가볍지도 않아 일상적인 한 끼로 선택하기 좋습니다.';
    return `${spicy}${soup}${weight}`;
  }

  function inferTexture(menu) {
    if (premiumMenuCopy[menu.name]?.texture) return premiumMenuCopy[menu.name].texture;
    if (menu.soup) return ['따뜻한 국물', '부드러운 재료', '편안한 마무리'];
    if (menu.method === '외식') return ['완성도 높은 조리', '즉각적인 만족감', '기분 전환'];
    if (menu.type === '양식') return ['부드러운 소스', '풍성한 향', '균형 잡힌 식감'];
    if (menu.type === '세계음식') return ['개성 있는 향신료', '선명한 소스', '이국적인 식감'];
    if (menu.type === '일식') return ['깔끔한 간', '정돈된 식감', '담백한 마무리'];
    if (menu.type === '중식') return ['강한 화력감', '진한 소스', '쫄깃한 식감'];
    return ['익숙한 감칠맛', '밥과 좋은 조합', '편안한 식감'];
  }

  function inferPairings(menu) {
    if (premiumMenuCopy[menu.name]?.pairings) return premiumMenuCopy[menu.name].pairings;
    if (menu.soup && menu.type === '한식') return ['공깃밥', '김치', '계란말이', '나물반찬'];
    if (menu.type === '한식') return ['된장국', '상추', '김치', '계란후라이'];
    if (menu.type === '일식') return ['미소국', '단무지', '녹차', '반숙란'];
    if (menu.type === '중식') return ['단무지', '오이무침', '차가운 차', '군만두'];
    if (menu.type === '세계음식') return ['라임', '피클', '허브 샐러드', '탄산수'];
    if (menu.type === '양식' && menu.weight === '가벼움') return ['탄산수', '그린 샐러드', '과일', '요거트'];
    if (menu.type === '양식') return ['샐러드', '피클', '마늘빵', '탄산수'];
    return ['물', '가벼운 샐러드', '피클', '과일'];
  }

  function tasteScores(menu) {
    const carbHeavy = ['밥', '면', '파스타', '버거', '피자', '토스트', '샌드위치', '국수', '라멘', '우동', '냉면'].some(k => menu.name.includes(k));
    const sweetMenu = ['팬케이크', '프렌치', '요거트', '스무디', '빙수', '푸딩', '스콘', '머핀', '라떼'].some(k => menu.name.includes(k));
    return {
      감칠맛: clamp((menu.type === '한식' ? 76 : menu.type === '일식' ? 70 : menu.type === '중식' ? 78 : menu.type === '세계음식' ? 72 : 62) + (menu.soup ? 8 : 0), 20, 98),
      매운맛: clamp(menu.spicy * 28 + (menu.name.includes('마라') ? 12 : 0), 0, 100),
      산뜻함: clamp((menu.weight === '가벼움' ? 78 : menu.weight === '중간' ? 56 : 34) + (menu.soup ? -6 : 0), 15, 95),
      포만감: clamp((menu.weight === '든든' ? 88 : menu.weight === '중간' ? 62 : 38) + (carbHeavy ? 8 : 0), 20, 98),
      달콤함: clamp((sweetMenu ? 76 : menu.type === '양식' ? 32 : 18) - (menu.spicy * 5), 5, 90)
    };
  }

  function premiumInfo(menu) {
    const curated = premiumMenuCopy[menu.name] || {};
    return {
      tagline: curated.tagline || baseTagline(menu),
      story: curated.story || buildStory(menu),
      chefNote: curated.chefNote || defaultChefNote(menu),
      texture: curated.texture || inferTexture(menu),
      pairings: curated.pairings || inferPairings(menu),
      occasion: mealOccasion(menu),
      difficulty: cookDifficulty(menu),
      priceTier: priceTier(menu),
      spice: spiceLabel(menu)
    };
  }

  function defaultChefNote(menu) {
    if (menu.method === '외식') return '외식 메뉴는 사이드 선택이 완성도를 좌우해요. 기름진 메뉴라면 산미 있는 반찬이나 샐러드를 곁들이는 편이 좋습니다.';
    if (menu.soup) return '국물 메뉴는 처음부터 간을 세게 잡기보다 마지막에 간을 맞추면 재료의 맛이 더 깔끔하게 살아납니다.';
    if (menu.spicy >= 2) return '매운 양념은 단맛과 산미가 같이 있어야 덜 부담스럽습니다. 마지막에 식초나 레몬 계열을 아주 소량 더해도 좋아요.';
    if (menu.weight === '가벼움') return '가벼운 메뉴는 단백질 토핑을 조금 더하면 포만감이 오래가고 식사 완성도가 높아집니다.';
    return '조리 직후 바로 먹기보다 1분 정도 두면 향과 온도가 안정되어 맛이 더 또렷해집니다.';
  }

  function renderTasteBoard(menu) {
    const scores = tasteScores(menu);
    return `
      <div class="taste-board">
        <div class="taste-title">맛 프로필</div>
        ${Object.entries(scores).map(([label, value]) => `
          <div class="taste-row">
            <span class="taste-label">${label}</span>
            <div class="taste-bar"><div class="taste-fill" style="--value:${value}%"></div></div>
            <span class="taste-value">${value}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderPremiumTags(menu, info) {
    return `
      <div class="premium-tags">
        <span class="premium-tag">${escapeHtml(menu.type)}</span>
        <span class="premium-tag">${escapeHtml(menu.weight)}</span>
        <span class="premium-tag">${escapeHtml(info.spice)}</span>
        <span class="premium-tag">${escapeHtml(info.difficulty)}</span>
        <span class="premium-tag">${escapeHtml(info.priceTier)}</span>
      </div>
    `;
  }

  function renderMenuPremiumDetails(menu, compact = false) {
    const info = premiumInfo(menu);
    return `
      <div class="premium-menu">
        <div class="premium-eyebrow">메뉴 상세</div>
        <div class="premium-headline">${escapeHtml(info.tagline)}</div>
        ${renderPremiumTags(menu, info)}
        <p class="premium-story">${escapeHtml(info.story)}</p>
        <div class="premium-grid">
          <div class="premium-card">
            <span class="premium-card-label">추천 상황</span>
            <div class="premium-card-title">어울리는 상황</div>
            <div class="premium-card-text">${escapeHtml(info.occasion)}</div>
          </div>
          <div class="premium-card">
            <span class="premium-card-label">식감</span>
            <div class="premium-card-title">식감 포인트</div>
            <div class="premium-card-text">${info.texture.map(escapeHtml).join(' · ')}</div>
          </div>
          <div class="premium-card">
            <span class="premium-card-label">영양 구성</span>
            <div class="premium-card-title">식사 밸런스</div>
            <div class="premium-card-text">${menu.nutrition ? `단백질 ${menu.nutrition.p}% · 탄수화물 ${menu.nutrition.c}% · 지방 ${menu.nutrition.f}%` : '균형 정보 없음'}</div>
          </div>
          <div class="premium-card">
            <span class="premium-card-label">가격대</span>
            <div class="premium-card-title">예상 비용감</div>
            <div class="premium-card-text">약 ${Number(menu.price).toLocaleString()}원 · ${escapeHtml(info.priceTier)}</div>
          </div>
        </div>
        ${compact ? '' : renderTasteBoard(menu)}
        <div class="pairing-box">
          <div class="pairing-title">같이 먹으면 좋은 조합</div>
          <div class="pairing-list">
            ${info.pairings.map(item => `<span class="pairing-item">${escapeHtml(item)}</span>`).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function renderRecipePremiumNote(menu) {
    const info = premiumInfo(menu);
    const tips = [
      info.chefNote,
      menu.method === '외식'
        ? `${menu.name}은(는) 직접 조리보다 좋은 매장을 고르는 것이 핵심이에요. 리뷰에서는 맛보다 위생·회전율·재료 신선도를 먼저 보세요.`
        : `${menu.name}은(는) ${menu.cook}분 안팎으로 완성되는 메뉴입니다. 재료 손질을 먼저 끝내두면 조리 중 맛이 흐트러지지 않습니다.`,
      menu.spicy >= 2
        ? '맵기를 낮추고 싶다면 달걀, 밥, 유제품 계열 사이드를 곁들이면 자극이 부드러워집니다.'
        : '자극이 강하지 않은 편이라 허브, 후추, 참기름, 레몬즙처럼 향을 더하는 재료와 잘 맞습니다.'
    ];
    return `
      <div class="recipe-premium-note">
        <h3>메뉴 해설</h3>
        <p>${escapeHtml(info.story)}</p>
        ${renderPremiumTags(menu, info)}
        <div class="nutrition-detail">
          <div class="nutrition-chip"><strong>${menu.nutrition?.p ?? '-'}</strong><span>PROTEIN</span></div>
          <div class="nutrition-chip"><strong>${menu.nutrition?.c ?? '-'}</strong><span>CARB</span></div>
          <div class="nutrition-chip"><strong>${menu.nutrition?.f ?? '-'}</strong><span>FAT</span></div>
        </div>
      </div>
      <div class="section">
        <h3>맛있게 먹는 포인트</h3>
        <ul class="recipe-tip-list">
          ${tips.map(t => `<li>${escapeHtml(t)}</li>`).join('')}
        </ul>
      </div>
      <div class="section">
        <h3>추천 조합</h3>
        <div class="pairing-list">
          ${info.pairings.map(item => `<span class="pairing-item">${escapeHtml(item)}</span>`).join('')}
        </div>
      </div>
    `;
  }

  // ─── Korean beta recommendation metadata ───
  // 사용자에게 보이는 이름이 달라도 사실상 같은 음식 계열이면 리롤에서 함께 제외합니다.
  const BREAKFAST_ONLY_NAMES = new Set([
    '아보카도 토스트','오트밀 볼','스크램블 에그','바나나 팬케이크','그래놀라 요거트',
    '프렌치 토스트','베이글 샌드위치','야채 스무디 보울','에그 베네딕트','고구마 라떼',
    '키쉬','아사이볼','에그 샌드위치','아침 머핀','그릴드 치즈','오믈렛','아침 부리또','샥슈카'
  ]);

  function getMenuFamily(menu) {
    if (!menu) return '';
    return String(menu.family || menu.id || menu.name || '').trim();
  }

  function isBreakfastOnlyMenu(menu) {
    return !!menu && BREAKFAST_ONLY_NAMES.has(menu.name);
  }

  function getHomeSuitability(menu) {
    if (!menu) return 'possible';
    if (menu.homeSuitability) return menu.homeSuitability;
    if (menu.method === '외식') return 'outside';
    if (Number(menu.cook || 0) >= 50) return 'special';
    return 'possible';
  }

  function getMenuFamiliarity(menu) {
    if (!menu) return 'explore';
    if (menu.familiarity) return menu.familiarity;
    if (['한식','일식','중식'].includes(menu.type)) return 'familiar';
    return 'explore';
  }

  function selectDiverseRecommendationSet(scored, limit = 3, ans = {}) {
    if (!Array.isArray(scored) || scored.length === 0) return [];

    const selected = [];
    const usedFamilies = new Set();
    const addMenu = menu => {
      if (!menu || selected.length >= limit || selected.includes(menu)) return false;
      const family = getMenuFamily(menu);
      if (family && usedFamilies.has(family)) return false;
      selected.push(menu);
      if (family) usedFamilies.add(family);
      return true;
    };

    const homeCuisine = getHomeCuisineType();
    const useMarketBalance = !hasExplicitCuisinePreference(ans);
    const topScore = Number(scored[0].score || 0);

    // 명시적 음식 종류가 없을 때는 현지 일상식 2개 + 익숙한 타 문화 메뉴 1개를 기본 구성으로 둡니다.
    if (useMarketBalance) {
      const localMenus = scored.filter(menu =>
        menu.type === homeCuisine &&
        getMenuFamiliarity(menu) !== 'explore' &&
        topScore - Number(menu.score || 0) <= (ans.mode === '집밥' ? 30 : 18)
      );
      localMenus.slice(0, 2).forEach(addMenu);

      const familiarAlternative = scored.find(menu =>
        menu.type !== homeCuisine &&
        getMenuFamiliarity(menu) !== 'explore'
      );
      addMenu(familiarAlternative);
    }

    // 시장 기본 구성이 불가능하거나 사용자가 음식 종류를 직접 골랐다면 점수 순서를 우선합니다.
    for (const menu of scored) {
      if (selected.length >= limit) break;
      addMenu(menu);
    }

    return selected.slice(0, limit);
  }


  function prioritizeMarketCuisine(scored, ans = {}) {
    if (!Array.isArray(scored) || !scored.length) return [];
    if (hasExplicitCuisinePreference(ans)) return scored;

    const homeCuisine = getHomeCuisineType();
    const localTop = scored.find(menu =>
      menu.type === homeCuisine &&
      getMenuFamiliarity(menu) !== 'explore'
    );
    if (!localTop || scored[0] === localTop) return scored;

    const scoreGap = Number(scored[0].score || 0) - Number(localTop.score || 0);
    const allowedGap = ans.mode === '집밥' ? 30 : 18;
    if (scoreGap > allowedGap) return scored;

    return [localTop, ...scored.filter(menu => menu !== localTop)];
  }


  // ─── Questions ───


  function buildMenuProfile(menu) {
    const tastes = tasteScores(menu);
    const moods = [];
    if (menu.weight === '든든') moods.push('든든한', '보상식');
    if (menu.weight === '가벼움') moods.push('가벼운', '부담없는');
    if (menu.soup) moods.push('따뜻한', '회복형');
    if (menu.spicy >= 2) moods.push('자극적인', '입맛돋우는');
    if (menu.method === '외식') moods.push('기분전환');
    if (menu.method === '간단') moods.push('빠른한끼');

    const situations = [];
    if (menu.method === '외식') situations.push('외식', '배달', '친구와', '데이트');
    if (menu.method !== '외식') situations.push('집밥');
    if (menu.price <= 7000) situations.push('가성비');
    if (menu.cook <= 10 || menu.method === '간단') situations.push('시간없을때');
    if (menu.weight !== '가벼움') situations.push('든든한식사');
    if (menu.weight === '가벼움') situations.push('가벼운식사');
    if (menu.soup) situations.push('비오는날', '추운날', '속편한식사');
    if (menu.spicy === 0 && menu.kcal <= 600) situations.push('속편한식사');
    if ((menu.nutrition?.p || 0) >= 25 || menu.weight === '든든') situations.push('운동후');
    situations.push('혼밥');

    const reasonTags = [menu.time, menu.type, menu.weight, spiceLabel(menu), cookDifficulty(menu), priceTier(menu)];
    return { moods: [...new Set(moods)], situations: [...new Set(situations)], tastes, reasonTags };
  }

  function getMenuProfile(menu) {
    if (!menu.profile) menu.profile = buildMenuProfile(menu);
    return menu.profile;
  }

  function enrichMenusForRecommendation() {
    menus.filter(Boolean).forEach(menu => {
      const profile = getMenuProfile(menu);
      menu.mood = profile.moods;
      menu.situation = profile.situations;
      menu.reasonTags = profile.reasonTags;
      menu.taste = profile.tastes;
      menu.restrictionTags = inferRestrictionTags(menu);
      menu.family = getMenuFamily(menu);
      menu.homeSuitability = getHomeSuitability(menu);
      menu.familiarity = getMenuFamiliarity(menu);
    });
  }
  const questions = [
    { step: 1, total: 3, title: '오늘은 어떻게 먹을까요?', sub: '식사 방식에 맞는 메뉴부터 좁혀드릴게요', key: 'mode', grid: 2,
      options: [
        { emoji:'🍽️', text:'외식', hint:'가까운 식당에서', value:'외식' },
        { emoji:'🛵', text:'배달', hint:'주문하기 좋은 메뉴', value:'배달' },
        { emoji:'🏠', text:'집밥', hint:'직접 간단히 만들기', value:'집밥' },
        { emoji:'🏪', text:'편의점', hint:'빠르고 부담 없이', value:'편의점' }
      ] },
    { step: 2, total: 3, title: '지금 어떤 메뉴가 당겨요?', sub: '오늘의 배고픔과 컨디션을 알려주세요', key: 'need', grid: 2,
      options: [
        { emoji:'🥗', text:'가볍게', hint:'부담 적은 한 끼', value:'light' },
        { emoji:'🍚', text:'든든하게', hint:'배부르게 먹기', value:'full' },
        { emoji:'🍲', text:'해장·국물', hint:'따뜻하고 편안하게', value:'hangover' },
        { emoji:'🌶️', text:'매콤하게', hint:'기분 좋은 자극', value:'spicy' }
      ] },
    { step: 3, total: 3, title: '한 끼 예산은 어느 정도예요?', sub: '가격 차이를 고려해 선택 금액보다 조금 넓게 추천합니다', key: 'budget', grid: 2,
      options: [
        { emoji:'₩', text:'약 1만 원', hint:'최대 1만 2천 원 정도', value:10000 },
        { emoji:'₩₩', text:'약 3만 원', hint:'최대 3만 3천 원 정도', value:30000 },
        { emoji:'₩₩₩', text:'약 5만 원', hint:'최대 5만 5천 원 정도', value:50000 },
        { emoji:'∞', text:'가격 상관없음', hint:'가격보다 메뉴 우선', value:null }
      ] },
  ];
  questions.forEach((q, idx) => { q.step = idx + 1; q.total = questions.length; });

  // ─── 카카오 로컬 API ───
  //
  // 1. https://developers.kakao.com/ 가입 후 애플리케이션 추가
  // 2. 앱 키 메뉴에서 'REST API 키' 복사
  // 3. 플랫폼 메뉴에서 Web 플랫폼 등록 (사이트 도메인: http://localhost:5500 등)
  // 4. ⚠️ [카카오맵] > [사용 설정]을 [ON]으로 (2024.12.1 이후 신규 앱 필수)
  // 5. 실제 배포에서는 브라우저 키 대신 서버 프록시 주소를 설정
  //
  // 무료 한도: 월 300,000 콜 (충분히 넉넉)
  // 비어있으면 mock 데이터로 폴백
  const NEARBY_PROXY_URL = (window.APP_CONFIG && window.APP_CONFIG.NEARBY_PROXY_URL) || '';

  // 메뉴 → 카카오 검색 키워드 매핑 (한국어)
  // 메뉴 이름이 그대로 통하는 경우가 많아서 대부분 그대로 사용
  const kakaoSearchKeywords = {
    '아보카도 토스트': '아보카도 토스트',
    '오트밀 볼': '브런치 카페',
    '스크램블 에그': '브런치 카페',
    '바나나 팬케이크': '팬케이크',
    '주먹밥': '주먹밥',
    '그래놀라 요거트': '브런치 카페',
    '잔치국수': '잔치국수',
    '제육덮밥': '제육덮밥',
    '시저 샐러드': '샐러드',
    '알리오 올리오': '파스타',
    '카레라이스': '카레',
    '타코': '타코',
    '초밥': '초밥',
    '만두': '만두',
    '클럽 샌드위치': '샌드위치',
    '수제버거': '수제버거',
    '김치찌개': '김치찌개',
    '연어 포케볼': '포케',
    '마르게리타 피자': '피자',
    '된장찌개': '된장찌개',
    '삼겹살': '삼겹살',
    '새우튀김': '새우튀김',
    '토마토 파스타': '파스타',
    '스테이크': '스테이크',
    '마라탕': '마라탕',
    '규동': '규동',
    '치킨': '치킨',
    '부대찌개': '부대찌개',
    '딤섬': '딤섬',
    '그릭 샐러드': '샐러드',
    '비빔밥': '비빔밥',
    '라멘': '라멘',
    '부리또': '멕시칸',
    '감바스': '스페인',
    '순두부찌개': '순두부찌개',
    // ─── 확장 메뉴 ───
    '프렌치 토스트': '브런치 카페',
    '베이글 샌드위치': '베이글',
    '크루아상': '베이커리',
    '미음': '죽',
    '야채 스무디 보울': '브런치 카페',
    '에그 베네딕트': '브런치 카페',
    '아침 부리또': '멕시칸',
    '고구마 라떼': '카페',
    '키쉬': '브런치 카페',
    '냉면': '냉면',
    '우동': '우동',
    '돈까스': '돈까스',
    '국밥': '국밥',
    '칼국수': '칼국수',
    '핫도그': '핫도그',
    '마라샹궈': '마라샹궈',
    '까르보나라': '파스타',
    '규카츠': '규카츠',
    '마키롤': '초밥',
    '포케볼': '포케',
    '쌈밥 정식': '쌈밥',
    '치즈버거': '버거',
    '페스토 파스타': '파스타',
    '반미': '베트남',
    '닭갈비': '닭갈비',
    '어묵탕': '어묵',
    '팟타이': '태국',
    '양꼬치': '양꼬치',
    '곱창전골': '곱창',
    '사시미': '회',
    '라자냐': '이탈리안',
    '설렁탕': '설렁탕',
    '케밥': '케밥',
    '고등어구이': '생선구이',
    '랍스터': '랍스터',
    '족발': '족발',
    '짜장면': '중국집',
    '짬뽕': '중국집',
    '탕수육': '중국집',
    '덴푸라 정식': '일식',
    '샤브샤브': '샤브샤브',
    '페퍼로니 피자': '피자',
    '김밥': '김밥',
    '떡볶이': '떡볶이',
    '순대국': '순대국',
    '아사이볼': '브런치 카페',
    '팥빙수': '빙수',
    '우니동': '일식',
    '월남쌈': '베트남',
    '갈비탕': '갈비탕',
    '스콘': '베이커리',
    '푸딩': '디저트 카페',
    '콥 샐러드': '샐러드',
    '육개장': '육개장',
    '볼로네제': '파스타',
    '경단': '떡',
    '소시지 볶음': '한식',
    '계란말이': '한식',
    '케사디야': '멕시칸',
    '오야코동': '일식',
    '에그 샌드위치': '샌드위치',
    '쭈꾸미 볶음': '쭈꾸미',
    '베트남 쌀국수': '쌀국수',
    '군만두': '만두',
    '아보카도 샐러드': '샐러드',
    '멘보샤': '중국집',
    '아침 머핀': '카페',
    '크림 파스타': '파스타',
    '알리오 감바스': '스페인',
    '전주비빔밥': '비빔밥',
    '전골': '전골',
    '미트파이': '베이커리',
  };

  // 음식 종류별 fallback
  const kakaoTypeKeywords = {
    '한식': '한식',
    '일식': '일식',
    '중식': '중식',
    '양식': '양식',
    '세계음식': '세계음식 맛집',
  };

  // ─── User Location ───
  let userLocation = null;
  let userLocationLabel = '';

  function getUserLocation() {
    return new Promise((resolve, reject) => {
      if (userLocation) { resolve(userLocation); return; }
      if (!navigator.geolocation) { reject(new Error('Geolocation not supported')); return; }
      navigator.geolocation.getCurrentPosition(
        pos => {
          userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          resolve(userLocation);
        },
        err => reject(err),
        { timeout: 8000, maximumAge: 5 * 60 * 1000 }
      );
    });
  }

  // ─── 카카오 로컬 API 검색 ───
  function isProviderConfigured() {
    return !!NEARBY_PROXY_URL;
  }

  async function searchPlaces(menu, location) {
    const query = kakaoSearchKeywords[menu.name] || kakaoTypeKeywords[menu.type] || '음식점';
    return searchPlacesKakao(query, location, { radius: 2000, size: 8, pageLimit: 1, sort: 'distance' });
  }

  // 카카오 응답을 UI 형식으로 변환
  function formatPlace(place, menu) {
    const dist = parseInt(place.distance);
    const distStr = dist >= 1000 ? `${(dist/1000).toFixed(1)}km` : `${dist}m`;

    // 카테고리 마지막 단어를 부제목으로 (예: "음식점 > 한식 > 찌개" → "찌개")
    const categoryParts = (place.category_name || '').split('>').map(s => s.trim());
    const subcategory = categoryParts[categoryParts.length - 1] || '';

    return {
      id: place.id || '',
      emoji: menu.emoji,
      name: place.place_name,
      dist: distStr,
      rating: '',  // 카카오 로컬 API는 평점 없음 (place_url로 카카오맵 페이지에서 확인 가능)
      price: '',
      addr: place.road_address_name || place.address_name || '',
      subcategory: subcategory,
      placeUrl: place.place_url, // 카카오맵 상세 페이지 URL
      phone: place.phone || '',
    };
  }

  // Mock 데이터 (API 키 없거나 실패 시 폴백)
  const mockRestaurantsByType = {
    '한식': [
      { emoji:'🥘', name:'엄마손맛 식당', dist:'220m', rating:'★ 4.7', price:'$$', addr:'(예시 데이터)' },
      { emoji:'🍚', name:'한솥 도시락', dist:'380m', rating:'★ 4.2', price:'$', addr:'(예시 데이터)' },
      { emoji:'🥢', name:'본가정식', dist:'510m', rating:'★ 4.6', price:'$$', addr:'(예시 데이터)' },
      { emoji:'🍲', name:'전주콩나물국밥', dist:'720m', rating:'★ 4.4', price:'$$', addr:'(예시 데이터)' },
    ],
    '일식': [
      { emoji:'🍣', name:'스시 오마카세', dist:'320m', rating:'★ 4.8', price:'$$$$', addr:'(예시 데이터)' },
      { emoji:'🍜', name:'멘야 무사시', dist:'450m', rating:'★ 4.5', price:'$$', addr:'(예시 데이터)' },
      { emoji:'🍱', name:'벤또야 도시락', dist:'180m', rating:'★ 4.3', price:'$', addr:'(예시 데이터)' },
      { emoji:'🍶', name:'이자카야 후쿠', dist:'860m', rating:'★ 4.6', price:'$$$', addr:'(예시 데이터)' },
    ],
    '중식': [
      { emoji:'🥟', name:'홍콩 딤섬', dist:'400m', rating:'★ 4.6', price:'$$$', addr:'(예시 데이터)' },
      { emoji:'🌶', name:'사천루', dist:'620m', rating:'★ 4.5', price:'$$$', addr:'(예시 데이터)' },
      { emoji:'🍜', name:'마라탕 전문점', dist:'290m', rating:'★ 4.4', price:'$$', addr:'(예시 데이터)' },
      { emoji:'🥘', name:'동방명주', dist:'1.1km', rating:'★ 4.7', price:'$$$$', addr:'(예시 데이터)' },
    ],
    '양식': [
      { emoji:'☕', name:'모닝 브런치 카페', dist:'220m', rating:'★ 4.7', price:'$$', addr:'(예시 데이터)' },
      { emoji:'🍝', name:'트라토리아 베네', dist:'380m', rating:'★ 4.5', price:'$$$', addr:'(예시 데이터)' },
      { emoji:'🍕', name:'피제리아 나폴리', dist:'510m', rating:'★ 4.6', price:'$$$', addr:'(예시 데이터)' },
      { emoji:'🥗', name:'그린 키친', dist:'720m', rating:'★ 4.4', price:'$$', addr:'(예시 데이터)' },
    ],
    '세계음식': [
      { emoji:'🌮', name:'멕시칸 타코 바', dist:'260m', rating:'★ 4.6', price:'$$', addr:'(예시 데이터)' },
      { emoji:'🍜', name:'베트남 쌀국수 하우스', dist:'410m', rating:'★ 4.5', price:'$$', addr:'(예시 데이터)' },
      { emoji:'🍤', name:'타이 키친', dist:'680m', rating:'★ 4.4', price:'$$$', addr:'(예시 데이터)' },
      { emoji:'🌯', name:'케밥 & 부리또 스팟', dist:'840m', rating:'★ 4.3', price:'$$', addr:'(예시 데이터)' },
    ],
  };


  // ─── State ───
  const APP_VERSION = 'korea-beta-v4.7';
  let currentStep = 0;
  let answers = {};
  let history = [];
  let currentMenu = null;
  let diary = []; // v2: {id,date,dateTime,time,method,amount,satisfaction,eatAgain,memo,photoDataUrl,menu}
  let favorites = []; // {menuName, addedAt}
  let personalProfile = null;
  let temporaryExcluded = new Set();
  let temporaryExcludedFamilies = new Set();
  let pendingMealPhoto = '';
  let selectedSatisfaction = '';
  let selectedEatAgain = '';
  let recordSaving = false;
  let decidedMenuName = '';
  const RECENT_EXCLUDE_DAYS = 3;

  // ─── localStorage keys ───
  const STORAGE = {
    diary: 'todaysplate_diary_v2',
    legacyDiary: 'todaysplate_diary_v1',
    favorites: 'todaysplate_favorites_v1',
    seeded: 'todaysplate_seeded_v1',
    profile: 'todaysplate_profile_v1',
    analytics: 'todaysplate_analytics_v2',
    legacyAnalytics: 'todaysplate_analytics_v1',
    session: 'todaysplate_session_v2',
    anonymousUser: 'todaysplate_anonymous_user_v1',
    visitCount: 'todaysplate_visit_count_v1',
    analyticsConsent: 'todaysplate_analytics_consent_v1',
    recommendationDraft: 'todaysplate_recommendation_draft_v1',
    rejectReasons: 'todaysplate_reject_reasons_v1',
    feedbackQueue: 'todaysplate_feedback_queue_v1',
  };

  const API_BASE_URL = (() => {
    const configured = String(window.APP_CONFIG?.API_BASE_URL || '').replace(/\/$/, '');
    if (configured) return configured;
    const nearby = String(window.APP_CONFIG?.NEARBY_PROXY_URL || '');
    try { return nearby ? new URL(nearby, window.location.href).origin : ''; }
    catch (_) { return ''; }
  })();

  function makeId(prefix = 'id') {
    if (window.crypto?.randomUUID) return `${prefix}_${window.crypto.randomUUID()}`;
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function getAnonymousUserId() {
    let id = localStorage.getItem(STORAGE.anonymousUser);
    if (!id) {
      id = makeId('anon');
      localStorage.setItem(STORAGE.anonymousUser, id);
    }
    return id;
  }

  function getSessionId() {
    let id = sessionStorage.getItem(STORAGE.session);
    if (!id) {
      id = makeId('session');
      sessionStorage.setItem(STORAGE.session, id);
    }
    return id;
  }

  function getAnalyticsConsent() {
    const value = localStorage.getItem(STORAGE.analyticsConsent);
    if (value === 'true') return true;
    if (value === 'false') return false;
    return null;
  }

  function sanitizeAnalyticsProperties(properties = {}) {
    const blocked = /(^|_)(lat|lng|latitude|longitude|address|contact|phone|email|memo|photo|image|preciseLocation)($|_)/i;
    const clean = {};
    Object.entries(properties || {}).forEach(([key, value]) => {
      if (blocked.test(key)) return;
      if (typeof value === 'string') clean[key] = value.slice(0, 160);
      else if (typeof value === 'number' || typeof value === 'boolean' || value === null) clean[key] = value;
      else if (Array.isArray(value)) clean[key] = value.slice(0, 12).map(v => typeof v === 'string' ? v.slice(0, 80) : v);
      else if (value && typeof value === 'object') {
        clean[key] = Object.fromEntries(Object.entries(value).slice(0, 20).filter(([nestedKey]) => !blocked.test(nestedKey)));
      }
    });
    return clean;
  }

  function readAnalyticsEvents() {
    try {
      const raw = localStorage.getItem(STORAGE.analytics) || localStorage.getItem(STORAGE.legacyAnalytics);
      return raw ? JSON.parse(raw) : [];
    } catch (_) { return []; }
  }

  function writeAnalyticsEvents(events) {
    localStorage.setItem(STORAGE.analytics, JSON.stringify(events.slice(-500)));
  }

  function getVisitCount() {
    return Number(localStorage.getItem(STORAGE.visitCount) || 0);
  }

  async function syncAnalyticsEvents() {
    if (!API_BASE_URL || getAnalyticsConsent() !== true || !navigator.onLine) return;
    const events = readAnalyticsEvents();
    const pending = events.filter(event => !event.syncedAt && event.eventId).slice(0, 50);
    if (!pending.length) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: pending }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const syncedIds = new Set(pending.map(event => event.eventId));
      const now = new Date().toISOString();
      writeAnalyticsEvents(events.map(event => syncedIds.has(event.eventId) ? { ...event, syncedAt: now } : event));
    } catch (error) {
      console.warn('analytics sync failed', error);
    }
  }

  function trackEvent(name, properties = {}) {
    if (getAnalyticsConsent() !== true) return;
    try {
      const events = readAnalyticsEvents();
      const event = {
        eventId: makeId('event'),
        name,
        properties: sanitizeAnalyticsProperties(properties),
        anonymousUserId: getAnonymousUserId(),
        sessionId: getSessionId(),
        occurredAt: new Date().toISOString(),
        appVersion: APP_VERSION,
        firstVisit: getVisitCount() <= 1,
        previousUseCount: Math.max(0, getVisitCount() - 1),
      };
      events.push(event);
      writeAnalyticsEvents(events);
      queueMicrotask(syncAnalyticsEvents);
    } catch (error) {
      console.warn('analytics event save failed', error);
    }
  }


  const ONBOARDING_OPTIONS = {
    homeCountry: [
      ['KR','🇰🇷 대한민국'], ['JP','🇯🇵 일본'], ['CN','🇨🇳 중국'], ['TW','🇹🇼 대만'], ['HK','🇭🇰 홍콩'],
      ['US','🇺🇸 미국'], ['GB','🇬🇧 영국'], ['FR','🇫🇷 프랑스'], ['IT','🇮🇹 이탈리아'],
      ['VN','🇻🇳 베트남'], ['TH','🇹🇭 태국'], ['IN','🇮🇳 인도'], ['MX','🇲🇽 멕시코'], ['OTHER','🌏 기타 지역']
    ],
    preferredTypes: [
      ['한식','🇰🇷 한식'], ['중식','🇨🇳 중식'], ['일식','🇯🇵 일식'], ['양식','🍝 양식'], ['세계음식','🌏 세계음식']
    ],
    allergens: [
      ['shrimp','새우'], ['seafood','생선·해산물'], ['egg','계란'], ['dairy','우유·유제품'], ['wheat','밀'], ['soy','대두'], ['nuts','땅콩·견과류'], ['pork','돼지고기'], ['beef','소고기']
    ],
    excludedIngredients: [
      ['seafood','해산물 제외'], ['shrimp','새우 제외'], ['pork','돼지고기 제외'], ['beef','소고기 제외'], ['chicken','닭고기 제외'],
      ['egg','계란 제외'], ['dairy','유제품 제외'], ['wheat','밀가루 제외'], ['spicy','매운 음식 제외'], ['fried','튀김류 제외'], ['highSodium','고나트륨 제한']
    ],
    dietRestrictions: [
      ['vegetarian','채식'], ['vegan','비건'], ['lowCarb','저탄수'], ['highProtein','고단백'], ['diet','다이어트']
    ],
    defaultWeight: [
      ['가벼움','가볍게'], ['중간','적당히'], ['든든','든든하게']
    ],
    budgetMax: [
      [10000,'약 1만원'], [30000,'약 3만원'], [50000,'약 5만원'], [null,'가격 상관없음']
    ],
    preferredSituations: [
      ['혼밥','혼밥'], ['친구와','친구와'], ['배달','배달'], ['집밥','집밥'], ['비오는날','비 오는 날'], ['운동후','운동 후'], ['속편한식사','속 편한 식사'], ['시간없을때','시간 없을 때']
    ]
  };

  const ONBOARDING_LABELS = {
    seafood:'해산물 제외', shrimp:'새우 제외', pork:'돼지고기 제외', beef:'소고기 제외', chicken:'닭고기 제외', egg:'계란 제외', dairy:'유제품 제외', wheat:'밀가루 제외', spicy:'매운 음식 제외', fried:'튀김류 제외', highSodium:'고나트륨 제한', soy:'대두 제외', nuts:'땅콩·견과류 제외',
    vegetarian:'채식', vegan:'비건', lowCarb:'저탄수', highProtein:'고단백', diet:'다이어트',
    혼밥:'혼밥', 친구와:'친구와', 배달:'배달', 집밥:'집밥', 비오는날:'비 오는 날', 운동후:'운동 후', 속편한식사:'속 편한 식사', 시간없을때:'시간 없을 때'
  };

  let onboardingDraft = null;

  // ─── Persistence ───
  function serializeDiaryRecords(records = diary) {
    return records.map(d => ({
      id: d.id || makeId('meal'),
      date: d.date,
      dateTime: d.dateTime || '',
      time: d.time,
      method: d.method || '',
      amount: Number.isFinite(Number(d.amount)) ? Number(d.amount) : null,
      satisfaction: d.satisfaction || '',
      eatAgain: d.eatAgain || '',
      memo: String(d.memo || '').slice(0, 300),
      photoDataUrl: String(d.photoDataUrl || ''),
      menuName: d.menu?.name || d.menuName || '',
      createdAt: d.createdAt || new Date().toISOString(),
    }));
  }

  function saveDiary() {
    const attempt = records => localStorage.setItem(STORAGE.diary, JSON.stringify(serializeDiaryRecords(records)));
    try {
      attempt(diary);
      return true;
    } catch (error) {
      // 사진 때문에 브라우저 저장 한도를 넘기면 오래된 사진부터 제거하고 나머지 기록은 보존합니다.
      const withPhotos = diary.filter(d => d.photoDataUrl).sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
      for (const record of withPhotos) {
        record.photoDataUrl = '';
        try {
          attempt(diary);
          setTimeout(() => showToast('저장 공간이 부족해 오래된 사진은 제외하고 기록했어요'), 0);
          return true;
        } catch (_) { /* 다음 오래된 사진 제거 */ }
      }
      console.warn('diary save failed', error);
      return false;
    }
  }

  function legacyDateTime(dateString, time) {
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return new Date().toISOString();
    const hours = { '아침': 8, '점심': 12, '저녁': 19, '야식': 23 };
    d.setHours(hours[time] || 12, 0, 0, 0);
    return d.toISOString();
  }

  function loadDiary() {
    try {
      const raw = localStorage.getItem(STORAGE.diary) || localStorage.getItem(STORAGE.legacyDiary);
      if (!raw) return [];
      const rows = JSON.parse(raw);
      const normalized = (Array.isArray(rows) ? rows : []).map(d => {
        const menu = findMenuByName(d.menuName || d.menu?.name);
        if (!menu) return null;
        return {
          id: d.id || makeId('meal'),
          date: d.date || new Date(d.dateTime || Date.now()).toDateString(),
          dateTime: d.dateTime || legacyDateTime(d.date, d.time),
          time: d.time || menu.time || getCurrentMealTime(),
          method: d.method || (menu.method === '외식' ? '외식' : '집밥'),
          amount: Number.isFinite(Number(d.amount)) ? Number(d.amount) : null,
          satisfaction: d.satisfaction || '',
          eatAgain: d.eatAgain || '',
          memo: String(d.memo || '').slice(0, 300),
          photoDataUrl: String(d.photoDataUrl || ''),
          menu,
          createdAt: d.createdAt || d.dateTime || new Date().toISOString(),
        };
      }).filter(Boolean).sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));
      if (!localStorage.getItem(STORAGE.diary) && normalized.length) {
        diary = normalized;
        saveDiary();
      }
      return normalized;
    } catch (error) {
      console.warn('diary load failed', error);
      return [];
    }
  }

  function saveFavorites() {
    try {
      localStorage.setItem(STORAGE.favorites, JSON.stringify(favorites));
    } catch (e) { console.warn('fav save failed', e); }
  }

  function loadFavorites() {
    try {
      const raw = localStorage.getItem(STORAGE.favorites);
      if (!raw) return [];
      return JSON.parse(raw).filter(f => findMenuByName(f.menuName));
    } catch (e) { return []; }
  }

  // ─── Personalization Profile ───
  function defaultPersonalProfile() {
    return {
      version: 3,
      onboardingDone: false,
      homeCountry: detectHomeCountry(),
      preferredTypes: [],
      allergens: [],
      excludedIngredients: [],
      dietRestrictions: [],
      budgetMax: null,
      defaultWeight: null,
      preferredSituations: [],
      feedbackStats: { good: 0, okay: 0, bad: 0, eaten: 0, never: 0 },
      bannedMenus: [],
      menuStats: {}, // menuName -> { shown, chosen, likes, rejects, neutral, feedback, timeChosen, lastChosenAt, lastRejectedAt, lastShownAt }
      timePatterns: { '아침': {}, '점심': {}, '저녁': {}, '야식': {} },
      acceptedCount: 0,
      rejectedCount: 0,
    };
  }

  function normalizePersonalProfile(profile) {
    const base = defaultPersonalProfile();
    const merged = { ...base, ...(profile || {}) };
    merged.bannedMenus = Array.isArray(merged.bannedMenus) ? merged.bannedMenus : [];
    merged.homeCountry = HOME_COUNTRY_CONFIG[merged.homeCountry] ? merged.homeCountry : detectHomeCountry();
    merged.preferredTypes = Array.isArray(merged.preferredTypes) ? merged.preferredTypes : [];
    merged.allergens = Array.isArray(merged.allergens) ? merged.allergens : [];
    merged.excludedIngredients = Array.isArray(merged.excludedIngredients) ? merged.excludedIngredients : [];
    merged.dietRestrictions = Array.isArray(merged.dietRestrictions) ? merged.dietRestrictions : [];
    merged.preferredSituations = Array.isArray(merged.preferredSituations) ? merged.preferredSituations : [];
    merged.budgetMax = normalizeBudgetTarget(merged.budgetMax);
    merged.defaultWeight = ['가벼움','중간','든든'].includes(merged.defaultWeight) ? merged.defaultWeight : null;
    merged.feedbackStats = { ...base.feedbackStats, ...(merged.feedbackStats || {}) };
    merged.menuStats = merged.menuStats && typeof merged.menuStats === 'object' ? merged.menuStats : {};
    merged.timePatterns = merged.timePatterns && typeof merged.timePatterns === 'object' ? merged.timePatterns : base.timePatterns;
    ['아침','점심','저녁','야식'].forEach(t => {
      if (!merged.timePatterns[t]) merged.timePatterns[t] = {};
    });
    return merged;
  }

  function saveProfile() {
    try {
      localStorage.setItem(STORAGE.profile, JSON.stringify(personalProfile || defaultPersonalProfile()));
    } catch (e) { console.warn('profile save failed', e); }
  }

  function loadProfile() {
    try {
      const raw = localStorage.getItem(STORAGE.profile);
      if (!raw) return defaultPersonalProfile();
      return normalizePersonalProfile(JSON.parse(raw));
    } catch (e) { return defaultPersonalProfile(); }
  }


  function labelForOption(value) {
    if (value === null || value === undefined) return '상관없음';
    const labels = {
      외식:'외식', 배달:'배달', 집밥:'집밥', 편의점:'편의점',
      light:'가볍게', full:'든든하게', hangover:'해장·국물', spicy:'매콤하게',
      10000:'약 1만 원', 30000:'약 3만 원', 50000:'약 5만 원'
    };
    return labels[value] || ONBOARDING_LABELS[value] || String(value);
  }

  function renderChoiceButtons(key, options, multi = true, strict = false) {
    const values = onboardingDraft?.[key];
    return `<div class="choice-grid">${options.map(([value, label]) => {
      const selected = Array.isArray(values) ? values.includes(value) : values === value;
      const encoded = value === null ? '__NULL__' : String(value).replace(/'/g, "\'");
      return `<button class="choice-chip ${strict ? 'strict' : ''} ${selected ? 'selected' : ''}" onclick="toggleOnboardingValue('${key}', '${encoded}', ${multi})">${label}</button>`;
    }).join('')}</div>`;
  }

  function renderOnboarding() {
    if (!onboardingDraft) onboardingDraft = JSON.parse(JSON.stringify(personalProfile || defaultPersonalProfile()));
    const c = document.getElementById('onboardingContent');
    if (!c) return;
    c.innerHTML = `
      <div class="onboard-section">
        <div class="onboard-label">Step 01 · Home Cuisine</div>
        <div class="onboard-title">어느 나라의 집밥을 기준으로 할까요?</div>
        <p class="onboard-help">집밥을 선택하면 이 국가의 일상적인 가정식을 대표 메뉴로 우선 추천합니다. 자동 감지 결과가 다르면 직접 바꿀 수 있습니다.</p>
        ${renderChoiceButtons('homeCountry', ONBOARDING_OPTIONS.homeCountry, false, true)}
      </div>
      <div class="onboard-section">
        <div class="onboard-label">Step 02</div>
        <div class="onboard-title">자주 끌리는 음식 스타일</div>
        <p class="onboard-help">선택한 카테고리는 바로 추천에서 가중치로 반영됩니다. 자세히 고르기에서 따로 고르면 그 조건이 더 우선입니다.</p>
        ${renderChoiceButtons('preferredTypes', ONBOARDING_OPTIONS.preferredTypes, true)}
      </div>
      <div class="onboard-section">
        <div class="onboard-label">Step 03 · Safety Filter</div>
        <div class="onboard-title">알레르기 가능 식재료</div>
        <p class="onboard-help">선택한 항목이 포함될 가능성이 있는 메뉴는 추천 후보에서 제외합니다. 실제 원재료와 교차 오염 가능성은 식당·제품에 직접 확인해야 합니다.</p>
        ${renderChoiceButtons('allergens', ONBOARDING_OPTIONS.allergens, true, true)}
      </div>
      <div class="onboard-section">
        <div class="onboard-label">Step 04 · Hard Filter</div>
        <div class="onboard-title">먹지 않는 재료와 음식</div>
        <p class="onboard-help">알레르기와 별도로, 먹지 않거나 강하게 싫어하는 재료를 선택하세요. 추천 후보에서 제외합니다.</p>
        ${renderChoiceButtons('excludedIngredients', ONBOARDING_OPTIONS.excludedIngredients, true, true)}
      </div>
      <div class="onboard-section">
        <div class="onboard-label">Step 05 · Diet Rule</div>
        <div class="onboard-title">식단 제한</div>
        <p class="onboard-help">채식, 비건, 저탄수, 고단백, 다이어트 조건을 추천 전에 반영합니다.</p>
        ${renderChoiceButtons('dietRestrictions', ONBOARDING_OPTIONS.dietRestrictions, true, true)}
      </div>
      <div class="onboard-section">
        <div class="onboard-label">Step 06</div>
        <div class="onboard-title">평소 선호하는 포만감</div>
        <p class="onboard-help">바로 추천에서 기본값으로 사용합니다.</p>
        ${renderChoiceButtons('defaultWeight', ONBOARDING_OPTIONS.defaultWeight, false)}
      </div>
      <div class="onboard-section">
        <div class="onboard-label">Step 07</div>
        <div class="onboard-title">1끼 예산</div>
        <p class="onboard-help">선택 금액을 기준으로 하되 매장별 가격 차이를 고려해 조금 여유 있게 추천합니다.</p>
        ${renderChoiceButtons('budgetMax', ONBOARDING_OPTIONS.budgetMax, false, true)}
      </div>
      <div class="onboard-section">
        <div class="onboard-label">Step 08</div>
        <div class="onboard-title">자주 생기는 식사 상황</div>
        <p class="onboard-help">상황은 후보를 억지로 줄이기보다 점수와 추천 이유에 강하게 반영합니다.</p>
        ${renderChoiceButtons('preferredSituations', ONBOARDING_OPTIONS.preferredSituations, true)}
      </div>
    `;
  }

  function decodeOnboardingValue(value) {
    if (value === '__NULL__') return null;
    if (/^-?\d+$/.test(value)) return Number(value);
    return value;
  }

  function toggleOnboardingValue(key, rawValue, multi = true) {
    if (!onboardingDraft) onboardingDraft = JSON.parse(JSON.stringify(personalProfile || defaultPersonalProfile()));
    const value = decodeOnboardingValue(rawValue);
    if (multi) {
      if (!Array.isArray(onboardingDraft[key])) onboardingDraft[key] = [];
      if (onboardingDraft[key].includes(value)) onboardingDraft[key] = onboardingDraft[key].filter(v => v !== value);
      else onboardingDraft[key].push(value);
    } else {
      onboardingDraft[key] = onboardingDraft[key] === value ? null : value;
    }
    renderOnboarding();
  }

  function openOnboarding(editMode = false) {
    if (!personalProfile) personalProfile = loadProfile();
    onboardingDraft = JSON.parse(JSON.stringify(personalProfile));
    renderOnboarding();
    switchPanel('onboarding', false);
  }

  function completeOnboarding() {
    personalProfile = normalizePersonalProfile({ ...(personalProfile || defaultPersonalProfile()), ...(onboardingDraft || {}) });
    personalProfile.onboardingDone = true;
    saveProfile();
    renderProfile();
    renderToday();
    trackEvent('taste_profile_saved', { homeCountry: personalProfile.homeCountry, preferredTypes: personalProfile.preferredTypes.length, allergens: personalProfile.allergens.length, exclusions: personalProfile.excludedIngredients.length });
    showToast('입맛 설정을 저장했어요');
    switchPanel('home');
  }

  function skipOnboarding() {
    if (!personalProfile) personalProfile = loadProfile();
    personalProfile.onboardingDone = true;
    saveProfile();
    showToast('나중에 입맛 탭에서 설정할 수 있어요');
    switchPanel('home');
  }

  function inferRestrictionTags(menu) {
    const text = `${menu.name || ''} ${menu.en || ''} ${menu.desc || ''} ${(menu.ingredients || []).map(i => i[0]).join(' ')}`.toLowerCase();
    const has = words => words.some(w => text.includes(w.toLowerCase()));
    const tags = new Set();
    if (has(['새우','shrimp','prawn'])) tags.add('shrimp');
    if (has(['연어','초밥','회','참치','새우','해물','오징어','조개','게','생선','명란','낙지','문어','굴','고등어','바지락','홍합','sushi','salmon','tuna','seafood'])) tags.add('seafood');
    if (has(['돼지','삼겹','제육','돈까스','돈카츠','스팸','소시지','햄','베이컨','pork','sausage','bacon'])) tags.add('pork');
    if (has(['소고기','쇠고기','스테이크','불고기','규동','갈비','우육','beef','steak'])) tags.add('beef');
    if (has(['치킨','닭','닭가슴살','chicken'])) tags.add('chicken');
    if (has(['계란','달걀','에그','egg'])) tags.add('egg');
    if (has(['치즈','우유','버터','요거트','크림','라떼','모짜렐라','마요네즈','dairy','milk','cheese','butter','yogurt','cream'])) tags.add('dairy');
    if (has(['밀가루','빵','면','국수','파스타','라멘','우동','소바','토스트','샌드위치','버거','피자','또띠야','베이글','크루아상','wheat','noodle','pasta','bread','bun','pizza'])) tags.add('wheat');
    if (has(['간장','된장','두부','콩','대두','soy','tofu','miso'])) tags.add('soy');
    if (has(['땅콩','아몬드','호두','캐슈','피스타치오','견과','peanut','almond','walnut','cashew','nut'])) tags.add('nuts');
    if ((menu.spicy || 0) >= 1 || has(['마라','매운','고추','칠리','spicy','hot'])) tags.add('spicy');
    if (has(['튀김','후라이드','돈까스','텐동','가라아게','fried','tempura'])) tags.add('fried');
    if (menu.soup || has(['찌개','탕','국','라멘','우동','국수','짬뽕','마라탕','부대찌개'])) tags.add('highSodium');
    if (['pork','beef','chicken','seafood','shrimp','egg','dairy'].some(t => tags.has(t))) tags.add('animal');
    return Array.from(tags);
  }

  function ensureRestrictionTags(menu) {
    if (!menu.restrictionTags) menu.restrictionTags = inferRestrictionTags(menu);
    return menu.restrictionTags;
  }

  const ALLERGEN_LABELS = {
    shrimp:'새우', seafood:'생선·조개류', egg:'계란', dairy:'우유·유제품', wheat:'밀', soy:'대두', nuts:'땅콩·견과류'
  };

  function ingredientName(item) {
    if (Array.isArray(item)) return String(item[0] || '').trim();
    if (item && typeof item === 'object') return String(item.name || item.item || '').trim();
    return String(item || '').trim();
  }

  function getMainIngredients(menu, limit = 5) {
    const recipeItems = menu?.recipe?.ingredients || menu?.ingredients || [];
    const names = recipeItems.map(ingredientName).filter(Boolean).filter(name => !/^(물|소금|후추|식용유|기름)$/u.test(name));
    return [...new Set(names)].slice(0, limit);
  }

  function getAllergenCandidates(menu) {
    const tags = ensureRestrictionTags(menu || {});
    return Object.keys(ALLERGEN_LABELS).filter(tag => tags.includes(tag)).map(tag => ALLERGEN_LABELS[tag]);
  }

  function expectedPriceRange(menu) {
    const center = Math.max(0, Number(menu?.price || 0));
    const min = Number(menu?.priceMin || Math.max(0, Math.floor(center * 0.8 / 500) * 500));
    const max = Number(menu?.priceMax || Math.ceil(center * 1.25 / 500) * 500);
    return { min, max: Math.max(min, max) };
  }

  function currentMealMethod(menu) {
    if (answers?.mode) return answers.mode;
    if (menu?.method === '외식') return '외식·배달';
    if (menu?.method === '간단') return '집밥·편의점';
    return '집밥';
  }

  function renderMenuDecisionFacts(menu) {
    const ingredients = getMainIngredients(menu);
    const allergens = getAllergenCandidates(menu);
    const price = expectedPriceRange(menu);
    const cookText = Number(menu?.cook || 0) <= 0 ? '매장·배달 이용' : `약 ${Number(menu.cook).toLocaleString()}분`;
    return `
      <div class="decision-facts">
        <div class="decision-facts-head"><span>결정 정보</span><strong>먹기 전에 확인하세요</strong></div>
        <div class="decision-facts-grid">
          <div><span>예상 가격</span><strong>${price.min.toLocaleString()}~${price.max.toLocaleString()}원</strong></div>
          <div><span>예상 준비 시간</span><strong>${escapeHtml(cookText)}</strong></div>
          <div><span>식사 방식</span><strong>${escapeHtml(currentMealMethod(menu))}</strong></div>
          <div><span>매운맛</span><strong>${escapeHtml(spiceLabel(menu))}</strong></div>
          <div><span>포만감</span><strong>${escapeHtml(menu?.weight || '정보 확인 필요')}</strong></div>
          <div><span>주요 식재료</span><strong>${ingredients.length ? escapeHtml(ingredients.join(', ')) : '정보 확인 필요'}</strong></div>
        </div>
        <div class="allergen-fact ${allergens.length ? 'warning' : ''}">
          <span>알레르기 가능 식재료</span>
          <strong>${allergens.length ? escapeHtml(allergens.join(', ')) : '등록 정보에서 확인되지 않음'}</strong>
          <p>실제 원재료, 조리 과정과 교차 오염 가능성은 식당·제품 표시를 직접 확인해야 합니다.</p>
        </div>
      </div>
    `;
  }

  function violatesUserRestrictions(menu) {
    if (!personalProfile) personalProfile = loadProfile();
    const tags = ensureRestrictionTags(menu);
    const excluded = [...(personalProfile.allergens || []), ...(personalProfile.excludedIngredients || [])];
    if (excluded.some(tag => tags.includes(tag))) return true;
    if (personalProfile.budgetMax && !isWithinBudget(menu.price, personalProfile.budgetMax)) return true;
    const diets = personalProfile.dietRestrictions || [];
    if (diets.includes('vegan') && (tags.includes('animal') || tags.includes('egg') || tags.includes('dairy'))) return true;
    if (diets.includes('vegetarian') && (tags.includes('pork') || tags.includes('beef') || tags.includes('chicken') || tags.includes('seafood') || tags.includes('shrimp'))) return true;
    if (diets.includes('lowCarb') && (menu.nutrition?.c || 0) >= 50) return true;
    if (diets.includes('highProtein') && (menu.nutrition?.p || 0) < 25) return true;
    if (diets.includes('diet') && Number(menu.kcal || 0) > 650) return true;
    return false;
  }

  function restrictionSummary() {
    if (!personalProfile) return [];
    const items = [];
    (personalProfile.allergens || []).forEach(v => items.push(`알레르기 ${labelForOption(v).replace(' 제외','')}`));
    (personalProfile.excludedIngredients || []).forEach(v => items.push(labelForOption(v)));
    (personalProfile.dietRestrictions || []).forEach(v => items.push(labelForOption(v)));
    if (personalProfile.budgetMax) items.push(`예산 ${budgetLabel(personalProfile.budgetMax)}`);
    return items;
  }

  function ensureMenuStats(menuName) {
    if (!personalProfile) personalProfile = defaultPersonalProfile();
    if (!personalProfile.menuStats[menuName]) {
      personalProfile.menuStats[menuName] = {
        shown: 0,
        chosen: 0,
        likes: 0,
        rejects: 0,
        neutral: 0,
        feedback: { good: 0, okay: 0, bad: 0, eaten: 0, never: 0 },
        timeChosen: { '아침': 0, '점심': 0, '저녁': 0 },
        lastChosenAt: null,
        lastRejectedAt: null,
        lastShownAt: null,
      };
    }
    if (!personalProfile.menuStats[menuName].feedback) personalProfile.menuStats[menuName].feedback = { good: 0, okay: 0, bad: 0, eaten: 0, never: 0 };
    if (!Number.isFinite(personalProfile.menuStats[menuName].neutral)) personalProfile.menuStats[menuName].neutral = 0;
    ['아침','점심','저녁','야식'].forEach(t => {
      if (!personalProfile.menuStats[menuName].timeChosen) personalProfile.menuStats[menuName].timeChosen = {};
      if (!personalProfile.menuStats[menuName].timeChosen[t]) personalProfile.menuStats[menuName].timeChosen[t] = 0;
    });
    return personalProfile.menuStats[menuName];
  }

  function getCurrentMealTime() {
    const now = new Date();
    const hour = now.getHours() + now.getMinutes() / 60;
    if (hour >= 5 && hour < 10.5) return '아침';
    if (hour >= 10.5 && hour < 15.5) return '점심';
    if (hour >= 15.5 && hour < 21.5) return '저녁';
    return '야식';
  }

  function isBanned(menuName) {
    return !!personalProfile && personalProfile.bannedMenus.includes(menuName);
  }

  function isTemporarilyExcluded(menuName) {
    return temporaryExcluded && temporaryExcluded.has(menuName);
  }

  function isTemporarilyExcludedFamily(menu) {
    const family = getMenuFamily(menu);
    return !!family && temporaryExcludedFamilies && temporaryExcludedFamilies.has(family);
  }

  function getRecentMenuNames(days = RECENT_EXCLUDE_DAYS) {
    const names = new Set();
    const cutoff = new Date(today);
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - days);
    diary.forEach(d => {
      const date = new Date(d.date);
      date.setHours(0, 0, 0, 0);
      if (date >= cutoff && d.menu) names.add(d.menu.name);
    });
    return names;
  }

  function isRecentlyEaten(menuName) {
    return getRecentMenuNames().has(menuName);
  }

  function recordMenuFeedback(menu, action, mealTime = null) {
    if (!menu) return;
    if (!personalProfile) personalProfile = loadProfile();

    const now = new Date().toISOString();
    const stats = ensureMenuStats(menu.name);
    const timeKey = mealTime || (answers && answers.time) || getCurrentMealTime();

    if (action === 'shown') {
      stats.shown += 1;
      stats.lastShownAt = now;
    }

    if (action === 'accept') {
      stats.chosen += 1;
      stats.likes += 1;
      stats.lastChosenAt = now;
      personalProfile.acceptedCount += 1;
      if (['아침','점심','저녁','야식'].includes(timeKey)) {
        stats.timeChosen[timeKey] = (stats.timeChosen[timeKey] || 0) + 1;
        personalProfile.timePatterns[timeKey][menu.name] = (personalProfile.timePatterns[timeKey][menu.name] || 0) + 1;
      }
    }

    if (action === 'reject') {
      stats.rejects += 1;
      stats.lastRejectedAt = now;
      personalProfile.rejectedCount += 1;
    }

    if (action === 'ban') {
      stats.rejects += 3;
      stats.lastRejectedAt = now;
      if (!personalProfile.bannedMenus.includes(menu.name)) {
        personalProfile.bannedMenus.push(menu.name);
      }
      personalProfile.rejectedCount += 1;
    }

    saveProfile();
  }

  function getPersonalBonus(menu, ans = {}) {
    if (!personalProfile) personalProfile = loadProfile();
    const stats = personalProfile.menuStats[menu.name] || {};
    const mealTime = ans.time || ans.contextTime || getCurrentMealTime();
    const timeHit = personalProfile.timePatterns?.[mealTime]?.[menu.name] || 0;

    let bonus = 0;
    bonus += Math.min((stats.likes || 0) * 0.25, 1.2);
    bonus += Math.min((stats.chosen || 0) * 0.15, 0.9);
    bonus -= Math.min((stats.rejects || 0) * 0.35, 1.8);
    bonus += Math.min(timeHit * 0.35, 1.4);

    if (isFavorited(menu.name)) bonus += 0.4;
    return bonus;
  }

  function toMatchPercent(score) {
    return Math.max(5, Math.min(99, Math.round(score)));
  }

  function renderPersonalNote(menu, ans = {}) {
    if (!menu || !personalProfile) return '';
    const stats = personalProfile.menuStats[menu.name] || {};
    const mealTime = ans.time || ans.contextTime || getCurrentMealTime();
    const timeHit = personalProfile.timePatterns?.[mealTime]?.[menu.name] || 0;
    const recentCount = getRecentMenuNames().size;

    const notes = [];
    if ((stats.likes || 0) > 0) notes.push(`선호 기록 ${stats.likes}회 반영`);
    if ((stats.rejects || 0) > 0) notes.push(`거부 기록 ${stats.rejects}회로 점수 일부 감소`);
    if (timeHit > 0) notes.push(`${mealTime} 시간대 선택 패턴 ${timeHit}회 반영`);
    if (isFavorited(menu.name)) notes.push('찜한 메뉴라 가중치 추가');
    if (recentCount > 0) notes.push(`최근 먹은 메뉴 ${recentCount}개는 후보에서 제외`);

    if (notes.length === 0) {
      return `<div class="personal-note"><strong>개인화:</strong> 아직 학습 데이터가 적어서 질문 답변 중심으로 추천했어요.</div>`;
    }

    return `
      <div class="personal-note">
        <strong>개인화 반영</strong>
        <ul>${notes.map(n => `<li>${n}</li>`).join('')}</ul>
      </div>
    `;
  }



  function escapeJsString(value) {
    return String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ');
  }

  function countBy(items, mapper) {
    return items.reduce((acc, item) => {
      const key = mapper(item);
      if (!key) return acc;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }

  function sortedEntries(obj) {
    return Object.entries(obj || {}).sort((a, b) => b[1] - a[1]);
  }

  function topStatMenus(kind = 'likes', limit = 5) {
    if (!personalProfile) personalProfile = loadProfile();
    return Object.entries(personalProfile.menuStats || {})
      .map(([name, stats]) => ({ menu: findMenuByName(name), stats }))
      .filter(x => x.menu && (x.stats[kind] || 0) > 0)
      .sort((a, b) => (b.stats[kind] || 0) - (a.stats[kind] || 0))
      .slice(0, limit);
  }

  function getRecommendationReasons(menu, ans = {}, candidateCount = null) {
    const profile = getMenuProfile(menu);
    const stats = personalProfile?.menuStats?.[menu.name] || {};
    const mealTime = ans.time || ans.contextTime || getCurrentMealTime();
    const timeHit = personalProfile?.timePatterns?.[mealTime]?.[menu.name] || 0;
    const recentNames = getRecentMenuNames();
    const reasons = [];

    if (ans.time && menu.time === ans.time) reasons.push(`${ans.time} 시간대 조건과 맞습니다.`);
    else if (!ans.time && menu.time === mealTime) reasons.push(`현재 시간 기준 ${mealTime} 메뉴로 자연스럽습니다.`);
    else reasons.push(`시간대는 강제로 제한하지 않고, 선택한 식사 방식과 예산을 우선 반영했습니다.`);

    if (ans.type && menu.type === ans.type) reasons.push(`선택한 ${ans.type} 카테고리와 정확히 일치합니다.`);
    if (ans.weight && menu.weight === ans.weight) reasons.push(`원한 포만감인 '${ans.weight}' 범주에 맞습니다.`);
    if (ans.method && menu.method === ans.method) reasons.push(`오늘의 조리 방식 '${ans.method}'에 맞습니다.`);
    if (ans.mode) reasons.push(`${labelForOption(ans.mode)} 상황에서 실행하기 쉬운 메뉴입니다.`);
    if (ans.need) reasons.push(`현재 원하는 '${labelForOption(ans.need)}' 조건에 맞습니다.`);
    if (ans.budget !== null && ans.budget !== undefined) reasons.push(`평균 가격이 ${budgetLabel(ans.budget)} 범위에 들어옵니다.`);
    if (ans.spicy) reasons.push(`맵기 선호를 반영해 ${spiceLabel(menu)} 메뉴를 골랐습니다.`);
    if (ans.situation && menuHasSituation(menu, ans.situation)) reasons.push(`오늘 상황 '${labelForOption(ans.situation)}'과 어울리는 메뉴로 판단했습니다.`);
    if (!ans.type && (personalProfile?.preferredTypes || []).includes(menu.type)) reasons.push(`온보딩에서 ${menu.type}을 선호한다고 설정해 기본 가중치를 더했습니다.`);
    if (!ans.weight && personalProfile?.defaultWeight && menu.weight === personalProfile.defaultWeight) reasons.push(`평소 선호 포만감 '${personalProfile.defaultWeight}'과 맞습니다.`);
    if (personalProfile?.budgetMax) reasons.push(`평소 예산 ${budgetLabel(personalProfile.budgetMax)} 조건을 통과했습니다.`);
    const restrictions = restrictionSummary();
    if (restrictions.length) reasons.push(`제외 조건(${restrictions.slice(0,3).join(', ')}${restrictions.length > 3 ? ' 외' : ''})에 걸리는 메뉴는 후보에서 제외했습니다.`);

    if ((stats.likes || 0) > 0) reasons.push(`이전에 긍정 반응을 ${stats.likes}회 남긴 메뉴라 가중치가 붙었습니다.`);
    if (timeHit > 0) reasons.push(`${mealTime} 시간대에 비슷한 선택이 ${timeHit}회 있어 패턴 점수를 반영했습니다.`);
    if (isFavorited(menu.name)) reasons.push('찜한 메뉴라 선호 점수를 추가했습니다.');
    if (recentNames.size > 0) reasons.push(`오늘/어제 먹은 메뉴 ${recentNames.size}개는 자동 제외했습니다.`);
    if (profile.situations.includes('시간없을때')) reasons.push('조리 부담이 낮아 빠르게 결정하기 좋습니다.');
    if (profile.moods.includes('회복형')) reasons.push('국물감이 있어 컨디션 회복형 식사로 적합합니다.');
    if (candidateCount !== null) reasons.push(`전체 ${menus.length}개 메뉴 중 조건을 정확히 만족한 ${candidateCount}개 후보만 비교했습니다.`);

    return [...new Set(reasons)].slice(0, 6);
  }

  function renderRecommendationReasonCard(menu, ans = {}, candidateCount = null) {
    const reasons = getRecommendationReasons(menu, ans, candidateCount);
    return `
      <div class="reason-card">
        <div class="reason-label">추천 근거</div>
        <div class="reason-title">오늘 이 메뉴를 추천한 이유</div>
        <ul class="reason-list">${reasons.map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
      </div>
    `;
  }


  function renderFeedbackCard(menu) {
    return `
      <div class="feedback-card">
        <div class="feedback-title">이 추천 어땠나요?</div>
        <p class="feedback-sub">아래 반응은 다음 추천의 가중치로 바로 반영됩니다. 실제로 먹었으면 식단 기록까지 이어집니다.</p>
        <div class="feedback-grid">
          <button class="feedback-btn" onclick="rateCurrentMenu('good')">👍 좋았어요</button>
          <button class="feedback-btn" onclick="rateCurrentMenu('okay')">😐 애매해요</button>
          <button class="feedback-btn" onclick="rateCurrentMenu('bad')">👎 별로예요</button>
          <button class="feedback-btn" onclick="rateCurrentMenu('eaten')">🍽 실제로 먹었어요</button>
          <button class="feedback-btn danger" onclick="rateCurrentMenu('never')">🚫 다시는 추천하지 마세요</button>
        </div>
      </div>
    `;
  }

  function rateCurrentMenu(kind) {
    if (!currentMenu) return;
    if (!personalProfile) personalProfile = loadProfile();
    const stats = ensureMenuStats(currentMenu.name);
    stats.feedback[kind] = (stats.feedback[kind] || 0) + 1;
    personalProfile.feedbackStats[kind] = (personalProfile.feedbackStats[kind] || 0) + 1;

    if (kind === 'good') {
      recordMenuFeedback(currentMenu, 'accept', answers.time || getCurrentMealTime());
      showToast('좋아요 반응을 학습했어요');
    } else if (kind === 'okay') {
      stats.neutral += 1;
      saveProfile();
      showToast('애매한 추천으로 기록했어요');
    } else if (kind === 'bad') {
      recordMenuFeedback(currentMenu, 'reject');
      temporaryExcluded.add(currentMenu.name);
      showToast('다음 추천에서 점수를 낮출게요');
    } else if (kind === 'eaten') {
      recordMenuFeedback(currentMenu, 'accept', answers.time || getCurrentMealTime());
      showToast('실제 식사로 기록할게요');
      openRecordModal();
    } else if (kind === 'never') {
      if (!confirm(`'${currentMenu.name}'을(를) 앞으로 추천에서 영구 제외할까요?`)) return;
      recordMenuFeedback(currentMenu, 'ban');
      temporaryExcluded.add(currentMenu.name);
      showToast('영구 제외에 추가했어요');
      showResult();
      return;
    }
    saveProfile();
    renderProfile();
  }

  function renderProfile() {
    const c = document.getElementById('profileContent');
    if (!c) return;
    if (!personalProfile) personalProfile = loadProfile();

    const liked = topStatMenus('likes', 5);
    const rejected = topStatMenus('rejects', 5);
    const banned = (personalProfile.bannedMenus || []).map(name => findMenuByName(name)).filter(Boolean);
    const selectedMenus = Object.entries(personalProfile.menuStats || {})
      .map(([name, stats]) => ({ menu: findMenuByName(name), stats }))
      .filter(x => x.menu && (x.stats.chosen || 0) > 0);

    const typeCounts = {};
    const weightCounts = {};
    selectedMenus.forEach(({ menu, stats }) => {
      typeCounts[menu.type] = (typeCounts[menu.type] || 0) + (stats.chosen || 0);
      weightCounts[menu.weight] = (weightCounts[menu.weight] || 0) + (stats.chosen || 0);
    });

    const topType = sortedEntries(typeCounts)[0];
    const topWeight = sortedEntries(weightCounts)[0];
    const topTime = sortedEntries(Object.fromEntries(Object.entries(personalProfile.timePatterns || {}).map(([t, obj]) => [t, Object.values(obj || {}).reduce((a,b)=>a+b,0)])))[0];

    c.innerHTML = `
      <div class="mini-stat-grid">
        <div class="mini-stat"><strong>${personalProfile.acceptedCount || 0}</strong><span>선호</span></div>
        <div class="mini-stat"><strong>${personalProfile.rejectedCount || 0}</strong><span>비선호</span></div>
        <div class="mini-stat"><strong>${banned.length}</strong><span>제외</span></div>
      </div>

      <div class="profile-section">
        <div class="profile-label">기본 설정</div>
        <div class="profile-title">추천 전 적용되는 강한 조건</div>
        <div class="settings-summary">
          <span class="settings-pill">집밥 기준 ${escapeHtml(getHomeCountryInfo().flag + ' ' + getHomeCountryInfo().label)} · ${escapeHtml(getHomeCuisineType())}</span>
          ${(personalProfile.preferredTypes || []).map(x => `<span class="settings-pill">선호 ${escapeHtml(x)}</span>`).join('') || '<span class="settings-pill">선호 스타일 미설정</span>'}
          ${(personalProfile.allergens || []).map(x => `<span class="settings-pill safety">알레르기 ${escapeHtml(labelForOption(x).replace(' 제외',''))}</span>`).join('')}
          ${(personalProfile.excludedIngredients || []).map(x => `<span class="settings-pill">${escapeHtml(labelForOption(x))}</span>`).join('')}
          ${(personalProfile.dietRestrictions || []).map(x => `<span class="settings-pill">${escapeHtml(labelForOption(x))}</span>`).join('')}
          ${personalProfile.budgetMax ? `<span class="settings-pill">예산 ${budgetLabel(personalProfile.budgetMax)}</span>` : '<span class="settings-pill">가격 상관없음</span>'}
          ${personalProfile.defaultWeight ? `<span class="settings-pill">기본 포만감 ${escapeHtml(personalProfile.defaultWeight)}</span>` : ''}
        </div>
        <button class="empty-cta" style="margin-top:12px;" onclick="openOnboarding(true)">입맛 설정 수정</button>
      </div>

      <div class="profile-section">
        <div class="profile-label">입맛 요약</div>
        <div class="profile-title">현재 앱이 파악한 입맛</div>
        <div class="pref-chip-wrap">
          <span class="pref-chip">${topType ? `선호 스타일 ${topType[0]}` : '선호 스타일 학습 전'}</span>
          <span class="pref-chip">${topWeight ? `포만감 ${topWeight[0]}` : '포만감 학습 전'}</span>
          <span class="pref-chip">${topTime ? `자주 고른 시간 ${topTime[0]}` : '시간대 패턴 학습 전'}</span>
          <span class="pref-chip">최근 메뉴 ${getRecentMenuNames().size}개 자동 제외</span>
        </div>
      </div>

      <div class="profile-section">
        <div class="profile-label">제외 메뉴</div>
        <div class="profile-title">불호 메뉴 영구 제외</div>
        ${banned.length ? `<div class="profile-list">${banned.map(m => `
          <div class="profile-row">
            <div class="profile-row-emoji">${m.emoji}</div>
            <div class="profile-row-main"><div class="profile-row-name">${escapeHtml(m.name)}</div><div class="profile-row-meta">추천 후보에서 제외됨</div></div>
            <button class="profile-action" onclick="unbanMenu('${escapeJsString(m.name)}')">제외 해제</button>
          </div>
        `).join('')}</div>` : '<p class="empty-text" style="padding:8px 0; margin:0;">아직 영구 제외한 메뉴가 없어요.</p>'}
      </div>

      <div class="profile-section">
        <div class="profile-label">선호 기록</div>
        <div class="profile-title">자주 선택한 메뉴</div>
        ${liked.length ? `<div class="profile-list">${liked.map(({menu, stats}) => `
          <div class="profile-row" onclick="currentMenu=findMenuByName('${escapeJsString(menu.name)}'); showResultForMenu(currentMenu)">
            <div class="profile-row-emoji">${menu.emoji}</div>
            <div class="profile-row-main"><div class="profile-row-name">${escapeHtml(menu.name)}</div><div class="profile-row-meta">선호 ${stats.likes || 0}회 · 선택 ${stats.chosen || 0}회</div></div>
          </div>
        `).join('')}</div>` : '<p class="empty-text" style="padding:8px 0; margin:0;">찜하거나 기록하면 선호 메뉴가 쌓입니다.</p>'}
      </div>

      <div class="profile-section">
        <div class="profile-label">비선호 기록</div>
        <div class="profile-title">덜 맞았던 메뉴</div>
        ${rejected.length ? `<div class="profile-list">${rejected.map(({menu, stats}) => `
          <div class="profile-row">
            <div class="profile-row-emoji">${menu.emoji}</div>
            <div class="profile-row-main"><div class="profile-row-name">${escapeHtml(menu.name)}</div><div class="profile-row-meta">거부 ${stats.rejects || 0}회</div></div>
          </div>
        `).join('')}</div>` : '<p class="empty-text" style="padding:8px 0; margin:0;">다른 추천을 누르면 거부 신호가 쌓입니다.</p>'}
      </div>

      <button class="retry-btn danger-soft" onclick="resetPreferenceOnly()">개인화 취향만 초기화</button>
    `;
  }

  function unbanMenu(menuName) {
    if (!personalProfile) personalProfile = loadProfile();
    personalProfile.bannedMenus = (personalProfile.bannedMenus || []).filter(name => name !== menuName);
    saveProfile();
    renderProfile();
    showToast(`'${menuName}' 제외를 해제했어요`);
  }

  function resetPreferenceOnly() {
    if (!confirm('식단 기록과 찜 목록은 유지하고, 선호/불호 학습 데이터만 초기화할까요?')) return;
    personalProfile = defaultPersonalProfile();
    saveProfile();
    renderProfile();
    showToast('개인화 취향 데이터가 초기화되었어요');
  }

  function showResultForMenu(menu) {
    if (!menu) return;
    currentMenu = menu;
    const topEl = document.getElementById('topPick');
    const score = scoreMenu(menu, answers || {});
    document.querySelector('.action-grid').style.display = '';
    document.querySelector('.runner-title').style.display = '';
    document.getElementById('resultSub').textContent = '선택한 메뉴 상세 보기';
    topEl.innerHTML = renderTopPickCard(menu, score);
    document.getElementById('resultDetails').innerHTML = `
      ${renderRecommendationReasonCard(menu, answers || {}, null)}
      ${renderMenuDecisionFacts(menu)}
      ${renderMenuPremiumDetails(menu)}
      ${renderPersonalNote(menu, answers || {})}
      ${renderFeedbackCard(menu)}
    `;
    document.getElementById('runnerList').innerHTML = '';
    updateFavButton();
    saveRecommendationDraft('result', { menuName: menu.name });
    switchPanel('result', false);
  }
  function resetAllData() {
    if (!confirm('추천 기록, 식사 기록, 찜, 취향, 익명 분석 데이터와 보관 중인 피드백을 이 기기에서 모두 삭제할까요?')) return;
    Object.values(STORAGE).forEach(key => localStorage.removeItem(key));
    sessionStorage.removeItem(STORAGE.session);
    diary = [];
    favorites = [];
    personalProfile = defaultPersonalProfile();
    temporaryExcluded = new Set();
    temporaryExcludedFamilies = new Set();
    currentMenu = null;
    answers = {};
    history = [];
    pendingMealPhoto = '';
    renderToday();
    renderDiary();
    renderFavorites();
    renderProfile();
    renderResumeRecommendation();
    closePrivacyModal();
    renderAnalyticsConsentPrompt();
    showToast('이 기기의 모든 사용자 데이터를 삭제했어요');
  }

  // ─── Date ───
  const days = ['일요일','월요일','화요일','수요일','목요일','금요일','토요일'];
  const months = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  const today = new Date();

  function updateHomeContext() {
    const mealTime = getCurrentMealTime();
    const greeting = document.getElementById('mealGreeting');
    const quickTitle = document.getElementById('quickRecommendTitle');
    const dateLine = document.getElementById('dateLine');
    if (dateLine) dateLine.textContent = `${months[today.getMonth()]} ${today.getDate()}일 · ${days[today.getDay()]}`;
    if (greeting) {
      const copy = {
        아침: '가볍고 기분 좋은 아침 메뉴를 찾아드려요',
        점심: '지금 먹기 좋은 점심 메뉴를 찾아드려요',
        저녁: '오늘 하루를 마무리할 저녁 메뉴를 찾아드려요'
      };
      greeting.textContent = copy[mealTime] || '지금 먹기 좋은 메뉴를 찾아드려요';
    }
    if (quickTitle) quickTitle.textContent = `${mealTime} 바로 추천`;
    renderResumeRecommendation();
  }

  updateHomeContext();

  // ─── Diary initialization ───
  function initDiary() {
    personalProfile = loadProfile();
    temporaryExcluded = new Set();
    temporaryExcludedFamilies = new Set();
    diary = loadDiary();
    favorites = loadFavorites();
    renderToday();
  }

  // ─── Filter ───
  function getAvailableMenuPool({ includeRecent = false, includeTemporary = false } = {}) {
    if (!personalProfile) personalProfile = loadProfile();
    const recent = getRecentMenuNames();
    const baseAllowed = m => {
      if (!m || !m.name) return false;
      if (isBanned(m.name)) return false;
      if (violatesUserRestrictions(m)) return false;
      if (!includeTemporary && isTemporarilyExcluded(m.name)) return false;
      if (!includeTemporary && isTemporarilyExcludedFamily(m)) return false;
      return true;
    };
    const strictPool = menus.filter(m => {
      if (!baseAllowed(m)) return false;
      if (!includeRecent && recent.has(m.name)) return false;
      return true;
    });

    // 최근 먹은 메뉴와 현재 세션에서 거절한 메뉴도 사용자가 명시한 제한으로 취급합니다.
    // 후보가 없더라도 앱이 임의로 이 조건을 풀어 같은 메뉴를 다시 추천하지 않습니다.
    return strictPool;
  }

  function filterMenus(ans, poolOptions = {}) {
    const pool = getAvailableMenuPool(poolOptions);
    return pool.filter(m => {
      if (ans.time && m.time !== ans.time) return false;
      if (ans.type && m.type !== ans.type) return false;
      if (ans.weight && m.weight !== ans.weight) return false;
      if (ans.soup !== undefined && ans.soup !== null && m.soup !== ans.soup) return false;
      if (ans.spicy) {
        if (ans.spicy === 'mild' && m.spicy > 0) return false;
        if (ans.spicy === 'mid' && (m.spicy < 1 || m.spicy > 2)) return false;
        if (ans.spicy === 'hot' && m.spicy < 2) return false;
      }
      if (ans.method && m.method !== ans.method) return false;
      if (ans.mode === '외식' && m.method !== '외식') return false;
      if (ans.mode === '배달' && m.method !== '외식') return false;
      if (ans.mode === '집밥' && !['간단','요리'].includes(m.method)) return false;
      if (ans.mode === '편의점' && !(m.method === '간단' && Number(m.price || 0) <= 7000)) return false;
      if (!ans.time && ans.contextTime && ans.contextTime !== '아침' && isBreakfastOnlyMenu(m)) return false;
      if (!isWithinBudget(m.price, ans.budget)) return false;
      return true;
    });
  }

  function filterMenusSoft(ans) {
    // 엄격 추천 모드: 사용자가 고른 핵심 조건은 자동으로 풀지 않습니다.
    // situation은 후보 제외가 아니라 점수/추천 이유에 반영합니다.
    return filterMenus(ans);
  }

  function getStrictMissMessages(ans = {}) {
    const messages = [];
    if (ans.type) messages.push(`${ans.type} 조건 유지`);
    if (ans.time) messages.push(`${ans.time} 시간대 유지`);
    if (ans.weight) messages.push(`${ans.weight} 포만감 유지`);
    if (ans.soup !== undefined && ans.soup !== null) messages.push(ans.soup ? '국물 있음 유지' : '국물 없음 유지');
    if (ans.spicy) messages.push(`맵기 ${ans.spicy === 'mild' ? '순한맛' : ans.spicy === 'mid' ? '약간 매콤' : '매운맛'} 유지`);
    if (ans.method) messages.push(`${ans.method} 조건 유지`);
    if (ans.mode) messages.push(`${labelForOption(ans.mode)} 방식 유지`);
    if (ans.need) messages.push(`${labelForOption(ans.need)} 상태 유지`);
    if (ans.budget !== null && ans.budget !== undefined) messages.push(`${budgetLabel(ans.budget)} 예산 유지`);
    if (ans.situation) messages.push(`상황 ${labelForOption(ans.situation)} 점수 반영`);
    return messages;
  }

  function cuisinePreferenceBonus(menu) {
    if (!personalProfile) personalProfile = loadProfile();
    const selectedMenus = Object.entries(personalProfile.menuStats || {})
      .map(([name, stats]) => ({ menu: findMenuByName(name), stats }))
      .filter(x => x.menu && (x.stats.chosen || 0) > 0);
    const typeChosen = selectedMenus
      .filter(x => x.menu.type === menu.type)
      .reduce((sum, x) => sum + (x.stats.chosen || 0), 0);
    return Math.min(typeChosen * 0.8, 6);
  }

  function varietyBonus(menu) {
    const recent = Array.from(getRecentMenuNames(7))
      .map(name => findMenuByName(name))
      .filter(Boolean);
    if (!recent.length) return 0;
    const sameTypeCount = recent.filter(m => m.type === menu.type).length;
    const sameWeightCount = recent.filter(m => m.weight === menu.weight).length;
    let bonus = 4;
    if (sameTypeCount >= 3) bonus -= 3;
    if (sameWeightCount >= 4) bonus -= 2;
    return Math.max(-4, bonus);
  }

  function menuHasSituation(menu, situation) {
    if (!situation) return false;
    const profile = getMenuProfile(menu);
    return (profile.situations || []).includes(situation) || (menu.situation || []).includes(situation);
  }

  function situationBonus(menu, ans = {}) {
    let bonus = 0;
    const profile = getMenuProfile(menu);
    if (ans.situation && menuHasSituation(menu, ans.situation)) bonus += 8;
    (personalProfile?.preferredSituations || []).forEach(s => {
      if (menuHasSituation(menu, s)) bonus += 1.2;
    });
    if (!ans.situation && profile.situations.includes('시간없을때') && getCurrentMealTime() === '아침') bonus += 1;
    return Math.min(bonus, 10);
  }

  function preferencePresetBonus(menu, ans = {}) {
    let bonus = 0;
    const preferredTypes = personalProfile?.preferredTypes || [];
    if (!ans.type && preferredTypes.length) {
      bonus += preferredTypes.includes(menu.type) ? 10 : -3;
    }
    if (!ans.weight && personalProfile?.defaultWeight && menu.weight === personalProfile.defaultWeight) bonus += 3;
    if (personalProfile?.budgetMax) {
      if (Number(menu.price || 0) <= Number(personalProfile.budgetMax)) bonus += 2;
      else if (isWithinBudget(menu.price, personalProfile.budgetMax)) bonus += 0.5;
    }
    return bonus;
  }


  function hasExplicitCuisinePreference(ans = {}) {
    return Boolean(ans.type) || Boolean((personalProfile?.preferredTypes || []).length);
  }

  function marketCuisineBonus(menu, ans = {}) {
    if (!menu || ans.type) return 0;
    const preferredTypes = personalProfile?.preferredTypes || [];
    if (preferredTypes.length) return 0;

    const homeCuisine = getHomeCuisineType();
    const familiarity = getMenuFamiliarity(menu);
    let bonus = 0;

    // 음식 종류를 고르지 않은 첫 사용자에게는 현재 시장의 일상식을 기본값으로 둡니다.
    if (menu.type === homeCuisine) bonus += ans.mode === '집밥' ? 20 : 14;
    else if (getHomeCountryCode() === 'KR' && ['일식','중식'].includes(menu.type)) bonus += 3;
    else if (getHomeCountryCode() === 'KR' && menu.type === '양식') bonus -= 2;
    else if (getHomeCountryCode() === 'KR' && menu.type === '세계음식') bonus -= 6;
    else bonus -= 2;

    // 생소한 메뉴는 사용자가 세계음식/양식을 명시하거나 학습된 선호가 생기기 전까지 후순위입니다.
    if (familiarity === 'common') bonus += 3;
    else if (familiarity === 'familiar') bonus += 1;
    else if (familiarity === 'explore') bonus -= 10;

    return bonus;
  }

  function applyMarketFamiliarityFilter(scored, ans = {}) {
    if (!Array.isArray(scored) || scored.length < 3) return scored || [];
    if (hasExplicitCuisinePreference(ans)) return scored;

    const familiar = scored.filter(menu => getMenuFamiliarity(menu) !== 'explore');
    // 익숙한 후보가 충분할 때만 생소한 메뉴를 기본 결과 3개에서 제외합니다.
    return familiar.length >= 3 ? familiar : scored;
  }

  function scoreMenu(m, ans = {}) {
    // 후보 필터링은 이미 엄격하게 끝났으므로, 여기서는 후보 안에서의 품질 순위를 계산합니다.
    let score = 62;

    if (ans.type && m.type === ans.type) score += 10;
    if (ans.time && m.time === ans.time) score += 7;
    if (!ans.time && ans.contextTime && m.time === ans.contextTime) score += 10;
    else if (!ans.time && ans.contextTime && m.time && m.time !== ans.contextTime) score -= 5;
    if (ans.weight && m.weight === ans.weight) score += 6;
    if (ans.soup !== undefined && ans.soup !== null && m.soup === ans.soup) score += 5;
    if (ans.method && m.method === ans.method) score += 5;
    if (ans.mode === '외식' && m.method === '외식') score += 8;
    if (ans.mode === '배달' && m.method === '외식') score += 7;
    if (ans.mode === '집밥' && ['간단','요리'].includes(m.method)) {
      score += 7;
      const homeSuitability = getHomeSuitability(m);
      const familiarity = getMenuFamiliarity(m);
      const cookMinutes = Number(m.cook || 0);

      // '집에서 만들 수 있음'보다 '한국 사용자가 집밥으로 기대하는 메뉴'를 우선합니다.
      if (homeSuitability === 'common') score += 11;
      else if (homeSuitability === 'possible') score += 1;
      else if (homeSuitability === 'special') score -= 12;

      if (cookMinutes <= 15) score += 6;
      else if (cookMinutes <= 30) score += 3;
      else if (cookMinutes >= 60) score -= 12;
      else if (cookMinutes >= 45) score -= 8;
      else if (cookMinutes >= 35) score -= 3;

      if (familiarity === 'common') score += 5;
      else if (familiarity === 'explore') score -= 4;

      // 국가별 집밥 기준은 marketCuisineBonus()에서 전체 추천에 일관되게 적용합니다.
    }
    if (ans.mode === '편의점' && m.method === '간단' && m.price <= 7000) score += 9;
    if (ans.need === 'light' && m.weight === '가벼움') score += 14;
    if (ans.need === 'full' && m.weight === '든든') score += 14;
    if (ans.need === 'hangover' && m.soup && m.spicy <= 1) score += 9;
    if (ans.need === 'spicy' && m.spicy >= 1) score += 14;
    if (ans.budget !== null && ans.budget !== undefined) {
      const targetBudget = normalizeBudgetTarget(ans.budget);
      if (targetBudget && Number(m.price || 0) <= targetBudget) score += 5;
      else if (targetBudget && isWithinBudget(m.price, targetBudget)) score += 1;
    }
    if (ans.preferEasy) {
      if (Number(m.cook || 0) <= 15) score += 7;
      else if (Number(m.cook || 0) >= 35) score -= 6;
    }
    if (ans.preferCommon && ['한식','중식','일식'].includes(m.type)) score += 3;

    if (ans.spicy) {
      if (ans.spicy === 'mild') score += (m.spicy === 0 ? 7 : -10);
      if (ans.spicy === 'mid') score += (m.spicy >= 1 && m.spicy <= 2 ? 7 : -8);
      if (ans.spicy === 'hot') score += (m.spicy >= 2 ? 7 : -8);
    }

    score += getPersonalBonus(m, ans) * 7;
    score += cuisinePreferenceBonus(m);
    score += marketCuisineBonus(m, ans);
    score += varietyBonus(m);
    score += situationBonus(m, ans);
    score += preferencePresetBonus(m, ans);

    const stats = personalProfile?.menuStats?.[m.name] || {};
    score -= Math.min((stats.shown || 0) * 0.25, 3); // 같은 메뉴 반복 노출 약간 억제
    score -= Math.min((stats.rejects || 0) * 1.2, 8);
    score += Math.min((stats.likes || 0) * 1.4, 8);

    // 정렬에는 원점수를 유지합니다. 화면 표시는 toMatchPercent()에서 99%로 제한합니다.
    // 이전에는 99점 상한 때문에 다수 메뉴가 동점이 되어 가나다순으로 선택되는 문제가 있었습니다.
    return Math.max(0, score);
  }

  // ─── Resumable recommendation flow ───
  function saveRecommendationDraft(stage = 'quiz', extra = {}) {
    try {
      localStorage.setItem(STORAGE.recommendationDraft, JSON.stringify({
        stage,
        currentStep,
        answers: { ...answers },
        history: Array.isArray(history) ? history.slice(-10) : [],
        menuName: currentMenu?.name || '',
        updatedAt: new Date().toISOString(),
        ...extra,
      }));
      renderResumeRecommendation();
    } catch (error) {
      console.warn('recommendation draft save failed', error);
    }
  }

  function getRecommendationDraft() {
    try {
      const raw = localStorage.getItem(STORAGE.recommendationDraft);
      if (!raw) return null;
      const draft = JSON.parse(raw);
      if (draft.answers && Object.prototype.hasOwnProperty.call(draft.answers, 'budget')) {
        draft.answers.budget = normalizeBudgetTarget(draft.answers.budget);
      }
      const ageMs = Date.now() - new Date(draft.updatedAt || 0).getTime();
      if (!Number.isFinite(ageMs) || ageMs > 12 * 60 * 60 * 1000) {
        localStorage.removeItem(STORAGE.recommendationDraft);
        return null;
      }
      return draft;
    } catch (_) { return null; }
  }

  function clearRecommendationDraft() {
    localStorage.removeItem(STORAGE.recommendationDraft);
    renderResumeRecommendation();
  }

  function renderResumeRecommendation() {
    const container = document.getElementById('resumeRecommendation');
    if (!container) return;
    const draft = getRecommendationDraft();
    if (!draft) { container.innerHTML = ''; return; }
    const isResult = draft.stage === 'result' && draft.menuName;
    container.innerHTML = `
      <button class="resume-card" type="button" onclick="resumeRecommendationFlow()">
        <span class="resume-icon">${isResult ? '🍽️' : '↻'}</span>
        <span><strong>${isResult ? `${escapeHtml(draft.menuName)} 추천 결과 다시 보기` : '진행 중인 메뉴 추천 이어하기'}</strong><small>${isResult ? '마지막 추천 결과와 선택 조건을 보존했어요.' : `${Math.min(Number(draft.currentStep || 0) + 1, questions.length)}번째 질문부터 계속할 수 있어요.`}</small></span>
        <span class="resume-arrow">→</span>
      </button>`;
  }

  function resumeRecommendationFlow() {
    const draft = getRecommendationDraft();
    if (!draft) { startQuiz(); return; }
    answers = draft.answers && typeof draft.answers === 'object' ? draft.answers : { contextTime: getCurrentMealTime() };
    history = Array.isArray(draft.history) ? draft.history : [];
    currentStep = Math.max(0, Math.min(Number(draft.currentStep || 0), questions.length - 1));
    if (draft.stage === 'result' && draft.menuName) {
      const menu = findMenuByName(draft.menuName);
      if (menu) {
        currentMenu = menu;
        showResultForMenu(menu);
        trackEvent('recommendation_result_viewed', { menuId: menu.id || menu.name, restored: true });
        return;
      }
    }
    switchPanel('quiz', false);
    renderQuestion();
  }

  // ─── Render question ───
  function renderQuestion() {
    const q = questions[currentStep];
    document.getElementById('stepNum').textContent = `질문 ${q.step}`;
    document.getElementById('questionText').textContent = q.title;
    document.getElementById('questionSub').textContent = q.sub;
    document.getElementById('stepCurrent').textContent = q.step;
    document.getElementById('stepTotal').textContent = q.total;

    const stepsEl = document.getElementById('progressSteps');
    stepsEl.innerHTML = '';
    for (let i = 0; i < q.total; i++) {
      const div = document.createElement('div');
      div.className = 'progress-step';
      if (i < currentStep) div.classList.add('done');
      else if (i === currentStep) div.classList.add('current');
      stepsEl.appendChild(div);
    }

    const candidates = filterMenusSoft(answers);
    document.getElementById('candidateNum').textContent = candidates.length;

    const opts = document.getElementById('optionsContainer');
    opts.className = 'options' + (q.grid === 2 ? ' grid-2' : '');
    opts.innerHTML = '';
    q.options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'option';
      btn.innerHTML = `
        <span class="opt-emoji">${opt.emoji}</span>
        <div style="flex:1;">
          <div class="opt-text">${opt.text}</div>
          ${opt.hint ? `<div class="opt-hint">${opt.hint}</div>` : ''}
        </div>
      `;
      btn.addEventListener('click', () => selectOption(q.key, opt.value, btn));
      opts.appendChild(btn);
    });

    document.getElementById('backBtn').disabled = currentStep === 0;
    renderFilterSummary();
  }

  function renderFilterSummary() {
    const sum = document.getElementById('filterSummary');
    sum.innerHTML = '';
    const labels = {
      time: { 아침:'아침', 점심:'점심', 저녁:'저녁' },
      type: { 한식:'한식', 일식:'일식', 중식:'중식', 양식:'양식', 세계음식:'세계음식' },
      weight: { 가벼움:'가볍게', 중간:'적당히', 든든:'든든하게' },
      soup: { true:'국물 있음', false:'국물 없음' },
      spicy: { mild:'순한맛', mid:'약간매콤', hot:'매운맛' },
      method: { 간단:'간편요리', 요리:'정성요리', 외식:'외식/배달' },
      situation: { 혼밥:'혼밥', 친구와:'친구와', 배달:'배달', 집밥:'집밥', 비오는날:'비 오는 날', 운동후:'운동 후', 속편한식사:'속 편한 식사', 시간없을때:'시간 없음' },
      mode: { 외식:'외식', 배달:'배달', 집밥:'집밥', 편의점:'편의점' },
      need: { light:'가볍게', full:'든든하게', hangover:'해장·국물', spicy:'매콤하게' },
      budget: { 10000:'약 1만 원', 30000:'약 3만 원', 50000:'약 5만 원' },
    };
    Object.keys(answers).forEach(key => {
      const val = answers[key];
      if (val === null || val === undefined) return;
      const label = labels[key]?.[val];
      if (label) {
        const chip = document.createElement('span');
        chip.className = 'filter-chip';
        chip.textContent = label;
        sum.appendChild(chip);
      }
    });
  }

  function selectOption(key, value, btnEl) {
    btnEl.classList.add('selected');
    setTimeout(() => {
      answers[key] = value;
      history.push({ key, value });
      trackEvent('recommendation_step_completed', { step: currentStep + 1, key, value: labelForOption(value), conditions: { ...answers } });
      currentStep++;
      saveRecommendationDraft('quiz');
      if (currentStep >= questions.length) showResult();
      else renderQuestion();
    }, 280);
  }

  document.getElementById('skipBtn').addEventListener('click', () => {
    const q = questions[currentStep];
    answers[q.key] = null;
    history.push({ key: q.key, value: null });
    trackEvent('recommendation_step_completed', { step: currentStep + 1, key: q.key, value: '상관없음', conditions: { ...answers } });
    currentStep++;
    saveRecommendationDraft('quiz');
    if (currentStep >= questions.length) showResult();
    else renderQuestion();
  });

  document.getElementById('backBtn').addEventListener('click', () => {
    if (currentStep === 0) return;
    if (history.length > 0) {
      const last = history.pop();
      delete answers[last.key];
    }
    currentStep--;
    saveRecommendationDraft('quiz');
    renderQuestion();
  });

  // ─── Show Result ───
  function showResult() {
    const candidates = filterMenusSoft(answers);
    let scored = candidates.map(m => ({ ...m, score: scoreMenu(m, answers) }));
    scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ko'));
    scored = applyMarketFamiliarityFilter(scored, answers);
    trackEvent('recommendation_completed', { candidateCount: scored.length, answers: { ...answers } });

    if (scored.length === 0) {
      const kept = getStrictMissMessages(answers);
      document.getElementById('resultSub').textContent = '선택한 조건을 모두 만족하는 메뉴가 없어요.';
      document.getElementById('topPick').innerHTML = `
        <span class="pick-emoji">🧭</span>
        <div class="pick-name">조건을 조금만 넓혀볼까요?</div>
        <p class="pick-desc">선택한 조건을 임의로 바꾸지 않고 정확히 맞는 메뉴만 찾고 있어요. 한두 가지 질문을 ‘아무거나 괜찮아요’로 선택하면 더 다양한 메뉴를 추천받을 수 있습니다.</p>
        <div class="reason-card">
          <div class="reason-label">선택한 조건</div>
          <div class="reason-title">이 조건을 그대로 유지했어요</div>
          <ul class="reason-list">
            ${kept.length ? kept.map(x => `<li>${escapeHtml(x)}</li>`).join('') : '<li>선택된 조건이 거의 없습니다.</li>'}
            <li>최근 먹은 메뉴와 제외한 메뉴, 피하고 싶은 재료, 예산 조건도 함께 반영했습니다.</li>
            <li>다시 찾기에서 조건 하나를 ‘아무거나’로 바꿔보세요.</li>
          </ul>
        </div>
      `;
      document.querySelector('.action-grid').style.display = 'none';
      document.querySelector('.runner-title').style.display = 'none';
      document.getElementById('runnerList').innerHTML = '';
      document.getElementById('resultDetails').innerHTML = '';
      switchPanel('result', false);
      return;
    }

    document.querySelector('.action-grid').style.display = '';
    document.querySelector('.runner-title').style.display = '';

    const recommendationSet = selectDiverseRecommendationSet(prioritizeMarketCuisine(scored, answers), 3, answers);
    const top = recommendationSet[0];
    currentMenu = top;
    const runners = recommendationSet.slice(1);
    saveRecommendationDraft('result', { menuName: top.name });
    trackEvent('recommendation_result_viewed', { menuId: top.id || top.name, recommendationRank: 1, candidateCount: candidates.length, conditions: { ...answers } });
    [top, ...runners].forEach(m => recordMenuFeedback(m, 'shown'));

    document.getElementById('resultSub').textContent = `선택한 조건에 맞는 ${candidates.length}개 메뉴 중 가장 잘 맞는 한 끼예요.`;

    const topEl = document.getElementById('topPick');
    const matchPct = toMatchPercent(top.score);
    topEl.innerHTML = renderTopPickCard(top, top.score);
    document.getElementById('resultDetails').innerHTML = `
      ${renderRecommendationReasonCard(top, answers, candidates.length)}
      ${renderMenuDecisionFacts(top)}
      ${renderMenuPremiumDetails(top)}
      ${renderPersonalNote(top, answers)}
      ${renderFeedbackCard(top)}
    `;

    const runEl = document.getElementById('runnerList');
    if (runners.length === 0) {
      runEl.innerHTML = '<div style="text-align:center; color:var(--ink-soft); font-size:13px; padding:20px;">엄격 조건에 맞는 다른 후보가 없어요</div>';
    } else {
      runEl.innerHTML = runners.map((r, idx) => `
        <div class="runner-item" onclick="pickRunner(${idx})">
          ${renderMenuPhoto(r, 'runner-photo')}
          <div class="runner-info">
            <div class="runner-name">${r.name}</div>
            <div class="runner-meta">${r.type} · ${r.weight} · ${spiceLabel(r)} · ${r.kcal}kcal</div>
          </div>
          <span class="runner-score">${toMatchPercent(r.score)}%</span>
        </div>
      `).join('');
    }
    window._runners = runners;
    switchPanel('result', false);
    updateFavButton();
  }

  function pickRunner(idx) {
    const r = window._runners[idx];
    if (!r) return;
    currentMenu = r;
    saveRecommendationDraft('result', { menuName: r.name });
    trackEvent('alternative_menu_selected', { menuId: r.id || r.name, recommendationRank: idx + 2, conditions: { ...answers } });
    // 대안 상세 확인은 최종 결정이 아니므로 선호 선택으로 누적하지 않습니다.
    // Re-render as top pick
    const topEl = document.getElementById('topPick');
    topEl.innerHTML = renderTopPickCard(r, r.score);
    document.getElementById('resultDetails').innerHTML = `
      ${renderRecommendationReasonCard(r, answers, null)}
      ${renderMenuDecisionFacts(r)}
      ${renderMenuPremiumDetails(r)}
      ${renderPersonalNote(r, answers)}
      ${renderFeedbackCard(r)}
    `;
    showToast(`${r.name}(으)로 선택했어요`);
    updateFavButton();
  }

  function acceptCurrentMenu() {
    if (!currentMenu) return;
    recordMenuFeedback(currentMenu, 'accept', answers.time || getCurrentMealTime());
    decidedMenuName = currentMenu.name;
    trackEvent('menu_selected', { menuId: currentMenu.id || currentMenu.name, menuName: currentMenu.name });
    showToast(`'${currentMenu.name}' 선호를 학습했어요`);
    openRecordModal();
  }

  function rejectCurrentMenu() {
    if (!currentMenu) return;
    const modal = document.getElementById('rejectReasonModal');
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeRejectReasonModal() {
    const modal = document.getElementById('rejectReasonModal');
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
  }

  function confirmRejectReason(reason) {
    if (!currentMenu) return;
    const labels = {
      not_in_mood:'지금 먹고 싶지 않음', too_expensive:'가격이 부담됨', recently_eaten:'최근에 먹었음',
      hard_to_find:'주변에서 찾기 어려움', hard_to_cook:'조리하기 어려움', dislike_ingredient:'재료가 마음에 들지 않음',
      too_small:'양이 적을 것 같음', too_large:'양이 많을 것 같음', other:'기타', skip:'이유 없음'
    };
    let detail = '';
    if (reason === 'other') {
      detail = String(window.prompt('다른 메뉴가 필요한 이유를 적어 주세요. 입력하지 않아도 다음 추천을 받을 수 있습니다.', '') || '').trim().slice(0, 300);
    }

    // 현재 추천 세션에 즉시 반영합니다. 한 번의 거절로 영구 취향을 확정하지는 않습니다.
    if (reason === 'too_small') answers.need = 'full';
    if (reason === 'too_large') answers.need = 'light';
    if (reason === 'hard_to_cook') answers.preferEasy = true;
    if (reason === 'hard_to_find') answers.preferCommon = true;
    if (reason === 'too_expensive') {
      const currentPrice = Number(currentMenu.price || 0);
      const nextBudget = [10000, 30000, 50000].filter(limit => limit < currentPrice).pop();
      if (nextBudget) answers.budget = !Number.isFinite(Number(answers.budget)) ? nextBudget : Math.min(Number(answers.budget), nextBudget);
    }

    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE.rejectReasons) || '[]');
      saved.push({ menuName: currentMenu.name, menuType: currentMenu.type || '', reason, detail, occurredAt: new Date().toISOString() });
      localStorage.setItem(STORAGE.rejectReasons, JSON.stringify(saved.slice(-150)));
    } catch (error) {
      console.warn('reject reason save failed', error);
    }
    recordMenuFeedback(currentMenu, 'reject');
    temporaryExcluded.add(currentMenu.name);
    const rejectedFamily = getMenuFamily(currentMenu);
    if (rejectedFamily) temporaryExcludedFamilies.add(rejectedFamily);
    trackEvent('menu_rejected', { menuId: currentMenu.id || currentMenu.name, menuType: currentMenu.type || '', menuFamily: rejectedFamily, reason });
    trackEvent('rejection_reason_selected', { menuId: currentMenu.id || currentMenu.name, reason });
    closeRejectReasonModal();
    showToast(`${labels[reason] || '다른 메뉴 요청'}을 반영했어요`);
    showResult();
  }

  function banCurrentMenu() {
    if (!currentMenu) return;
    if (!confirm(`'${currentMenu.name}'을(를) 앞으로 추천에서 영구 제외할까요?`)) return;
    recordMenuFeedback(currentMenu, 'ban');
    temporaryExcluded.add(currentMenu.name);
    const bannedFamily = getMenuFamily(currentMenu);
    if (bannedFamily) temporaryExcludedFamilies.add(bannedFamily);
    showToast(`'${currentMenu.name}'은 앞으로 추천하지 않아요`);
    showResult();
  }

  // ─── Start quiz ───
  function startQuiz() {
    currentStep = 0;
    answers = { contextTime: getCurrentMealTime() };
    history = [];
    temporaryExcluded = new Set();
    temporaryExcludedFamilies = new Set();
    decidedMenuName = '';
    saveRecommendationDraft('quiz');
    trackEvent('recommendation_started', { flow: 'three_step', mealTime: answers.contextTime });
    switchPanel('quiz', false);
    renderQuestion();
  }

  function quickRecommend() {
    currentStep = questions.length;
    const mealTime = getCurrentMealTime();
    answers = { time: mealTime };
    if (personalProfile?.defaultWeight) answers.weight = personalProfile.defaultWeight;
    if ((personalProfile?.preferredSituations || []).length === 1) answers.situation = personalProfile.preferredSituations[0];
    history = Object.keys(answers).map(key => ({ key, value: answers[key] }));
    temporaryExcluded = new Set();
    temporaryExcludedFamilies = new Set();
    decidedMenuName = '';
    saveRecommendationDraft('quiz');
    trackEvent('recommendation_started', { flow: 'instant', mealTime });
    showResult();
  }

  // ─── Recipe ───
  function renderRecipe() {
    const c = document.getElementById('recipeContent');
    if (!currentMenu) {
      c.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📖</div>
          <p class="empty-text">아직 선택된 메뉴가 없어요<br>메뉴 찾기를 먼저 해주세요</p>
          <button class="empty-cta" onclick="startQuiz()">메뉴 찾으러 가기</button>
        </div>
      `;
      return;
    }
    document.getElementById('recipeSubtitle').textContent = `${currentMenu.name} 만드는 법`;
    c.innerHTML = `
      <div class="recipe-header">
        <span class="recipe-emoji">${currentMenu.emoji}</span>
        <div class="recipe-name">${currentMenu.name}</div>
        <div class="recipe-meta">
          <span>⏱ ${currentMenu.cook === 0 ? '외식' : currentMenu.cook + '분'}</span>
          <span>👥 1인분</span>
          <span>🔥 ${currentMenu.kcal}kcal</span>
        </div>
      </div>
      ${renderRecipePremiumNote(currentMenu)}
      <div class="section">
        <h3>재료</h3>
        <ul class="ingredient-list">
          ${currentMenu.ingredients.map(i => `<li><span>${i[0]}</span><span class="qty">${i[1]}</span></li>`).join('')}
        </ul>
      </div>
      <div class="section">
        <h3>만드는 법</h3>
        <ol class="step-list">
          ${currentMenu.steps.map(s => `<li>${s}</li>`).join('')}
        </ol>
      </div>
    `;
  }

  function goRecipe() {
    if (currentMenu) trackEvent('recipe_viewed', { menuId: currentMenu.id || currentMenu.name });
    switchPanel('recipe');
  }

  // ─── Nearby ───
  async function renderNearby() {
    const c = document.getElementById('nearbyContent');
    if (!currentMenu) {
      c.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📍</div>
          <p class="empty-text">아직 선택된 메뉴가 없어요<br>메뉴 찾기를 먼저 해주세요</p>
          <button class="empty-cta" onclick="startQuiz()">메뉴 찾으러 가기</button>
        </div>
      `;
      return;
    }
    document.getElementById('nearbySubtitle').textContent = `'${currentMenu.name}'을(를) 파는 가까운 곳`;

    // Provider 설정 안 됐으면 mock 데이터로 폴백
    if (!isProviderConfigured()) {
      const list = mockRestaurantsByType[currentMenu.type] || [];
      c.innerHTML = renderNearbyGuide(currentMenu) + renderMockNotice() + list.map(r => renderRestaurantCard(r)).join('');
      return;
    }

    // 로딩 표시
    c.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📍</div>
        <p class="empty-text">주변 식당을 찾는 중...<br><span style="font-size:11px;">위치 권한을 허용해주세요</span></p>
      </div>
    `;

    try {
      const location = await getUserLocation();
      const places = await searchPlaces(currentMenu, location);

      if (places.length === 0) {
        c.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">🔍</div>
            <p class="empty-text">근처에서 '${currentMenu.name}'을(를)<br>파는 곳을 찾지 못했어요</p>
            <button class="empty-cta" onclick="startQuiz()">다른 메뉴 찾기</button>
          </div>
        `;
        return;
      }

      const formatted = places.map(p => formatPlace(p, currentMenu));
      c.innerHTML = renderNearbyGuide(currentMenu) + formatted.map(r => renderRestaurantCard(r)).join('');
    } catch (err) {
      console.error('Nearby search failed:', err);
      // 에러 시 mock 데이터로 폴백
      const list = mockRestaurantsByType[currentMenu.type] || [];
      const errMsg = err.code === 1 ? '위치 권한이 거부되어' : '주변 식당을 불러오지 못해';
      c.innerHTML = renderNearbyGuide(currentMenu) + `
        <div style="background:var(--cream); border:1px dashed var(--tomato); border-radius:12px; padding:12px 14px; margin-bottom:12px; font-size:12px; color:var(--ink-soft);">
          ⚠️ ${errMsg} 예시 데이터를 보여드려요
        </div>
      ` + list.map(r => renderRestaurantCard(r)).join('');
    }
  }



  function renderNearbyGuide(menu) {
    const info = premiumInfo(menu);
    const soloFit = menu.method === '외식' && menu.weight === '든든' ? '보통' : '높음';
    const crowd = menu.time === '점심' ? '12:00~13:00 혼잡 예상' : menu.time === '저녁' ? '18:30~20:00 혼잡 예상' : '오전 시간대 비교적 여유';
    const orderTip = menu.soup ? '국물 메뉴는 회전율이 빠른 매장이 안정적' : menu.spicy >= 2 ? '맵기 조절 가능 여부 확인' : '사이드와 음료 조합 확인';
    const keyword = kakaoSearchKeywords[menu.name] || menu.name;
    return `
      <div class="nearby-guide">
        <div class="nearby-label">Restaurant Strategy</div>
        <div class="nearby-title">근처에서 먹는다면 이렇게 고르세요</div>
        <div class="nearby-guide-list">
          <div class="nearby-guide-item"><span>검색 키워드</span><strong>${escapeHtml(keyword)}</strong></div>
          <div class="nearby-guide-item"><span>예상 가격대</span><strong>약 ${Number(menu.price).toLocaleString()}원 · ${escapeHtml(info.priceTier)}</strong></div>
          <div class="nearby-guide-item"><span>혼밥 적합도</span><strong>${soloFit}</strong></div>
          <div class="nearby-guide-item"><span>혼잡 시간</span><strong>${crowd}</strong></div>
          <div class="nearby-guide-item"><span>고르는 기준</span><strong>${escapeHtml(orderTip)}</strong></div>
        </div>
      </div>
    `;
  }
  function renderMockNotice() {
    return `
      <div style="background:var(--cream); border:1px dashed var(--mustard); border-radius:12px; padding:12px 14px; margin-bottom:12px; font-size:12px; color:var(--ink-soft); line-height:1.6;">
        💡 <strong>예시 데이터입니다.</strong><br>
        실제 주변 식당을 보려면 <strong>카카오 디벨로퍼스</strong>에서 REST API 키를 받아<br>
        서버의 Kakao API 키와 <code style="font-family:'JetBrains Mono',monospace; background:var(--paper); padding:2px 6px; border-radius:4px;">NEARBY_PROXY_URL</code>을 설정하세요.<br>
      </div>
    `;
  }

  function renderRestaurantCard(r) {
    const metaParts = [];
    if (r.subcategory) metaParts.push(`<span>${r.subcategory}</span>`);
    if (r.dist) metaParts.push(`<span>${r.dist}</span>`);
    if (r.phone) metaParts.push(`<span>${r.phone}</span>`);
    if (r.rating) metaParts.push(`<span class="rest-rating">${r.rating}</span>`);
    if (r.price) metaParts.push(`<span>${r.price}</span>`);

    // 카카오맵 URL 있으면 그쪽으로, 없으면 mock일 경우 클릭만 처리
    const onClick = r.placeUrl
      ? `window.open('${r.placeUrl}', '_blank')`
      : `openInMaps('${r.name.replace(/'/g, "\\'")}', '${(r.addr||'').replace(/'/g, "\\'")}')`;

    return `
      <div class="restaurant" onclick="${onClick}">
        <div class="rest-emoji">${r.emoji}</div>
        <div class="rest-info">
          <div class="rest-name">${r.name}</div>
          <div class="rest-meta">${metaParts.join('<span style="opacity:0.4;">·</span>')}</div>
          ${r.addr ? `<div class="rest-meta" style="margin-top:4px; opacity:0.7;">${r.addr}</div>` : ''}
        </div>
      </div>
    `;
  }

  function openRestaurantResult(restaurantId, name, addr, placeUrl) {
    trackEvent('restaurant_selected', {
      restaurantId: restaurantId || name || 'unknown',
      menuId: currentMenu?.id || currentMenu?.name || '',
      distanceBand: 'unknown'
    });
    if (placeUrl) window.open(placeUrl, '_blank', 'noopener,noreferrer');
    else openInMaps(name, addr);
  }

  function openInMaps(name, addr) {
    const query = encodeURIComponent(`${name} ${addr}`);
    // Google Maps 검색 (글로벌 호환)
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
  }

  function goNearby() {
    if (currentMenu) trackEvent('restaurant_search_started', { menuId: currentMenu.id || currentMenu.name });
    switchPanel('nearby');
  }


  // ─── Refined Nearby Search v2 ───
  const NEARBY_CUISINE_CONFIG = {
    '한식': {
      category: '한식',
      specialty: ['한식', '백반', '국밥', '찌개', '탕', '정식', '분식'],
      fallback: ['한식 맛집', '백반집', '국밥집', '찌개 전문점'],
      storeWords: ['식당', '밥집', '한식당', '정식', '국밥', '찌개']
    },
    '중식': {
      category: '중식',
      specialty: ['중식', '중화요리', '중국집', '반점'],
      fallback: ['중식 맛집', '중국집', '중화요리', '반점'],
      storeWords: ['중화요리', '중국집', '반점', '마라', '딤섬', '양꼬치']
    },
    '일식': {
      category: '일식',
      specialty: ['일식', '초밥', '라멘', '우동', '돈카츠', '이자카야'],
      fallback: ['일식 맛집', '초밥', '라멘', '돈카츠', '우동'],
      storeWords: ['스시', '초밥', '라멘', '우동', '돈카츠', '이자카야', '일식']
    },
    '양식': {
      category: '양식',
      specialty: ['양식', '브런치', '파스타', '피자', '스테이크', '버거', '샐러드'],
      fallback: ['양식 맛집', '브런치 카페', '파스타', '피자', '수제버거'],
      storeWords: ['비스트로', '브런치', '파스타', '피자', '스테이크', '버거', '카페']
    },
    '세계음식': {
      category: '세계음식',
      specialty: ['멕시칸', '태국음식', '베트남음식', '인도음식', '중동음식', '쌀국수', '타코', '커리'],
      fallback: ['세계음식 맛집', '멕시칸', '태국음식', '베트남 쌀국수', '인도커리'],
      storeWords: ['타코', '멕시칸', '타이', '쌀국수', '베트남', '커리', '케밥', '인도', '중동']
    }
  };

  const DISH_SEARCH_BASES = [
    '소고기 미역국','성게 미역국','전복 미역국','들깨 미역국','미역국','김치찌개','된장찌개','순두부찌개','부대찌개','감자탕','갈비탕','설렁탕','국밥','순대국','육개장','칼국수','냉면','비빔밥','김밥','제육볶음','제육덮밥','불고기','닭갈비','삼겹살','족발','고등어구이','쌈밥','보쌈',
    '짜장면','짬뽕','탕수육','마라탕','마라샹궈','딤섬','양꼬치','마파두부','우육면','완탕면','멘보샤','유린기','꿔바로우',
    '초밥','라멘','우동','돈카츠','돈까스','규동','카츠동','오야코동','사케동','텐동','소바','오니기리','타코야키','야키소바','나베','사시미',
    '파스타','알리오 올리오','토마토 파스타','크림 파스타','봉골레','피자','스테이크','버거','수제버거','샌드위치','샐러드','브런치','리조또','라자냐','수프','스튜','포케볼','포케',
    '타코','부리또','팟타이','쌀국수','반미','케밥','커리','비리야니','팔라펠','후무스','퀘사디야','월남쌈','똠얌꿍','나시고렝','샤와르마','하리라'
  ].sort((a, b) => b.length - a.length);

  let DISH_TO_RESTAURANT_KEYWORDS = {};

  function compactText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function uniq(arr) {
    return Array.from(new Set((arr || []).map(compactText).filter(Boolean)));
  }

  function coreDishName(menu) {
    const name = compactText(menu?.name);
    if (!name) return '';
    const exact = DISH_SEARCH_BASES.find(base => name === base);
    if (exact) return exact;
    const included = DISH_SEARCH_BASES.find(base => name.includes(base));
    if (included) return included;
    return name.replace(/^(매운|얼큰한|담백한|맑은|특제|수제|치즈|불맛|간장|고추장|크림|토마토|바질|스파이시|갈릭|허브|칠리|소고기|돼지고기|닭고기|해물|새우|연어|비프|치킨|쉬림프|램|두부|버섯|전복|성게|들깨|바지락)\s+/g, '').trim() || name;
  }

  function buildPlaceQueries(menu) {
    const name = compactText(menu?.name);
    const core = coreDishName(menu);
    const typeCfg = NEARBY_CUISINE_CONFIG[menu?.type] || NEARBY_CUISINE_CONFIG['한식'];
    const alias = DISH_TO_RESTAURANT_KEYWORDS[name] || DISH_TO_RESTAURANT_KEYWORDS[core] || [];
    const base = kakaoSearchKeywords[name] || kakaoSearchKeywords[core] || core || name;
    const soupOrDry = menu?.soup ? `${menu.type} 국물` : `${menu.type} ${menu.weight || ''}`;
    const methodHint = menu?.method === '외식' ? `${base} 맛집` : base;

    const exact = uniq([name, base, ...alias, methodHint]);
    const specialty = uniq([
      `${core} 전문점`,
      `${base} 전문점`,
      ...typeCfg.specialty,
      ...(menu?.soup ? ['국물 맛집', '탕 전문점', '찌개 전문점'] : ['덮밥', '정식', '전문점'])
    ]);
    const fallback = uniq([
      ...typeCfg.fallback,
      soupOrDry,
      kakaoTypeKeywords[menu?.type] || `${menu?.type || ''} 맛집`,
      '음식점'
    ]);

    return { exact, specialty, fallback, primary: exact[0] || specialty[0] || fallback[0] || '음식점', core };
  }

  function searchQualityLabel(menu) {
    if (menu.method === '외식') return '외식 추천 메뉴라 정확 메뉴명을 1순위로 검색합니다.';
    if (menu.soup) return '국물 메뉴라 메뉴명 + 전문점 키워드를 함께 봅니다.';
    if (menu.type === '양식') return '양식은 메뉴명이 넓어서 파스타/버거/브런치 같은 세부 카테고리를 우선합니다.';
    if (menu.type === '세계음식') return '세계음식은 국가/요리군 키워드까지 같이 검색합니다.';
    return '메뉴명, 음식 분류, 전문점 키워드를 순서대로 검색합니다.';
  }

  function renderNearbySearchStrategy(menu) {
    const q = buildPlaceQueries(menu);
    const chips = uniq([q.primary, q.core, ...(q.specialty.slice(0, 4)), ...(q.fallback.slice(0, 2))]);
    return `
      <div class="nearby-search-card">
        <div class="nearby-label">Smart Place Search</div>
        <div class="nearby-title">검색을 이렇게 정교화했어요</div>
        <div class="nearby-chip-row">
          ${chips.slice(0, 8).map(x => `<span class="nearby-chip">${escapeHtml(x)}</span>`).join('')}
        </div>
        <div class="nearby-tier-list">
          <div class="nearby-tier"><span>1차</span><div><strong>${escapeHtml(q.exact.slice(0,3).join(' · '))}</strong><small>정확 메뉴명과 대표 별칭으로 먼저 검색</small></div></div>
          <div class="nearby-tier"><span>2차</span><div><strong>${escapeHtml(q.specialty.slice(0,4).join(' · '))}</strong><small>전문점/요리군 키워드로 확장</small></div></div>
          <div class="nearby-tier"><span>3차</span><div><strong>${escapeHtml(q.fallback.slice(0,4).join(' · '))}</strong><small>근처에 정확 메뉴가 없을 때 같은 음식군으로 폴백</small></div></div>
        </div>
      </div>
    `;
  }

  function externalMapQuery(menu) {
    const q = buildPlaceQueries(menu);
    return q.primary || menu.name;
  }

  function renderExternalSearchLinks(menu) {
    const query = encodeURIComponent(externalMapQuery(menu));
    const google = `https://www.google.com/maps/search/?api=1&query=${query}`;
    const kakao = `https://map.kakao.com/link/search/${query}`;
    const naver = `https://map.naver.com/p/search/${query}`;
    return `
      <div class="map-link-row">
        <button class="map-link-btn" onclick="window.open('${google}', '_blank')">Google</button>
        <button class="map-link-btn" onclick="window.open('${kakao}', '_blank')">Kakao</button>
        <button class="map-link-btn" onclick="window.open('${naver}', '_blank')">Naver</button>
      </div>
    `;
  }

  function placeRelevanceScore(place, menu, tierName, query) {
    const name = compactText(place.place_name || place.name || '');
    const cat = compactText(place.category_name || place.subcategory || '');
    const addr = compactText(place.road_address_name || place.address_name || place.addr || '');
    const dist = Number(place.distance || String(place.dist || '').replace(/[^0-9.]/g, '')) || 9999;
    const q = compactText(query);
    const core = coreDishName(menu);
    const typeCfg = NEARBY_CUISINE_CONFIG[menu.type] || {};
    let score = 50;
    if (tierName === 'exact') score += 35;
    if (tierName === 'specialty') score += 22;
    if (tierName === 'fallback') score += 8;
    if (name.includes(menu.name)) score += 35;
    if (core && name.includes(core)) score += 28;
    if (q && name.includes(q)) score += 18;
    if ((typeCfg.storeWords || []).some(w => name.includes(w) || cat.includes(w))) score += 15;
    if (cat.includes(typeCfg.category || menu.type)) score += 12;
    if (menu.soup && /(국|탕|찌개|라멘|우동|쌀국수|수프|스튜)/.test(name + cat)) score += 9;
    if (!menu.soup && /(덮밥|정식|구이|볶음|파스타|버거|피자|샐러드|초밥|타코|반미)/.test(name + cat)) score += 9;
    if (menu.method === '외식') score += 5;
    score -= Math.min(16, dist / 250);
    if (addr.includes('예시')) score -= 3;
    return Math.max(0, Math.round(score));
  }

  function qualityBadgesForPlace(place, menu) {
    const badges = [];
    const score = place.score || placeRelevanceScore(place, menu, place.tier || 'fallback', place.query || '');
    const core = coreDishName(menu);
    const name = compactText(place.name || place.place_name || '');
    if (name.includes(menu.name) || (core && name.includes(core))) badges.push('메뉴명 일치');
    if ((place.tier || '') === 'exact') badges.push('정확검색');
    if ((place.tier || '') === 'specialty') badges.push('전문점후보');
    if (menu.soup) badges.push('국물메뉴');
    if (menu.method === '외식') badges.push('외식적합');
    if (score >= 85) badges.push('우선확인');
    else if (score >= 70) badges.push('검토가치');
    return badges.slice(0, 4);
  }

  async function searchKakaoByQuery(query, location, radius, size = 8) {
    return searchPlacesKakao(query, location, { radius, size, pageLimit: 1, sort: 'distance' });
  }

  async function searchPlacesSmart(menu, location) {
    const q = buildPlaceQueries(menu);
    const plan = [
      ...q.exact.slice(0, 3).map(query => ({ query, tier:'exact', radius:1800 })),
      ...q.specialty.slice(0, 4).map(query => ({ query, tier:'specialty', radius:2500 })),
      ...q.fallback.slice(0, 3).map(query => ({ query, tier:'fallback', radius:3500 }))
    ];
    const map = new Map();
    for (const item of plan) {
      try {
        const places = await searchKakaoByQuery(item.query, location, item.radius, 8);
        places.forEach(p => {
          const key = p.id || `${p.place_name}|${p.road_address_name || p.address_name}`;
          const scored = { ...p, query: item.query, tier: item.tier, score: placeRelevanceScore(p, menu, item.tier, item.query) };
          const prev = map.get(key);
          if (!prev || scored.score > prev.score) map.set(key, scored);
        });
      } catch (e) {
        console.warn('place query failed', item.query, e);
      }
      if (map.size >= 12) break;
    }
    return Array.from(map.values()).sort((a, b) => b.score - a.score).slice(0, 8);
  }

  function smartRestaurantName(menu, index) {
    const core = coreDishName(menu);
    const typeCfg = NEARBY_CUISINE_CONFIG[menu.type] || NEARBY_CUISINE_CONFIG['한식'];
    const namesByType = {
      '한식': [`${core} 전문 한상`, `본가 ${core}`, `정갈한 ${core}집`, `오늘의 한식당`, `동네 백반 ${core}`],
      '중식': [`${core} 중화반점`, `사천 ${core}관`, `홍콩 ${core} 하우스`, `동네 중국집`, `마라 중화주방`],
      '일식': [`${core} 일식당`, `멘야 ${core}`, `스시와 ${core}`, `하루 일식`, `동네 일본식당`],
      '양식': [`${core} 비스트로`, `브런치 & ${core}`, `트라토리아 ${core}`, `그릴하우스`, `샐러드 키친`],
      '세계음식': [`${core} 월드키친`, `${core} 스트리트`, `타이·멕시칸 키친`, `비엣남 테이블`, `커리 앤 케밥`]
    };
    const pool = namesByType[menu.type] || typeCfg.fallback;
    return pool[index % pool.length];
  }

  function buildSmartMockRestaurants(menu) {
    const baseDistances = ['180m','340m','620m','920m','1.4km','1.8km','2.3km','2.9km'];
    const prices = menu.price >= 18000 ? ['$$$','$$$$','$$$','$$$$'] : menu.price >= 10000 ? ['$$','$$$','$$','$$$'] : ['$','$$','$','$$'];
    const q = buildPlaceQueries(menu);
    return Array.from({ length: 6 }, (_, i) => {
      const tier = i < 2 ? 'exact' : i < 4 ? 'specialty' : 'fallback';
      const query = tier === 'exact' ? q.exact[i % q.exact.length] : tier === 'specialty' ? q.specialty[i % q.specialty.length] : q.fallback[i % q.fallback.length];
      const raw = {
        emoji: menu.emoji,
        name: smartRestaurantName(menu, i),
        dist: baseDistances[i],
        rating: `★ ${(4.2 + (i % 4) * 0.15).toFixed(1)}`,
        price: prices[i % prices.length],
        addr: '(예시 데이터 · 실제 검색은 지도 버튼 또는 Kakao API 사용)',
        subcategory: i < 2 ? `${coreDishName(menu)} 후보` : `${menu.type} · ${menu.soup ? '국물' : '식사'} 메뉴`,
        query,
        tier,
        placeUrl: '',
        phone: ''
      };
      raw.score = placeRelevanceScore({ place_name: raw.name, category_name: raw.subcategory, address_name: raw.addr, distance: parseFloat(raw.dist) * (raw.dist.includes('km') ? 1000 : 1) }, menu, tier, query);
      raw.badges = qualityBadgesForPlace(raw, menu);
      return raw;
    }).sort((a, b) => b.score - a.score);
  }

  function renderNearbyGuide(menu) {
    const info = premiumInfo(menu);
    const q = buildPlaceQueries(menu);
    const soloFit = menu.method === '외식' && menu.weight === '든든' ? '보통' : '높음';
    const crowd = menu.time === '점심' ? '12:00~13:00 혼잡 예상' : menu.time === '저녁' ? '18:30~20:00 혼잡 예상' : '오전 시간대 비교적 여유';
    const orderTip = menu.soup ? '국물 메뉴는 전문점·회전율·육수 베이스 확인' : menu.spicy >= 2 ? '맵기 조절 가능 여부와 사이드 구성 확인' : '대표 메뉴명과 세부 카테고리 일치 여부 확인';
    const deliveryFit = menu.method === '외식' || answers.situation === '배달' ? '높음' : menu.soup ? '보통' : '높음';
    return `
      <div class="nearby-guide">
        <div class="nearby-label">Restaurant Strategy</div>
        <div class="nearby-title">근처에서 먹는다면 이렇게 고르세요</div>
        <div class="nearby-guide-list">
          <div class="nearby-guide-item"><span>핵심 검색어</span><strong>${escapeHtml(q.primary)}</strong></div>
          <div class="nearby-guide-item"><span>대체 검색어</span><strong>${escapeHtml(q.specialty.slice(0,3).join(' · '))}</strong></div>
          <div class="nearby-guide-item"><span>예상 가격대</span><strong>약 ${Number(menu.price).toLocaleString()}원 · ${escapeHtml(info.priceTier)}</strong></div>
          <div class="nearby-guide-item"><span>혼밥 적합도</span><strong>${soloFit}</strong></div>
          <div class="nearby-guide-item"><span>배달 적합도</span><strong>${deliveryFit}</strong></div>
          <div class="nearby-guide-item"><span>혼잡 시간</span><strong>${crowd}</strong></div>
          <div class="nearby-guide-item"><span>고르는 기준</span><strong>${escapeHtml(orderTip)}</strong></div>
        </div>
      </div>
    `;
  }

  function renderMockNotice() {
    return `
      <div class="nearby-warning" style="border-color:var(--mustard);">
        💡 <strong>정교화된 예시 데이터입니다.</strong><br>
        현재는 API 키가 없어 메뉴명·음식분류·상황·예산 기준으로 만든 후보를 보여줍니다.<br>
        실제 주변 식당은 위 지도 버튼을 누르거나 서버 프록시를 연결하면 거리순 검색으로 바뀝니다.
      </div>
    `;
  }

  function normalizeRestaurantScore(value) {
    const score = Number(value);
    if (!Number.isFinite(score)) return null;
    return Math.max(0, Math.min(99, Math.round(score)));
  }

  function restaurantFitLabel(value) {
    const score = normalizeRestaurantScore(value);
    if (score === null) return '';
    if (score >= 85) return '추천도 높음';
    if (score >= 70) return '추천도 보통';
    return '관련 식당';
  }

  function formatPlace(place, menu) {
    const dist = parseInt(place.distance, 10);
    const distStr = Number.isFinite(dist) ? (dist >= 1000 ? `${(dist/1000).toFixed(1)}km` : `${dist}m`) : '';
    const categoryParts = (place.category_name || '').split('>').map(s => s.trim()).filter(Boolean);
    const subcategory = categoryParts[categoryParts.length - 1] || menu.type;
    const rawScore = place.score || placeRelevanceScore(place, menu, place.tier || 'fallback', place.query || '');
    return {
      id: place.id || '',
      emoji: menu.emoji,
      name: place.place_name,
      dist: distStr,
      score: rawScore,
      fitLabel: restaurantFitLabel(rawScore),
      price: '',
      addr: place.road_address_name || place.address_name || '',
      subcategory,
      placeUrl: place.place_url,
      phone: place.phone || '',
      query: place.query || '',
      tier: place.tier || 'fallback',
      badges: qualityBadgesForPlace(place, menu)
    };
  }

  function renderRestaurantCard(r) {
    const metaParts = [];
    if (r.subcategory) metaParts.push(`<span>${escapeHtml(r.subcategory)}</span>`);
    if (r.dist) metaParts.push(`<span>${escapeHtml(r.dist)}</span>`);
    if (r.phone) metaParts.push(`<span>${escapeHtml(r.phone)}</span>`);
    if (r.price) metaParts.push(`<span>${escapeHtml(r.price)}</span>`);
    if (r.query) metaParts.push(`<span>검색: ${escapeHtml(r.query)}</span>`);

    const safeName = escapeJsString(r.name || '');
    const safeAddr = escapeJsString(r.addr || '');
    const safeUrl = escapeJsString(r.placeUrl || '');
    const safeId = escapeJsString(r.id || r.name || '');
    const onClick = `openRestaurantResult('${safeId}', '${safeName}', '${safeAddr}', '${safeUrl}')`;
    const badges = r.badges || (currentMenu ? qualityBadgesForPlace(r, currentMenu) : []);
    const fitLabel = r.fitLabel || restaurantFitLabel(r.score);
    return `
      <div class="restaurant" onclick="${onClick}">
        <div class="rest-emoji">${r.emoji || '🍽️'}</div>
        <div class="rest-info">
          <div class="rest-heading">
            <div class="rest-name">${escapeHtml(r.name || '식당')}</div>
            ${fitLabel ? `<div class="rest-score">${escapeHtml(fitLabel)}</div>` : ''}
          </div>
          <div class="rest-meta">${metaParts.join('<span style="opacity:0.4;">·</span>')}</div>
          ${r.addr ? `<div class="rest-meta" style="margin-top:4px; opacity:0.7;">${escapeHtml(r.addr)}</div>` : ''}
          ${badges.length ? `<div class="rest-badge-row">${badges.map(b => `<span class="rest-badge">${escapeHtml(b)}</span>`).join('')}</div>` : ''}
        </div>
      </div>
    `;
  }

  async function renderNearby() {
    const c = document.getElementById('nearbyContent');
    if (!currentMenu) {
      c.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📍</div>
          <p class="empty-text">아직 선택된 메뉴가 없어요<br>메뉴 찾기를 먼저 해주세요</p>
          <button class="empty-cta" onclick="startQuiz()">메뉴 찾으러 가기</button>
        </div>
      `;
      return;
    }
    document.getElementById('nearbySubtitle').textContent = `'${currentMenu.name}'을(를) 찾는 정교한 주변 검색`;
    const strategy = renderNearbySearchStrategy(currentMenu) + renderNearbyGuide(currentMenu) + renderExternalSearchLinks(currentMenu);

    if (!isProviderConfigured()) {
      const list = buildSmartMockRestaurants(currentMenu);
      c.innerHTML = strategy + renderMockNotice() + list.map(r => renderRestaurantCard(r)).join('');
      return;
    }

    c.innerHTML = strategy + `
      <div class="empty-state">
        <div class="empty-icon">📍</div>
        <p class="empty-text">정확 메뉴명 → 전문점 → 음식군 순서로 검색 중...<br><span style="font-size:11px;">위치 권한을 허용해주세요</span></p>
      </div>
    `;

    try {
      const location = await getUserLocation();
      const places = await searchPlacesSmart(currentMenu, location);
      if (!places.length) {
        c.innerHTML = strategy + `
          <div class="empty-state">
            <div class="empty-icon">🔍</div>
            <p class="empty-text">근처에서 정확히 맞는 식당을 찾지 못했어요<br>지도 버튼으로 직접 검색해보세요</p>
            <button class="empty-cta" onclick="startQuiz()">다른 메뉴 찾기</button>
          </div>
        `;
        return;
      }
      const formatted = places.map(p => formatPlace(p, currentMenu));
      c.innerHTML = strategy + formatted.map(r => renderRestaurantCard(r)).join('');
    } catch (err) {
      console.error('Nearby search failed:', err);
      const list = buildSmartMockRestaurants(currentMenu);
      const errMsg = err.code === 1 ? '위치 권한이 거부되어' : '주변 식당을 불러오지 못해';
      c.innerHTML = strategy + `
        <div class="nearby-warning">⚠️ ${errMsg} 정교화된 예시 데이터를 보여드려요.</div>
      ` + list.map(r => renderRestaurantCard(r)).join('');
    }
  }

  function openInMaps(name, addr) {
    const query = encodeURIComponent(`${name || ''} ${addr || ''}`.trim());
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
  }

  function goNearby() {
    if (currentMenu) trackEvent('restaurant_search_started', { menuId: currentMenu.id || currentMenu.name });
    switchPanel('nearby');
  }

  // ─── Diary ───
  function renderToday() {
    const todayKey = new Date().toDateString();
    const todayMeals = diary.filter(d => d.date === todayKey);
    const slots = ['아침','점심','저녁','야식'];
    const el = document.getElementById('todayMeals');
    if (!el) return;
    el.innerHTML = slots.map(slot => {
      const record = todayMeals.find(d => d.time === slot);
      if (record) {
        const visual = record.photoDataUrl
          ? `<span class="today-meal-photo"><img src="${record.photoDataUrl}" alt="${escapeHtml(record.menu.name)} 기록 사진"></span>`
          : renderMenuPhoto(record.menu, 'today-meal-photo');
        return `<div class="today-meal" onclick="switchPanel('diary')">
          ${visual}
          <div>${escapeHtml(record.menu.name)}</div>
        </div>`;
      }
      return `<div class="today-meal" onclick="startQuiz()">
        <div class="today-meal-empty">+</div>
        <div>${slot}</div>
      </div>`;
    }).join('');
  }

  function startOfCurrentWeek() {
    const d = new Date();
    const day = d.getDay() || 7;
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - day + 1);
    return d;
  }

  function recentRejectTypeSummary() {
    try {
      const rows = JSON.parse(localStorage.getItem(STORAGE.rejectReasons) || '[]');
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const counts = {};
      rows.filter(row => new Date(row.occurredAt || 0).getTime() >= cutoff).forEach(row => {
        const menu = findMenuByName(row.menuName);
        if (menu?.type) counts[menu.type] = (counts[menu.type] || 0) + 1;
      });
      return sortedEntries(counts)[0]?.[0] || '-';
    } catch (_) { return '-'; }
  }

  function renderDiaryInsights() {
    if (!diary.length) return '';
    const weekStart = startOfCurrentWeek();
    const weekRecords = diary.filter(record => new Date(record.dateTime) >= weekStart);
    const scoped = weekRecords.length ? weekRecords : diary.slice(0, 20);
    const typeCounts = countBy(scoped, d => d.menu?.type);
    const methodCounts = countBy(scoped, d => d.method || '미입력');
    const menuCounts = countBy(scoped, d => d.menu?.name);
    const amounts = scoped.map(d => d.amount).filter(value => Number.isFinite(Number(value)));
    const avgAmount = amounts.length ? Math.round(amounts.reduce((sum, value) => sum + Number(value), 0) / amounts.length) : null;
    const earlierMenuNames = new Set(diary.filter(record => new Date(record.dateTime) < weekStart).map(record => record.menu?.name));
    const newMenus = new Set(weekRecords.map(record => record.menu?.name).filter(name => name && !earlierMenuNames.has(name)));
    const repeated = Object.entries(menuCounts).filter(([, count]) => count >= 2).sort((a, b) => b[1] - a[1]);
    const highSatisfaction = [...new Set(scoped.filter(record => record.satisfaction === '좋음').map(record => record.menu?.name).filter(Boolean))].slice(0, 3);
    const topType = sortedEntries(typeCounts)[0]?.[0] || '-';
    const topMethod = sortedEntries(methodCounts)[0]?.[0] || '-';
    const periodLabel = weekRecords.length ? '이번 주' : '최근 기록';

    return `
      <div class="insight-card">
        <div class="insight-label">식사 기록 요약</div>
        <div class="insight-title">${periodLabel}에 남긴 사실만 정리했어요</div>
        <div class="analysis-grid">
          <div class="analysis-box"><strong>${scoped.length}회</strong><span>식사 기록</span></div>
          <div class="analysis-box"><strong>${escapeHtml(topType)}</strong><span>가장 많이 먹은 종류</span></div>
          <div class="analysis-box"><strong>${avgAmount === null ? '-' : `${avgAmount.toLocaleString()}원`}</strong><span>평균 한 끼 지출</span></div>
          <div class="analysis-box"><strong>${escapeHtml(topMethod)}</strong><span>가장 자주 이용한 방식</span></div>
        </div>
        <div class="record-fact-list">
          <div><span>새롭게 기록한 메뉴</span><strong>${weekRecords.length ? `${newMenus.size}개` : '-'}</strong></div>
          <div><span>반복해서 먹은 메뉴</span><strong>${repeated.length ? escapeHtml(repeated.slice(0, 3).map(([name, count]) => `${name} ${count}회`).join(', ')) : '없음'}</strong></div>
          <div><span>만족도가 높았던 메뉴</span><strong>${highSatisfaction.length ? escapeHtml(highSatisfaction.join(', ')) : '아직 입력 없음'}</strong></div>
          <div><span>최근 자주 거절한 음식 종류</span><strong>${escapeHtml(recentRejectTypeSummary())}</strong></div>
        </div>
        <p class="form-notice">이 요약은 기록된 사실을 보여주며 식습관이나 건강 상태를 평가하지 않습니다.</p>
      </div>`;
  }

  function renderDiaryRecord(record) {
    const amountText = Number.isFinite(Number(record.amount)) ? `${Number(record.amount).toLocaleString()}원` : '금액 미입력';
    const satisfactionText = record.satisfaction ? `만족도 ${record.satisfaction}` : '만족도 미입력';
    const againMap = { yes:'다시 먹고 싶음', maybe:'다시 먹을지 고민', no:'다시 먹고 싶지 않음' };
    const againText = againMap[record.eatAgain] || '재선택 여부 미입력';
    const visual = record.photoDataUrl
      ? `<div class="diary-record-photo"><img src="${record.photoDataUrl}" alt="${escapeHtml(record.menu.name)} 기록 사진"></div>`
      : `<div class="diary-record-photo">${renderMenuPhoto(record.menu, 'diary-record-photo-inner')}</div>`;
    return `
      <article class="diary-record-card">
        ${visual}
        <div class="diary-record-main">
          <strong>${escapeHtml(record.menu.name)}</strong>
          <small>${escapeHtml(record.time)} · ${escapeHtml(record.method || '방식 미입력')} · ${amountText}</small>
          <small>${escapeHtml(satisfactionText)} · ${escapeHtml(againText)}</small>
          ${record.memo ? `<p class="diary-record-note">${escapeHtml(record.memo)}</p>` : ''}
        </div>
        <button class="diary-record-delete" type="button" onclick="deleteMealRecord('${escapeJsString(record.id)}')">삭제</button>
      </article>`;
  }

  function renderDiary() {
    const c = document.getElementById('diaryContent');
    if (!c) return;
    if (diary.length === 0) {
      c.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📓</div>
          <p class="empty-text">아직 기록된 식사가 없어요<br>예시 기록 없이 바로 시작할 수 있습니다.</p>
          <button class="empty-cta" onclick="startQuiz()">메뉴 추천받기</button>
        </div>`;
      return;
    }
    const byDate = {};
    diary.forEach(record => {
      if (!byDate[record.date]) byDate[record.date] = [];
      byDate[record.date].push(record);
    });
    const dates = Object.keys(byDate).sort((a, b) => new Date(b) - new Date(a));
    c.innerHTML = renderDiaryInsights() + dates.map(dateStr => {
      const date = new Date(dateStr);
      const todayKey = new Date().toDateString();
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      const label = dateStr === todayKey ? '오늘' : dateStr === yesterday.toDateString() ? '어제' : `${months[date.getMonth()]} ${date.getDate()}일`;
      const items = byDate[dateStr].sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));
      return `
        <section class="diary-day factual-diary-day">
          <div class="diary-date"><span>${label}</span><span class="kcal">${items.length}개 기록</span></div>
          <div class="diary-record-list">${items.map(renderDiaryRecord).join('')}</div>
        </section>`;
    }).join('');
  }

  // ─── Record Modal ───
  let selectedMealTime = null;

  function toLocalDateTimeInputValue(date = new Date()) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
  }

  function defaultRecordMethod(menu) {
    if (answers?.mode && ['외식','배달','집밥','편의점'].includes(answers.mode)) return answers.mode;
    if (menu?.method === '외식') return '외식';
    if (menu?.method === '간단') return '집밥';
    return '집밥';
  }

  function resetSegmentedInput(id) {
    document.querySelectorAll(`#${id} button`).forEach(button => button.classList.remove('selected'));
  }

  function openRecordModal() {
    if (!currentMenu) { showToast('먼저 메뉴를 골라주세요'); return; }
    selectedMealTime = answers?.contextTime || answers?.time || getCurrentMealTime();
    selectedSatisfaction = '';
    selectedEatAgain = '';
    pendingMealPhoto = '';
    recordSaving = false;

    const modal = document.getElementById('recordModal');
    document.getElementById('recordModalDish').innerHTML = `<strong>${escapeHtml(currentMenu.name)}</strong>을(를) 실제로 먹은 기록을 남겨주세요.`;
    document.getElementById('recordDateTime').value = toLocalDateTimeInputValue(new Date());
    document.getElementById('recordMethod').value = defaultRecordMethod(currentMenu);
    document.getElementById('recordAmount').value = '';
    document.getElementById('recordMemo').value = '';
    document.getElementById('recordPhoto').value = '';
    document.getElementById('recordPhotoPreview').hidden = true;
    document.getElementById('recordPhotoPreview').innerHTML = '';
    resetSegmentedInput('recordSatisfaction');
    resetSegmentedInput('recordEatAgain');
    document.querySelectorAll('.meal-time-btn').forEach(button => button.classList.toggle('selected', button.dataset.time === selectedMealTime));
    const submitButton = document.getElementById('recordSubmitBtn');
    submitButton.disabled = false;
    submitButton.textContent = '기록하기';
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeRecordModal() {
    const modal = document.getElementById('recordModal');
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
  }

  document.querySelectorAll('.meal-time-btn').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.meal-time-btn').forEach(item => item.classList.remove('selected'));
      button.classList.add('selected');
      selectedMealTime = button.dataset.time;
    });
  });

  document.querySelectorAll('#recordSatisfaction button').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('#recordSatisfaction button').forEach(item => item.classList.remove('selected'));
      button.classList.add('selected');
      selectedSatisfaction = button.dataset.value || '';
    });
  });

  document.querySelectorAll('#recordEatAgain button').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('#recordEatAgain button').forEach(item => item.classList.remove('selected'));
      button.classList.add('selected');
      selectedEatAgain = button.dataset.value || '';
    });
  });

  async function compressMealPhoto(file) {
    if (!file || !file.type.startsWith('image/')) return '';
    if (file.size > 12 * 1024 * 1024) throw new Error('사진은 12MB 이하만 선택할 수 있어요.');
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('사진을 읽지 못했습니다.'));
      reader.readAsDataURL(file);
    });
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('사진 형식을 처리하지 못했습니다.'));
      img.src = dataUrl;
    });
    const maxSide = 960;
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let compressed = canvas.toDataURL('image/jpeg', 0.72);
    if (compressed.length > 480_000) compressed = canvas.toDataURL('image/jpeg', 0.55);
    if (compressed.length > 650_000) throw new Error('사진을 충분히 줄이지 못했습니다. 다른 사진을 선택해 주세요.');
    return compressed;
  }

  document.getElementById('recordPhoto').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    const preview = document.getElementById('recordPhotoPreview');
    if (!file) {
      pendingMealPhoto = '';
      preview.hidden = true;
      preview.innerHTML = '';
      return;
    }
    try {
      pendingMealPhoto = await compressMealPhoto(file);
      preview.innerHTML = `<img src="${pendingMealPhoto}" alt="선택한 음식 사진 미리보기">`;
      preview.hidden = false;
    } catch (error) {
      pendingMealPhoto = '';
      event.target.value = '';
      preview.hidden = true;
      preview.innerHTML = '';
      showToast(error.message || '사진을 처리하지 못했습니다');
    }
  });

  async function confirmRecord() {
    if (recordSaving || !selectedMealTime || !currentMenu) return;
    const dateTimeValue = document.getElementById('recordDateTime').value;
    const dateTime = new Date(dateTimeValue);
    if (!dateTimeValue || Number.isNaN(dateTime.getTime())) {
      showToast('식사 날짜와 시간을 확인해 주세요');
      return;
    }
    const amountValue = document.getElementById('recordAmount').value.trim();
    const amount = amountValue === '' ? null : Number(amountValue);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000)) {
      showToast('지출 금액을 0원 이상 100만원 이하로 입력해 주세요');
      return;
    }

    recordSaving = true;
    const submitButton = document.getElementById('recordSubmitBtn');
    submitButton.disabled = true;
    submitButton.textContent = '저장 중…';

    const record = {
      id: makeId('meal'),
      date: dateTime.toDateString(),
      dateTime: dateTime.toISOString(),
      time: selectedMealTime,
      method: document.getElementById('recordMethod').value,
      amount,
      satisfaction: selectedSatisfaction,
      eatAgain: selectedEatAgain,
      memo: document.getElementById('recordMemo').value.trim().slice(0, 300),
      photoDataUrl: pendingMealPhoto,
      menu: currentMenu,
      createdAt: new Date().toISOString(),
    };

    diary.unshift(record);
    diary.sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));
    const saved = saveDiary();
    if (!saved) {
      diary = diary.filter(item => item.id !== record.id);
      recordSaving = false;
      submitButton.disabled = false;
      submitButton.textContent = '다시 저장';
      showToast('기록을 저장하지 못했습니다. 입력 내용은 화면에 남아 있어요.');
      return;
    }

    if (decidedMenuName !== currentMenu.name) {
      recordMenuFeedback(currentMenu, 'accept', selectedMealTime);
      decidedMenuName = currentMenu.name;
    }
    clearRecommendationDraft();
    closeRecordModal();
    renderToday();
    renderDiary();
    renderProfile();
    trackEvent('meal_record_created', {
      menuId: currentMenu.id || currentMenu.name,
      mealTime: selectedMealTime,
      mealMethod: record.method,
      amountRange: amount === null ? 'not_provided' : amount <= 10000 ? 'under_10000' : amount <= 30000 ? 'under_30000' : amount <= 50000 ? 'under_50000' : 'over_50000',
      satisfaction: record.satisfaction || 'not_provided',
      eatAgain: record.eatAgain || 'not_provided',
      hasPhoto: Boolean(record.photoDataUrl),
      hasMemo: Boolean(record.memo),
    });
    showToast(`'${currentMenu.name}' 식사 기록을 저장했어요`);
    recordSaving = false;

    if (!personalProfile.onboardingDone && diary.length === 1) {
      setTimeout(() => showToast('내 입맛에서 선호 음식과 제외 재료를 설정할 수 있어요'), 900);
    }
  }

  function deleteMealRecord(recordId) {
    const record = diary.find(item => item.id === recordId);
    if (!record || !confirm(`'${record.menu.name}' 식사 기록을 삭제할까요?`)) return;
    diary = diary.filter(item => item.id !== recordId);
    if (!saveDiary()) {
      diary.unshift(record);
      diary.sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));
      showToast('기록을 삭제하지 못했습니다');
      return;
    }
    renderToday();
    renderDiary();
    trackEvent('meal_record_deleted', { menuId: record.menu.id || record.menu.name });
    showToast('식사 기록을 삭제했어요');
  }

  // ─── Favorites ───
  function isFavorited(menuName) {
    return favorites.some(f => f.menuName === menuName);
  }

  function toggleFavorite() {
    if (!currentMenu) return;
    if (isFavorited(currentMenu.name)) {
      favorites = favorites.filter(f => f.menuName !== currentMenu.name);
      trackEvent('menu_unfavorited', { menuId: currentMenu.id || currentMenu.name });
      showToast(`'${currentMenu.name}' 찜 해제`);
    } else {
      favorites.unshift({ menuName: currentMenu.name, addedAt: new Date().toISOString() });
      trackEvent('menu_favorited', { menuId: currentMenu.id || currentMenu.name });
      showToast(`'${currentMenu.name}' 찜 목록에 추가 ♥`);
    }
    saveFavorites();
    updateFavButton();
    renderFavorites();
    renderProfile();
  }

  function removeFavorite(menuName, e) {
    if (e) e.stopPropagation();
    favorites = favorites.filter(f => f.menuName !== menuName);
    saveFavorites();
    renderFavorites();
    if (currentMenu && currentMenu.name === menuName) updateFavButton();
    showToast('찜 목록에서 제거됨');
  }

  function updateFavButton() {
    if (!currentMenu) return;
    const btn = document.getElementById('favActionBtn');
    const icon = document.getElementById('favActionIcon');
    const text = document.getElementById('favActionText');
    if (!btn) return;
    if (isFavorited(currentMenu.name)) {
      btn.classList.add('faved');
      icon.textContent = '♥';
      text.textContent = '찜 해제';
    } else {
      btn.classList.remove('faved');
      icon.textContent = '♡';
      text.textContent = '찜하기';
    }
  }

  function pickFavorite(menuName) {
    const menu = findMenuByName(menuName);
    if (!menu) return;
    currentMenu = menu;
    // jump to recipe view for that menu
    renderRecipe();
    switchPanel('recipe');
  }

  function renderFavorites() {
    const c = document.getElementById('favoritesContent');
    document.getElementById('favSubtitle').textContent =
      favorites.length > 0 ? `${favorites.length}개의 메뉴를 찜해두셨어요` : '언젠가 먹어보고 싶은 메뉴 모음';

    if (favorites.length === 0) {
      c.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">♡</div>
          <p class="empty-text">아직 찜한 메뉴가 없어요<br>마음에 드는 메뉴를 발견하면<br>♡ 버튼으로 저장해보세요</p>
          <button class="empty-cta" onclick="startQuiz()">메뉴 찾으러 가기</button>
        </div>
      `;
      return;
    }

    c.innerHTML = favorites.map(f => {
      const m = findMenuByName(f.menuName);
      if (!m) return '';
      const added = new Date(f.addedAt);
      const dateStr = `${months[added.getMonth()]} ${added.getDate()}`;
      return `
        <div class="fav-card" onclick="pickFavorite('${m.name}')">
          ${renderMenuPhoto(m, 'fav-photo')}
          <div class="fav-info">
            <div class="fav-name">${m.name}</div>
            <div class="fav-meta">
              <span>${m.time}</span>
              <span>· ${m.kcal}kcal</span>
              <span>· ~${m.price.toLocaleString()}원</span>
            </div>
            <div class="fav-date">${dateStr} 저장</div>
          </div>
          <button class="fav-remove" onclick="removeFavorite('${m.name}', event)" title="찜 해제">×</button>
        </div>
      `;
    }).join('');
  }



  // ─── Recommendation Test Panel ───
  const TEST_SELECTS = [
    { id:'testTime', key:'time', label:'시간대', values:['아침','점심','저녁'] },
    { id:'testType', key:'type', label:'음식 종류', values:['한식','중식','일식','양식','세계음식'] },
    { id:'testWeight', key:'weight', label:'포만감', values:['가벼움','중간','든든'] },
    { id:'testSoup', key:'soup', label:'국물', values:[['true','있음'],['false','없음']] },
    { id:'testSpicy', key:'spicy', label:'맵기', values:[['mild','순한맛'],['mid','약간 매콤'],['hot','매운맛']] },
    { id:'testMethod', key:'method', label:'방식', values:['간단','요리','외식'] },
  ];

  function renderRecommendationTest() {
    const box = document.getElementById('recommendationTestControls');
    const result = document.getElementById('recommendationTestResult');
    if (!box || !result) return;
    box.innerHTML = TEST_SELECTS.map(cfg => {
      const opts = cfg.values.map(v => {
        const value = Array.isArray(v) ? v[0] : v;
        const label = Array.isArray(v) ? v[1] : v;
        return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
      }).join('');
      return `<label class="test-field"><span>${cfg.label}</span><select id="${cfg.id}">${opts}</select></label>`;
    }).join('') + `<button class="empty-cta test-run-btn" onclick="runRecommendationTest()">엄격 조건 검사</button>`;
    runRecommendationTest();
  }

  function readRecommendationTestAnswers() {
    const ans = {};
    TEST_SELECTS.forEach(cfg => {
      const el = document.getElementById(cfg.id);
      if (!el) return;
      let value = el.value;
      if (cfg.key === 'soup') value = value === 'true';
      ans[cfg.key] = value;
    });
    return ans;
  }

  function runRecommendationTest() {
    const result = document.getElementById('recommendationTestResult');
    if (!result) return;
    const ans = readRecommendationTestAnswers();
    const strictAll = filterMenus(ans, { includeRecent:true, includeTemporary:true });
    const userFiltered = filterMenus(ans);
    const scored = strictAll.map(m => ({ menu:m, score: scoreMenu(m, ans) })).sort((a,b) => b.score - a.score).slice(0, 12);
    const report = window.__curatedCoverageReport || getCuratedCoverageReport();
    result.innerHTML = `
      <div class="test-summary-card">
        <strong>검사 결과</strong>
        <p>전체 DB 기준 엄격 후보: <b>${strictAll.length}</b>개</p>
        <p>현재 개인화 제외 반영 후 후보: <b>${userFiltered.length}</b>개</p>
        <p>DB 정책: <b>실제 메뉴만 사용</b> · 총 ${report.totalMenus || menus.length}개 · 자동 생성 메뉴 0개</p>
      </div>
      <div class="test-result-list">
        ${scored.map((x, idx) => `
          <div class="runner-item" onclick="selectRunner('${escapeJsString(x.menu.name)}')">
            <span class="runner-emoji">${x.menu.emoji || '🍽'}</span>
            <div class="runner-info">
              <div class="runner-name">${idx + 1}. ${escapeHtml(x.menu.name)}</div>
              <div class="runner-meta">${escapeHtml(x.menu.type)} · ${escapeHtml(x.menu.time)} · ${escapeHtml(x.menu.weight)} · ${x.menu.soup ? '국물 있음' : '국물 없음'} · ${escapeHtml(x.menu.method)}</div>
            </div>
            <span class="runner-score">${Math.round(x.score)}</span>
          </div>`).join('')}
      </div>
      ${strictAll.length < 3 ? `<div class="nearby-empty-strict"><div class="icon">⚠️</div><p>이 조합은 실제 등록 메뉴 기준 후보가 3개 미만입니다. 가짜 메뉴 대신 실제 음식명을 data/menus.json에 추가해야 합니다.</p></div>` : ''}
    `;
  }

  // ─── Panel switching ───
  function switchPanel(name, updateNav = true) {
    const targetPanel = document.getElementById('panel-' + name);
    if (!targetPanel) {
      console.error('존재하지 않는 패널:', name);
      showToast('화면을 열지 못했습니다. 홈으로 이동합니다.');
      name = 'home';
    }
    const nextPanel = document.getElementById('panel-' + name);
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    nextPanel.classList.add('active');
    document.body.dataset.panel = name;

    // 긴 화면에서 다른 탭으로 이동했을 때 이전 스크롤 위치가 남아
    // 새 화면의 하단부터 보이는 문제를 방지합니다.
    requestAnimationFrame(() => {
      const scroller = document.scrollingElement || document.documentElement;
      if (scroller) scroller.scrollTop = 0;
      window.scrollTo(0, 0);
    });

    if (updateNav) {
      const navMap = { home:'home', quiz:'home', result:'home', recipe:'home', nearby:'nearby', favorites:'favorites', profile:'profile', debug:'home', recipeqa:'home', diary:'diary' };
      const target = navMap[name];
      document.querySelectorAll('.nav-item').forEach(n => {
        n.classList.toggle('active', n.dataset.panel === target);
      });
    }

    if (name === 'recipe') renderRecipe();
    if (name === 'nearby') renderNearby();
    if (name === 'favorites') renderFavorites();
    if (name === 'profile') renderProfile();
    if (name === 'debug') renderRecommendationTest();
    if (name === 'recipeqa') renderRecipeQA();
    if (name === 'diary') {
      try {
        renderDiary();
      } catch (error) {
        console.error('식사 기록 화면 렌더링 실패:', error);
        const diaryContent = document.getElementById('diaryContent');
        if (diaryContent) {
          diaryContent.innerHTML = `
            <div class="empty-state diary-error-state">
              <div class="empty-icon">!</div>
              <p class="empty-text">식사 기록을 불러오지 못했어요.<br>기록은 삭제되지 않았습니다.</p>
              <button class="empty-cta" type="button" onclick="switchPanel('diary')">다시 불러오기</button>
            </div>`;
        }
        trackEvent('app_error', { area:'diary_render', message:String(error?.message || error) });
      }
    }
    if (name === 'home') { updateHomeContext(); renderToday(); }
  }

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      switchPanel(item.dataset.panel, false);
    });
  });

  // ─── Toast ───
  function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 1800);
  }



  // ─── Research-informed beginner recipes + strict nearby availability override ───
  let TRUSTED_RECIPE_SOURCES = {};

  let CURATED_RECIPE_SOURCES = {};

  function recipeFamily(menu) {
    const n = (menu?.name || '').replace(/\s+/g, '');
    if (/미역국/.test(n)) return 'miyeokguk';
    if (/김치찌개/.test(n)) return 'kimchijjigae';
    if (/된장찌개|청국장/.test(n)) return 'doenjangjjigae';
    if (/제육|돼지불고기|두루치기/.test(n)) return 'jeyuk';
    if (/비빔밥|돌솥/.test(n)) return 'bibimbap';
    if (/파스타|스파게티|알리오|까르보|라구/.test(n)) return 'pasta';
    if (/카레/.test(n)) return 'curry';
    if (/볶음밥/.test(n)) return 'friedrice';
    if (/샐러드/.test(n)) return 'salad';
    if (/스테이크/.test(n)) return 'steak';
    if (/라면|라멘/.test(n)) return 'noodleSoup';
    if (/떡볶이/.test(n)) return 'tteokbokki';
    if (/불고기/.test(n)) return 'bulgogi';
    return 'generic';
  }

  function variantForMenu(menu) {
    const name = menu?.name || '';
    const variants = ['소고기','성게','전복','바지락','홍합','들깨','참치','돼지고기','해물','두부','버섯','차돌','닭고기','새우'];
    return variants.find(v => name.includes(v)) || '';
  }

  function sourceListForMenu(menu) {
    const family = recipeFamily(menu);
    const base = CURATED_RECIPE_SOURCES[family] || CURATED_RECIPE_SOURCES.generic;
    const safety = TRUSTED_RECIPE_SOURCES.safety;
    const merged = [...base, safety];
    const seen = new Set();
    return merged.filter(s => {
      const key = s.url;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function safeExternalLink(url) {
    return escapeHtml(url || '#');
  }

  function renderRecipeSources(menu) {
    const sources = sourceListForMenu(menu);
    return `
      <div class="recipe-source-card">
        <div class="recipe-source-title">참고한 레시피 기준</div>
        <p class="recipe-source-desc">
          아래 레시피를 그대로 복사하지 않고, 유명 레시피 채널·블로그·대중 반응형 플랫폼의 공통 조리 원리를 초보자용으로 재구성했습니다.
        </p>
        <div class="recipe-source-list">
          ${sources.map(src => `
            <a class="recipe-source-link" href="${safeExternalLink(src.url)}" target="_blank" rel="noopener noreferrer">
              <strong>${escapeHtml(src.title)}</strong>
              ${escapeHtml(src.note || '')}
            </a>
          `).join('')}
        </div>
      </div>
    `;
  }

  function ingredientRows(items) {
    return items.map(i => `<li><span>${escapeHtml(i[0])}</span><span class="qty">${escapeHtml(i[1])}</span></li>`).join('');
  }

  function detailedStep(no, time, main, why) {
    return `
      <div class="recipe-step-card">
        <div class="recipe-step-head">
          <span class="recipe-step-no">STEP ${String(no).padStart(2,'0')}</span>
          <span class="recipe-step-time">${escapeHtml(time)}</span>
        </div>
        <div class="recipe-step-main">${escapeHtml(main)}</div>
        <div class="recipe-step-why">${escapeHtml(why)}</div>
      </div>
    `;
  }

  function renderDetailedSteps(steps) {
    return steps.map((s, idx) => detailedStep(idx + 1, s.time || '', s.main || s, s.why || '이 단계는 맛의 균형을 잡기 위한 과정입니다.')).join('');
  }

  function miyeokgukRecipe(menu) {
    const variant = variantForMenu(menu);
    const seafood = ['성게','전복','바지락','홍합','해물','새우'].includes(variant);
    const perilla = variant === '들깨';
    const main = variant || '소고기';
    const mainQty = seafood ? '100~150g' : perilla ? '들깨가루 2큰술' : '80~120g';
    const ingredients = [
      ['마른 미역', '8~10g'],
      [main === '소고기' ? '소고기 국거리' : main, mainQty],
      ['국간장', '1.5큰술'],
      ['참기름', seafood ? '1작은술' : '1큰술'],
      ['다진 마늘', '1작은술'],
      ['물', '700~800ml'],
      ['소금', '마지막 간 맞춤']
    ];
    if (perilla) ingredients.splice(4, 0, ['들깨가루', '2큰술']);
    const steps = [
      { time:'10분', main:'마른 미역을 찬물에 담가 충분히 불린 뒤, 손으로 2~3번 헹구고 가위로 한입 크기로 자릅니다.', why:'불린 미역은 양이 크게 늘어납니다. 헹구면 비린 향과 모래감을 줄일 수 있습니다.' },
      { time:'1분', main: seafood ? `${main}은 흐르는 물에 가볍게 씻고 물기를 빼둡니다.` : `${main}은 키친타월로 핏물을 닦고 한입 크기로 준비합니다.`, why:'초보자는 재료 물기를 먼저 빼야 볶을 때 튀지 않고 국물 맛이 탁해지지 않습니다.' },
      { time:'2분', main:'냄비를 중약불에 올리고 참기름을 두른 뒤 미역을 먼저 볶습니다. 미역 색이 진해지고 윤기가 나면 성공입니다.', why:'미역을 바로 끓이는 것보다 먼저 볶으면 국물이 더 깊고 고소해집니다.' },
      { time:'2분', main: seafood ? `${main}을 넣고 30초~1분만 가볍게 볶습니다. 오래 볶지 마세요.` : `${main}을 넣고 겉면 색이 살짝 변할 때까지 볶습니다.`, why: seafood ? '해산물은 오래 볶으면 질겨지므로 향만 입히는 정도면 충분합니다.' : '고기를 먼저 볶으면 잡내가 줄고 국물에 감칠맛이 생깁니다.' },
      { time:'15~20분', main:'물을 붓고 국간장을 넣은 뒤 센 불에서 끓입니다. 끓어오르면 중약불로 줄여 15분 이상 끓입니다.', why:'미역국은 끓이는 시간이 조금 길수록 미역의 감칠맛이 국물에 잘 우러납니다.' },
      { time:'1분', main: perilla ? '불을 약하게 줄이고 들깨가루를 넣어 잘 풀어줍니다. 마지막에 소금으로 간을 맞춥니다.' : '마지막에 다진 마늘을 넣고 1분만 더 끓인 뒤 소금으로 간을 맞춥니다.', why:'간장은 향과 색을 만들고, 소금은 최종 짠맛을 조절합니다. 처음부터 소금을 많이 넣지 마세요.' }
    ];
    return {
      title: `${menu.name} 초보자용 레시피`, servings:'1~2인분', time:'25~35분', difficulty:'초보 가능', heat:'중약불 중심',
      summary:'미역을 충분히 불리고 먼저 볶는 것이 핵심입니다. 국물 음식은 마지막 간 맞춤이 실패를 줄입니다.',
      equipment:['냄비','가위','계량스푼','국자','체 또는 볼'], ingredients, steps,
      checks:['미역이 부드럽고 질기지 않다','국물이 옅은 갈색 또는 뽀얀 빛을 낸다','짠맛이 먼저 치고 오지 않고 감칠맛이 난다'],
      mistakes:['미역을 너무 많이 넣으면 냄비가 넘칩니다. 마른 미역 10g이면 충분합니다.','처음부터 소금을 많이 넣으면 되돌리기 어렵습니다. 마지막에 맞추세요.','해산물 미역국은 오래 끓이면 질겨질 수 있으니 해산물 양을 과하게 넣지 마세요.']
    };
  }

  function kimchijjigaeRecipe(menu) {
    const ingredients = [
      ['잘 익은 김치', '1컵 반'], ['김치국물', '3~5큰술'], ['돼지고기 또는 참치', '100~150g'], ['두부', '1/3모'], ['양파', '1/4개'], ['대파', '1/3대'], ['고춧가루', '1작은술'], ['국간장 또는 진간장', '1작은술'], ['물 또는 멸치육수', '500ml']
    ];
    const steps = [
      { time:'2분', main:'김치는 가위로 한입 크기로 자르고, 두부·양파·대파를 미리 썰어둡니다.', why:'초보자는 재료를 미리 다 썰어두면 조리 중 당황하지 않습니다.' },
      { time:'3분', main:'냄비에 돼지고기를 먼저 넣고 중불에서 볶습니다. 고기 겉면이 하얗게 변하면 김치를 넣습니다.', why:'고기 기름에 김치를 볶으면 국물 맛이 깊어지고 신맛이 둥글어집니다.' },
      { time:'3분', main:'김치가 살짝 투명해질 때까지 볶고, 고춧가루와 간장을 넣어 섞습니다.', why:'양념을 먼저 볶으면 날맛이 줄고 찌개 색이 좋아집니다.' },
      { time:'12분', main:'물 또는 육수를 붓고 김치국물을 넣은 뒤 끓입니다. 끓으면 중약불로 줄입니다.', why:'김치찌개는 오래 끓일수록 맛이 합쳐집니다. 센 불로 계속 끓이면 국물이 빨리 졸아 짜집니다.' },
      { time:'5분', main:'두부와 양파를 넣고 더 끓입니다. 마지막에 대파를 넣고 1분 뒤 불을 끕니다.', why:'두부는 너무 오래 끓이면 부서지므로 후반에 넣는 것이 안전합니다.' }
    ];
    return { title:`${menu.name} 실패 줄이는 레시피`, servings:'1~2인분', time:'25분', difficulty:'초보 가능', heat:'중불 → 중약불', summary:'묵은지와 김치국물이 맛의 절반입니다. 김치를 먼저 볶고 마지막에 간을 조절하세요.', equipment:['냄비','가위','도마','국자'], ingredients, steps, checks:['김치가 흐물거리며 부드럽다','국물이 너무 맵거나 짜지 않다','두부가 부서지지 않고 모양을 유지한다'], mistakes:['신김치가 없으면 식초를 많이 넣지 말고 김치국물을 활용하세요.','두부를 처음부터 넣으면 쉽게 부서집니다.','물이 적으면 금방 짜지니 중간에 맛을 보세요.'] };
  }

  function doenjangRecipe(menu) {
    const ingredients = [['된장','1.5큰술'],['두부','1/3모'],['애호박','1/4개'],['양파','1/4개'],['감자 또는 버섯','조금'],['대파','1/3대'],['다진 마늘','1작은술'],['물 또는 멸치육수','500ml']];
    const steps = [
      { time:'3분', main:'채소와 두부를 모두 한입 크기로 썰어둡니다. 감자는 얇게 썰수록 빨리 익습니다.', why:'초보자에게 가장 흔한 실패는 재료 익는 속도가 제각각인 것입니다.' },
      { time:'5분', main:'냄비에 물 또는 육수를 넣고 감자처럼 단단한 재료부터 넣어 끓입니다.', why:'단단한 재료를 먼저 익혀야 두부가 부서지지 않습니다.' },
      { time:'1분', main:'된장을 체에 풀거나 숟가락으로 잘 풀어 넣습니다.', why:'된장 덩어리가 남으면 특정 부분만 짜질 수 있습니다.' },
      { time:'7분', main:'애호박, 양파, 버섯을 넣고 중불에서 끓입니다.', why:'채소가 익으면서 단맛이 국물에 배어 나옵니다.' },
      { time:'3분', main:'두부, 다진 마늘, 대파를 넣고 한 번 더 끓입니다. 싱거우면 된장보다 소금으로 조금만 보정합니다.', why:'된장을 계속 추가하면 텁텁해질 수 있어 마지막 간은 소량의 소금이 안정적입니다.' }
    ];
    return { title:`${menu.name} 기본 레시피`, servings:'1~2인분', time:'20분', difficulty:'초보 가능', heat:'중불', summary:'된장찌개는 된장을 많이 넣는 것보다 채소 단맛과 육수 균형이 중요합니다.', equipment:['냄비','칼','도마','국자'], ingredients, steps, checks:['된장 덩어리가 없다','감자가 있다면 속까지 익었다','국물이 텁텁하지 않고 구수하다'], mistakes:['된장을 처음부터 많이 넣지 마세요. 졸면서 짜집니다.','두부는 마지막에 넣어야 모양이 살아납니다.'] };
  }

  function jeyukRecipe(menu) {
    const ingredients = [['돼지고기 앞다리/목살 얇은 것','200g'],['양파','1/2개'],['대파','1/2대'],['고추장','1큰술'],['고춧가루','1큰술'],['간장','1큰술'],['설탕 또는 올리고당','1큰술'],['다진 마늘','1작은술'],['참기름','마지막 1작은술']];
    const steps = [
      { time:'3분', main:'양파와 대파를 썰고, 고기는 키친타월로 핏물을 가볍게 닦습니다.', why:'물기가 많으면 볶는 게 아니라 삶아져서 맛이 흐려집니다.' },
      { time:'2분', main:'고추장, 고춧가루, 간장, 설탕, 다진 마늘을 섞어 양념장을 만듭니다.', why:'양념을 따로 섞어야 한 부분만 짜거나 맵지 않습니다.' },
      { time:'5분', main:'팬을 중강불로 달군 뒤 고기를 먼저 펼쳐 굽습니다. 고기가 70% 정도 익으면 양파를 넣습니다.', why:'고기를 먼저 구워야 수분이 덜 나오고 불맛에 가까운 맛이 납니다.' },
      { time:'4분', main:'양념장을 넣고 빠르게 섞어 볶습니다. 타기 시작하면 물 2큰술을 넣어 풀어줍니다.', why:'고추장 양념은 쉽게 탑니다. 소량의 물은 실패를 막는 안전장치입니다.' },
      { time:'1분', main:'대파와 참기름을 넣고 불을 끈 뒤 섞습니다.', why:'참기름은 오래 가열하면 향이 날아가므로 마지막에 넣습니다.' }
    ];
    return { title:`${menu.name} 초보자용 레시피`, servings:'1인분', time:'15~20분', difficulty:'보통', heat:'중강불', summary:'수분을 줄이고 양념을 태우지 않는 것이 핵심입니다. 팬이 너무 뜨거우면 물을 조금 넣으세요.', equipment:['프라이팬','집게 또는 주걱','볼'], ingredients, steps, checks:['고기 안쪽까지 분홍색이 없다','양념이 고기에 고르게 묻었다','팬 바닥 양념이 까맣게 타지 않았다'], mistakes:['양념을 처음부터 넣으면 타기 쉽습니다.','냉동 고기를 바로 볶으면 물이 많이 나옵니다. 가능하면 해동하세요.'] };
  }

  function bibimbapRecipe(menu) {
    const ingredients = [['밥','1공기'],['계란','1개'],['나물 또는 채소','2~3가지'],['고추장','1큰술'],['참기름','1큰술'],['간장','1작은술'],['김가루/깨','선택']];
    const steps = [
      { time:'3분', main:'냉장고 채소를 얇게 썰고, 물기가 많은 채소는 키친타월로 닦습니다.', why:'비빔밥은 물기가 많으면 밥이 질어집니다.' },
      { time:'5분', main:'채소를 각각 소금 아주 조금으로 볶거나 전자레인지에 살짝 익힙니다.', why:'재료를 따로 익히면 색과 식감이 살아납니다.' },
      { time:'3분', main:'계란 프라이를 만듭니다. 초보자는 반숙보다 완숙이 안전합니다.', why:'완숙은 실패가 적고 도시락처럼 먹기에도 좋습니다.' },
      { time:'1분', main:'그릇에 밥을 담고 재료를 둘러 올립니다.', why:'고명을 나눠 올리면 보기 좋고 비비기도 편합니다.' },
      { time:'1분', main:'고추장, 참기름, 간장을 조금씩 넣고 먼저 절반만 비빈 뒤 맛을 보고 추가합니다.', why:'양념을 한 번에 넣으면 짜거나 매워질 수 있습니다.' }
    ];
    return { title:`${menu.name} 쉬운 레시피`, servings:'1인분', time:'15분', difficulty:'초보 가능', heat:'약불~중불', summary:'비빔밥은 양념을 한 번에 넣지 않는 것이 핵심입니다. 절반만 넣고 맛을 보세요.', equipment:['프라이팬','그릇','주걱'], ingredients, steps, checks:['밥이 질지 않다','양념이 과하지 않다','채소 식감이 남아 있다'], mistakes:['고추장을 많이 넣으면 모든 맛이 가려집니다.','채소 물기를 빼지 않으면 밥이 질어집니다.'] };
  }

  function pastaRecipe(menu) {
    const tomato = /토마토|라구|볼로네제/.test(menu.name);
    const oil = /알리오|오일/.test(menu.name);
    const cream = /크림|까르보/.test(menu.name);
    const ingredients = [['파스타면','100g'],['소금','물 1L당 10g 정도'],['마늘','2~4쪽'],['올리브유','2큰술'],[tomato?'토마토소스':cream?'크림 또는 우유':'면수','150ml'],['후추/치즈','선택']];
    const steps = [
      { time:'1분', main:'냄비에 물을 넉넉히 끓이고 소금을 넣습니다.', why:'면 자체에 간이 들어가야 소스와 따로 놀지 않습니다.' },
      { time:'7~10분', main:'포장지 시간보다 1분 짧게 삶습니다. 면수 한 컵은 버리지 말고 남깁니다.', why:'소스에서 한 번 더 익히면 식감이 맞습니다. 면수는 소스를 붙이는 접착제 역할을 합니다.' },
      { time:'2분', main:'팬에 올리브유와 마늘을 넣고 약불에서 천천히 향을 냅니다.', why:'마늘은 센 불에서 금방 타므로 약불이 안전합니다.' },
      { time:'3분', main: tomato ? '토마토소스를 넣고 끓입니다.' : cream ? '크림 또는 우유를 넣고 약불에서 데웁니다.' : '면수 4~5큰술을 넣고 팬을 흔들어 오일과 섞습니다.', why:'파스타 맛은 소스가 면에 잘 붙는지가 중요합니다.' },
      { time:'1~2분', main:'면을 넣고 섞습니다. 뻑뻑하면 면수를 한 숟가락씩 추가합니다.', why:'초보자는 물을 한 번에 많이 넣지 말고 조금씩 넣어 농도를 맞추세요.' }
    ];
    return { title:`${menu.name} 기본 레시피`, servings:'1인분', time:'15~20분', difficulty:'초보 가능', heat:'약불~중불', summary:'파스타는 면수 보관이 핵심입니다. 면수로 농도와 간을 동시에 조절하세요.', equipment:['냄비','프라이팬','집게'], ingredients, steps, checks:['면이 퍼지지 않았다','소스가 면에 코팅되어 있다','마늘이 까맣게 타지 않았다'], mistakes:['면수를 전부 버리지 마세요.','마늘을 센 불에 볶으면 쓴맛이 납니다.'] };
  }

  function genericRecipe(menu) {
    const baseIngredients = (menu.ingredients || []).filter(i => !String(i[0]).includes('외식') && !String(i[0]).includes('배달'));
    const ingredients = baseIngredients.length ? baseIngredients : [['주재료', '1인분'], ['소금/간장', '조금씩'], ['기름 또는 육수', menu.soup ? '500ml' : '1큰술'], ['대파/마늘', '선택']];
    let steps;
    if (menu.soup) {
      steps = [
        { time:'3분', main:'재료를 모두 한입 크기로 썰어둡니다.', why:'국물 요리는 재료 크기가 비슷해야 익는 속도가 맞습니다.' },
        { time:'2분', main:'향을 낼 재료를 먼저 약불에서 볶거나 육수를 끓입니다.', why:'처음 향이 국물 전체 맛을 결정합니다.' },
        { time:'10~15분', main:'단단한 재료부터 넣고 끓인 뒤 부드러운 재료를 나중에 넣습니다.', why:'두부, 면, 해산물은 오래 끓이면 부서지거나 질겨집니다.' },
        { time:'1분', main:'불을 끄기 직전에 간을 봅니다. 싱거우면 소금이나 간장을 아주 조금만 넣습니다.', why:'국물은 끓으면서 짜지므로 마지막 간이 안전합니다.' }
      ];
    } else if (menu.method === '간단') {
      steps = [
        { time:'3분', main:'재료를 씻고 바로 먹기 좋은 크기로 자릅니다.', why:'간단 메뉴는 손질만 안정적이면 절반은 성공입니다.' },
        { time:'3~5분', main:'익혀야 하는 재료만 먼저 조리합니다. 생으로 먹는 재료는 마지막에 넣습니다.', why:'식감 차이를 살리면 간단한 메뉴도 완성도가 올라갑니다.' },
        { time:'1분', main:'소스나 양념은 절반만 넣고 섞은 뒤 맛을 보고 추가합니다.', why:'초보자는 양념 과다가 가장 흔한 실패입니다.' }
      ];
    } else {
      steps = [
        { time:'3분', main:'재료를 모두 손질하고 양념을 따로 섞어둡니다.', why:'요리 중 양념을 찾으면 불 조절 타이밍을 놓치기 쉽습니다.' },
        { time:'5분', main:'팬이나 냄비를 중불로 예열하고 주재료부터 익힙니다.', why:'주재료를 먼저 익혀야 겉면 맛과 식감이 살아납니다.' },
        { time:'5~10분', main:'양념이나 소스를 넣고 중약불에서 마무리합니다.', why:'양념은 센 불에서 쉽게 타므로 중약불이 안전합니다.' },
        { time:'1분', main:'불을 끄고 마지막 향 재료를 넣습니다.', why:'참기름, 허브, 후추 같은 향 재료는 마지막에 넣어야 향이 남습니다.' }
      ];
    }
    return { title:`${menu.name} 초보자용 기본 조리법`, servings:'1인분', time: menu.cook ? `${Math.max(menu.cook, 10)}분 안팎` : '15~25분', difficulty: menu.method === '외식' ? '집밥 변형' : '초보 가능', heat: menu.soup ? '중불 → 중약불' : '중불 중심', summary:'해당 메뉴의 기본 조리 원리를 초보자용으로 풀어 쓴 버전입니다. 정확한 맛은 참고 레시피와 비교해 조정하세요.', equipment: menu.soup ? ['냄비','국자','칼','도마'] : ['프라이팬 또는 볼','주걱','칼','도마'], ingredients, steps, checks:['재료가 속까지 익었다','간이 한쪽으로 치우치지 않았다','타거나 눌어붙은 냄새가 없다'], mistakes:['양념은 절반만 먼저 넣고 맛을 본 뒤 추가하세요.','센 불이 항상 빠른 것은 아닙니다. 타기 시작하면 즉시 불을 줄이세요.'] };
  }

  function researchedRecipeFor(menu) {
    const family = recipeFamily(menu);
    if (family === 'miyeokguk') return miyeokgukRecipe(menu);
    if (family === 'kimchijjigae') return kimchijjigaeRecipe(menu);
    if (family === 'doenjangjjigae') return doenjangRecipe(menu);
    if (family === 'jeyuk') return jeyukRecipe(menu);
    if (family === 'bibimbap') return bibimbapRecipe(menu);
    if (family === 'pasta') return pastaRecipe(menu);
    return genericRecipe(menu);
  }

  function renderBeginnerRecipe(menu) {
    const r = researchedRecipeFor(menu);
    return `
      <div class="beginner-recipe-box">
        <div class="beginner-recipe-title">${escapeHtml(r.title)}</div>
        <p class="beginner-recipe-sub">${escapeHtml(r.summary)}</p>
        <div class="recipe-mini-grid">
          <div class="recipe-mini-card"><span>Servings</span><strong>${escapeHtml(r.servings)}</strong></div>
          <div class="recipe-mini-card"><span>Time</span><strong>${escapeHtml(r.time)}</strong></div>
          <div class="recipe-mini-card"><span>Difficulty</span><strong>${escapeHtml(r.difficulty)}</strong></div>
          <div class="recipe-mini-card"><span>Heat</span><strong>${escapeHtml(r.heat)}</strong></div>
        </div>
        <div class="recipe-beginner-alert">
          초보자 기준: 조리 전 손을 씻고, 생고기·해산물과 바로 먹는 채소 도마를 분리하세요. 간은 처음부터 세게 하지 말고 마지막에 맞추는 방식이 가장 안전합니다.
        </div>
      </div>
      <div class="section">
        <h3>필요한 도구</h3>
        <div class="pairing-list">${r.equipment.map(x => `<span class="pairing-item">${escapeHtml(x)}</span>`).join('')}</div>
      </div>
      <div class="section">
        <h3>재료</h3>
        <ul class="ingredient-list">${ingredientRows(r.ingredients)}</ul>
      </div>
      <div class="section">
        <h3>초보자용 상세 조리 순서</h3>
        ${renderDetailedSteps(r.steps)}
      </div>
      <div class="section">
        <h3>완성 확인 기준</h3>
        <ul class="recipe-check-list">${r.checks.map(x => `<li>✓ ${escapeHtml(x)}</li>`).join('')}</ul>
      </div>
      <div class="section">
        <h3>자주 망하는 포인트</h3>
        <ul class="recipe-mistake-list">${r.mistakes.map(x => `<li>주의: ${escapeHtml(x)}</li>`).join('')}</ul>
      </div>
    `;
  }

  function renderRecipe() {
    const c = document.getElementById('recipeContent');
    if (!currentMenu) {
      c.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📖</div>
          <p class="empty-text">아직 선택된 메뉴가 없어요<br>메뉴 찾기를 먼저 해주세요</p>
          <button class="empty-cta" onclick="startQuiz()">메뉴 찾으러 가기</button>
        </div>
      `;
      return;
    }
    document.getElementById('recipeSubtitle').textContent = `${currentMenu.name} · 초보자도 따라 하는 상세 레시피`;
    c.innerHTML = `
      <div class="recipe-header">
        <span class="recipe-emoji">${currentMenu.emoji}</span>
        <div class="recipe-name">${escapeHtml(currentMenu.name)}</div>
        <div class="recipe-meta">
          <span>⏱ ${currentMenu.cook === 0 ? '외식/집밥 변형' : currentMenu.cook + '분 기준'}</span>
          <span>👥 1인분 기준</span>
          <span>🔥 약 ${currentMenu.kcal}kcal</span>
        </div>
      </div>
      ${renderRecipeSources(currentMenu)}
      ${renderRecipePremiumNote(currentMenu)}
      ${renderBeginnerRecipe(currentMenu)}
    `;
  }


  // ─── Source-backed recipe system v2 ───
  // 이 블록은 이전의 범용 레시피 렌더링을 덮어씁니다.
  // 원문 레시피를 그대로 복사하지 않고, 신뢰 가능한 출처의 핵심 조리 원리를 초보자용으로 재구성합니다.
  const SOURCE_RECIPE_CATALOG = {
    foodSafetyKorea:{title:'식품안전나라 · 조리 위생 기준',url:'https://www.foodsafetykorea.go.kr/',note:'손 씻기, 생고기·채소 도마 분리, 충분한 가열 등 안전 기준'},
    maangchiMiyeokguk:{title:'Maangchi · Miyeokguk',url:'https://www.maangchi.com/recipe/miyeokguk',note:'불린 미역, 참기름/마늘, 국간장·액젓 계열 간의 기본 구조'},
    maangchiKimchiJjigae:{title:'Maangchi · Kimchi-jjigae',url:'https://www.maangchi.com/recipe/kimchi-jjigae',note:'묵은 김치, 김치국물, 돼지고기, 두부를 중심으로 하는 김치찌개 구조'},
    koreanBapsangMiyeokguk:{title:'Korean Bapsang · Beef Seaweed Soup',url:'https://www.koreanbapsang.com/miyeok-guk-beef-seaweed-soup/',note:'가정식 소고기 미역국 비율과 국간장 사용 흐름'},
    koreanBapsangDoenjang:{title:'Korean Bapsang · Doenjang Jjigae',url:'https://www.koreanbapsang.com/doenjang-jjigae-korean-soy-bean-paste/',note:'된장, 두부, 채소, 멸치육수 기반의 기본 된장찌개 구조'},
    koreanBapsangBibimbap:{title:'Korean Bapsang · Bibimbap',url:'https://www.koreanbapsang.com/bibimbap/',note:'채소 고명, 밥, 고추장 양념을 분리해 구성하는 비빔밥 구조'},
    justOneCookbook:{title:'Just One Cookbook · Japanese recipes',url:'https://www.justonecookbook.com/',note:'일본 가정식 레시피와 단계별 사진 자료'},
    justOneCookbookOyakodon:{title:'Just One Cookbook · Oyakodon',url:'https://www.justonecookbook.com/10-minute-meal-oyakodon/',note:'다시·간장·미림 기반으로 닭고기와 달걀을 익히는 덮밥 구조'},
    japaneseCooking101:{title:'Japanese Cooking 101',url:'https://japanesecooking101.com/',note:'일본 가정식 영상·문서 레시피, 카라아게·우동·돈부리 등 참고'},
    seriousEatsOyakodon:{title:'Serious Eats · Oyakodon',url:'https://www.seriouseats.com/oyakodon-japanese-chicken-and-egg-rice-bowl-recipe',note:'다시, 간장, 사케/미림, 설탕의 단짠 조합 설명'},
    woksMapo:{title:'The Woks of Life · Mapo Tofu',url:'https://thewoksoflife.com/ma-po-tofu-real-deal/',note:'두반장, 산초, 다진 고기, 연두부의 사천식 마파두부 구조'},
    redHouseMapo:{title:'Red House Spice · Authentic Mapo Tofu',url:'https://redhousespice.com/mapo-tofu-authentic-way/',note:'중국 가정식 관점의 정통 마파두부 흐름'},
    chinaSichuanFood:{title:'China Sichuan Food · Mapo Tofu',url:'https://www.chinasichuanfood.com/mapo-tofu-recipe/',note:'두반장과 사천 후추를 중심으로 한 마라 풍미'},
    redHouseSpice:{title:'Red House Spice · Chinese Recipe Central',url:'https://redhousespice.com/',note:'중국 가정식, 만두, 사천요리, 초보자용 중식 레시피 참고'},
    silverSpoon:{title:'The Silver Spoon · Phaidon',url:'https://www.phaidon.com/en-us/products/the-silver-spoon-classic',note:'이탈리아 Il Cucchiaio d\'Argento 계열의 전통 가정식 기준'},
    cucchiaio:{title:'Il Cucchiaio d\'Argento · Ricette',url:'https://www.cucchiaio.it/',note:'이탈리아 현지 레시피 매체. 전통·가정식·셰프 레시피 참고'},
    gialloCarbonara:{title:'GialloZafferano · Spaghetti alla Carbonara',url:'https://www.giallozafferano.com/recipes/Spaghetti-Carbonara-Bacon-and-egg-spaghetti.html',note:'구안찰레, 페코리노 로마노, 달걀, 후추 중심의 로마식 카르보나라'},
    hotThaiPadThai:{title:'Hot Thai Kitchen · Authentic Pad Thai',url:'https://hot-thai-kitchen.com/best-pad-thai/',note:'타마린드·피시소스·팜슈가를 축으로 하는 태국식 팟타이'},
    helenPho:{title:'Helen\'s Recipes · Phở bò',url:'https://helenrecipes.com/recipe-39-pho/',note:'맑고 향신료 중심인 베트남식 쌀국수 육수'},
    rickBayless:{title:'Rick Bayless · Mexican recipes',url:'https://www.rickbayless.com/',note:'멕시코 지역요리 기반의 타코·엔칠라다·살사 참고'},
    swasthiButterChicken:{title:'Swasthi\'s Recipes · Butter Chicken',url:'https://www.indianhealthyrecipes.com/butter-chicken/',note:'탄두리식 양념 치킨을 토마토·버터·크림 소스에 넣는 치킨 마카니 구조'}
  };

  function hasAny(text, words) {
    const t = String(text || '').replace(/\s+/g, '');
    return words.some(w => t.includes(String(w).replace(/\s+/g, '')));
  }

  function sourceRecipeFamily(menu) {
    const n = menu?.name || '';
    const type = menu?.type || '';
    if (hasAny(n, ['미역국'])) return 'koreanSeaweedSoup';
    if (hasAny(n, ['김치찌개','부대찌개'])) return 'koreanKimchiStew';
    if (hasAny(n, ['된장찌개','청국장'])) return 'koreanDoenjangStew';
    if (hasAny(n, ['비빔밥','돌솥비빔밥','전주비빔밥','꼬막비빔밥','보리비빔밥'])) return 'koreanBibimbap';
    if (hasAny(n, ['제육','돼지불고기','두루치기','오징어볶음','낙지볶음','쭈꾸미'])) return 'koreanSpicyStirFry';
    if (hasAny(n, ['불고기','잡채','김치볶음밥','계란말이'])) return 'koreanHomePan';
    if (hasAny(n, ['떡볶이'])) return 'koreanTteokbokki';
    if (hasAny(n, ['파전','해물파전'])) return 'koreanPancake';
    if (hasAny(n, ['갈비탕','설렁탕','순대국','국밥','닭곰탕','육개장','감자탕','칼국수','잔치국수','수제비','떡국','어묵탕','전골','곱창전골','콩나물국밥'])) return 'koreanSoupTang';
    if (type === '한식') return 'koreanGeneral';

    if (hasAny(n, ['오야코동','규동','가츠동','텐동','야키토리덮밥','사케동','우니동','치라시'])) return 'japaneseDonburi';
    if (hasAny(n, ['라멘','츠케멘'])) return 'japaneseRamen';
    if (hasAny(n, ['우동','소바','규니쿠우동'])) return 'japaneseNoodles';
    if (hasAny(n, ['돈까스','돈카츠','규카츠','카츠카레','카레라이스'])) return 'japaneseKatsuCurry';
    if (hasAny(n, ['새우튀김','텐동','덴푸라'])) return 'japaneseTempura';
    if (hasAny(n, ['초밥','마키','사시미','이나리즈시','치라시스시'])) return 'japaneseSushi';
    if (hasAny(n, ['오코노미야키','타코야키','야키소바'])) return 'japaneseTeppan';
    if (hasAny(n, ['나베','스키야키','샤브샤브'])) return 'japaneseHotpot';
    if (type === '일식') return 'japaneseGeneral';

    if (hasAny(n, ['마파두부'])) return 'chineseMapoTofu';
    if (hasAny(n, ['만두','딤섬','군만두','샤오롱바오'])) return 'chineseDumpling';
    if (hasAny(n, ['마라탕','마라샹궈','훠궈','마라롱샤'])) return 'chineseMalaHotpot';
    if (hasAny(n, ['짜장면','짬뽕','탄탄면','우육면','울면'])) return 'chineseNoodles';
    if (hasAny(n, ['볶음밥','양저우'])) return 'chineseFriedRice';
    if (hasAny(n, ['탕수육','꿔바로우','유린기','라조기','고추잡채','멘보샤','북경오리','양꼬치','산라탕'])) return 'chineseRestaurant';
    if (type === '중식') return 'chineseGeneral';

    if (hasAny(n, ['까르보나라'])) return 'italianCarbonara';
    if (hasAny(n, ['알리오','봉골레'])) return 'italianOilPasta';
    if (hasAny(n, ['토마토파스타','볼로네제','라구','라자냐'])) return 'italianTomatoPasta';
    if (hasAny(n, ['페스토','크림파스타','바질크림'])) return 'italianCreamPesto';
    if (hasAny(n, ['리조또','뇨키'])) return 'italianRisottoGnocchi';
    if (hasAny(n, ['피자','마르게리타','페퍼로니'])) return 'italianPizza';
    if (hasAny(n, ['스테이크','로스트치킨','바베큐립','랍스터','감바스'])) return 'westernProtein';
    if (hasAny(n, ['샐러드','시저','그릭','콥','포케볼','아보카도'])) return 'westernSalad';
    if (hasAny(n, ['버거','샌드위치','베이글','브리또','퀘사디야','핫도그','랩'])) return 'westernSandwich';
    if (hasAny(n, ['수프','클램차우더','프렌치어니언'])) return 'westernSoup';
    if (hasAny(n, ['팬케이크','프렌치토스트','오트밀','그래놀라','스크램블','오믈렛','에그베네딕트','키쉬'])) return 'westernBreakfast';

    if (hasAny(n, ['팟타이'])) return 'thaiPadThai';
    if (hasAny(n, ['똠얌','그린커리','락사'])) return 'thaiSoupCurry';
    if (hasAny(n, ['쌀국수','분짜','분보','반미','월남쌈'])) return 'vietnamese';
    if (hasAny(n, ['버터치킨','티카','난세트','커리'])) return 'indianCurry';
    if (hasAny(n, ['타코','엔칠라다','과카몰리','케사디야','부리또'])) return 'mexican';
    if (hasAny(n, ['케밥','팔라펠','후무스','샥슈카','파투쉬'])) return 'middleEastern';
    if (hasAny(n, ['나시고렝','미고렝'])) return 'indonesian';
    if (type === '세계음식') return 'worldGeneral';
    return 'basicTrusted';
  }

  const SOURCE_KEYS_BY_FAMILY = {
    koreanSeaweedSoup:['maangchiMiyeokguk','koreanBapsangMiyeokguk'],
    koreanKimchiStew:['maangchiKimchiJjigae'],
    koreanDoenjangStew:['koreanBapsangDoenjang'],
    koreanBibimbap:['koreanBapsangBibimbap'],
    koreanSpicyStirFry:['maangchiKimchiJjigae'],
    koreanHomePan:['koreanBapsangBibimbap'],
    koreanTteokbokki:['maangchiKimchiJjigae'],
    koreanPancake:['koreanBapsangBibimbap'],
    koreanSoupTang:['maangchiMiyeokguk','koreanBapsangDoenjang'],
    koreanGeneral:['koreanBapsangBibimbap'],
    japaneseDonburi:['justOneCookbookOyakodon','seriousEatsOyakodon','justOneCookbook'],
    japaneseRamen:['justOneCookbook','japaneseCooking101'],
    japaneseNoodles:['justOneCookbook','japaneseCooking101'],
    japaneseKatsuCurry:['justOneCookbook','japaneseCooking101'],
    japaneseTempura:['justOneCookbook','japaneseCooking101'],
    japaneseSushi:['justOneCookbook','japaneseCooking101'],
    japaneseTeppan:['justOneCookbook','japaneseCooking101'],
    japaneseHotpot:['justOneCookbook','japaneseCooking101'],
    japaneseGeneral:['justOneCookbook','japaneseCooking101'],
    chineseMapoTofu:['woksMapo','redHouseMapo','chinaSichuanFood'],
    chineseDumpling:['redHouseSpice'],
    chineseMalaHotpot:['redHouseSpice','chinaSichuanFood'],
    chineseNoodles:['redHouseSpice','chinaSichuanFood'],
    chineseFriedRice:['redHouseSpice'],
    chineseRestaurant:['redHouseSpice'],
    chineseGeneral:['redHouseSpice'],
    italianCarbonara:['silverSpoon','cucchiaio','gialloCarbonara'],
    italianOilPasta:['silverSpoon','cucchiaio'],
    italianTomatoPasta:['silverSpoon','cucchiaio'],
    italianCreamPesto:['silverSpoon','cucchiaio'],
    italianRisottoGnocchi:['silverSpoon','cucchiaio'],
    italianPizza:['silverSpoon','cucchiaio'],
    westernProtein:['silverSpoon','cucchiaio'],
    westernSalad:['silverSpoon','cucchiaio'],
    westernSandwich:['silverSpoon'],
    westernSoup:['silverSpoon','cucchiaio'],
    westernBreakfast:['silverSpoon'],
    thaiPadThai:['hotThaiPadThai'],
    thaiSoupCurry:['hotThaiPadThai'],
    vietnamese:['helenPho'],
    indianCurry:['swasthiButterChicken'],
    mexican:['rickBayless'],
    middleEastern:['rickBayless'],
    indonesian:['hotThaiPadThai'],
    worldGeneral:['hotThaiPadThai','helenPho','rickBayless'],
    basicTrusted:['foodSafetyKorea']
  };

  function recipeSourcesV2(menu) {
    const family = sourceRecipeFamily(menu);
    const keys = [...(SOURCE_KEYS_BY_FAMILY[family] || []), 'foodSafetyKorea'];
    const seen = new Set();
    return keys.map(k => SOURCE_RECIPE_CATALOG[k]).filter(src => {
      if (!src || seen.has(src.url)) return false;
      seen.add(src.url);
      return true;
    });
  }

  function dishVariant(menu) {
    const n = menu?.name || '';
    const candidates = ['소고기','성게','전복','바지락','홍합','들깨','참치','돼지고기','해물','두부','버섯','차돌','닭고기','새우','연어','치킨','야채','버터','그린','토마토','크림','페스토'];
    return candidates.find(v => n.includes(v)) || '';
  }

  function baseRecipeMeta(menu, title, summary, obj) {
    return {
      title: title || `${menu.name} · 출처 기반 초보자 레시피`,
      cuisine: menu.type || '기타',
      authenticity:'출처 기반 재구성',
      summary,
      servings: obj.servings || '1~2인분',
      time: obj.time || (menu.cook ? `${menu.cook}분 안팎` : '20~30분'),
      difficulty: obj.difficulty || '초보 가능',
      heat: obj.heat || '중불 중심',
      equipment: obj.equipment || ['칼','도마','냄비 또는 팬','계량스푼'],
      ingredients: obj.ingredients || [],
      steps: obj.steps || [],
      checks: obj.checks || ['주재료가 속까지 익었다','간이 너무 짜거나 달지 않다','타거나 눌어붙은 냄새가 없다'],
      mistakes: obj.mistakes || ['양념은 절반만 먼저 넣고 맛을 본 뒤 추가하세요.','불이 너무 세면 먼저 불을 줄이고 물이나 육수를 조금 넣으세요.']
    };
  }

  function koreanRecipeV2(menu, family) {
    const n = menu.name;
    const v = dishVariant(menu);
    if (family === 'koreanSeaweedSoup') {
      const seafood = /성게|전복|바지락|홍합|해물|새우/.test(n);
      const perilla = /들깨/.test(n);
      const mainName = perilla ? '들깨가루' : seafood ? (v || '해산물') : '소고기 국거리';
      return baseRecipeMeta(menu, `${n} · 한식 출처 기반 레시피`, '미역을 충분히 불리고, 참기름에 미역과 주재료를 먼저 볶아 감칠맛을 만든 뒤 오래 끓이는 한식 미역국 방식입니다.', {
        servings:'2인분', time:'30~40분', heat:'중약불', equipment:['냄비','체 또는 볼','가위','국자','계량스푼'],
        ingredients:[['마른 미역','10g'],[mainName, perilla?'2큰술':'100~150g'],['참기름','1큰술'],['다진 마늘','1작은술'],['국간장','1.5큰술'],['물','800ml'],['소금 또는 액젓','마지막 간 맞춤']],
        steps:[
          {time:'10분', main:'마른 미역을 찬물에 불린 뒤 2~3번 헹구고 물기를 짭니다.', why:'불림과 헹굼이 부족하면 식감이 질기고 바다 냄새가 강하게 남습니다.'},
          {time:'2분', main: seafood ? `${mainName}은 흐르는 물에 가볍게 씻고 물기를 빼둡니다.` : `${mainName}은 핏물을 닦고 한입 크기로 준비합니다.`, why:'물기와 핏물을 줄이면 국물이 탁해지는 것을 막습니다.'},
          {time:'3분', main:'냄비에 참기름을 두르고 미역을 중약불에서 윤기 날 때까지 볶습니다.', why:'미역을 먼저 볶는 과정이 국물의 고소함과 깊이를 만듭니다.'},
          {time:'2분', main: seafood ? `${mainName}을 넣고 30초~1분만 짧게 볶습니다.` : `${mainName}을 넣고 겉면 색이 변할 때까지 볶습니다.`, why: seafood ? '해산물은 오래 볶으면 질겨져서 짧게 향만 입히는 편이 안전합니다.' : '고기를 볶으면 잡내가 줄고 국물에 감칠맛이 붙습니다.'},
          {time:'20분', main:'물을 붓고 끓어오르면 국간장을 넣은 뒤 중약불에서 충분히 끓입니다.', why:'미역국은 짧게 끓이면 맛이 따로 놀 수 있어 최소 15분 이상 끓이는 편이 안정적입니다.'},
          {time:'1분', main: perilla ? '들깨가루를 마지막에 풀고 소금으로 간을 맞춥니다.' : '다진 마늘을 넣고 1분 더 끓인 뒤 소금이나 액젓으로 간을 맞춥니다.', why:'마지막 간 맞춤을 해야 졸아들면서 짜지는 실패를 줄일 수 있습니다.'}
        ],
        checks:['미역이 부드럽고 질기지 않다','국물에서 참기름과 미역 향이 난다','짠맛보다 감칠맛이 먼저 느껴진다'],
        mistakes:['마른 미역을 많이 넣지 마세요. 10g도 불리면 꽤 늘어납니다.','국간장을 많이 넣으면 색이 탁하고 짜집니다.','해산물 변형은 오래 끓이면 질겨질 수 있습니다.']
      });
    }
    if (family === 'koreanKimchiStew') {
      return baseRecipeMeta(menu, `${n} · 묵은지 찌개 레시피`, '잘 익은 김치와 김치국물을 중심으로 감칠맛을 만들고, 고기 또는 두부를 더해 끓이는 한식 찌개 방식입니다.', {
        servings:'2인분', time:'25~35분', heat:'중불 → 중약불', equipment:['냄비','가위','국자','도마'],
        ingredients:[['잘 익은 김치','1.5컵'],['김치국물','4큰술'],['돼지고기 또는 참치','120g'],['두부','1/2모'],['양파','1/4개'],['대파','1/3대'],['고춧가루','1작은술'],['국간장','1작은술'],['물 또는 멸치육수','600ml']],
        steps:[
          {time:'2분', main:'김치와 두부, 양파, 대파를 미리 썰어둡니다.', why:'찌개는 끓기 시작하면 타이밍이 빨라서 재료를 먼저 준비해야 안정적입니다.'},
          {time:'4분', main:'냄비에 돼지고기를 먼저 볶고, 겉면이 익으면 김치를 넣어 함께 볶습니다.', why:'김치를 기름에 볶으면 신맛이 둥글어지고 국물 맛이 진해집니다.'},
          {time:'1분', main:'고춧가루와 국간장을 넣어 짧게 섞습니다.', why:'양념을 짧게 볶으면 날맛이 줄고 색이 살아납니다.'},
          {time:'15분', main:'물 또는 육수와 김치국물을 붓고 끓으면 중약불로 낮춰 끓입니다.', why:'센 불로 오래 끓이면 국물이 빨리 졸아 짜지므로 중약불이 안전합니다.'},
          {time:'5분', main:'두부와 양파를 넣고 더 끓인 뒤 마지막에 대파를 넣습니다.', why:'두부는 후반에 넣어야 부서지지 않고 모양이 유지됩니다.'}
        ], checks:['김치가 부드럽고 국물에 신맛이 자연스럽게 섞였다','두부가 과하게 부서지지 않았다','국물이 너무 짜지 않다'], mistakes:['덜 익은 김치만 쓰면 깊은 맛이 약합니다. 김치국물을 활용하세요.','두부를 처음부터 넣으면 쉽게 부서집니다.','고춧가루를 오래 볶으면 탄맛이 납니다.']
      });
    }
    if (family === 'koreanDoenjangStew') {
      return baseRecipeMeta(menu, `${n} · 된장 베이스 레시피`, '된장을 먼저 잘 풀고 단단한 채소부터 익힌 뒤 두부와 향채를 마지막에 넣는 한국 가정식 찌개 방식입니다.', {
        servings:'2인분', time:'20~25분', heat:'중불', equipment:['냄비','체 또는 숟가락','국자','칼'],
        ingredients:[['된장','1.5~2큰술'],['두부','1/2모'],['애호박','1/4개'],['양파','1/4개'],['감자 또는 버섯','조금'],['대파','1/3대'],['다진 마늘','1작은술'],['멸치육수 또는 물','600ml']],
        steps:[
          {time:'3분', main:'감자, 애호박, 양파, 두부를 비슷한 크기로 썹니다.', why:'크기가 비슷해야 익는 시간이 맞고 식감이 안정적입니다.'},
          {time:'5분', main:'육수에 감자처럼 단단한 재료를 먼저 넣어 끓입니다.', why:'단단한 재료를 먼저 익히면 두부가 부서지는 것을 막을 수 있습니다.'},
          {time:'1분', main:'된장을 체에 풀거나 숟가락으로 완전히 풀어 넣습니다.', why:'덩어리진 된장은 한 입만 짜지는 실패를 만듭니다.'},
          {time:'7분', main:'애호박, 양파, 버섯을 넣고 중불에서 끓입니다.', why:'채소 단맛이 국물에 배어 된장의 짠맛을 둥글게 합니다.'},
          {time:'3분', main:'두부, 마늘, 대파를 넣고 짧게 끓여 마무리합니다.', why:'두부와 대파는 마지막에 넣어야 모양과 향이 살아납니다.'}
        ], checks:['된장 덩어리가 없다','채소가 속까지 익었다','국물이 텁텁하지 않고 구수하다'], mistakes:['된장을 계속 추가하면 짜고 텁텁해집니다.','두부를 세게 저으면 부서집니다.']
      });
    }
    if (family === 'koreanBibimbap') {
      return baseRecipeMeta(menu, `${n} · 비빔밥 조립 레시피`, '밥 위에 각각 간한 고명과 고추장 양념을 올리는 방식입니다. 재료를 한 번에 볶지 않고 따로 준비하는 것이 핵심입니다.', {
        servings:'1인분', time:'20~30분', heat:'약불~중불', equipment:['프라이팬','그릇','젓가락','도마'],
        ingredients:[['밥','1공기'],['시금치/콩나물/당근/버섯 등 채소','2~4가지'],['계란','1개'],['고추장','1큰술'],['참기름','1큰술'],['간장','1작은술'],['깨','조금']],
        steps:[
          {time:'5분', main:'채소는 얇게 썰고 물기가 많은 재료는 키친타월로 닦습니다.', why:'물기가 많으면 밥이 질어지고 양념이 흐려집니다.'},
          {time:'8분', main:'채소를 종류별로 소금 아주 조금과 함께 따로 볶거나 데칩니다.', why:'재료별 익는 속도와 색이 달라서 따로 조리해야 맛이 선명합니다.'},
          {time:'3분', main:'계란 프라이를 만듭니다. 초보자는 완숙이 가장 안전합니다.', why:'반숙은 맛있지만 익힘 실패가 생기기 쉬워 처음엔 완숙이 안정적입니다.'},
          {time:'2분', main:'밥 위에 고명을 나눠 올리고 고추장, 참기름, 깨를 곁들입니다.', why:'보기 좋게 올리면 비비기도 쉽고 재료 균형을 확인할 수 있습니다.'},
          {time:'1분', main:'양념은 절반만 넣고 먼저 비빈 뒤 맛을 보고 추가합니다.', why:'비빔밥은 양념 과다가 가장 흔한 실패입니다.'}
        ], checks:['밥이 질지 않다','채소 식감이 남아 있다','고추장 맛만 강하지 않다'], mistakes:['고추장을 처음부터 많이 넣지 마세요.','채소 물기를 꼭 줄이세요.']
      });
    }
    if (family === 'koreanSpicyStirFry' || family === 'koreanHomePan') {
      const spicy = family === 'koreanSpicyStirFry';
      return baseRecipeMeta(menu, `${n} · 한식 팬 조리 레시피`, spicy ? '고추장·고춧가루 양념은 쉽게 타므로 고기를 먼저 익히고 양념을 후반에 넣는 방식입니다.' : '간장, 마늘, 설탕, 참기름을 중심으로 팬에서 수분을 날리며 조리하는 한식 볶음 방식입니다.', {
        servings:'1~2인분', time:'15~25분', heat:'중강불 → 중불', equipment:['프라이팬','주걱','볼','키친타월'],
        ingredients:[['주재료','200g'],['양파','1/2개'],['대파','1/2대'],[spicy?'고추장':'간장',spicy?'1큰술':'1.5큰술'],[spicy?'고춧가루':'설탕','1큰술'],['다진 마늘','1작은술'],['참기름','마지막 1작은술']],
        steps:[
          {time:'3분', main:'주재료의 물기를 닦고 양파, 대파를 썰어둡니다.', why:'물기가 많으면 볶음이 아니라 찜처럼 되어 맛이 흐려집니다.'},
          {time:'2분', main:'양념은 작은 볼에 미리 섞어둡니다.', why:'팬 위에서 바로 넣으면 한쪽만 짜거나 탈 수 있습니다.'},
          {time:'5분', main:'팬을 달군 뒤 주재료를 먼저 펼쳐 익힙니다.', why:'주재료를 먼저 익혀야 표면 맛과 식감이 살아납니다.'},
          {time:'4분', main:'양파를 넣고 숨이 죽으면 양념을 넣어 빠르게 섞습니다.', why:'양념은 후반에 넣어야 타는 위험이 줄어듭니다.'},
          {time:'1분', main:'대파와 참기름을 넣고 불을 끈 뒤 섞습니다.', why:'참기름과 대파 향은 마지막에 넣어야 남습니다.'}
        ], checks:['주재료 안쪽까지 익었다','팬 바닥 양념이 까맣게 타지 않았다','양념이 고르게 묻었다'], mistakes:['양념을 처음부터 넣지 마세요.','타기 시작하면 물 1~2큰술을 넣고 불을 낮추세요.']
      });
    }
    return baseRecipeMeta(menu, `${n} · 한식 기본 레시피`, '한국 가정식의 기본 원칙인 재료 손질, 육수 또는 양념 분리, 마지막 간 맞춤을 기준으로 구성했습니다.', {
      ingredients:[['주재료','1인분'],['마늘/대파','조금'],['간장 또는 소금','조금씩'],['참기름 또는 식용유','1작은술'],['물 또는 육수',menu.soup?'500ml':'필요 시 2큰술']],
      steps:[{time:'3분',main:'재료를 먹기 좋은 크기로 손질합니다.',why:'크기가 일정해야 익는 속도가 맞습니다.'},{time:'5분',main:menu.soup?'육수나 물을 먼저 끓이고 단단한 재료부터 넣습니다.':'팬을 중불로 예열하고 주재료부터 익힙니다.',why:'기본 재료의 익힘이 전체 맛을 좌우합니다.'},{time:'5~10분',main:'양념은 절반만 넣고 조리한 뒤 마지막에 간을 맞춥니다.',why:'처음부터 세게 간하면 되돌리기 어렵습니다.'}],
    });
  }

  function japaneseRecipeV2(menu, family) {
    const n = menu.name;
    if (family === 'japaneseDonburi') return baseRecipeMeta(menu, `${n} · 일본 돈부리 방식`, '다시, 간장, 미림, 설탕으로 만든 간단한 츠유에 재료를 짧게 조린 뒤 밥 위에 얹는 일본식 덮밥 구조입니다.', {
      servings:'1인분', time:'15~20분', heat:'중약불', equipment:['작은 팬','그릇','젓가락'],
      ingredients:[['밥','1공기'],['닭고기/소고기/돈카츠 등 주재료','120g'],['양파','1/4개'],['달걀','1~2개'],['다시 또는 물+혼다시','120ml'],['간장','1큰술'],['미림','1큰술'],['설탕','1작은술']],
      steps:[{time:'2분',main:'양파와 주재료를 얇게 썰고 달걀은 너무 곱게 풀지 않습니다.',why:'일본식 덮밥은 달걀 결이 살아야 식감이 좋습니다.'},{time:'3분',main:'팬에 다시, 간장, 미림, 설탕을 넣고 끓입니다.',why:'이 단짠 츠유가 돈부리 맛의 중심입니다.'},{time:'5분',main:'양파와 주재료를 넣고 중약불에서 익힙니다.',why:'센 불은 국물을 빠르게 졸여 짜게 만듭니다.'},{time:'1분',main:'달걀을 2번에 나누어 붓고 뚜껑을 덮어 부드럽게 익힙니다.',why:'두 번에 나누면 일부는 익고 일부는 촉촉하게 남습니다.'},{time:'1분',main:'밥 위에 국물과 함께 얹어 냅니다.',why:'돈부리는 밥에 츠유가 살짝 스며야 완성도가 올라갑니다.'}],
      checks:['달걀이 완전히 마르지 않았다','국물이 너무 짜지 않다','밥이 국물에 살짝 젖었다'], mistakes:['달걀을 오래 익히면 퍽퍽해집니다.','간장을 많이 넣으면 금방 짜집니다.']
    });
    if (family === 'japaneseRamen' || family === 'japaneseNoodles') return baseRecipeMeta(menu, `${n} · 일본식 면 레시피`, '다시 또는 육수, 간장/미소/소금 계열 타레, 삶은 면을 분리해 준비한 뒤 마지막에 조립하는 방식입니다.', {
      servings:'1인분', time:'20~40분', heat:'중불', equipment:['냄비 2개','체','그릇'],
      ingredients:[['면','1인분'],['육수 또는 다시','500ml'],['간장/미소/소금 타레','1~2큰술'],['대파','조금'],['계란 또는 고기 토핑','선택'],['김/시치미','선택']],
      steps:[{time:'5분',main:'국물과 면 삶을 물을 따로 끓입니다.',why:'면을 삶은 물은 전분이 많아 국물에 쓰면 탁해집니다.'},{time:'5분',main:'그릇에 타레를 먼저 넣고 뜨거운 육수를 부어 맛을 봅니다.',why:'타레와 육수 비율을 먼저 맞추면 짠맛 실패가 줄어듭니다.'},{time:'포장 시간',main:'면은 포장지 시간에 맞춰 삶고 바로 물기를 털어 그릇에 넣습니다.',why:'면은 몇 초 차이로 식감이 달라집니다.'},{time:'1분',main:'토핑을 올리고 바로 먹습니다.',why:'일본식 면은 면이 퍼지기 전에 먹는 것이 중요합니다.'}],
      checks:['면이 퍼지지 않았다','국물이 탁하지 않다','타레가 과하지 않다'], mistakes:['면 삶은 물을 국물로 쓰지 마세요.','면을 삶아두고 오래 방치하지 마세요.']
    });
    if (family === 'japaneseKatsuCurry' || family === 'japaneseTempura') return baseRecipeMeta(menu, `${n} · 일본 튀김/카츠 방식`, '주재료의 물기를 제거하고 밀가루-달걀-빵가루 또는 튀김옷을 얇게 입힌 뒤 온도를 유지해 튀기는 방식입니다.', {
      servings:'1인분', time:'25~35분', heat:'170~180℃', equipment:['깊은 팬','집게','키친타월','온도계 있으면 좋음'],
      ingredients:[['주재료','150~200g'],['소금/후추','조금'],['밀가루','적당량'],['달걀','1개'],['빵가루 또는 튀김가루','적당량'],['식용유','넉넉히']],
      steps:[{time:'2분',main:'주재료의 물기를 완전히 닦고 소금, 후추를 살짝 뿌립니다.',why:'물기가 남으면 튀김옷이 떨어지고 기름이 튑니다.'},{time:'5분',main:'밀가루, 달걀, 빵가루 순서로 얇고 고르게 입힙니다.',why:'두껍게 입히면 겉은 타고 속은 덜 익을 수 있습니다.'},{time:'5~8분',main:'170~180℃ 기름에서 색이 노릇해질 때까지 튀깁니다.',why:'온도가 낮으면 기름을 먹고, 높으면 겉만 탑니다.'},{time:'3분',main:'키친타월 위에서 쉬게 한 뒤 자릅니다.',why:'바로 자르면 육즙이 빠지고 튀김옷이 눅눅해질 수 있습니다.'}],
      checks:['겉이 노릇하고 속이 익었다','기름 냄새가 무겁지 않다','튀김옷이 쉽게 벗겨지지 않는다'], mistakes:['젖은 재료를 그대로 튀기지 마세요.','기름에 한 번에 많이 넣으면 온도가 떨어집니다.']
    });
    return baseRecipeMeta(menu, `${n} · 일본 가정식 기본`, '일본 가정식의 핵심인 다시, 간장, 미림, 설탕의 균형을 기준으로 초보자용으로 구성했습니다.', {
      ingredients:[['주재료','1인분'],['다시 또는 물','150~300ml'],['간장','1큰술'],['미림','1큰술'],['설탕','1작은술'],['대파 또는 생강','선택']],
      steps:[{time:'3분',main:'주재료를 균일하게 손질합니다.',why:'일본식 조림은 크기가 균일해야 간이 고르게 배입니다.'},{time:'5분',main:'다시, 간장, 미림, 설탕을 먼저 끓여 기본 국물 또는 소스를 만듭니다.',why:'소스를 먼저 맞춰야 재료가 짜지지 않습니다.'},{time:'10분',main:'주재료를 넣고 중약불에서 익힙니다.',why:'강한 불보다 중약불이 간을 부드럽게 배게 합니다.'}]
    });
  }

  function chineseRecipeV2(menu, family) {
    const n = menu.name;
    if (family === 'chineseMapoTofu') return baseRecipeMeta(menu, `${n} · 사천식 마파두부 기준`, '두반장과 사천 후추의 마라 향을 중심으로 두부를 부드럽게 끓이고 전분물로 농도를 잡는 방식입니다.', {
      servings:'2인분', time:'20분', heat:'중불', equipment:['웍 또는 깊은 팬','주걱','작은 볼'],
      ingredients:[['부드러운 두부','300g'],['다진 돼지고기 또는 소고기','80g'],['두반장','1큰술'],['다진 마늘/생강','각 1작은술'],['간장','1작은술'],['물 또는 육수','180ml'],['전분물','전분 1작은술+물 2큰술'],['사천 후추','마지막에 조금']],
      steps:[{time:'2분',main:'두부를 2cm 큐브로 자르고 뜨거운 물에 잠깐 담가둡니다.',why:'두부가 덜 부서지고 콩 냄새가 줄어듭니다.'},{time:'3분',main:'팬에 기름을 두르고 다진 고기를 볶아 수분을 날립니다.',why:'고기 수분을 날려야 소스가 묽어지지 않습니다.'},{time:'2분',main:'두반장, 마늘, 생강을 넣고 붉은 기름이 날 때까지 볶습니다.',why:'두반장은 볶아야 향과 색이 살아납니다.'},{time:'5분',main:'육수와 두부를 넣고 주걱으로 세게 젓지 말고 팬을 흔들어 끓입니다.',why:'두부가 쉽게 부서지기 때문입니다.'},{time:'1분',main:'전분물을 조금씩 넣어 농도를 맞추고 마지막에 사천 후추를 뿌립니다.',why:'전분은 한 번에 넣으면 덩어리가 생깁니다.'}],
      checks:['두부가 과하게 부서지지 않았다','소스가 밥에 비빌 정도로 걸쭉하다','마라 향이 있지만 탄맛은 없다'], mistakes:['두반장을 센 불에 오래 볶으면 탑니다.','전분물을 한 번에 붓지 마세요.']
    });
    if (family === 'chineseDumpling') return baseRecipeMeta(menu, `${n} · 중국식 만두/딤섬 기본`, '다진 고기와 채소의 수분을 조절하고 만두피 안에 공기를 빼며 감싼 뒤 찌거나 굽는 방식입니다.', {
      servings:'2인분', time:'35~50분', heat:'중불', equipment:['볼','찜기 또는 팬','숟가락'],
      ingredients:[['만두피','20장'],['다진 돼지고기 또는 새우','200g'],['부추/배추','1컵'],['간장','1큰술'],['참기름','1작은술'],['생강','조금'],['전분','1작은술']],
      steps:[{time:'5분',main:'채소는 잘게 썰고 소금을 아주 조금 뿌린 뒤 물기를 짭니다.',why:'속에 물이 많으면 만두피가 터집니다.'},{time:'5분',main:'고기, 채소, 간장, 생강, 참기름을 한 방향으로 치대듯 섞습니다.',why:'한 방향으로 섞으면 속이 더 잘 뭉칩니다.'},{time:'10분',main:'만두피에 속을 적당히 넣고 공기를 빼며 가장자리를 붙입니다.',why:'공기가 많으면 익으면서 터지기 쉽습니다.'},{time:'8~10분',main:'찜기에서 찌거나 팬에 굽고 물을 부어 뚜껑을 덮어 익힙니다.',why:'초보자는 찜 방식이 가장 실패가 적습니다.'}],
      checks:['피가 터지지 않았다','속 고기가 완전히 익었다','채소 물이 흘러나오지 않는다'], mistakes:['속을 너무 많이 넣지 마세요.','채소 물기를 꼭 짜세요.']
    });
    if (family === 'chineseMalaHotpot') return baseRecipeMeta(menu, `${n} · 마라/훠궈식 조리 기준`, '마라 베이스는 향신료와 두반장/마라소스를 기름에 풀어 향을 내고, 재료는 익는 순서대로 넣는 방식입니다.', {
      servings:'1~2인분', time:'20~30분', heat:'중불', equipment:['냄비','체','국자'],
      ingredients:[['마라소스 또는 훠궈 베이스','1~2큰술'],['물 또는 육수','700ml'],['채소','2컵'],['두부/버섯','적당량'],['고기 또는 해산물','100g'],['면 또는 당면','선택']],
      steps:[{time:'2분',main:'재료를 씻고 고기, 채소, 두부, 면을 따로 둡니다.',why:'익는 시간이 달라 한 번에 넣으면 일부는 과하게 익습니다.'},{time:'3분',main:'냄비에 기름을 조금 두르고 마라 베이스를 약불에서 풀어 향을 냅니다.',why:'향신료는 기름에서 향이 잘 살아납니다.'},{time:'10분',main:'육수를 붓고 단단한 채소와 버섯부터 넣습니다.',why:'단단한 재료가 먼저 익어야 전체 식감이 맞습니다.'},{time:'3~5분',main:'고기, 두부, 면을 순서대로 넣고 익힙니다.',why:'고기와 면은 오래 끓이면 질겨지거나 불 수 있습니다.'}],
      checks:['재료가 과하게 물러지지 않았다','국물이 너무 짜지 않다','마라 향이 기름에 잘 풀렸다'], mistakes:['마라소스를 처음부터 많이 넣지 마세요.','면은 마지막에 넣으세요.']
    });
    return baseRecipeMeta(menu, `${n} · 중식 기본 조리법`, '중식은 강한 화력과 빠른 조리가 중요하지만, 가정에서는 재료를 미리 준비하고 소스를 따로 만들어 실패를 줄이는 방식이 안전합니다.', {
      servings:'1~2인분', time:'20~30분', heat:'중강불', equipment:['웍 또는 프라이팬','주걱','볼'],
      ingredients:[['주재료','200g'],['마늘/생강/대파','조금'],['간장','1큰술'],['소흥주 또는 맛술','1큰술'],['전분','1작은술'],['식용유','1~2큰술']],
      steps:[{time:'5분',main:'주재료를 작게 썰고 소스 재료를 미리 섞습니다.',why:'중식은 조리 속도가 빨라 중간에 양념을 찾으면 타기 쉽습니다.'},{time:'3분',main:'팬을 충분히 달군 뒤 향채를 먼저 볶습니다.',why:'마늘, 생강, 대파가 기름에 향을 입힙니다.'},{time:'5분',main:'주재료를 넣고 빠르게 볶습니다.',why:'수분을 날려야 중식 특유의 볶음 맛이 납니다.'},{time:'2분',main:'소스를 넣고 빠르게 섞어 마무리합니다.',why:'소스를 오래 끓이면 짜지고 윤기가 줄어듭니다.'}],
      checks:['재료가 물러지지 않았다','소스가 재료에 코팅됐다','팬 바닥이 타지 않았다'], mistakes:['소스를 팬에서 즉석으로 만들지 말고 미리 섞으세요.','재료를 너무 많이 넣으면 팬 온도가 떨어집니다.']
    });
  }

  function italianWesternRecipeV2(menu, family) {
    const n = menu.name;
    if (family === 'italianCarbonara') return baseRecipeMeta(menu, `${n} · 이탈리아식 카르보나라 기준`, '크림이 아니라 구안찰레 또는 판체타의 지방, 페코리노, 달걀, 후추, 면수로 소스를 만드는 로마식 기준입니다.', {
      servings:'1인분', time:'20분', heat:'약불/잔열', equipment:['냄비','팬','볼','집게'],
      ingredients:[['스파게티','100g'],['구안찰레 또는 판체타','50g'],['달걀노른자','1~2개'],['페코리노 로마노','25g'],['후추','넉넉히'],['소금','면 삶는 물용']],
      steps:[{time:'1분',main:'달걀노른자, 치즈, 후추를 볼에 섞어 페이스트처럼 만듭니다.',why:'소스를 미리 만들어야 팬에서 달걀이 익어버리는 실패를 줄입니다.'},{time:'8~10분',main:'면을 삶고 면수 한 컵을 따로 둡니다.',why:'면수는 치즈와 달걀을 부드럽게 연결하는 역할입니다.'},{time:'5분',main:'팬에서 구안찰레 또는 판체타를 천천히 익혀 지방을 냅니다.',why:'고기 지방이 카르보나라 소스의 핵심입니다.'},{time:'1분',main:'불을 끄고 면을 팬에 넣어 지방과 섞습니다.',why:'달걀 소스는 직접 불에서 익히면 스크램블처럼 됩니다.'},{time:'1분',main:'달걀 치즈 소스를 넣고 면수로 농도를 조절하며 빠르게 섞습니다.',why:'잔열과 면수로 크리미한 질감을 만듭니다.'}],
      checks:['달걀이 덩어리로 익지 않았다','소스가 면에 매끈하게 붙었다','후추 향이 살아 있다'], mistakes:['생크림을 넣으면 전통 카르보나라와 달라집니다.','불 위에서 달걀 소스를 넣지 마세요.']
    });
    if (family === 'italianOilPasta' || family === 'italianTomatoPasta' || family === 'italianCreamPesto') return baseRecipeMeta(menu, `${n} · 이탈리아 파스타 기본`, '파스타는 면 삶는 물의 간, 면수 보관, 소스와 면을 팬에서 합치는 만테카레가 핵심입니다.', {
      servings:'1인분', time:'15~25분', heat:'약불~중불', equipment:['큰 냄비','프라이팬','집게'],
      ingredients:[['파스타면','100g'],['소금','물 1L당 약 10g'],['올리브유','2큰술'],['마늘','2~4쪽'],['소스 재료','토마토/오일/페스토 중 메뉴에 맞게'],['면수','1컵 남기기']],
      steps:[{time:'1분',main:'물을 넉넉히 끓이고 소금을 넣습니다.',why:'면 자체에 간이 들어가야 소스와 따로 놀지 않습니다.'},{time:'7~10분',main:'면은 포장 시간보다 1분 짧게 삶고 면수를 남깁니다.',why:'팬에서 한 번 더 익히며 소스와 합쳐야 식감이 맞습니다.'},{time:'3분',main:'팬에서 마늘이나 소스 베이스를 약불로 준비합니다.',why:'마늘과 올리브유는 센 불에서 쉽게 타서 쓴맛이 납니다.'},{time:'2분',main:'면을 팬에 옮기고 면수를 조금씩 넣으며 섞습니다.',why:'면수의 전분이 소스를 면에 붙게 합니다.'},{time:'1분',main:'불을 끄고 치즈나 허브를 넣어 마무리합니다.',why:'마지막 향 재료는 오래 가열하지 않아야 향이 남습니다.'}],
      checks:['면이 퍼지지 않았다','소스가 면에 붙었다','마늘이 타지 않았다'], mistakes:['면수를 전부 버리지 마세요.','소스를 너무 많이 넣으면 면 맛이 사라집니다.']
    });
    if (family === 'italianPizza') return baseRecipeMeta(menu, `${n} · 이탈리아식 피자 기준`, '얇은 도우, 과하지 않은 토마토, 모차렐라, 높은 온도의 짧은 굽기를 기준으로 한 피자 방식입니다.', {
      servings:'1판', time:'30~60분', heat:'오븐 최고온도', equipment:['오븐','팬 또는 피자스톤','볼'], ingredients:[['피자 도우','1장'],['토마토소스','3~4큰술'],['모차렐라','100g'],['올리브유','조금'],['바질 또는 토핑','선택']],
      steps:[{time:'10분',main:'오븐을 가능한 높은 온도로 충분히 예열합니다.',why:'피자는 낮은 온도에서 오래 구우면 도우가 마르고 질겨집니다.'},{time:'2분',main:'도우에 소스를 얇게 펴 바릅니다.',why:'소스가 많으면 도우가 눅눅해집니다.'},{time:'2분',main:'치즈와 토핑을 과하지 않게 올립니다.',why:'토핑이 많으면 수분이 많아져 바삭함이 줄어듭니다.'},{time:'8~12분',main:'가장 높은 온도에서 가장자리 색이 날 때까지 굽습니다.',why:'짧고 강한 굽기가 도우 식감을 살립니다.'}],
      checks:['도우 가장자리가 노릇하다','가운데가 축축하지 않다','치즈가 녹고 살짝 색이 났다'], mistakes:['소스와 토핑을 많이 올리지 마세요.','예열을 충분히 하세요.']
    });
    return baseRecipeMeta(menu, `${n} · 서양식 기본 레시피`, '신뢰 가능한 이탈리아/서양 조리 원칙에 맞춰 소금 간, 수분 조절, 불 조절을 중심으로 구성했습니다.', {
      ingredients:[['주재료','1인분'],['소금/후추','조금'],['올리브유 또는 버터','1큰술'],['향신채/허브','선택'],['소스 또는 육수','필요 시']],
      steps:[{time:'3분',main:'주재료의 물기를 닦고 소금, 후추로 밑간합니다.',why:'수분이 많으면 굽기보다 찌는 상태가 됩니다.'},{time:'5~10분',main:'팬이나 오븐을 충분히 예열하고 주재료를 익힙니다.',why:'예열이 부족하면 겉면 맛이 약해집니다.'},{time:'2분',main:'불을 줄이고 소스나 버터를 넣어 마무리합니다.',why:'마지막 지방과 소스가 풍미를 연결합니다.'}]
    });
  }

  function worldRecipeV2(menu, family) {
    const n = menu.name;
    if (family === 'thaiPadThai') return baseRecipeMeta(menu, `${n} · 태국식 팟타이 기준`, '타마린드의 신맛, 피시소스의 짠맛, 팜슈가의 단맛을 균형 있게 맞추고 센 불에서 빠르게 볶는 방식입니다.', {
      servings:'1인분', time:'20~25분', heat:'중강불', equipment:['웍 또는 큰 팬','볼','집게'],
      ingredients:[['쌀국수 면','80~100g'],['새우 또는 닭고기','100g'],['달걀','1개'],['숙주','한 줌'],['부추 또는 쪽파','조금'],['타마린드 소스','1.5큰술'],['피시소스','1큰술'],['팜슈가 또는 설탕','1큰술'],['땅콩/라임','선택']],
      steps:[{time:'10분',main:'쌀국수 면을 미지근한 물에 불려 휘어질 정도로 만듭니다.',why:'삶아버리면 볶을 때 쉽게 끊어지고 퍼집니다.'},{time:'2분',main:'타마린드, 피시소스, 설탕을 섞어 소스를 만듭니다.',why:'팟타이는 신맛·짠맛·단맛 균형이 핵심입니다.'},{time:'3분',main:'팬에 기름을 두르고 단백질을 먼저 익힌 뒤 한쪽으로 밀고 달걀을 익힙니다.',why:'재료별 익는 속도가 달라 순서가 중요합니다.'},{time:'3분',main:'면과 소스를 넣고 빠르게 볶습니다. 뻑뻑하면 물을 조금 넣습니다.',why:'소스가 면에 흡수되면서 식감이 잡힙니다.'},{time:'1분',main:'숙주와 부추를 마지막에 넣고 짧게 섞습니다.',why:'숙주는 숨만 죽어야 아삭함이 남습니다.'}],
      checks:['면이 퍼지지 않았다','신맛·단맛·짠맛이 균형 있다','숙주가 아삭하다'], mistakes:['쌀국수 면을 끓는 물에 오래 삶지 마세요.','소스를 한 번에 다 넣기보다 맛을 보며 조절하세요.']
    });
    if (family === 'vietnamese') return baseRecipeMeta(menu, `${n} · 베트남식 기준`, '쌀국수 계열은 맑고 향신료가 살아 있는 육수, 반미·분짜 계열은 신선한 허브와 산미 있는 소스가 핵심입니다.', {
      servings:'1~2인분', time: hasAny(n,['쌀국수'])?'2시간 이상 또는 간편 육수 30분':'25~40분', heat:'중불', equipment:['냄비','체','그릇'],
      ingredients: hasAny(n,['쌀국수']) ? [['쌀국수 면','1인분'],['소고기 육수 또는 사골/양지 육수','600ml'],['양파/생강','구워서 사용'],['팔각/계피','조금'],['피시소스','간 맞춤'],['숙주/고수/라임','곁들임']] : [['주재료','1인분'],['피시소스','1큰술'],['라임 또는 식초','1큰술'],['설탕','1작은술'],['허브/채소','넉넉히'],['쌀면 또는 바게트','메뉴에 맞게']],
      steps:[{time:'5분',main:'양파, 생강 또는 허브 재료를 준비합니다.',why:'베트남 음식은 향채와 산미가 맛의 중심입니다.'},{time:'15분+',main: hasAny(n,['쌀국수'])?'육수에 향신료를 넣고 충분히 우립니다.':'고기나 주재료를 양념해 굽거나 볶습니다.',why: hasAny(n,['쌀국수'])?'맑은 향신료 육수가 쌀국수 맛을 결정합니다.':'주재료의 간과 허브의 신선함이 균형을 만듭니다.'},{time:'3분',main:'쌀면은 따로 삶거나 불려 준비합니다.',why:'면을 국물에 오래 넣어두면 쉽게 퍼집니다.'},{time:'2분',main:'그릇에 면과 재료를 담고 육수나 소스를 더합니다.',why:'마지막 조립이 식감과 향을 살립니다.'}],
      checks:['허브 향이 살아 있다','소스가 너무 달거나 짜지 않다','쌀면이 퍼지지 않았다'], mistakes:['면을 국물에서 오래 끓이지 마세요.','피시소스는 조금씩 넣으세요.']
    });
    if (family === 'indianCurry') return baseRecipeMeta(menu, `${n} · 인도식 커리 기준`, '요거트와 향신료로 단백질을 재우고, 토마토·버터·크림 또는 캐슈로 부드러운 소스를 만드는 북인도식 커리 흐름입니다.', {
      servings:'2인분', time:'35~50분', heat:'중불', equipment:['팬','볼','블렌더 있으면 좋음'],
      ingredients:[['닭고기 또는 주재료','250g'],['요거트','3큰술'],['가람마살라/커리파우더','1큰술'],['토마토소스','200ml'],['버터','1큰술'],['크림 또는 우유','50ml'],['마늘/생강','각 1작은술']],
      steps:[{time:'10분+',main:'주재료를 요거트와 향신료에 재웁니다.',why:'요거트가 고기를 부드럽게 하고 향신료가 속까지 배게 합니다.'},{time:'5분',main:'팬에 버터를 녹이고 마늘, 생강을 볶습니다.',why:'향신료와 향채는 기름에서 향이 잘 살아납니다.'},{time:'10분',main:'토마토소스를 넣고 신맛이 부드러워질 때까지 끓입니다.',why:'토마토를 충분히 끓여야 날카로운 산미가 줄어듭니다.'},{time:'10분',main:'고기를 넣고 익힌 뒤 크림을 넣어 농도를 맞춥니다.',why:'크림은 오래 끓이면 분리될 수 있어 후반에 넣습니다.'}],
      checks:['소스가 부드럽고 분리되지 않았다','고기가 속까지 익었다','향신료 맛이 날것처럼 튀지 않는다'], mistakes:['크림을 센 불에서 오래 끓이지 마세요.','향신료를 너무 많이 넣으면 쓴맛이 날 수 있습니다.']
    });
    if (family === 'mexican') return baseRecipeMeta(menu, `${n} · 멕시코식 조립 기준`, '옥수수 또는 밀 토르티야, 단백질, 살사, 산미, 고수/양파를 조합해 균형을 맞추는 방식입니다.', {
      servings:'1~2인분', time:'20~30분', heat:'중불', equipment:['팬','볼','집게'],
      ingredients:[['토르티야','2~3장'],['고기/콩/치즈 등 속재료','150g'],['토마토/양파/고수','살사용'],['라임','1/2개'],['소금','조금'],['아보카도 또는 사워크림','선택']],
      steps:[{time:'5분',main:'살사 재료를 잘게 썰고 라임즙, 소금으로 간합니다.',why:'멕시코식 조립 메뉴는 산미가 느끼함을 잡아줍니다.'},{time:'8분',main:'속재료를 팬에서 익히고 물기가 많으면 조금 날립니다.',why:'물이 많으면 토르티야가 쉽게 찢어집니다.'},{time:'1분',main:'토르티야를 마른 팬에 앞뒤로 데웁니다.',why:'따뜻한 토르티야는 잘 접히고 향이 좋아집니다.'},{time:'2분',main:'속재료와 살사를 올리고 바로 접어 먹습니다.',why:'조립 후 오래 두면 토르티야가 눅눅해집니다.'}],
      checks:['토르티야가 따뜻하고 찢어지지 않는다','속재료 물기가 과하지 않다','라임 산미가 느끼함을 잡는다'], mistakes:['차가운 토르티야를 바로 접지 마세요.','살사 물기를 너무 많이 넣지 마세요.']
    });
    return baseRecipeMeta(menu, `${n} · 세계음식 출처 기반 기본`, '현지 레시피에서 공통적으로 강조되는 산미, 향신료, 허브, 소스 균형을 기준으로 초보자용으로 구성했습니다.', {
      ingredients:[['주재료','1인분'],['현지식 소스 또는 향신료','메뉴에 맞게'],['채소/허브','넉넉히'],['밥/면/빵','메뉴에 맞게'],['라임/식초 등 산미','조금']],
      steps:[{time:'5분',main:'소스와 향신료를 먼저 준비합니다.',why:'세계음식은 소스 균형이 맛의 중심인 경우가 많습니다.'},{time:'10분',main:'주재료를 익히고 수분을 조절합니다.',why:'물기가 많으면 소스와 재료가 따로 놀 수 있습니다.'},{time:'2분',main:'허브나 산미 재료는 마지막에 넣습니다.',why:'신선한 향은 오래 가열하면 사라집니다.'}]
    });
  }

  function sourceBackedRecipeFor(menu) {
    const family = sourceRecipeFamily(menu);
    if (family.startsWith('korean')) return koreanRecipeV2(menu, family);
    if (family.startsWith('japanese')) return japaneseRecipeV2(menu, family);
    if (family.startsWith('chinese')) return chineseRecipeV2(menu, family);
    if (family.startsWith('italian') || family.startsWith('western')) return italianWesternRecipeV2(menu, family);
    if (['thaiPadThai','thaiSoupCurry','vietnamese','indianCurry','mexican','middleEastern','indonesian','worldGeneral'].includes(family)) return worldRecipeV2(menu, family);
    return italianWesternRecipeV2(menu, family);
  }

  function renderSourceAuthenticity(menu) {
    const family = sourceRecipeFamily(menu);
    const sources = recipeSourcesV2(menu);
    return `
      <div class="source-authenticity-panel">
        <div class="source-authenticity-title">출처 검증 기준</div>
        <p class="source-authenticity-copy">
          이 레시피는 <strong>${escapeHtml(menu.type || '해당 cuisine')}</strong> 기준으로 분류한 뒤, 메뉴 계열 <strong>${escapeHtml(family)}</strong>에 맞는 출처를 연결했습니다.
          저작권 보호를 위해 원문을 통째로 복사하지 않고, 조리 원리·재료 구조·실패 포인트를 초보자용으로 재작성했습니다.
        </p>
        <div class="source-badge-row">
          ${sources.map(src => `<a class="source-badge" href="${safeExternalLink(src.url)}" target="_blank" rel="noopener noreferrer"><strong>${escapeHtml(src.title)}</strong><span>${escapeHtml(src.note)}</span></a>`).join('')}
        </div>
      </div>`;
  }

  function renderSourceBackedRecipe(menu) {
    const r = sourceBackedRecipeFor(menu);
    return `
      <div class="beginner-recipe-box source-backed-recipe">
        <div class="beginner-recipe-title">${escapeHtml(r.title)}</div>
        <p class="beginner-recipe-sub">${escapeHtml(r.summary)}</p>
        <div class="recipe-mini-grid">
          <div class="recipe-mini-card"><span>Cuisine</span><strong>${escapeHtml(r.cuisine)}</strong></div>
          <div class="recipe-mini-card"><span>Servings</span><strong>${escapeHtml(r.servings)}</strong></div>
          <div class="recipe-mini-card"><span>Time</span><strong>${escapeHtml(r.time)}</strong></div>
          <div class="recipe-mini-card"><span>Heat</span><strong>${escapeHtml(r.heat)}</strong></div>
        </div>
        <div class="recipe-beginner-alert">
          초보자 안전 기준: 생고기·해산물은 채소와 도마를 분리하고, 조리 중간에 맛을 볼 때는 새 숟가락을 사용하세요. 고기와 해산물은 속까지 익었는지 확인하세요.
        </div>
      </div>
      <div class="section"><h3>필요한 도구</h3><div class="pairing-list">${r.equipment.map(x => `<span class="pairing-item">${escapeHtml(x)}</span>`).join('')}</div></div>
      <div class="section"><h3>재료 · 1차 기준</h3><ul class="ingredient-list">${ingredientRows(r.ingredients)}</ul></div>
      <div class="section"><h3>초보자용 상세 조리 순서</h3>${renderDetailedSteps(r.steps)}</div>
      <div class="section"><h3>완성 확인 기준</h3><ul class="recipe-check-list">${r.checks.map(x => `<li>✓ ${escapeHtml(x)}</li>`).join('')}</ul></div>
      <div class="section"><h3>자주 망하는 포인트</h3><ul class="recipe-mistake-list">${r.mistakes.map(x => `<li>주의: ${escapeHtml(x)}</li>`).join('')}</ul></div>
    `;
  }

  function isNonEmptyArray(value) {
    return Array.isArray(value) && value.length > 0;
  }

  function normalizeIngredientRow(item) {
    if (Array.isArray(item)) return [item[0] ?? '', item[1] ?? ''];
    if (item && typeof item === 'object') return [item.name || item.item || item.ingredient || '', item.amount || item.qty || item.quantity || ''];
    return [String(item || ''), ''];
  }

  function renderRecipeFileIngredients(recipe) {
    const ingredients = isNonEmptyArray(recipe?.ingredients) ? recipe.ingredients : [];
    if (!ingredients.length) return `<p class="recipe-empty-note">recipes.json에 재료 데이터가 없습니다.</p>`;
    return `<ul class="ingredient-list">${ingredients.map(item => {
      const [name, qty] = normalizeIngredientRow(item);
      return `<li><span>${escapeHtml(name)}</span><span class="qty">${escapeHtml(qty)}</span></li>`;
    }).join('')}</ul>`;
  }

  function normalizeRecipeStep(step, index) {
    if (step && typeof step === 'object' && !Array.isArray(step)) {
      return {
        time: step.time || step.minutes || step.duration || '',
        main: step.main || step.text || step.instruction || step.step || '',
        why: step.why || step.tip || step.note || step.reason || ''
      };
    }
    return { time: '', main: String(step || ''), why: '' };
  }

  function renderRecipeFileSteps(recipe) {
    const steps = isNonEmptyArray(recipe?.steps) ? recipe.steps : [];
    if (!steps.length) return `<p class="recipe-empty-note">recipes.json에 조리 순서 데이터가 없습니다.</p>`;
    return steps.map((raw, idx) => {
      const s = normalizeRecipeStep(raw, idx);
      return `
        <div class="recipe-step-card">
          <div class="recipe-step-head">
            <span class="recipe-step-no">STEP ${String(idx + 1).padStart(2, '0')}</span>
            ${s.time ? `<span class="recipe-step-time">${escapeHtml(s.time)}</span>` : ''}
          </div>
          <div class="recipe-step-main">${escapeHtml(s.main)}</div>
          ${s.why ? `<div class="recipe-step-why">${escapeHtml(s.why)}</div>` : ''}
        </div>`;
    }).join('');
  }

  function renderRecipeFileSources(recipe, menu) {
    const directSources = isNonEmptyArray(recipe?.sources) ? recipe.sources : [];
    const curatedSources = isNonEmptyArray(directSources)
      ? directSources
      : recipeSourcesV2(menu).map(src => ({ title: src.title, url: src.url, note: src.note }));
    if (!isNonEmptyArray(curatedSources)) return '';
    return `
      <div class="recipe-source-card">
        <div class="recipe-source-title">레시피 출처</div>
        <p class="recipe-source-desc">
          이 화면은 <strong>recipes.json에 등록된 레시피</strong>를 우선 표시합니다. 아래 출처는 레시피 검증 또는 계열 참고 기준입니다.
        </p>
        <div class="recipe-source-list">
          ${curatedSources.map(src => `
            <a class="recipe-source-link" href="${safeExternalLink(src.url || '#')}" target="_blank" rel="noopener noreferrer">
              <strong>${escapeHtml(src.title || 'Recipe source')}</strong>
              ${escapeHtml(src.note || '')}
            </a>`).join('')}
        </div>
      </div>`;
  }

  function renderRecipeFromFile(menu) {
    const recipe = menu?.recipe || {};
    const hasRecipeFileData = isNonEmptyArray(recipe.ingredients) || isNonEmptyArray(recipe.steps);
    if (!hasRecipeFileData) return '';
    const title = recipe.title || `${menu.name} 레시피`;
    const summary = recipe.summary || recipe.description || `${menu.name}의 recipes.json 등록 레시피입니다.`;
    const checks = isNonEmptyArray(recipe.checks) ? recipe.checks : [];
    const mistakes = isNonEmptyArray(recipe.mistakes) ? recipe.mistakes : [];
    return `
      ${renderRecipeFileSources(recipe, menu)}
      <div class="beginner-recipe-box source-backed-recipe">
        <div class="beginner-recipe-title">${escapeHtml(title)}</div>
        <p class="beginner-recipe-sub">${escapeHtml(summary)}</p>
        <div class="recipe-mini-grid">
          <div class="recipe-mini-card"><span>Data</span><strong>recipes.json 우선</strong></div>
          <div class="recipe-mini-card"><span>Cuisine</span><strong>${escapeHtml(menu.type || '-')}</strong></div>
          <div class="recipe-mini-card"><span>Time</span><strong>${menu.cook === 0 ? '외식/변형' : escapeHtml(String(menu.cook)) + '분'}</strong></div>
          <div class="recipe-mini-card"><span>Servings</span><strong>${escapeHtml(recipe.servings || '1인분')}</strong></div>
        </div>
      </div>
      ${renderRecipePremiumNote(menu)}
      <div class="section"><h3>재료</h3>${renderRecipeFileIngredients(recipe)}</div>
      <div class="section"><h3>조리 순서</h3>${renderRecipeFileSteps(recipe)}</div>
      ${checks.length ? `<div class="section"><h3>완성 확인 기준</h3><ul class="recipe-check-list">${checks.map(x => `<li>✓ ${escapeHtml(x)}</li>`).join('')}</ul></div>` : ''}
      ${mistakes.length ? `<div class="section"><h3>자주 망하는 포인트</h3><ul class="recipe-mistake-list">${mistakes.map(x => `<li>주의: ${escapeHtml(x)}</li>`).join('')}</ul></div>` : ''}
    `;
  }

  function renderRecipe() {
    const c = document.getElementById('recipeContent');
    if (!currentMenu) {
      c.innerHTML = `<div class="empty-state"><div class="empty-icon">📖</div><p class="empty-text">아직 선택된 메뉴가 없어요<br>메뉴 찾기를 먼저 해주세요</p><button class="empty-cta" onclick="startQuiz()">메뉴 찾으러 가기</button></div>`;
      return;
    }
    document.getElementById('recipeSubtitle').textContent = `${currentMenu.name} · recipes.json 기준 레시피`;
    const recipeFromFile = renderRecipeFromFile(currentMenu);
    c.innerHTML = `
      <div class="recipe-header">
        <span class="recipe-emoji">${currentMenu.emoji}</span>
        <div class="recipe-name">${escapeHtml(currentMenu.name)}</div>
        <div class="recipe-meta">
          <span>🍽 ${escapeHtml(currentMenu.type || '')}</span>
          <span>⏱ ${currentMenu.cook === 0 ? '외식/집밥 변형' : currentMenu.cook + '분 기준'}</span>
          <span>🔥 약 ${currentMenu.kcal}kcal</span>
        </div>
      </div>
      ${recipeFromFile || `${renderSourceAuthenticity(currentMenu)}${renderRecipePremiumNote(currentMenu)}${renderSourceBackedRecipe(currentMenu)}`}
    `;
  }

  function strictMenuPlaceQueries(menu) {
    const q = buildPlaceQueries(menu);
    const core = coreDishName(menu);
    const exact = [...new Set([menu.name, core, ...q.exact, ...q.specialty]
      .filter(Boolean)
      .map(x => String(x).trim())
      .filter(x => x && !/맛집$/.test(x) && !/음식$/.test(x))
    )];
    return exact.slice(0, 8);
  }

  async function searchPlacesForExactMenuOnly(menu, location) {
    const queries = strictMenuPlaceQueries(menu);
    const results = new Map();
    for (const query of queries) {
      try {
        const places = await searchPlacesKakao(query, location);
        places.forEach(place => {
          const placeText = `${place.place_name || ''} ${place.category_name || ''}`;
          const core = coreDishName(menu);
          const related = placeText.includes(core) || placeText.includes(menu.name) || query.includes(core);
          if (!related) return;
          const key = place.id || `${place.place_name}-${place.address_name}`;
          const scored = { ...place, query, tier:'exact', score: placeRelevanceScore(place, menu, 'exact', query) };
          const prev = results.get(key);
          if (!prev || scored.score > prev.score) results.set(key, scored);
        });
      } catch (e) {
        console.warn('strict place query failed', query, e);
      }
      if (results.size >= 10) break;
    }
    return Array.from(results.values()).sort((a, b) => b.score - a.score).slice(0, 8);
  }

  function renderNearbyNoData(menu, reason) {
    const q = strictMenuPlaceQueries(menu);
    return `
      <div class="nearby-empty-strict">
        <div class="icon">🔍</div>
        <p><strong>${escapeHtml(menu.name)}</strong>을(를) 파는 주변 식당을 찾지 못했습니다.</p>
        <p>${escapeHtml(reason || '추천 메뉴와 직접 연결되는 식당 검색 결과가 없습니다.')}</p>
        <p style="font-size:12px; margin-top:8px;">검색 기준: ${q.map(escapeHtml).join(' · ')}</p>
        <button class="empty-cta" onclick="startQuiz()" style="margin-top:14px;">다른 메뉴 추천받기</button>
      </div>
    `;
  }

  function renderNearbyProviderNotice() {
    return `
      <div class="nearby-status-card">
        현재 버전은 가짜 식당 후보를 만들지 않습니다. Kakao REST API 키와 위치 권한이 있을 때만 실제 주변 식당을 표시합니다. API가 없으면 존재 여부를 확정하지 않고 지도 검색 버튼만 제공합니다.
      </div>
    `;
  }

  async function renderNearby() {
    const c = document.getElementById('nearbyContent');
    if (!currentMenu) {
      c.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📍</div>
          <p class="empty-text">아직 선택된 메뉴가 없어요<br>메뉴 찾기를 먼저 해주세요</p>
          <button class="empty-cta" onclick="startQuiz()">메뉴 찾으러 가기</button>
        </div>
      `;
      return;
    }

    document.getElementById('nearbySubtitle').textContent = `'${currentMenu.name}' 실제 주변 식당 확인`;
    const strategy = renderNearbySearchStrategy(currentMenu) + renderNearbyGuide(currentMenu) + renderExternalSearchLinks(currentMenu);

    if (!isProviderConfigured()) {
      c.innerHTML = strategy + renderNearbyProviderNotice() + renderNearbyNoData(currentMenu, '실제 주변 식당 API가 연결되지 않아 이 앱 안에서는 주변 식당을 확인할 수 없습니다.');
      return;
    }

    c.innerHTML = strategy + `
      <div class="empty-state">
        <div class="empty-icon">📍</div>
        <p class="empty-text">추천 메뉴명 기준으로 실제 주변 식당을 검색 중입니다.<br><span style="font-size:11px;">위치 권한을 허용해주세요.</span></p>
      </div>
    `;

    try {
      const location = await getUserLocation();
      const places = await searchPlacesForExactMenuOnly(currentMenu, location);
      if (!places.length) {
        c.innerHTML = strategy + renderNearbyNoData(currentMenu, '현재 위치 주변에는 이 추천 메뉴를 직접적으로 파는 식당이 검색되지 않았습니다.');
        return;
      }
      const formatted = places.map(p => formatPlace(p, currentMenu));
      c.innerHTML = strategy + formatted.map(r => renderRestaurantCard(r)).join('');
    } catch (err) {
      console.error('Nearby search failed:', err);
      const msg = err.code === 1 ? '위치 권한이 거부되어 주변 식당을 확인할 수 없습니다.' : '주변 식당 검색에 실패했습니다.';
      c.innerHTML = strategy + renderNearbyNoData(currentMenu, msg);
    }
  }


  // ─── Nearby Search Hotfix: map-like Kakao keyword search ───
  // 지도 앱에서 직접 검색되는 식당이 앱에서 빠지던 문제를 수정합니다.
  // 원인: 기존 코드는 undefined 함수(searchPlacesKakao)를 호출했고, 검색 결과의 가게명/카테고리에 메뉴명이 없으면 제거했습니다.
  // 실제 지도 검색은 키워드 매칭 결과를 우선 보여주므로, 앱도 "정확 메뉴명/핵심 메뉴명" 검색 결과를 우선 신뢰하도록 바꿉니다.
  const NEARBY_SEARCH_DEFAULTS = {
    radiusSteps: [3000, 7000, 12000, 20000],
    pageLimit: 2,
    pageSize: 15,
  };
  let lastNearbySearchLog = [];

  function getNearbySearchRadiusSteps() {
    const cfg = window.APP_CONFIG || {};
    const raw = Array.isArray(cfg.NEARBY_RADIUS_STEPS) ? cfg.NEARBY_RADIUS_STEPS : NEARBY_SEARCH_DEFAULTS.radiusSteps;
    return raw
      .map(v => Number(v))
      .filter(v => Number.isFinite(v) && v > 0)
      .map(v => Math.min(20000, Math.round(v)))
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .sort((a, b) => a - b);
  }

  function normalizeKakaoPlace(place, query, tier, sort, radius) {
    return {
      ...place,
      query,
      tier,
      sort,
      radius,
      score: placeRelevanceScore(place, currentMenu || {}, tier || 'exact', query)
    };
  }

  async function searchPlacesKakao(query, location, options = {}) {
    if (!NEARBY_PROXY_URL) throw new Error('주변 식당 프록시가 설정되지 않았습니다.');
    if (!query) return [];
    if (!location || !Number.isFinite(Number(location.lat)) || !Number.isFinite(Number(location.lng))) {
      throw new Error('위치 좌표가 올바르지 않습니다.');
    }

    const radius = Math.min(20000, Math.max(1, Number(options.radius || 5000)));
    const size = Math.min(15, Math.max(1, Number(options.size || NEARBY_SEARCH_DEFAULTS.pageSize)));
    const pageLimit = Math.min(3, Math.max(1, Number(options.pageLimit || NEARBY_SEARCH_DEFAULTS.pageLimit)));
    const sort = options.sort || 'accuracy';
    const documents = [];

    for (let page = 1; page <= pageLimit; page += 1) {
      const params = new URLSearchParams({
        query: String(query),
        x: String(location.lng),
        y: String(location.lat),
        radius: String(radius),
        size: String(size),
        page: String(page),
        sort,
      });
      const separator = NEARBY_PROXY_URL.includes('?') ? '&' : '?';
      const res = await fetch(`${NEARBY_PROXY_URL}${separator}${params.toString()}`, {
        headers: { 'Accept': 'application/json' }
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`주변 식당 프록시 ${res.status}: ${errText.slice(0, 180)}`);
      }

      const data = await res.json();
      const pageDocs = (data.documents || []).filter(d => {
        const group = d.category_group_code || '';
        const cat = d.category_name || '';
        return group === 'FD6' || group === 'CE7' || /음식점|카페|간식|주점/.test(cat);
      });
      documents.push(...pageDocs);
      if (!data.meta || data.meta.is_end || !(data.documents || []).length) break;
    }

    return documents.map(d => normalizeKakaoPlace(d, String(query), options.tier || 'exact', sort, radius));
  }



  function strictMenuPlaceQueries(menu) {
    const q = buildPlaceQueries(menu);
    const name = compactText(menu?.name);
    const core = coreDishName(menu);
    const aliases = DISH_TO_RESTAURANT_KEYWORDS[name] || DISH_TO_RESTAURANT_KEYWORDS[core] || [];
    const candidates = uniq([
      name,
      core,
      ...aliases,
      ...(q.exact || []),
      ...(q.specialty || []).filter(x => /전문점|전문|식당|집|카페|스시|라멘|쌀국수|마라|파스타|피자|버거|브런치|국밥|찌개|탕|국수|냉면|초밥|돈까스|돈카츠|타코|커리|케밥|반미/.test(x))
    ]);

    // 한식/양식 같은 너무 넓은 키워드는 제외합니다. 실제 메뉴 검색에 가까운 키워드만 남깁니다.
    return candidates
      .map(x => String(x).trim())
      .filter(x => x.length >= 2)
      .filter(x => !/^(한식|중식|일식|양식|세계음식|음식점|맛집|정식|전문점)$/.test(x))
      .slice(0, 10);
  }

  function placeHardReject(place) {
    const cat = `${place.category_name || ''} ${place.category_group_name || ''}`;
    const name = `${place.place_name || ''}`;
    // 메뉴 검색 결과라도 비식당 업종은 제외합니다.
    if (/마트|슈퍼|편의점|식자재|정육점|수산시장|식품|반찬가게|배달대행|도매|소매|제조|학원/.test(cat + name)) return true;
    return false;
  }

  async function searchPlacesForExactMenuOnly(menu, location) {
    const queries = strictMenuPlaceQueries(menu);
    const radiusSteps = getNearbySearchRadiusSteps();
    const sorts = ['accuracy', 'distance'];
    const results = new Map();
    const logs = [];

    for (const radius of radiusSteps) {
      for (const query of queries) {
        for (const sort of sorts) {
          let places = [];
          try {
            places = await searchPlacesKakao(query, location, { radius, sort, tier: 'exact', size: 15, pageLimit: 2 });
          } catch (e) {
            logs.push({ query, radius, sort, count: 0, error: e.message || String(e) });
            continue;
          }

          const accepted = places.filter(p => !placeHardReject(p));
          logs.push({ query, radius, sort, count: accepted.length });

          accepted.forEach(place => {
            const key = place.id || `${place.place_name}|${place.road_address_name || place.address_name}`;
            const boosted = {
              ...place,
              query,
              radius,
              sort,
              tier: 'exact',
              score: placeRelevanceScore(place, menu, 'exact', query) + (sort === 'accuracy' ? 6 : 0) - Math.min(8, Number(place.distance || 0) / 1200)
            };
            const prev = results.get(key);
            if (!prev || boosted.score > prev.score) results.set(key, boosted);
          });
        }
        if (results.size >= 8) break;
      }
      if (results.size >= 3) break;
    }

    lastNearbySearchLog = logs;
    return Array.from(results.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }

  function renderNearbySearchDebug() {
    if (!lastNearbySearchLog.length) return '';
    const rows = lastNearbySearchLog.slice(0, 18).map(item => `
      <div class="nearby-debug-row">
        <span>${escapeHtml(item.query)}</span>
        <span>${Number(item.radius).toLocaleString()}m</span>
        <span>${escapeHtml(item.sort)}</span>
        <strong>${item.error ? 'ERR' : item.count + '개'}</strong>
      </div>
    `).join('');
    return `
      <details class="nearby-debug">
        <summary>검색 진단 보기</summary>
        <div class="nearby-debug-head"><span>검색어</span><span>반경</span><span>정렬</span><span>결과</span></div>
        ${rows}
      </details>
    `;
  }

  function renderNearbyNoData(menu, reason) {
    const q = strictMenuPlaceQueries(menu);
    return `
      <div class="nearby-empty-strict">
        <div class="icon">🔍</div>
        <p><strong>${escapeHtml(menu.name)}</strong>을(를) 파는 주변 식당을 찾지 못했습니다.</p>
        <p>${escapeHtml(reason || '현재 위치 주변에는 이 추천 메뉴를 파는 식당이 없습니다.')}</p>
        <p style="font-size:12px; margin-top:8px;">검색 기준: ${q.map(escapeHtml).join(' · ')}</p>
        <p style="font-size:11px; margin-top:6px; color:var(--ink-soft);">검색 반경: ${getNearbySearchRadiusSteps().map(v => (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'km').join(' → ')}</p>
        ${renderNearbySearchDebug()}
        <button class="empty-cta" onclick="startQuiz()" style="margin-top:14px;">다른 메뉴 추천받기</button>
      </div>
    `;
  }

  function renderManualLocationForm() {
    return `
      <div class="manual-location-form">
        <label for="manualLocationQuery">지역·주소·역 이름으로 찾기</label>
        <div class="manual-location-row">
          <input id="manualLocationQuery" type="search" maxlength="80" autocomplete="street-address" placeholder="예: 강남역, 광운대역, 서울 노원구 월계동" onkeydown="if(event.key==='Enter'){event.preventDefault();searchByManualLocation();}">
          <button type="button" onclick="searchByManualLocation()">지역 검색</button>
        </div>
        <p class="manual-location-help">위치 권한을 허용하지 않아도 사용할 수 있습니다. 입력한 검색어는 지역 좌표 확인에만 사용합니다.</p>
      </div>`;
  }

  async function resolveManualLocation(query) {
    if (!API_BASE_URL) throw new Error('지역 검색 서버가 연결되지 않았습니다.');
    const params = new URLSearchParams({ query });
    const response = await fetch(`${API_BASE_URL}/api/resolve-location?${params}`, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const error = new Error(payload.error === 'location_not_found' ? '입력한 지역을 찾지 못했습니다.' : '지역 검색에 실패했습니다.');
      error.code = payload.error || `HTTP_${response.status}`;
      throw error;
    }
    const payload = await response.json();
    if (!Number.isFinite(Number(payload.lat)) || !Number.isFinite(Number(payload.lng))) throw new Error('지역 좌표가 올바르지 않습니다.');
    return { lat: Number(payload.lat), lng: Number(payload.lng), label: String(payload.label || query).slice(0, 100) };
  }

  async function searchByManualLocation() {
    const input = document.getElementById('manualLocationQuery');
    const query = input?.value?.trim() || '';
    if (query.length < 2) {
      showToast('지역, 주소 또는 역 이름을 2자 이상 입력해 주세요');
      return;
    }
    const c = document.getElementById('nearbyContent');
    const strategy = renderNearbySearchStrategy(currentMenu) + renderNearbyGuide(currentMenu) + renderExternalSearchLinks(currentMenu);
    c.innerHTML = strategy + `<div class="empty-state"><div class="empty-icon">🔍</div><p class="empty-text">${escapeHtml(query)} 위치를 확인하고 있어요.</p></div>`;
    try {
      const location = await resolveManualLocation(query);
      userLocation = { lat: location.lat, lng: location.lng };
      userLocationLabel = location.label;
      trackEvent('location_manual_search', { queryType: /역$/.test(query) ? 'station' : /[로길동구시군]$/.test(query) ? 'address_or_region' : 'keyword' });
      await searchNearbyAtLocation(userLocation, 'manual');
    } catch (error) {
      c.innerHTML = strategy + renderNearbyNoData(currentMenu, error.message || '지역 검색어를 확인해 주세요.') + renderManualLocationForm();
      trackEvent('restaurant_search_failed', { errorCode: error.code || 'manual_location_error', source: 'manual' });
    }
  }

  async function searchNearbyAtLocation(location, source = 'device') {
    const c = document.getElementById('nearbyContent');
    const strategy = renderNearbySearchStrategy(currentMenu) + renderNearbyGuide(currentMenu) + renderExternalSearchLinks(currentMenu);
    const label = source === 'manual' && userLocationLabel ? userLocationLabel : '현재 위치';
    c.innerHTML = strategy + `
      <div class="empty-state">
        <div class="empty-icon">📍</div>
        <p class="empty-text">${escapeHtml(label)} 주변에서 실제 식당을 검색 중입니다.</p>
      </div>`;
    try {
      const places = await searchPlacesForExactMenuOnly(currentMenu, location);
      trackEvent('restaurant_search_completed', { menuId: currentMenu.id || currentMenu.name, source, resultCount: places.length });
      if (!places.length) {
        c.innerHTML = strategy + renderNearbyNoData(currentMenu, `${label} 주변에는 이 추천 메뉴를 파는 식당이 검색되지 않았습니다.`) + renderManualLocationForm();
        return;
      }
      const formatted = places.map(place => formatPlace(place, currentMenu));
      c.innerHTML = strategy + `<div class="nearby-status-card">검색 기준 위치: ${escapeHtml(label)} · 결과 ${formatted.length}개</div>` + renderNearbySearchDebug() + formatted.map(restaurant => renderRestaurantCard(restaurant)).join('') + renderManualLocationForm();
    } catch (error) {
      console.error('Nearby search failed:', error);
      c.innerHTML = strategy + renderNearbyNoData(currentMenu, `식당 검색에 실패했습니다. ${error.message || ''}`.trim()) + renderManualLocationForm();
      trackEvent('restaurant_search_failed', { errorCode: error.code || 'provider_error', source });
    }
  }

  async function renderNearby(options = {}) {
    const c = document.getElementById('nearbyContent');
    if (!currentMenu) {
      c.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📍</div>
          <p class="empty-text">아직 선택된 메뉴가 없어요<br>메뉴 찾기를 먼저 해주세요</p>
          <button class="empty-cta" onclick="startQuiz()">메뉴 찾으러 가기</button>
        </div>`;
      return;
    }

    document.getElementById('nearbySubtitle').textContent = `'${currentMenu.name}' 실제 주변 식당 확인`;
    const strategy = renderNearbySearchStrategy(currentMenu) + renderNearbyGuide(currentMenu) + renderExternalSearchLinks(currentMenu);

    if (!isProviderConfigured()) {
      c.innerHTML = strategy + renderNearbyProviderNotice() + renderNearbyNoData(currentMenu, '주변 식당 서버 프록시가 연결되지 않아 앱 안에서는 실제 식당을 확인할 수 없습니다. 지도 버튼은 직접 검색용입니다.');
      return;
    }

    if (userLocation && !options.requestLocation) {
      await searchNearbyAtLocation(userLocation, userLocationLabel ? 'manual' : 'device');
      return;
    }

    if (!options.requestLocation) {
      c.innerHTML = strategy + `
        <div class="location-permission-card">
          <img src="./assets/brand/logo-symbol.svg" alt="" width="58" height="58">
          <div class="location-permission-copy">
            <strong>주변 식당을 찾을 방법을 선택하세요</strong>
            <p>현재 위치는 이번 식당 검색에만 사용하며 지속적으로 추적하지 않습니다. 권한을 거부해도 지역, 주소 또는 역 이름을 직접 입력할 수 있습니다.</p>
          </div>
          <button type="button" onclick="requestNearbyLocation()">현재 위치로 찾기</button>
        </div>
        ${renderManualLocationForm()}`;
      return;
    }

    c.innerHTML = strategy + `<div class="empty-state"><div class="empty-icon">📍</div><p class="empty-text">현재 위치 권한을 확인하고 있어요.</p></div>`;
    try {
      const location = await getUserLocation();
      userLocationLabel = '';
      trackEvent('location_permission_granted', { source: 'nearby' });
      await searchNearbyAtLocation(location, 'device');
    } catch (error) {
      const denied = Number(error.code) === 1;
      trackEvent('location_permission_failed', { source: 'nearby', code: error.code || 'unknown' });
      c.innerHTML = strategy + `
        <div class="nearby-status-card">${denied ? '위치 권한이 거부되었습니다. 아래에서 지역을 직접 입력해 주세요.' : '현재 위치를 확인하지 못했습니다. 지역을 직접 입력할 수 있습니다.'}</div>
        ${renderManualLocationForm()}`;
    }
  }

  function requestNearbyLocation() {
    trackEvent('location_permission_prompted', { source: 'nearby' });
    renderNearby({ requestLocation: true });
  }


  // ─── v4.5 Home-country recommendation + menu-first nearby search ───
  // Kakao Local 키워드 API는 식당의 전체 메뉴판을 제공하지 않습니다.
  // 따라서 1차는 정확 메뉴명으로 검색하고, 결과가 부족할 때만 같은 음식 문화의 가까운 식당을
  // '판매 여부 확인 필요' 후보로 보여줍니다. 라조기를 마라로 바꾸는 식의 임의 치환은 금지합니다.
  const GENERIC_RESTAURANT_KEYWORDS = new Set([
    '한식','한식 맛집','백반','가정식','중식','중식 맛집','중화요리','중국집','반점','일식','일식 맛집',
    '양식','양식 맛집','세계음식','세계음식 맛집','음식점','맛집','전문점','식당','카페','마라','멕시칸',
    '태국음식','베트남음식','인도음식','중동음식'
  ]);

  function isDishSpecificRestaurantKeyword(keyword, menu) {
    const term = compactText(keyword);
    const name = compactText(menu?.name);
    const core = coreDishName(menu);
    if (!term || GENERIC_RESTAURANT_KEYWORDS.has(term)) return false;
    if (term === name || term === core) return true;
    if (name && (name.includes(term) || term.includes(name))) return true;
    if (core && (core.includes(term) || term.includes(core))) return true;
    // 마라 음식이 아닌데 마라 키워드로 확장하지 않습니다.
    if (/마라/.test(term) && !/마라/.test(name)) return false;
    return term.length >= 3 && !/맛집|전문점|식당|카페|중국집|중화요리|반점|한식|중식|일식|양식/.test(term);
  }

  function cuisineCandidateQueries(menu) {
    const name = compactText(menu?.name);
    if (menu?.type === '중식') {
      if (/마라/.test(name)) return ['마라탕', '마라샹궈', '마라 전문점', '중화요리'];
      if (/딤섬|만두|소롱포|샤오롱바오/.test(name)) return ['딤섬 전문점', '중화요리', '중국집'];
      if (/양꼬치|마라롱샤/.test(name)) return ['양꼬치', '중화요리', '중국집'];
      return ['중화요리', '중국집', '반점'];
    }
    if (menu?.type === '한식') return ['한식', '백반', '한식당'];
    if (menu?.type === '일식') return ['일식', '일본식당', '이자카야'];
    if (menu?.type === '양식') return ['양식', '이탈리안', '브런치'];
    return ['세계음식', '아시아음식', '에스닉푸드'];
  }

  function buildPlaceQueries(menu) {
    const name = compactText(menu?.name);
    const core = coreDishName(menu);
    const aliases = DISH_TO_RESTAURANT_KEYWORDS[name] || DISH_TO_RESTAURANT_KEYWORDS[core] || [];
    const specificAliases = aliases.filter(keyword => isDishSpecificRestaurantKeyword(keyword, menu));
    const exact = uniq([name, core, ...specificAliases]);
    const specialty = uniq(cuisineCandidateQueries(menu));
    return {
      exact,
      specialty,
      fallback: specialty,
      primary: exact[0] || name || specialty[0] || '음식점',
      core
    };
  }

  function strictMenuPlaceQueries(menu) {
    return buildPlaceQueries(menu).exact
      .map(value => compactText(value))
      .filter(value => value.length >= 2)
      .slice(0, 6);
  }

  function renderNearbySearchStrategy(menu) {
    const q = buildPlaceQueries(menu);
    return `
      <div class="nearby-search-card">
        <div class="nearby-label">Menu-first Place Search</div>
        <div class="nearby-title">메뉴명을 바꾸지 않고 검색합니다</div>
        <div class="nearby-chip-row">
          ${q.exact.slice(0, 5).map(x => `<span class="nearby-chip">${escapeHtml(x)}</span>`).join('')}
        </div>
        <div class="nearby-tier-list">
          <div class="nearby-tier"><span>1차</span><div><strong>${escapeHtml(q.exact.join(' · ') || menu.name)}</strong><small>정확 메뉴명과 실제 별칭만 검색</small></div></div>
          <div class="nearby-tier"><span>2차</span><div><strong>${escapeHtml(q.specialty.join(' · '))}</strong><small>정확 검색이 부족할 때 가까운 ${escapeHtml(menu.type)} 식당을 표시하며, 메뉴 판매 여부는 직접 확인</small></div></div>
        </div>
        <p class="manual-location-help" style="margin-top:10px;">지도 API에는 식당의 전체 메뉴판이 없을 수 있어, 2차 후보는 해당 메뉴 판매를 보장하지 않습니다.</p>
      </div>`;
  }

  function placeTierRank(tier) {
    return tier === 'exact' ? 0 : tier === 'cuisine_candidate' ? 1 : 2;
  }

  async function searchPlacesForExactMenuOnly(menu, location) {
    const exactQueries = strictMenuPlaceQueries(menu);
    const cuisineQueries = cuisineCandidateQueries(menu);
    const radiusSteps = getNearbySearchRadiusSteps();
    const results = new Map();
    const logs = [];

    async function collect(queries, tier, maxResults, sorts) {
      for (const radius of radiusSteps) {
        for (const query of queries) {
          for (const sort of sorts) {
            let places = [];
            try {
              places = await searchPlacesKakao(query, location, { radius, sort, tier, size: 15, pageLimit: 2 });
            } catch (error) {
              logs.push({ query, radius, sort, tier, count: 0, error: error.message || String(error) });
              continue;
            }
            const accepted = places.filter(place => !placeHardReject(place));
            logs.push({ query, radius, sort, tier, count: accepted.length });
            accepted.forEach(place => {
              const key = place.id || `${place.place_name}|${place.road_address_name || place.address_name}`;
              const distance = Number(place.distance || 99999);
              const rankBonus = tier === 'exact' ? 100 : 0;
              const candidate = {
                ...place,
                query,
                radius,
                sort,
                tier,
                menuAvailability: tier === 'exact' ? 'keyword_match' : 'unknown',
                score: rankBonus + placeRelevanceScore(place, menu, tier === 'exact' ? 'exact' : 'fallback', query) - Math.min(12, distance / 1200)
              };
              const previous = results.get(key);
              if (!previous || candidate.score > previous.score) results.set(key, candidate);
            });
          }
          if (results.size >= maxResults) break;
        }
        if (results.size >= maxResults) break;
      }
    }

    await collect(exactQueries, 'exact', 6, ['accuracy', 'distance']);
    if (results.size < 8) await collect(cuisineQueries, 'cuisine_candidate', 10, ['distance']);

    lastNearbySearchLog = logs;
    return Array.from(results.values())
      .sort((a, b) => placeTierRank(a.tier) - placeTierRank(b.tier) || Number(a.distance || 99999) - Number(b.distance || 99999) || b.score - a.score)
      .slice(0, 10);
  }

  function qualityBadgesForPlace(place, menu) {
    if ((place.tier || '') === 'cuisine_candidate') return [`가까운 ${menu.type} 식당`, '메뉴 판매 여부 확인'];
    const badges = ['메뉴 키워드 검색'];
    const name = compactText(place.name || place.place_name || '');
    const core = coreDishName(menu);
    if (name.includes(menu.name) || (core && name.includes(core))) badges.unshift('상호명 일치');
    return badges.slice(0, 3);
  }

  function formatPlace(place, menu) {
    const distance = parseInt(place.distance, 10);
    const dist = Number.isFinite(distance) ? (distance >= 1000 ? `${(distance / 1000).toFixed(1)}km` : `${distance}m`) : '';
    const categoryParts = (place.category_name || '').split('>').map(value => value.trim()).filter(Boolean);
    const category = categoryParts[categoryParts.length - 1] || menu.type;
    const isCandidate = place.tier === 'cuisine_candidate';
    return {
      id: place.id || '',
      emoji: menu.emoji,
      name: place.place_name,
      dist,
      score: place.score,
      fitLabel: isCandidate ? `${menu.type} 식당 후보` : '메뉴 검색 일치',
      price: '',
      addr: place.road_address_name || place.address_name || '',
      subcategory: category,
      placeUrl: place.place_url,
      phone: place.phone || '',
      query: place.query || '',
      tier: place.tier || 'exact',
      availabilityNote: isCandidate ? `'${menu.name}' 판매 여부는 매장에 확인하세요.` : `지도 검색에서 '${menu.name}' 키워드로 확인된 결과입니다.`,
      badges: qualityBadgesForPlace(place, menu)
    };
  }

  function renderRestaurantCard(r) {
    const metaParts = [];
    if (r.subcategory) metaParts.push(`<span>${escapeHtml(r.subcategory)}</span>`);
    if (r.dist) metaParts.push(`<span>${escapeHtml(r.dist)}</span>`);
    if (r.phone) metaParts.push(`<span>${escapeHtml(r.phone)}</span>`);
    if (r.query) metaParts.push(`<span>검색어: ${escapeHtml(r.query)}</span>`);
    const safeName = escapeJsString(r.name || '');
    const safeAddr = escapeJsString(r.addr || '');
    const safeUrl = escapeJsString(r.placeUrl || '');
    const safeId = escapeJsString(r.id || r.name || '');
    const badges = r.badges || [];
    return `
      <div class="restaurant" onclick="openRestaurantResult('${safeId}', '${safeName}', '${safeAddr}', '${safeUrl}')">
        <div class="rest-emoji">${r.emoji || '🍽️'}</div>
        <div class="rest-info">
          <div class="rest-heading"><div class="rest-name">${escapeHtml(r.name || '식당')}</div>${r.fitLabel ? `<div class="rest-score">${escapeHtml(r.fitLabel)}</div>` : ''}</div>
          <div class="rest-meta">${metaParts.join('<span style="opacity:0.4;">·</span>')}</div>
          ${r.addr ? `<div class="rest-meta" style="margin-top:4px; opacity:0.7;">${escapeHtml(r.addr)}</div>` : ''}
          ${r.availabilityNote ? `<div class="rest-meta" style="margin-top:6px;">${escapeHtml(r.availabilityNote)}</div>` : ''}
          ${badges.length ? `<div class="rest-badge-row">${badges.map(b => `<span class="rest-badge">${escapeHtml(b)}</span>`).join('')}</div>` : ''}
        </div>
      </div>`;
  }


  // ─── Final recipe renderer: recipes.json only, no fake fallback ───
  function normalizeRecipeIngredientRows(items) {
    if (!Array.isArray(items)) return '';
    return items.map(item => {
      if (Array.isArray(item)) return `<li><span>${escapeHtml(item[0] || '')}</span><span class="qty">${escapeHtml(item[1] || '')}</span></li>`;
      return `<li><span>${escapeHtml(item.name || item.item || '')}</span><span class="qty">${escapeHtml(item.qty || item.amount || '')}</span></li>`;
    }).join('');
  }

  function normalizeRecipeSteps(steps) {
    if (!Array.isArray(steps)) return '';
    return steps.map((step, idx) => {
      const no = String(idx + 1).padStart(2, '0');
      const time = typeof step === 'object' ? (step.time || '') : '';
      const main = typeof step === 'object' ? (step.main || '') : String(step || '');
      const why = typeof step === 'object' ? (step.why || '') : '';
      return `
        <div class="recipe-step-card">
          <div class="recipe-step-head">
            <span class="recipe-step-no">STEP ${no}</span>
            <span class="recipe-step-time">${escapeHtml(time)}</span>
          </div>
          <div class="recipe-step-main">${escapeHtml(main)}</div>
          ${why ? `<div class="recipe-step-why">${escapeHtml(why)}</div>` : ''}
        </div>`;
    }).join('');
  }

  function renderRecipeSourceBasis(recipe) {
    const sources = Array.isArray(recipe.sourceBasis) ? recipe.sourceBasis : [];
    if (!sources.length) return '';
    return `
      <div class="recipe-source-card">
        <div class="recipe-source-title">출처 기반 재작성 레시피</div>
        <p class="recipe-source-desc">아래 출처의 재료 구조와 조리 원리를 확인한 뒤, 원문을 복사하지 않고 초보자용으로 다시 작성했습니다.</p>
        <div class="recipe-source-list">
          ${sources.map(src => `
            <a class="recipe-source-link" href="${safeExternalLink(src.url)}" target="_blank" rel="noopener noreferrer">
              <strong>${escapeHtml(src.title || '출처')}</strong>
              ${escapeHtml(src.note || '')}
            </a>`).join('')}
        </div>
      </div>`;
  }

  function renderVerifiedRecipe(recipe) {
    return `
      ${renderRecipeSourceBasis(recipe)}
      <div class="beginner-recipe-box">
        <div class="recipe-status-badge">검증 상태: VERIFIED REWRITE</div>
        <div class="beginner-recipe-title">${escapeHtml(recipe.name || currentMenu.name)} 상세 레시피</div>
        <p class="beginner-recipe-sub">${escapeHtml(recipe.summary || '')}</p>
        <div class="recipe-mini-grid">
          <div class="recipe-mini-card"><span>Servings</span><strong>${escapeHtml(recipe.servings || '1인분')}</strong></div>
          <div class="recipe-mini-card"><span>Time</span><strong>${escapeHtml(recipe.time || '')}</strong></div>
          <div class="recipe-mini-card"><span>Difficulty</span><strong>${escapeHtml(recipe.difficulty || '')}</strong></div>
          <div class="recipe-mini-card"><span>Heat</span><strong>${escapeHtml(recipe.heat || '')}</strong></div>
        </div>
        <div class="recipe-beginner-alert">${escapeHtml(recipe.rewritePolicy || '출처 레시피를 초보자용으로 재작성했습니다.')}</div>
      </div>
      <div class="section">
        <h3>필요한 도구</h3>
        <div class="pairing-list">${(recipe.equipment || []).map(x => `<span class="pairing-item">${escapeHtml(x)}</span>`).join('')}</div>
      </div>
      <div class="section">
        <h3>재료 · 1차 기준</h3>
        <ul class="ingredient-list">${normalizeRecipeIngredientRows(recipe.ingredients)}</ul>
      </div>
      <div class="section">
        <h3>초보자용 상세 조리 순서</h3>
        ${normalizeRecipeSteps(recipe.steps)}
      </div>
      <div class="section">
        <h3>완성 확인 기준</h3>
        <ul class="recipe-check-list">${(recipe.checks || []).map(x => `<li>✓ ${escapeHtml(x)}</li>`).join('')}</ul>
      </div>
      <div class="section">
        <h3>자주 망하는 포인트</h3>
        <ul class="recipe-mistake-list">${(recipe.mistakes || []).map(x => `<li>주의: ${escapeHtml(x)}</li>`).join('')}</ul>
      </div>
      <div class="section">
        <h3>저작권 처리</h3>
        <div class="recipe-beginner-alert">${escapeHtml(recipe.copyrightNote || '원문 복사 없이 재작성했습니다.')}</div>
      </div>`;
  }

  function renderUnverifiedRecipe(menu) {
    const query = encodeURIComponent(`${menu.name} 레시피`);
    return `
      <div class="recipe-source-card">
        <div class="recipe-source-title">출처 검증 레시피 준비 중</div>
        <p class="recipe-source-desc">
          이 메뉴는 아직 recipes.json에 검증 레시피가 없습니다. 이전처럼 범용 템플릿으로 가짜 레시피를 만들지 않습니다.
        </p>
        <div class="recipe-source-list">
          <a class="recipe-source-link" href="https://www.google.com/search?q=${query}" target="_blank" rel="noopener noreferrer"><strong>직접 검색</strong>${escapeHtml(menu.name)} 레시피 검색</a>
        </div>
      </div>`;
  }

  function renderRecipe() {
    const c = document.getElementById('recipeContent');
    if (!currentMenu) {
      c.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📖</div>
          <p class="empty-text">아직 선택된 메뉴가 없어요<br>메뉴 찾기를 먼저 해주세요</p>
          <button class="empty-cta" onclick="startQuiz()">메뉴 찾으러 가기</button>
        </div>`;
      return;
    }
    const recipe = currentMenu.recipe || {};
    document.getElementById('recipeSubtitle').textContent = `${currentMenu.name} · 출처 기반 레시피`;
    c.innerHTML = `
      <div class="recipe-header">
        <span class="recipe-emoji">${escapeHtml(currentMenu.emoji || '🍽')}</span>
        <div class="recipe-name">${escapeHtml(currentMenu.name)}</div>
        <div class="recipe-meta">
          <span>⏱ ${escapeHtml(recipe.time || (currentMenu.cook === 0 ? '외식/확인 필요' : currentMenu.cook + '분 기준'))}</span>
          <span>👥 ${escapeHtml(recipe.servings || '1인분 기준')}</span>
          <span>🔥 약 ${escapeHtml(currentMenu.kcal || '')}kcal</span>
        </div>
      </div>
      ${renderRecipePremiumNote(currentMenu)}
      ${recipe.verified === true ? renderVerifiedRecipe(recipe) : renderUnverifiedRecipe(currentMenu)}
    `;
  }


  // ─── Recipe QA Panel ───
  function getRecipeForMenu(menu) {
    return menu && menu.recipe && typeof menu.recipe === 'object' ? menu.recipe : {};
  }

  function countRecipeSteps(recipe) {
    return Array.isArray(recipe.steps) ? recipe.steps.length : 0;
  }

  function countRecipeIngredients(recipe) {
    return Array.isArray(recipe.ingredients) ? recipe.ingredients.length : 0;
  }

  function countRecipeSources(recipe) {
    return Array.isArray(recipe.sourceBasis) ? recipe.sourceBasis.filter(src => src && (src.title || src.url)).length : 0;
  }

  function hasUrlSource(recipe) {
    return Array.isArray(recipe.sourceBasis) && recipe.sourceBasis.some(src => src && /^https?:\/\//.test(String(src.url || '')));
  }

  function recipeContainsSuspiciousTemplate(recipe) {
    const raw = JSON.stringify(recipe || {});
    const suspicious = [
      '주재료', '물 또는 육수', '마늘/대파', '기본 양념', '출처 검증 레시피 준비 중',
      'generic', 'source-mapped-generic', '템플릿', '전문점1', '전문점2', '간편식1', '홈쿡3'
    ];
    return suspicious.filter(word => raw.includes(word));
  }

  function recipeQualityFlags(menu) {
    const recipe = getRecipeForMenu(menu);
    const flags = [];
    if (recipe.verified !== true) flags.push({ level:'danger', label:'미검증', detail:'verified가 true가 아닙니다.' });
    if (!recipe.summary || String(recipe.summary).trim().length < 20) flags.push({ level:'warn', label:'요약 부족', detail:'초보자가 메뉴 성격을 이해할 설명이 부족합니다.' });
    if (countRecipeSources(recipe) < 1) flags.push({ level:'danger', label:'출처 없음', detail:'sourceBasis가 비어 있습니다.' });
    if (!hasUrlSource(recipe)) flags.push({ level:'warn', label:'URL 출처 없음', detail:'확인 가능한 웹 출처 URL이 없습니다.' });
    if (countRecipeIngredients(recipe) < 3) flags.push({ level:'danger', label:'재료 부족', detail:'재료가 3개 미만입니다.' });
    if (countRecipeSteps(recipe) < 5) flags.push({ level:'warn', label:'단계 부족', detail:'초보자용 상세 단계가 5개 미만입니다.' });
    if (!Array.isArray(recipe.equipment) || recipe.equipment.length < 1) flags.push({ level:'warn', label:'도구 없음', detail:'필요 도구가 없습니다.' });
    if (!Array.isArray(recipe.checks) || recipe.checks.length < 2) flags.push({ level:'warn', label:'완성 기준 부족', detail:'완성 확인 기준이 2개 미만입니다.' });
    if (!Array.isArray(recipe.mistakes) || recipe.mistakes.length < 2) flags.push({ level:'warn', label:'실패 포인트 부족', detail:'자주 망하는 포인트가 2개 미만입니다.' });
    const suspicious = recipeContainsSuspiciousTemplate(recipe);
    if (suspicious.length) flags.push({ level:'danger', label:'템플릿 의심', detail:`의심 표현: ${suspicious.join(', ')}` });
    return flags;
  }

  function recipeQaStatus(menu) {
    const flags = recipeQualityFlags(menu);
    if (flags.some(f => f.level === 'danger')) return 'fail';
    if (flags.some(f => f.level === 'warn')) return 'warn';
    return 'pass';
  }

  function recipeQaStatusLabel(status) {
    return status === 'pass' ? '통과' : status === 'warn' ? '보완 필요' : '수정 필요';
  }

  function recipeQaStatusIcon(status) {
    return status === 'pass' ? '✅' : status === 'warn' ? '⚠️' : '🚨';
  }

  function buildRecipeQaRows() {
    return menus.map(menu => {
      const recipe = getRecipeForMenu(menu);
      const flags = recipeQualityFlags(menu);
      const status = recipeQaStatus(menu);
      return {
        menu,
        recipe,
        flags,
        status,
        ingredientCount: countRecipeIngredients(recipe),
        stepCount: countRecipeSteps(recipe),
        sourceCount: countRecipeSources(recipe)
      };
    });
  }

  function recipeQaSummary(rows) {
    const total = rows.length;
    const pass = rows.filter(r => r.status === 'pass').length;
    const warn = rows.filter(r => r.status === 'warn').length;
    const fail = rows.filter(r => r.status === 'fail').length;
    const verified = rows.filter(r => r.recipe.verified === true).length;
    const withSources = rows.filter(r => r.sourceCount > 0).length;
    const suspicious = rows.filter(r => r.flags.some(f => f.label === '템플릿 의심')).length;
    return { total, pass, warn, fail, verified, withSources, suspicious };
  }

  function renderRecipeQaControls(summary) {
    const types = ['전체', ...Array.from(new Set(menus.map(m => m.type).filter(Boolean)))];
    return `
      <div class="qa-summary-grid">
        <div class="qa-stat-card"><span>전체 메뉴</span><strong>${summary.total}</strong></div>
        <div class="qa-stat-card pass"><span>통과</span><strong>${summary.pass}</strong></div>
        <div class="qa-stat-card warn"><span>보완 필요</span><strong>${summary.warn}</strong></div>
        <div class="qa-stat-card fail"><span>수정 필요</span><strong>${summary.fail}</strong></div>
        <div class="qa-stat-card"><span>verified</span><strong>${summary.verified}</strong></div>
        <div class="qa-stat-card"><span>출처 있음</span><strong>${summary.withSources}</strong></div>
      </div>
      <div class="qa-policy-card">
        <strong>QA 기준</strong>
        <p>가짜 레시피를 만들지 않고, recipes.json에 등록된 출처 기반 레시피만 검수합니다. 통과 기준은 verified=true, 출처, 재료, 5단계 이상 조리법, 완성 기준, 실패 포인트입니다.</p>
      </div>
      <div class="qa-toolbar">
        <label class="test-field"><span>검색</span><input id="recipeQaSearch" type="search" placeholder="메뉴명, 출처, 재료 검색" oninput="runRecipeQA()"></label>
        <label class="test-field"><span>음식 종류</span><select id="recipeQaType" onchange="runRecipeQA()">${types.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}</select></label>
        <label class="test-field"><span>상태</span><select id="recipeQaStatus" onchange="runRecipeQA()"><option value="전체">전체</option><option value="fail">수정 필요</option><option value="warn">보완 필요</option><option value="pass">통과</option></select></label>
        <button class="empty-cta" onclick="downloadRecipeQaReport()">QA 리포트 저장</button>
      </div>`;
  }

  function renderRecipeQaRow(row) {
    const { menu, recipe, flags, status } = row;
    const flagHtml = flags.length
      ? flags.map(f => `<span class="qa-flag ${escapeHtml(f.level)}" title="${escapeHtml(f.detail)}">${escapeHtml(f.label)}</span>`).join('')
      : '<span class="qa-flag pass">문제 없음</span>';
    const sources = Array.isArray(recipe.sourceBasis) ? recipe.sourceBasis.slice(0, 3) : [];
    return `
      <div class="qa-recipe-card ${escapeHtml(status)}">
        <div class="qa-recipe-head">
          <div>
            <div class="qa-recipe-title">${recipeQaStatusIcon(status)} ${escapeHtml(menu.name)}</div>
            <div class="qa-recipe-meta">${escapeHtml(menu.type)} · 재료 ${row.ingredientCount}개 · 단계 ${row.stepCount}개 · 출처 ${row.sourceCount}개</div>
          </div>
          <div class="qa-recipe-status ${escapeHtml(status)}">${recipeQaStatusLabel(status)}</div>
        </div>
        <div class="qa-flag-row">${flagHtml}</div>
        <p class="qa-recipe-summary">${escapeHtml(recipe.summary || '요약 없음')}</p>
        <div class="qa-source-row">
          ${sources.map(src => src.url
            ? `<a href="${safeExternalLink(src.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(src.title || '출처')}</a>`
            : `<span>${escapeHtml(src.title || '출처')}</span>`).join('')}
        </div>
        ${flags.length ? `<details class="qa-detail"><summary>수정 포인트 보기</summary>${flags.map(f => `<p><strong>${escapeHtml(f.label)}</strong> — ${escapeHtml(f.detail)}</p>`).join('')}</details>` : ''}
        <div class="qa-actions">
          <button onclick="openRecipeFromQA('${escapeJsString(menu.name)}')">앱에서 레시피 보기</button>
          <button onclick="copyRecipeKey('${escapeJsString(menu.id || menu.name)}')">ID 복사</button>
        </div>
      </div>`;
  }

  function runRecipeQA() {
    const result = document.getElementById('recipeQaResult');
    if (!result) return;
    const q = (document.getElementById('recipeQaSearch')?.value || '').trim().toLowerCase();
    const type = document.getElementById('recipeQaType')?.value || '전체';
    const status = document.getElementById('recipeQaStatus')?.value || '전체';
    let rows = buildRecipeQaRows();
    if (type !== '전체') rows = rows.filter(r => r.menu.type === type);
    if (status !== '전체') rows = rows.filter(r => r.status === status);
    if (q) {
      rows = rows.filter(r => {
        const raw = JSON.stringify({ name:r.menu.name, type:r.menu.type, recipe:r.recipe }).toLowerCase();
        return raw.includes(q);
      });
    }
    rows.sort((a, b) => {
      const rank = { fail:0, warn:1, pass:2 };
      return rank[a.status] - rank[b.status] || a.menu.type.localeCompare(b.menu.type, 'ko') || a.menu.name.localeCompare(b.menu.name, 'ko');
    });
    result.innerHTML = `
      <div class="qa-result-count">표시 중: <strong>${rows.length}</strong>개</div>
      <div class="qa-list">${rows.map(renderRecipeQaRow).join('')}</div>`;
  }

  function renderRecipeQA() {
    const c = document.getElementById('recipeQaContent');
    if (!c) return;
    const rows = buildRecipeQaRows();
    const summary = recipeQaSummary(rows);
    c.innerHTML = renderRecipeQaControls(summary) + '<div id="recipeQaResult"></div>';
    runRecipeQA();
  }

  function openRecipeFromQA(menuName) {
    const menu = findMenuByName(menuName);
    if (!menu) {
      showToast('메뉴를 찾지 못했습니다');
      return;
    }
    currentMenu = menu;
    switchPanel('recipe');
  }

  function copyRecipeKey(key) {
    const text = String(key || '');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => showToast('ID를 복사했습니다'));
    } else {
      showToast(text);
    }
  }

  function makeRecipeQaReport() {
    const rows = buildRecipeQaRows();
    return {
      generatedAt: new Date().toISOString(),
      summary: recipeQaSummary(rows),
      items: rows.map(r => ({
        id: r.menu.id || r.menu.name,
        name: r.menu.name,
        type: r.menu.type,
        status: r.status,
        verified: r.recipe.verified === true,
        ingredients: r.ingredientCount,
        steps: r.stepCount,
        sources: r.sourceCount,
        flags: r.flags.map(f => ({ level:f.level, label:f.label, detail:f.detail }))
      }))
    };
  }

  function downloadRecipeQaReport() {
    const report = makeRecipeQaReport();
    const blob = new Blob([JSON.stringify(report, null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recipe-qa-report-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }


  // ─── Beta feedback, privacy and consent ───
  let lastClientError = null;
  window.addEventListener('error', event => {
    lastClientError = {
      message: String(event.message || 'client_error').slice(0, 240),
      source: String(event.filename || '').split('/').pop().slice(0, 100),
      line: Number(event.lineno || 0),
      occurredAt: new Date().toISOString(),
    };
    trackEvent('client_error', { errorCode: 'window_error', source: lastClientError.source, line: lastClientError.line });
  });
  window.addEventListener('unhandledrejection', event => {
    lastClientError = { message: String(event.reason?.message || event.reason || 'promise_rejection').slice(0, 240), occurredAt: new Date().toISOString() };
    trackEvent('client_error', { errorCode: 'unhandled_rejection' });
  });

  function activePanelName() {
    const panel = document.querySelector('.panel.active');
    return panel?.id?.replace('panel-', '') || 'unknown';
  }

  function openFeedbackModal(type = '') {
    const modal = document.getElementById('feedbackModal');
    if (type) document.getElementById('feedbackType').value = type;
    document.getElementById('feedbackMessage').value = '';
    document.getElementById('feedbackContact').value = '';
    document.getElementById('feedbackIncludeContext').checked = true;
    const button = document.getElementById('feedbackSubmitBtn');
    button.disabled = false;
    button.textContent = '보내기';
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeFeedbackModal() {
    const modal = document.getElementById('feedbackModal');
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
  }

  function readFeedbackQueue() {
    try { return JSON.parse(localStorage.getItem(STORAGE.feedbackQueue) || '[]'); }
    catch (_) { return []; }
  }

  function writeFeedbackQueue(rows) {
    localStorage.setItem(STORAGE.feedbackQueue, JSON.stringify(rows.slice(-100)));
  }

  async function syncFeedbackQueue() {
    if (!API_BASE_URL || !navigator.onLine) return false;
    const queue = readFeedbackQueue();
    const pending = queue.filter(row => !row.syncedAt).slice(0, 20);
    if (!pending.length) return true;
    let changed = false;
    for (const item of pending) {
      try {
        const response = await fetch(`${API_BASE_URL}/api/feedback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        item.syncedAt = new Date().toISOString();
        changed = true;
      } catch (error) {
        console.warn('feedback sync failed', error);
        break;
      }
    }
    if (changed) writeFeedbackQueue(queue);
    return queue.every(row => row.syncedAt);
  }

  async function submitGeneralFeedback() {
    const message = document.getElementById('feedbackMessage').value.trim();
    if (message.length < 3) {
      showToast('의견 내용을 3자 이상 입력해 주세요');
      return;
    }
    const includeContext = document.getElementById('feedbackIncludeContext').checked;
    const button = document.getElementById('feedbackSubmitBtn');
    button.disabled = true;
    button.textContent = '보내는 중…';
    const feedback = {
      feedbackId: makeId('feedback'),
      type: document.getElementById('feedbackType').value,
      message: message.slice(0, 1000),
      contact: document.getElementById('feedbackContact').value.trim().slice(0, 120),
      anonymousUserId: getAnonymousUserId(),
      sessionId: getSessionId(),
      occurredAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      context: includeContext ? {
        panel: activePanelName(),
        menuId: currentMenu?.id || '',
        menuName: currentMenu?.name || '',
        recommendationConditions: sanitizeAnalyticsProperties(answers || {}),
        lastError: lastClientError,
        userAgentFamily: /Android/i.test(navigator.userAgent) ? 'android' : /iPhone|iPad/i.test(navigator.userAgent) ? 'ios' : 'web',
      } : null,
    };
    const queue = readFeedbackQueue();
    queue.push(feedback);
    writeFeedbackQueue(queue);
    const fullySynced = await syncFeedbackQueue();
    trackEvent('feedback_submitted', { feedbackType: feedback.type, panel: activePanelName(), synced: fullySynced });
    closeFeedbackModal();
    showToast(fullySynced ? '의견을 전송했어요' : '의견을 기기에 보관했어요. 연결되면 다시 전송합니다.');
  }

  function openPrivacyModal() {
    const toggle = document.getElementById('analyticsConsentToggle');
    if (toggle) toggle.checked = getAnalyticsConsent() === true;
    const modal = document.getElementById('privacyModal');
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closePrivacyModal() {
    const modal = document.getElementById('privacyModal');
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
  }

  function setAnalyticsConsent(enabled) {
    localStorage.setItem(STORAGE.analyticsConsent, enabled ? 'true' : 'false');
    if (!enabled) {
      localStorage.removeItem(STORAGE.analytics);
    } else {
      trackEvent('analytics_consent_changed', { enabled: true });
      syncAnalyticsEvents();
    }
    const banner = document.getElementById('analyticsConsentBanner');
    if (banner) banner.hidden = true;
    const toggle = document.getElementById('analyticsConsentToggle');
    if (toggle) toggle.checked = enabled;
    showToast(enabled ? '선택 분석 데이터 수집에 동의했어요' : '선택 분석 데이터 수집을 껐어요');
  }

  function respondAnalyticsConsent(enabled) {
    setAnalyticsConsent(enabled);
    if (enabled) {
      trackEvent('app_open', { returning: diary.length > 0 || favorites.length > 0 });
      if (getVisitCount() > 1) trackEvent('user_returned', { previousUseCount: getVisitCount() - 1 });
    }
  }

  function renderAnalyticsConsentPrompt() {
    const banner = document.getElementById('analyticsConsentBanner');
    if (!banner) return;
    banner.hidden = getAnalyticsConsent() !== null;
  }

  function downloadLocalData() {
    const exportData = {
      exportedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      anonymousUserId: getAnonymousUserId(),
      preferences: personalProfile || loadProfile(),
      favorites,
      mealRecords: serializeDiaryRecords(diary),
      rejectionReasons: (() => { try { return JSON.parse(localStorage.getItem(STORAGE.rejectReasons) || '[]'); } catch (_) { return []; } })(),
      analyticsConsent: getAnalyticsConsent() === true,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `todays-plate-data-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast('내 데이터 파일을 저장했어요');
  }

  window.addEventListener('online', () => {
    syncAnalyticsEvents();
    syncFeedbackQueue();
  });

  // ─── Init ───
  async function initApp() {
    await loadAppData();
    sanitizeMenuDatabase();
    window.__curatedCoverageReport = getCuratedCoverageReport();
    enrichMenusForRecommendation();
    initDiary();
    compactProfileAgainstMenuDatabase();
    saveProfile();
    const visits = getVisitCount() + 1;
    localStorage.setItem(STORAGE.visitCount, String(visits));
    updateHomeContext();
    renderToday();
    renderAnalyticsConsentPrompt();
    if (getAnalyticsConsent() === true) {
      trackEvent('app_open', { returning: visits > 1, mealRecordCount: diary.length, favoriteCount: favorites.length });
      if (visits > 1) trackEvent('user_returned', { previousUseCount: visits - 1 });
      syncAnalyticsEvents();
    }
    syncFeedbackQueue();
  }

  initApp().then(() => {
    document.body.dataset.appReady = 'true';
    if (!document.body.dataset.panel) document.body.dataset.panel = 'home';
  }).catch(error => {
    console.error('앱 초기화 실패:', error);
    document.body.dataset.appReady = 'error';
    const activePanel = document.querySelector('.panel.active') || document.getElementById('panel-home');
    if (activePanel) {
      activePanel.innerHTML = `
        <div class="fatal-state" role="alert">
          <div class="fatal-state-mark">!</div>
          <h1>앱을 불러오지 못했어요</h1>
          <p>네트워크 연결을 확인한 뒤 다시 시도해 주세요.</p>
          <button type="button" onclick="location.reload()">다시 시도</button>
        </div>`;
    }
  });


  // ─── v4.6 Nearby search evidence filter ───
  // 메뉴명 검색 결과라는 이유만으로 모든 장소를 신뢰하지 않습니다.
  // 1) 상호명에서 메뉴/별칭이 확인되는 장소
  // 2) 메뉴명 검색으로 반환됐고 업종이 해당 요리군과 일치하는 장소
  // 3) 가까운 전문점 후보
  // 순으로 구분하며, 판매가 확인되지 않은 장소에는 추천도 표현을 사용하지 않습니다.
  function normalizePlaceSearchText(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/bbq/g, '바비큐')
      .replace(/barbecue/g, '바비큐')
      .replace(/바베큐/g, '바비큐')
      .replace(/[^0-9a-z가-힣]/g, '');
  }

  function menuSearchAliases(menu) {
    const name = compactText(menu?.name);
    const core = coreDishName(menu);
    const loaded = DISH_TO_RESTAURANT_KEYWORDS[name] || DISH_TO_RESTAURANT_KEYWORDS[core] || [];
    const aliases = [name, core, ...loaded];
    const compact = normalizePlaceSearchText(name);

    if (/바비큐립|폭립|립바비큐/.test(compact)) {
      aliases.push('바비큐 립', '바베큐 립', 'BBQ 립', '폭립', '바비큐 폭립', '바베큐 폭립');
    }
    if (/라조기/.test(compact)) aliases.push('라조기');
    if (/유린기/.test(compact)) aliases.push('유린기');
    if (/깐풍기/.test(compact)) aliases.push('깐풍기');

    return uniq(aliases).filter(value => value.length >= 2).slice(0, 8);
  }

  function isCafeCompatibleMenu(menu) {
    const text = normalizePlaceSearchText(`${menu?.name || ''} ${menu?.desc || ''}`);
    return /브런치|토스트|샌드위치|샐러드|베이글|팬케이크|와플|크루아상|커피|라떼|스무디|아사이|요거트|디저트|케이크|푸딩/.test(text);
  }

  function dishVenueProfile(menu) {
    const name = normalizePlaceSearchText(menu?.name);
    const origin = normalizePlaceSearchText(menu?.origin);

    if (/바비큐립|폭립|립바비큐/.test(name)) {
      return {
        venueQueries: ['미국식 바비큐', '아메리칸 바베큐', '바비큐 전문점', '폭립', '스테이크하우스', '그릴 레스토랑', '패밀리레스토랑'],
        venueTerms: ['바비큐', '바베큐', 'bbq', '폭립', '립', '스테이크', '그릴', '패밀리레스토랑', '아메리칸', '텍사스', '양식', '레스토랑'],
        rejectTerms: ['브런치', '카페', '커피', '디저트', '베이커리', '제과'],
        allowCafe: false,
      };
    }

    if (menu?.type === '양식') {
      if (/파스타|볼로네제|라구|라자냐|리조또|뇨끼/.test(name)) {
        return { venueQueries:['이탈리안', '파스타', '트라토리아', '이탈리안 레스토랑'], venueTerms:['이탈리안','파스타','트라토리아','라자냐','리조또','뇨끼','양식','레스토랑'], rejectTerms:['한식','중식','일식'], allowCafe:false };
      }
      if (/피자/.test(name)) {
        return { venueQueries:['피자', '피제리아', '화덕피자'], venueTerms:['피자','피제리아','화덕','양식','레스토랑'], rejectTerms:['한식','중식','일식'], allowCafe:false };
      }
      if (/버거|햄버거/.test(name)) {
        return { venueQueries:['수제버거', '버거'], venueTerms:['버거','햄버거','양식','레스토랑'], rejectTerms:['카페','커피','디저트'], allowCafe:false };
      }
      if (/스테이크|로스트|그릴/.test(name)) {
        return { venueQueries:['스테이크하우스', '그릴 레스토랑', '패밀리레스토랑'], venueTerms:['스테이크','그릴','패밀리레스토랑','비스트로','양식','레스토랑'], rejectTerms:['브런치','카페','커피','디저트'], allowCafe:false };
      }
      if (isCafeCompatibleMenu(menu)) {
        return { venueQueries:['브런치 카페', '브런치', '카페'], venueTerms:['브런치','카페','베이커리','샌드위치','샐러드'], rejectTerms:[], allowCafe:true };
      }
      return { venueQueries:['양식 레스토랑', '비스트로', '패밀리레스토랑'], venueTerms:['양식','레스토랑','비스트로','패밀리레스토랑'], rejectTerms:['카페','커피','디저트','베이커리'], allowCafe:false };
    }

    if (menu?.type === '중식') {
      if (/마라/.test(name)) return { venueQueries:['마라탕', '마라샹궈', '마라 전문점', '중화요리'], venueTerms:['마라','중식','중화','중국집','반점'], rejectTerms:['카페','커피','디저트'], allowCafe:false };
      if (/딤섬|만두|소롱포|샤오롱바오/.test(name)) return { venueQueries:['딤섬 전문점', '중화요리', '중국집'], venueTerms:['딤섬','중식','중화','중국집','반점','홍콩'], rejectTerms:['카페','커피','디저트'], allowCafe:false };
      return { venueQueries:['중화요리', '중국집', '반점'], venueTerms:['중식','중화','중국집','반점','사천','광동','홍콩'], rejectTerms:['마라탕전문','카페','커피','디저트'], allowCafe:false };
    }

    if (menu?.type === '한식') {
      return { venueQueries:['한식', '백반', '한식당'], venueTerms:['한식','백반','한정식','국밥','찌개','탕','구이','분식'], rejectTerms:['카페','커피','디저트'], allowCafe:false };
    }

    if (menu?.type === '일식') {
      return { venueQueries:['일식', '일본식당', '이자카야'], venueTerms:['일식','스시','초밥','라멘','우동','돈카츠','돈까스','이자카야','일본'], rejectTerms:['카페','커피','디저트'], allowCafe:false };
    }

    if (/베트남/.test(origin) || /쌀국수|반미/.test(name)) return { venueQueries:['베트남 음식', '쌀국수', '베트남 식당'], venueTerms:['베트남','쌀국수','반미'], rejectTerms:['카페','커피','디저트'], allowCafe:false };
    if (/멕시코/.test(origin) || /타코|부리또|퀘사디야|케사디야/.test(name)) return { venueQueries:['멕시칸', '타코', '부리또'], venueTerms:['멕시칸','타코','부리또','퀘사디야','케사디야'], rejectTerms:['카페','커피','디저트'], allowCafe:false };
    if (/태국/.test(origin) || /팟타이|똠얌/.test(name)) return { venueQueries:['태국 음식', '타이 레스토랑'], venueTerms:['태국','타이','팟타이','똠얌'], rejectTerms:['카페','커피','디저트'], allowCafe:false };
    if (/인도/.test(origin) || /커리|비리야니/.test(name)) return { venueQueries:['인도 음식', '인도 커리'], venueTerms:['인도','커리','비리야니'], rejectTerms:['카페','커피','디저트'], allowCafe:false };

    return { venueQueries:['세계음식 식당', '에스닉 레스토랑'], venueTerms:['세계음식','에스닉','레스토랑'], rejectTerms:['카페','커피','디저트'], allowCafe:false };
  }

  function cuisineCandidateQueries(menu) {
    return uniq(dishVenueProfile(menu).venueQueries).slice(0, 7);
  }

  function strictMenuPlaceQueries(menu) {
    return menuSearchAliases(menu);
  }

  function placeHardReject(place, menu) {
    const profile = dishVenueProfile(menu || currentMenu || {});
    const category = normalizePlaceSearchText(`${place.category_name || ''} ${place.category_group_name || ''}`);
    const name = normalizePlaceSearchText(place.place_name || '');
    const text = `${name} ${category}`;

    if (/마트|슈퍼|편의점|식자재|정육점|수산시장|식품|반찬가게|배달대행|도매|소매|제조|학원|숙박|호텔|펜션/.test(text)) return true;
    if (!profile.allowCafe && (/카페|커피|디저트|베이커리|제과/.test(text) || place.category_group_code === 'CE7')) return true;
    if ((profile.rejectTerms || []).some(term => text.includes(normalizePlaceSearchText(term)))) return true;
    return false;
  }

  function evaluatePlaceEvidence(place, menu, query, requestedTier) {
    if (placeHardReject(place, menu)) return null;
    const profile = dishVenueProfile(menu);
    const placeText = normalizePlaceSearchText(`${place.place_name || ''} ${place.category_name || ''} ${place.category_group_name || ''}`);
    const aliases = menuSearchAliases(menu).map(normalizePlaceSearchText).filter(value => value.length >= 2);
    const queryText = normalizePlaceSearchText(query);
    const strongNameMatch = aliases.some(alias => normalizePlaceSearchText(place.place_name || '').includes(alias));
    const venueMatch = (profile.venueTerms || []).some(term => placeText.includes(normalizePlaceSearchText(term)));

    if (strongNameMatch) return { tier:'verified_name_match', evidenceRank:0, menuAvailability:'name_evidence' };
    if (requestedTier === 'exact' && venueMatch) return { tier:'menu_query_candidate', evidenceRank:1, menuAvailability:'unknown' };
    if (requestedTier === 'cuisine_candidate' && venueMatch) return { tier:'cuisine_candidate', evidenceRank:2, menuAvailability:'unknown' };

    // 카카오가 정확 메뉴 검색으로 반환했더라도 업종 근거가 전혀 없으면 노출하지 않습니다.
    if (requestedTier === 'exact' && queryText && placeText.includes(queryText)) {
      return { tier:'verified_name_match', evidenceRank:0, menuAvailability:'name_evidence' };
    }
    return null;
  }

  function placeTierRank(tier) {
    if (tier === 'verified_name_match') return 0;
    if (tier === 'menu_query_candidate') return 1;
    if (tier === 'cuisine_candidate') return 2;
    return 3;
  }

  async function searchPlacesForExactMenuOnly(menu, location) {
    const exactQueries = strictMenuPlaceQueries(menu);
    const venueQueries = cuisineCandidateQueries(menu);
    const radiusSteps = getNearbySearchRadiusSteps();
    const results = new Map();
    const logs = [];

    async function collect(queries, requestedTier, targetCount, sorts) {
      for (const radius of radiusSteps) {
        for (const query of queries) {
          for (const sort of sorts) {
            let places = [];
            try {
              places = await searchPlacesKakao(query, location, { radius, sort, tier: requestedTier, size:15, pageLimit:2 });
            } catch (error) {
              logs.push({ query:`${requestedTier === 'exact' ? '[메뉴]' : '[업종]'} ${query}`, radius, sort, tier:requestedTier, count:0, error:error.message || String(error) });
              continue;
            }

            let acceptedCount = 0;
            places.forEach(place => {
              const evidence = evaluatePlaceEvidence(place, menu, query, requestedTier);
              if (!evidence) return;
              acceptedCount += 1;
              const key = place.id || `${place.place_name}|${place.road_address_name || place.address_name}`;
              const distance = Number(place.distance || 99999);
              const candidate = {
                ...place,
                query,
                radius,
                sort,
                ...evidence,
                score: 100 - evidence.evidenceRank * 25 - Math.min(20, distance / 800),
              };
              const previous = results.get(key);
              if (!previous || placeTierRank(candidate.tier) < placeTierRank(previous.tier) || (placeTierRank(candidate.tier) === placeTierRank(previous.tier) && candidate.score > previous.score)) {
                results.set(key, candidate);
              }
            });
            logs.push({ query:`${requestedTier === 'exact' ? '[메뉴]' : '[업종]'} ${query}`, radius, sort, tier:requestedTier, count:acceptedCount });
          }
          if (results.size >= targetCount) break;
        }
        if (results.size >= targetCount) break;
      }
    }

    // 메뉴명·표기 변형을 먼저 확인합니다. 카페 등 업종 불일치 결과는 여기서 제거됩니다.
    await collect(exactQueries, 'exact', 6, ['accuracy', 'distance']);
    // 결과가 부족할 때만 메뉴에 맞는 전문 업종으로 확장합니다. 양식 전체/브런치로 확장하지 않습니다.
    if (results.size < 8) await collect(venueQueries, 'cuisine_candidate', 10, ['distance']);

    lastNearbySearchLog = logs;
    return Array.from(results.values())
      .sort((a, b) => placeTierRank(a.tier) - placeTierRank(b.tier) || Number(a.distance || 99999) - Number(b.distance || 99999) || b.score - a.score)
      .slice(0, 10);
  }

  function qualityBadgesForPlace(place, menu) {
    if (place.tier === 'verified_name_match') return ['상호명 일치', '판매 여부 확인'];
    if (place.tier === 'menu_query_candidate') return ['메뉴명 검색 결과', '판매 여부 확인'];
    return [`${menu.type} 전문점 후보`, '판매 여부 확인'];
  }

  function restaurantFitLabel(value, tier) {
    if (tier === 'verified_name_match') return '상호명 일치';
    if (tier === 'menu_query_candidate') return '메뉴 검색 후보';
    if (tier === 'cuisine_candidate') return '전문점 후보';
    return '';
  }

  function formatPlace(place, menu) {
    const distance = parseInt(place.distance, 10);
    const dist = Number.isFinite(distance) ? (distance >= 1000 ? `${(distance / 1000).toFixed(1)}km` : `${distance}m`) : '';
    const categoryParts = (place.category_name || '').split('>').map(value => value.trim()).filter(Boolean);
    const category = categoryParts[categoryParts.length - 1] || menu.type;
    const verified = place.tier === 'verified_name_match';
    const queryCandidate = place.tier === 'menu_query_candidate';
    return {
      id: place.id || '',
      emoji: menu.emoji,
      name: place.place_name,
      dist,
      score: place.score,
      fitLabel: restaurantFitLabel(place.score, place.tier),
      price: '',
      addr: place.road_address_name || place.address_name || '',
      subcategory: category,
      placeUrl: place.place_url,
      phone: place.phone || '',
      query: place.query || '',
      tier: place.tier || 'cuisine_candidate',
      availabilityNote: verified
        ? `상호명에 '${menu.name}' 관련 표현이 있습니다. 실제 판매 여부와 영업 상태를 확인하세요.`
        : queryCandidate
          ? `'${menu.name}' 검색으로 확인된 ${menu.type} 식당입니다. 메뉴판 또는 전화로 판매 여부를 확인하세요.`
          : `가까운 ${menu.type} 전문점 후보입니다. '${menu.name}' 판매를 보장하지 않습니다.`,
      badges: qualityBadgesForPlace(place, menu),
    };
  }

  function renderNearbySearchDebug() {
    if (!lastNearbySearchLog.length) return '';
    const aggregated = new Map();
    lastNearbySearchLog.forEach(item => {
      const key = `${item.query}|${item.radius}|${item.sort}`;
      const previous = aggregated.get(key) || { ...item, count:0 };
      previous.count += Number(item.count || 0);
      if (item.error) previous.error = item.error;
      aggregated.set(key, previous);
    });
    const rows = Array.from(aggregated.values()).slice(0, 18).map(item => `
      <div class="nearby-debug-row">
        <span>${escapeHtml(item.query)}</span>
        <span>${Number(item.radius).toLocaleString()}m</span>
        <span>${escapeHtml(item.sort)}</span>
        <strong>${item.error ? 'ERR' : item.count + '개'}</strong>
      </div>`).join('');
    return `
      <details class="nearby-debug">
        <summary>검색 진단 보기</summary>
        <div class="nearby-debug-head"><span>검색 단계</span><span>반경</span><span>정렬</span><span>채택</span></div>
        ${rows}
      </details>`;
  }
