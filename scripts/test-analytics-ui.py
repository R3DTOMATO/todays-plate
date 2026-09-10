"""Mocked browser checks. Run a static server at PLATE_TEST_URL (default :9154).
Requires Playwright; optional PLATE_BROWSER / PLATE_FONT_DIR / PLATE_SCREENSHOTS.
No real accounts, network event writes, or production data.
"""
import importlib.util, json, os
from pathlib import Path
from playwright.sync_api import sync_playwright
spec=importlib.util.spec_from_file_location('entry',Path(__file__).with_name('test-entry-flow.py'))
f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
BASE=os.environ.get('PLATE_TEST_URL','http://127.0.0.1:9154')

def run():
 with sync_playwright() as p:
  launch={'args':['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--disable-gpu']}
  if os.environ.get('PLATE_BROWSER'):launch['executable_path']=os.environ['PLATE_BROWSER']
  browser=p.chromium.launch(**launch);page=browser.new_page(viewport={'width':1440,'height':960},reduced_motion='reduce');errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  report={'generatedAt':'2026-09-10T00:00:00Z','period':{'from':'2026-09-01','to':'2026-09-10'},'overview':{'browsers':4,'sessions':11,'events':129,'excludedEvents':3,'unlinkedEvents':100,'malformedLines':0,'invalidTimestamps':0},'funnel':{'starts':10,'completed':8,'results':8,'selected':3,'recorded':1,'rerolled':1,'completionRate':80,'selectionRate':37.5,'recordRate':33.3},'daily':[{'date':'2026-09-09','browsers':4,'starts':10,'selections':3}],'eventsByName':[{'name':'recommendation_started','count':10}],'errors':[{'event':'client_error','code':'API_HEALTH_001','count':1}],'definitions':'기간 안에 시작한 추천을 집계합니다.'}
  api={'status':200,'queries':[]}
  def route(r):
   url=r.request.url
   if '/__test-fonts/' in url:r.fulfill(path=str(Path(os.environ['PLATE_FONT_DIR'])/url.split('/__test-fonts/')[1]))
   elif url.startswith(BASE+'/js/auth.js'):r.fulfill(content_type='text/javascript',body=f.AUTH)
   elif url.startswith(BASE+'/js/config.js'):r.fulfill(content_type='text/javascript',body='window.APP_CONFIG={API_BASE_URL:'+json.dumps(BASE)+'};window.FIREBASE_CONFIG={apiKey:"test",projectId:"test"};')
   elif 'firebase-firestore.js' in url:r.fulfill(content_type='text/javascript',body=f.FIRESTORE)
   elif 'firebase-app.js' in url:r.fulfill(content_type='text/javascript',body=f.FIREBASE_APP)
   elif 'firebase-storage.js' in url:r.fulfill(content_type='text/javascript',body=f.STORAGE)
   elif '/api/admin/analytics' in url:
    api['queries'].append(url);assert r.request.headers.get('authorization')=='Bearer admin-token'
    r.fulfill(status=api['status'],content_type='application/json',body=json.dumps(report if api['status']==200 else {'error':'not_admin'}))
   elif '/api/health' in url:r.fulfill(content_type='application/json',body='{"ok":true}')
   elif not url.startswith(BASE):r.abort()
   else:r.continue_()
  page.route('**/*',route);page.goto(BASE,wait_until='domcontentloaded')
  page.wait_for_function('document.body.dataset.access==="signedout"&&document.body.dataset.appReady==="true"')
  page.evaluate('''() => {localStorage.setItem('fixture:users/a/private/taste',JSON.stringify({version:1,completed:true,homeCountry:'KR'}));window.__setUser({uid:'a'});}''')
  page.wait_for_function('document.body.dataset.access==="ready"')
  page.evaluate('''() => {
   window.__sent=[];window.__pending=[];const original=window.fetch;
   window.fetch=(url,opts)=>String(url).endsWith('/api/events')?new Promise(resolve=>{const events=JSON.parse(opts.body).events;window.__sent.push(...events);window.__pending.push(()=>resolve(new Response(JSON.stringify({accepted:events.length,duplicates:0,invalid:0,received:events.length,acknowledgedEventIds:events.map(x=>x.eventId)}),{status:202})));}):original(url,opts);
   setAnalyticsConsent(true);
  }''')
  page.wait_for_function('window.__pending.length===1')
  page.evaluate("trackEvent('while_uploading')")
  def drain():
   for _ in range(20):
    page.evaluate('window.__pending.splice(0).forEach(fn=>fn())');page.wait_for_timeout(30)
    if page.evaluate('!analyticsSyncRunning'):break
   assert page.evaluate('readAnalyticsEvents().every(x=>x.syncedAt)')
  drain();assert page.evaluate('window.__sent.some(x=>x.name==="while_uploading")')
  print('PASS pending event survives upload acknowledgement')
  page.evaluate('startQuiz()');first=page.evaluate('analyticsRecommendationId');assert first
  for step in range(3):
   page.locator('#optionsContainer .option').first.click()
   if step<2:page.wait_for_function(f'currentStep==={step+1}')
  page.wait_for_function('document.body.dataset.panel==="result"');page.evaluate('acceptCurrentMenu();openRecordModal()')
  page.evaluate('confirmRecord()');page.wait_for_function('!recordSaving');drain()
  saved=page.evaluate('readAnalyticsEvents().find(x=>x.name==="meal_record_created")');assert saved['recommendationId']==first and saved['properties']['recordId']
  print('PASS recommendation to selected-menu record linked')
  page.evaluate('startQuiz()');assert page.evaluate('analyticsRecommendationId')!=first
  page.evaluate("localStorage.setItem('todaysplate_analytics_test_v1','true');trackEvent('test_marked')");drain();assert page.evaluate('window.__sent.find(x=>x.name==="test_marked").isTestTraffic')
  page.evaluate("trackEvent('revoke_in_flight');setAnalyticsConsent(false)");page.evaluate('window.__pending.splice(0).forEach(fn=>fn())');page.wait_for_timeout(50)
  assert page.evaluate('readAnalyticsEvents().length')==0
  print('PASS test marker and in-flight consent revocation')
  page.goto(BASE+'/admin/analytics.html',wait_until='domcontentloaded')
  if os.environ.get('PLATE_FONT_DIR'):page.add_style_tag(url=BASE+'/__test-fonts/400.css')
  assert not page.locator('#report').is_visible()
  page.evaluate('window.__setUser({uid:"admin",getIdToken:async()=>"admin-token"})')
  page.wait_for_selector('#report:not([hidden])');assert page.locator('#events').inner_text()=='129'
  for width in [393,768,1440]:
   page.set_viewport_size({'width':width,'height':960});page.evaluate('document.fonts.ready')
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
   out=Path(os.environ.get('PLATE_SCREENSHOTS','/tmp/plate-analytics-ui'));out.mkdir(parents=True,exist_ok=True)
   page.screenshot(path=str(out/f'analytics-{width}.png'),full_page=True)
  page.locator('#includeTests').check();page.locator('#refresh').click();page.wait_for_function('!document.querySelector("#refresh").disabled');assert 'includeTests=true' in api['queries'][-1]
  api['status']=403;page.locator('#refresh').click();page.wait_for_selector('#status.error');assert not page.locator('#report').is_visible()
  print('PASS responsive dashboard, filters, authenticated fetch, forbidden response clears report')
  page.evaluate('window.__setUser(null)');assert page.locator('#loginPanel').is_visible();assert not page.locator('#report').is_visible()
  assert not errors,errors
  browser.close();print('Analytics browser checks passed.')
if __name__=='__main__':run()
