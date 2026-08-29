import { recommendMenus, explainRecommendation } from '../js/recommendation-engine.js';
import fs from 'fs';

const menus = JSON.parse(fs.readFileSync('../data/menus.json','utf8'));

const situations = ['혼밥','친구','데이트','가족','회식','야식'];
const typeSets = [['한식'],['양식'],['중식'],['일식'],['세계음식'],[]];
const moodSets = [['매콤'],['국물'],['가벼움'],['든든'],['매콤','국물'],['순함'],[]];
const budgets = [8000,12000,20000,0];
const modes = ['집밥','외식','배달'];

let total=0, zero=0, fallback=0, under3=0;
const problems=[];

for (const s of situations)
for (const t of typeSets)
for (const m of moodSets)
for (const b of budgets)
for (const d of modes) {
  total++;
  const out = recommendMenus(menus, {
    situation:s, types:t, moods:m, budget:b, diningMode:d,
    mealTime:'저녁', avoidIngredients:[], bannedMenus:[],
    recentMeals:[], menuStats:{}, seed:'test'
  }, 3);
  if (out.results.length===0) { zero++; problems.push([s,t,m,b,d]); }
  else if (out.results.length<3) under3++;
  if (out.fallbackUsed) fallback++;
}

console.log(`총 조합: ${total}`);
console.log(`  결과 0개: ${zero}`);
console.log(`  결과 3개 미만: ${under3}`);
console.log(`  완화 발동: ${fallback} (${(fallback/total*100).toFixed(1)}%)`);
if (problems.length) console.log('문제 조합:', problems.slice(0,10));
