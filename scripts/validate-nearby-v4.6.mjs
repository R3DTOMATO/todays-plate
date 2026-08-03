import fs from 'node:fs';

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const keywords = JSON.parse(fs.readFileSync(new URL('../data/restaurant-keywords.json', import.meta.url), 'utf8'));
const firebase = JSON.parse(fs.readFileSync(new URL('../firebase.json', import.meta.url), 'utf8'));
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

const bbq = keywords['바베큐 립'] || [];
assert(bbq.includes('바비큐 립'), '바비큐 립 표기 변형 누락');
assert(bbq.includes('폭립'), '폭립 별칭 누락');
assert(bbq.includes('BBQ 립'), 'BBQ 립 별칭 누락');
assert(app.includes("venueQueries: ['미국식 바비큐', '아메리칸 바베큐', '바비큐 전문점', '폭립', '스테이크하우스'"), '바베큐 립 전문 업종 검색 계획 누락');
assert(app.includes("rejectTerms: ['브런치', '카페', '커피', '디저트'"), '바베큐 립 카페/브런치 제외 규칙 누락');
assert(app.includes("if (!profile.allowCafe && (/카페|커피|디저트|베이커리|제과/.test(text) || place.category_group_code === 'CE7')) return true;"), '일반 식사 메뉴의 카페 제외 규칙 누락');
assert(app.includes("return '메뉴 검색 후보';"), '미확인 장소 라벨 누락');
assert(!app.slice(app.lastIndexOf('// ─── v4.6')).includes("return '추천도 높음'"), 'v4.6에서 추천도 높음 표현이 남아 있음');
assert(/app\.js\?v=4\.(?:6|7|8)\.0/.test(index), 'app.js 캐시 버전 누락');
assert(JSON.stringify(firebase).includes('no-store'), 'Firebase HTML/JS 캐시 방지 설정 누락');

if (failures.length) {
  console.error('v4.6 validation failed');
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log('v4.6 nearby search validation passed');
console.log('- 바베큐 립 표기 변형 검색');
console.log('- 브런치/카페 오탐 제외');
console.log('- 미확인 장소 추천도 표현 제거');
console.log('- 배포 캐시 무효화');
