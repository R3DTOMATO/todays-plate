import { rankFeed, buildTasteVector } from '../js/feed-ranking.js';
import fs from 'fs';
const menus = JSON.parse(fs.readFileSync('../data/menus.json','utf8'));

const NOW = Date.parse('2026-08-29T19:00:00+09:00');
let seq=0;
function post(menuName, opts={}) {
  const m = menus.find(x=>x.name===menuName);
  return {
    id:`p${++seq}`, authorUid:opts.uid||`u${seq}`, authorName:`user${seq}`,
    menuId:m.id, menuName:m.name, menuType:m.type, menuSpicy:m.spicy,
    menuSoup:m.soup, menuWeight:m.weight,
    photoUrl: opts.photo===false?null:'x.jpg',
    likeCount:opts.likes??0, reportCount:opts.reports??0,
    status:opts.status||'visible',
    createdAt: NOW - (opts.hoursAgo??1)*3600000
  };
}

// 매운 한식 국물을 좋아하는 사용자
const history = [
  {menu:menus.find(m=>m.name==='김치찌개'), satisfaction:5},
  {menu:menus.find(m=>m.name==='순두부찌개'), satisfaction:5},
  {menu:menus.find(m=>m.name==='마라탕'), satisfaction:4},
  {menu:menus.find(m=>m.name==='육개장'), satisfaction:5},
];
const taste = buildTasteVector(history);
console.log('=== 취향 벡터 ===');
console.log('종류 선호:', Object.fromEntries(Object.entries(taste.typeAffinity).map(([k,v])=>[k,v.toFixed(2)])));
console.log('매운맛 선호:', taste.spicyPreference.toFixed(2), '/ 국물 선호:', taste.soupPreference.toFixed(2));

const feed = [
  post('부대찌개',{likes:5}), post('아보카도 토스트',{likes:20}),
  post('짬뽕',{likes:3}), post('시저 샐러드',{likes:15}),
  post('감자탕',{likes:2}), post('마르게리타 피자',{likes:30}),
  post('설렁탕',{likes:1}), post('초밥',{likes:8}),
];

console.log('\n=== 취향 반영 피드 ===');
rankFeed(feed,{history,now:NOW},8).posts.forEach((p,i)=>
  console.log(`  ${i+1}. ${p.menuName} (${p.menuType}, 좋아요${p.likeCount}) ${p._score}점`));

console.log('\n=== 신규 사용자(이력 없음) 피드 ===');
const cold = rankFeed(feed,{history:[],now:NOW},8);
console.log('취향 사용됨:', cold.tasteUsed);
cold.posts.slice(0,4).forEach((p,i)=>console.log(`  ${i+1}. ${p.menuName} (좋아요${p.likeCount})`));

console.log('\n=== 안전 필터 검증 ===');
const unsafe = [
  post('김치찌개',{uid:'blocked_user'}),
  post('된장찌개',{reports:3}),
  post('비빔밥',{status:'hidden'}),
  post('제육덮밥',{uid:'ok'}),
];
const safe = rankFeed(unsafe,{history,blockedUids:['blocked_user'],now:NOW},10);
console.log(`4개 중 노출: ${safe.posts.length}개 (${safe.posts.map(p=>p.menuName).join(', ')})`);
console.log(safe.posts.length===1 && safe.posts[0].menuName==='제육덮밥' ? '✓ 차단/신고/숨김 모두 제외됨' : '✗ 실패');

console.log('\n=== 도배 방지 검증 ===');
const spam = [post('김치찌개',{uid:'spammer'}),post('된장찌개',{uid:'spammer'}),
  post('순두부찌개',{uid:'spammer'}),post('짬뽕',{uid:'other'})];
const anti = rankFeed(spam,{history,now:NOW},4);
const topAuthors = anti.posts.slice(0,2).map(p=>p.authorUid);
console.log('상위 2개 작성자:', topAuthors.join(', '));
console.log(new Set(topAuthors).size===2 ? '✓ 같은 작성자 연속 노출 억제됨' : '✗ 도배 발생');

console.log('\n=== 다양성 검증 (한식만 5개 + 양식 1개) ===');
const mono=[post('김치찌개'),post('된장찌개'),post('순두부찌개'),post('육개장'),post('감자탕'),post('마르게리타 피자')];
const div=rankFeed(mono,{history,now:NOW},6);
console.log(div.posts.map(p=>p.menuType).join(' → '));
