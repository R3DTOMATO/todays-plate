"""Local UI regression with a fake identity/Firestore boundary; no live accounts or writes.

python -m http.server 9154
PLATE_BROWSER=/path/to/chromium python scripts/test-entry-flow.py
Requires Playwright; omit PLATE_BROWSER to use its installed Chromium.
"""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = os.environ.get('PLATE_TEST_URL', 'http://127.0.0.1:9154')
AUTH = r"""
export const FIREBASE_READY=true, auth={}, db={};
let user=null; const listeners=new Set();
export const getCurrentUser=()=>user;
export const isSignedIn=()=>!!user;
export const waitForAuth=()=>Promise.resolve(user);
export function onAuthChange(fn){listeners.add(fn);queueMicrotask(()=>fn(user));return ()=>listeners.delete(fn);}
function change(next){user=next;listeners.forEach(fn=>fn(user));}
window.__setUser=change;
const fixture={uid:'account-a',displayName:'테스터',email:'test@example.test'};
export const signInWithEmail=async()=>{change(fixture);return fixture;};
export const signUpWithEmail=signInWithEmail;
export const signInWithGoogle=signInWithEmail;
export const signInWithApple=signInWithEmail;
export const resetPassword=async()=>{};
export const signOutUser=async()=>change(null);
export const deleteAccount=async()=>change(null);
export const requireAuth=async()=>user;
window.appAuth={getCurrentUser,isSignedIn,onAuthChange,waitForAuth,requireAuth};
"""
FIRESTORE = r"""
export const getFirestore=()=>({});
export const doc=(db,...parts)=>({path:parts.join('/')});
export const collection=doc;
export const serverTimestamp=()=>new Date().toISOString();
export async function getDoc(ref){
 const uid=ref.path.split('/')[1];
 const delay=window.__readDelay?.[uid]||0;
 if(delay)await new Promise(r=>setTimeout(r,delay));
 if(window.__failRead)throw Error('read unavailable');
 const data=JSON.parse(localStorage.getItem('fixture:'+ref.path)||'null');
 return {exists:()=>!!data,data:()=>data};
}
export async function setDoc(ref,value){
 if(window.__failWrite)throw Error('write unavailable');
 localStorage.setItem('fixture:'+ref.path,JSON.stringify(value));
}
export const getDocs=async()=>({docs:[]});
export const deleteDoc=async()=>{};
export const addDoc=async()=>({id:'fixture'});
export const updateDoc=async()=>{};
export const query=(...args)=>args;
export const where=query, orderBy=query, limit=query, startAt=query, endAt=query;
export const getCountFromServer=async()=>({data:()=>({count:0})});
export const onSnapshot=()=>()=>{};
export const runTransaction=async()=>{};
export const increment=n=>n;
export class Timestamp{static fromDate(d){return new Timestamp(d)}constructor(d){this.d=d}toDate(){return this.d}}
"""
FIREBASE_APP = 'export const initializeApp=()=>({}); export const getApps=()=>[{}];'
STORAGE = '''export const getStorage=()=>({}); export const ref=()=>({});
export const uploadBytes=async()=>{}; export const getDownloadURL=async()=>'';
export const deleteObject=async()=>{};'''

