"""Responsive UI checks with mocked Firebase; no live accounts or remote writes.

Run a local static server, then: python scripts/test-responsive.py
Uses the same PLATE_TEST_URL, PLATE_BROWSER, PLATE_FONT_DIR and
PLATE_SCREENSHOTS options as test-entry-flow.py. Requires Playwright.
"""
import importlib.util
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

spec = importlib.util.spec_from_file_location('entry_fixture', Path(__file__).with_name('test-entry-flow.py'))
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)
BASE = os.environ.get('PLATE_TEST_URL', 'http://127.0.0.1:9154')
OUT = Path(os.environ.get('PLATE_SCREENSHOTS', '/tmp/plate-responsive'))


def run():
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        launch = {'args': ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--disable-gpu']}
        if os.environ.get('PLATE_BROWSER'):
            launch['executable_path'] = os.environ['PLATE_BROWSER']
        browser = p.chromium.launch(**launch)
        page = browser.new_page(reduced_motion='reduce')
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))

        def route(request):
            url = request.request.url
            if os.environ.get('PLATE_FONT_DIR') and url.startswith(BASE + '/__test-fonts/'):
                request.fulfill(path=str(Path(os.environ['PLATE_FONT_DIR']) / url.split('/__test-fonts/')[1]))
            elif url.startswith(BASE + '/js/auth.js'):
                request.fulfill(content_type='text/javascript', body=fixture.AUTH)
            elif url.startswith(BASE + '/js/config.js'):
                request.fulfill(content_type='text/javascript', body='window.APP_CONFIG={};window.FIREBASE_CONFIG={apiKey:"test",projectId:"test"};')
            elif 'firebase-firestore.js' in url:
                request.fulfill(content_type='text/javascript', body=fixture.FIRESTORE)
            elif 'firebase-app.js' in url:
                request.fulfill(content_type='text/javascript', body=fixture.FIREBASE_APP)
            elif 'firebase-storage.js' in url:
                request.fulfill(content_type='text/javascript', body=fixture.STORAGE)
            elif not url.startswith(BASE):
                request.abort()
            else:
                request.continue_()

        page.route('**/*', route)
        page.goto(BASE, wait_until='domcontentloaded')
        if os.environ.get('PLATE_FONT_DIR'):
            page.add_style_tag(url=BASE + '/__test-fonts/400.css')
        page.wait_for_function('document.body.dataset.access === "signedout" && document.body.dataset.appReady === "true"')

        def capture(name, width):
            page.evaluate('document.fonts.ready')
            page.screenshot(path=str(OUT / f'{width}-{name}.png'), full_page=True)
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), f'{width} {name}: horizontal overflow'
            print('PASS', width, name)

        def inside_viewport(selector):
            box = page.locator(selector).bounding_box()
            assert box and box['x'] >= -1 and box['x'] + box['width'] <= page.viewport_size['width'] + 1, selector

        for width in [320, 393, 768, 1024, 1440]:
            page.set_viewport_size({'width': width, 'height': 900 if width >= 768 else 852})
            capture('entry', width)
            page.click('#entrySignIn')
            inside_viewport('#authModal .modal')
            page.click('#authCloseBtn')

        page.evaluate('''() => {
            localStorage.setItem('fixture:users/account-a/private/taste', JSON.stringify({
                version: 1, completed: true, homeCountry: 'KR', preferredTypes: [],
                allergens: [], excludedIngredients: [], dietRestrictions: []
            }));
            window.__setUser({uid: 'account-a'});
        }''')
        page.wait_for_function('document.body.dataset.access === "ready"')
        page.evaluate('respondAnalyticsConsent(false)')
        page.wait_for_function('!document.querySelector("#toast").classList.contains("show")')

        for width in [320, 393, 768, 1024, 1440]:
            page.set_viewport_size({'width': width, 'height': 900 if width >= 768 else 852})
            page.evaluate('switchPanel("home")')
            capture('home', width)
            nav = page.locator('.bottom-nav').bounding_box()
            if width >= 768:
                assert nav['x'] == 0 and nav['height'] == page.viewport_size['height']
                assert page.locator('.quick-decision').bounding_box()['x'] >= nav['width']
            else:
                assert nav['y'] > page.viewport_size['height'] / 2
            page.click('.quick-decision-cta')
            capture('quiz', width)
            for step in range(3):
                page.locator('#optionsContainer .option').first.click()
                if step < 2:
                    page.wait_for_function(f'currentStep === {step + 1}')
            page.wait_for_function('document.body.dataset.panel === "result"')
            capture('result', width)
            page.locator('.figma-pick-cta').click(trial=True)
            page.evaluate('currentMenu=findMenuByName("김치찌개"); switchPanel("recipe")')
            capture('recipe', width)
            inside_viewport('.rc-top-actions')
            page.locator('#rcStartBtn').click()
            assert page.locator('#rcStartBtn').inner_text() == '요리 끝내기'
            page.locator('#rcSteps .rc-step').first.click()
            assert page.locator('#rcSteps .rc-step.is-done').count() == 1
            page.locator('#rcStartBtn').click()
            page.evaluate('switchPanel("nearby")')
            capture('nearby', width)
            inside_viewport('.nb-controls')
            if width >= 1024:
                map_box = page.locator('.nb-map').bounding_box()
                list_box = page.locator('.nb-sheet').bounding_box()
                assert map_box['x'] + map_box['width'] <= list_box['x']
            for panel in ['favorites', 'diary', 'profile']:
                page.locator(f'.nav-item[data-panel="{panel}"]').click()
                capture(panel, width)
            page.evaluate('openGroupVote()')
            capture('group', width)
            page.evaluate('openOnboarding()')
            capture('taste', width)
            inside_viewport('#tasteNext')
            assert not page.locator('.bottom-nav').is_visible()
            page.evaluate('switchPanel("home")')

        # Emulate a map SDK to test resizing without an API key or location access.
        page.evaluate('''async () => {
            window.APP_CONFIG.KAKAO_JS_KEY = 'fixture';
            window.__mapLayouts = 0;
            window.kakao = {maps: {
                Map: class {
                    constructor(_, opts) { this.center = opts.center; window.__map = this; }
                    getCenter() { return this.center; }
                    setCenter(value) { this.center = value; }
                    relayout() { window.__mapLayouts++; }
                    setZoomable() {}
                },
                LatLng: class { constructor(lat, lng) { this.lat = lat; this.lng = lng; } },
                LatLngBounds: class { extend() {} },
                CustomOverlay: class { setMap() {} }
            }};
            switchPanel('nearby');
            const module = await import('./js/kakao-map.js?responsive-fixture');
            await module.renderKakaoMap({lat: 37.5, lng: 127}, [], () => {});
        }''')
        page.wait_for_function('window.__mapLayouts > 0')
        page.wait_for_timeout(100)  # Drain the existing delayed initial relayout.
        before = page.evaluate('window.__mapLayouts')
        page.set_viewport_size({'width': 768, 'height': 1024})
        page.wait_for_function(f'window.__mapLayouts > {before}')
        assert page.evaluate('window.__map.getCenter().lat === 37.5 && window.__map.getCenter().lng === 127')
        print('PASS map resize preserves center')
        assert not errors, errors
        browser.close()
        print('55 viewport snapshots, navigation/recipe actions and map resize passed; external services mocked.')


if __name__ == '__main__':
    run()
