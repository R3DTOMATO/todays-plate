// ─────────────────────────────────────────────────────────────
// 오류 모니터링 (Sentry)
//
// 왜 필요한가
//  지금은 사용자가 앱이 깨져도 직접 말해주지 않으면 알 수 없다.
//  베타 테스터를 받기 전에 오류를 자동으로 수집할 수단이 있어야 한다.
//
// 개인정보 원칙
//  이 앱은 사진·메모·정확한 위치를 서버로 보내지 않는다는 방침이 있다.
//  오류 리포트가 그 방침을 깨면 안 되므로, 전송 직전에 한 번 더 걸러낸다.
//  개인정보처리방침의 "수집하지 않는 것" 목록과 이 파일이 일치해야 한다.
// ─────────────────────────────────────────────────────────────

const DSN = (window.APP_CONFIG && window.APP_CONFIG.SENTRY_DSN) || '';
const RELEASE = 'todays-plate@6.0.0';

// 사용자가 분석 수집에 동의했는지 확인한다.
// 동의 전에는 오류도 보내지 않는다 — 오류 리포트에도 이용 맥락이 담기기 때문이다.
// app.js의 STORAGE.analyticsConsent와 같은 키를 본다.
// 키나 값이 어긋나면 동의했는데도 오류가 안 잡히거나 그 반대가 된다.
const CONSENT_KEY = 'todaysplate_analytics_consent_v1';

function hasAnalyticsConsent() {
  try {
    return localStorage.getItem(CONSENT_KEY) === 'true';
  } catch (_) {
    return false;
  }
}

// URL·문자열에서 개인정보로 보이는 값을 지운다
function scrubText(value) {
  if (typeof value !== 'string') return value;
  return value
    // 이메일
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    // 좌표로 보이는 소수 쌍
    .replace(/-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}/g, '[coords]')
    // 쿼리스트링의 위치·투표 세션 값
    .replace(/([?&](lat|lng|latitude|longitude|vote|token)=)[^&#]*/gi, '$1[redacted]')
    // data URL (사진)
    .replace(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/gi, '[image]');
}

function scrubDeep(value, depth = 0) {
  if (depth > 4) return value;
  if (typeof value === 'string') return scrubText(value);
  if (Array.isArray(value)) return value.map(v => scrubDeep(v, depth + 1));
  if (value && typeof value === 'object') {
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      // 키 이름만 봐도 민감한 항목은 값을 통째로 지운다
      if (/photo|image|memo|note|address|contact|phone|email|token|password|lat|lng/i.test(key)) {
        output[key] = '[redacted]';
      } else {
        output[key] = scrubDeep(item, depth + 1);
      }
    }
    return output;
  }
  return value;
}

// 굳이 알림받을 필요 없는 오류들 — 잡음이 많으면 진짜 오류를 놓친다
const IGNORED = [
  'ResizeObserver loop',
  'Non-Error promise rejection captured',
  'Failed to fetch',              // 네트워크 끊김 — 사용자 환경 문제
  'NetworkError',
  'Load failed',
  'AbortError',
  'The play() request was interrupted',
  'Extension context invalidated', // 브라우저 확장 프로그램
  'chrome-extension://',
  'safari-extension://',
];

function shouldIgnore(event) {
  const message = event?.exception?.values?.[0]?.value || event?.message || '';
  if (IGNORED.some(pattern => message.includes(pattern))) return true;

  // 확장 프로그램이 던진 오류는 우리 코드 문제가 아니다
  const frames = event?.exception?.values?.[0]?.stacktrace?.frames || [];
  if (frames.some(f => /extension:\/\//.test(f.filename || ''))) return true;

  return false;
}

function loadSentryScript() {
  return new Promise(resolve => {
    if (window.Sentry) return resolve();
    const script = document.createElement('script');
    script.src = 'https://browser.sentry-cdn.com/8.26.0/bundle.min.js';
    script.crossOrigin = 'anonymous';
    script.onload = () => resolve();
    script.onerror = () => resolve();   // 실패해도 앱은 계속 동작해야 한다
    document.head.appendChild(script);
  });
}

export function initErrorMonitoring() {
  if (!DSN) {
    console.info('[monitoring] SENTRY_DSN이 없어 오류 수집이 비활성화되었습니다.');
    return;
  }
  // Sentry CDN 번들은 ES 모듈이 아니라 일반 스크립트다.
  // import()로는 불러올 수 없으므로 script 태그로 넣는다.
  loadSentryScript()
    .then(() => {
      const Sentry = window.Sentry;
      if (!Sentry) {
        console.warn('[monitoring] Sentry를 불러오지 못했습니다. (광고 차단 확장 프로그램일 수 있습니다)');
        return;
      }

      Sentry.init({
        dsn: DSN,
        release: RELEASE,
        environment: location.hostname === 'localhost' ? 'development' : 'production',

        // 사용자 IP를 보내지 않는다
        sendDefaultPii: false,

        beforeSend(event) {
          if (shouldIgnore(event)) return null;

          // URL에 투표 세션 ID나 좌표가 들어갈 수 있다
          if (event.request?.url) event.request.url = scrubText(event.request.url);
          if (event.request?.headers) delete event.request.headers;
          if (event.request?.cookies) delete event.request.cookies;

          if (event.extra) event.extra = scrubDeep(event.extra);
          if (event.contexts) event.contexts = scrubDeep(event.contexts);

          // 사용자 식별자는 익명 ID만 남긴다
          if (event.user) {
            event.user = { id: event.user.id || undefined };
          }
          return event;
        },

        beforeBreadcrumb(crumb) {
          // 입력 내용이 브레드크럼에 그대로 남는 것을 막는다
          if (crumb.category === 'ui.input') return null;
          if (crumb.data?.url) crumb.data.url = scrubText(crumb.data.url);
          if (crumb.message) crumb.message = scrubText(crumb.message);
          return crumb;
        },
      });

      // 어느 화면에서 났는지 알 수 있게 패널을 태그로 남긴다
      const panel = document.body.dataset.panel;
      if (panel) Sentry.setTag('panel', panel);

      const observer = new MutationObserver(() => {
        const current = document.body.dataset.panel;
        if (current) Sentry.setTag('panel', current);
      });
      observer.observe(document.body, { attributes: true, attributeFilter: ['data-panel'] });

      console.info('[monitoring] 오류 수집을 시작했습니다.');
    });
}

/** 잡은 오류를 직접 보고할 때 사용 */
export function reportError(error, context = {}) {
  if (window.Sentry) {
    window.Sentry.captureException(error, { extra: scrubDeep(context) });
  } else {
    console.error('[monitoring]', error, context);
  }
}

let started = false;

function startOnce() {
  if (started) return;
  if (!DSN || !hasAnalyticsConsent()) return;
  started = true;
  initErrorMonitoring();
}

// 동의는 앱 실행 후에 누를 수 있다. 그때 시작한다.
document.addEventListener('analyticsConsentChanged', event => {
  if (event.detail?.enabled) startOnce();
});

startOnce();

window.appMonitoring = { report: reportError };