def run():
    checks = 0
    def check(name, condition):
        nonlocal checks
        assert condition, name
        checks += 1
        print('PASS', name)

    with sync_playwright() as p:
        launch = {'args':['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--disable-gpu']}
        if os.environ.get('PLATE_BROWSER'):
            launch['executable_path'] = os.environ['PLATE_BROWSER']
        browser = p.chromium.launch(**launch)
        page = browser.new_page(viewport={'width':393,'height':852})
        errors=[]
        page.on('pageerror', lambda err: errors.append(str(err)))
        def route(req):
            url=req.request.url
            if os.environ.get('PLATE_FONT_DIR') and url.startswith(BASE+'/__test-fonts/'):
                req.fulfill(path=str(Path(os.environ['PLATE_FONT_DIR']) / url.split('/__test-fonts/')[1]))
            elif url.startswith(BASE+'/js/auth.js'):
                req.fulfill(content_type='text/javascript',body=AUTH)
            elif url.startswith(BASE+'/js/config.js'):
                req.fulfill(content_type='text/javascript',body='window.APP_CONFIG={};window.FIREBASE_CONFIG={apiKey:"test",projectId:"test"};')
            elif 'firebase-firestore.js' in url:
                req.fulfill(content_type='text/javascript',body=FIRESTORE)
            elif 'firebase-app.js' in url:
                req.fulfill(content_type='text/javascript',body=FIREBASE_APP)
            elif 'firebase-storage.js' in url:
                req.fulfill(content_type='text/javascript',body=STORAGE)
            elif not url.startswith(BASE):
                req.abort()
            else:
                req.continue_()
        page.route('**/*',route)
        page.goto(BASE,wait_until='domcontentloaded')
        if os.environ.get('PLATE_FONT_DIR'):
            page.add_style_tag(url=BASE+'/__test-fonts/400.css')
            page.evaluate('document.fonts.ready')
        page.wait_for_function('document.body.dataset.access === "signedout"')
        check('로그인 전 첫 화면만 노출', page.locator('#entryGate').is_visible() and not page.locator('#appShell').is_visible())
        page.evaluate('startQuiz()')
        check('비로그인 추천 진입 차단', page.evaluate('document.body.dataset.panel') != 'quiz')
        out=Path(os.environ.get('PLATE_SCREENSHOTS','/tmp/plate-ui'))
        out.mkdir(parents=True,exist_ok=True)
        page.screenshot(path=str(out/'entry.png'),full_page=True)
        page.click('#entrySignUp')
        check('회원가입 모드 연결', page.locator('#authNicknameRow').is_visible())
        page.fill('#authEmail','test@example.test')
        page.fill('#authPassword','test-password-123')
        page.fill('#authNickname','테스터')
        page.click('#authSubmitBtn')
        page.wait_for_function('document.body.dataset.panel === "onboarding"')
        page.wait_for_function('document.body.dataset.appReady === "true"')
        check('첫 로그인은 입맛 설정', not page.locator('.bottom-nav').is_visible())
        check('기존 6·7·8단계 제거', page.evaluate('TASTE_STEPS.length') == 5)
        page.click('#tasteNext')
        page.get_by_role('button',name='일식',exact=False).click()
        page.screenshot(path=str(out/'taste.png'),full_page=True)
        page.click('#tasteNext')
        page.get_by_role('button',name='우유·유제품',exact=False).click()
        page.click('#tasteNext')
        page.click('#tasteNext')
        page.evaluate('window.__failWrite=true')
        page.click('#tasteNext')
        page.wait_for_selector('#tasteSaveError:not([hidden])')
        check('저장 실패 시 설정 유지', page.evaluate('onboardingDraft.allergens.includes("dairy")') and page.evaluate('document.body.dataset.panel')=='onboarding')
        page.evaluate('window.__failWrite=false')
        page.click('#tasteNext')
        page.wait_for_function('document.body.dataset.panel === "quiz"')
        saved=page.evaluate('JSON.parse(localStorage.getItem("fixture:users/account-a/private/taste"))')
        check('입맛 비공개 문서 저장',saved['allergens']==['dairy'] and 'budgetMax' not in saved and saved['preferredTypes']==['일식'])
        check('추천 질문 3개',page.evaluate('questions.length')==3)
        page.locator('#optionsContainer .option').first.dblclick()
        page.wait_for_function('currentStep === 1')
        check('연속 클릭으로 단계 건너뛰지 않음',page.locator('#questionText').inner_text()=='누구와 먹나요?')
        page.locator('#optionsContainer .option').first.click()
        page.wait_for_function('currentStep === 2')
        page.locator('#optionsContainer .option').first.click()
        page.wait_for_function('document.body.dataset.panel === "result"')
        check('추천 결과 도달',bool(page.locator('.pick-name').inner_text()))
        check('검증되지 않은 적합도 % 제거','추천 적합도' not in page.locator('#topPick').inner_text())
        check('재료 로딩 후 우유 알레르기 제외',page.evaluate('violatesUserRestrictions(findMenuByName("오트밀 볼"))'))
        check('간편 요리에서 족발 제외',page.evaluate('!filterMenus({mode:"집밥"}).some(m=>m.name==="족발")'))
        check('시간 여유 선택으로 족발 허용',page.evaluate('filterMenus({mode:"집밥",includeComplexCooking:true}).some(m=>m.name==="족발")'))
        check('레시피 합계 시간 반영',page.evaluate('getCookingInfo(findMenuByName("족발")).minutes')==155)
        check('예산 초과 이유를 정확히 표시',page.evaluate('getRecommendationReasons({price:20000,type:"한식"},{budget:8000}).some(s=>s.includes("초과"))'))
        page.screenshot(path=str(out/'result.png'),full_page=True)
        page.evaluate('window.__setUser(null)')
        page.wait_for_function('document.body.dataset.access === "signedout"')
        check('로그아웃 시 게이트 복귀',page.locator('#entryGate').is_visible())
        page.evaluate('window.__setUser({uid:"account-a"})')
        page.wait_for_function('document.body.dataset.access === "ready"')
        check('재로그인 시 설문 생략·입맛 복원',page.evaluate('document.body.dataset.panel === "home" && personalProfile.allergens.includes("dairy")'))
        page.evaluate('window.__setUser({uid:"account-b"})')
        page.wait_for_function('document.body.dataset.access === "onboarding"')
        check('다른 계정에 이전 입맛 혼입 없음',page.evaluate('personalProfile.allergens.length === 0'))
        page.evaluate('window.__failRead=true;window.__setUser({uid:"account-c"})')
        page.wait_for_function('document.body.dataset.access === "error"')
        check('조회 실패 시 오류·재시도',page.locator('#entryRetry').is_visible() and not page.locator('#appShell').is_visible())
        page.evaluate('window.__failRead=false;window.__readDelay={"account-a":200};window.__setUser({uid:"account-a"});window.__setUser({uid:"account-b"})')
        page.wait_for_function('document.body.dataset.access === "onboarding"')
        page.wait_for_timeout(300)
        check('늦게 도착한 이전 계정 응답 무시',page.evaluate('activeProfileUid === "account-b" && personalProfile.allergens.length === 0'))
        for width in [320,393,768]:
            page.set_viewport_size({'width':width,'height':852})
            check(f'{width}px 가로 넘침 없음',page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        check('페이지 JavaScript 오류 없음',not errors)
        browser.close()
    print(f'{checks} checks passed; Firebase boundary mocked.')

if __name__ == '__main__':
    run()
