import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
const DAY=86400000, KST=32400000;
const day=ms=>new Date(ms+KST).toISOString().slice(0,10);
const bad=message=>Object.assign(new Error(message),{statusCode:400});
function midnight(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw bad('invalid_date');
  const ms=Date.parse(value+'T00:00:00+09:00');
  if(!Number.isFinite(ms)||day(ms)!==value)throw bad('invalid_date');
  return ms;
}
export function reportOptions(params={},now=Date.now()){
  const to=params.to||day(now), from=params.from||day(midnight(to)-29*DAY);
  const start=midnight(from),end=midnight(to)+DAY;
  if(end<=start||end-start>366*DAY)throw bad('invalid_date_range');
  const excludedIds=[...new Set(String(params.excludeIds||'').split(',').map(x=>x.trim()).filter(Boolean))];
  if(excludedIds.length>100||excludedIds.some(x=>!/^[\w-]{1,100}$/.test(x)))throw bad('invalid_excluded_ids');
  return {from,to,start,end,excludeTests:params.includeTests!=='true',excludedIds};
}
export async function readEventRows(directory){
  let files;try{files=await readdir(directory);}catch(e){if(e.code==='ENOENT')return {rows:[],malformed:0};throw e;}
  const rows=[],seen=new Set();let malformed=0;
  for(const file of files.filter(x=>/^events(?:-\d{4}-\d{2})?\.jsonl$/.test(x)).sort()){
    const stream=createReadStream(resolve(directory,file),{encoding:'utf8'});
    const lines=createInterface({input:stream,crlfDelay:Infinity});
    try{for await(const line of lines){
      if(!line.trim())continue;
      let row;try{row=JSON.parse(line);}catch{malformed++;continue;}
      if(!row||typeof row!=='object'||!row.name){malformed++;continue;}
      if(row.eventId&&seen.has(row.eventId))continue;
      if(row.eventId)seen.add(row.eventId);
      rows.push(row);
    }}catch(e){if(e.code!=='ENOENT')throw e;}finally{lines.close();stream.destroy();}
  }
  return {rows,malformed};
}
const inc=(map,key)=>map.set(key,(map.get(key)||0)+1);
const rate=(n,d)=>d?Math.round(n/d*1000)/10:null;
const counts=map=>[...map].sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count}));
export function aggregateEvents(input,options){
  const excluded=new Set(options.excludedIds),seen=new Set(),all=[];
  let excludedEvents=0,invalidTimestamps=0;
  for(const row of input){
    if(row.eventId&&seen.has(row.eventId))continue;
    if(row.eventId)seen.add(row.eventId);
    const time=Date.parse(row.timestamp||row.occurredAt);
    if(!Number.isFinite(time)){invalidTimestamps++;continue;}
    if(excluded.has(row.anonymousUserId)||(options.excludeTests&&row.isTestTraffic===true)){
      if(time>=options.start&&time<options.end)excludedEvents++;continue;
    }
    all.push({...row,time});
  }
  all.sort((a,b)=>a.time-b.time);
  const rows=all.filter(x=>x.time>=options.start&&x.time<options.end);
  const names=new Map(),errors=new Map(),daily=new Map(),users=new Set(),sessions=new Set(),flows=new Map();
  for(let ms=options.start;ms<options.end;ms+=DAY)daily.set(day(ms),{date:day(ms),events:0,users:new Set(),starts:0,selections:0});
  for(const row of rows){
    inc(names,row.name);if(row.anonymousUserId)users.add(row.anonymousUserId);
    if(row.sessionId)sessions.add(JSON.stringify([row.anonymousUserId,row.sessionId]));
    const d=daily.get(day(row.time));d.events++;if(row.anonymousUserId)d.users.add(row.anonymousUserId);
    if(/error|failed|failure/i.test(row.name))inc(errors,JSON.stringify([String(row.name).slice(0,80),String(row.properties?.errorCode||row.properties?.code||'unknown').slice(0,80)]));
  }
  // Cohort: first start inside period. Only subsequent stages through end count.
  const started=new Set();
  for(const row of all){
    if(row.time>=options.end)break;
    if(!row.anonymousUserId||!row.recommendationId)continue;
    const key=JSON.stringify([row.anonymousUserId,row.recommendationId]);
    if(row.name==='recommendation_started'&&!started.has(key)){
      started.add(key);
      if(row.time>=options.start){flows.set(key,{complete:false,result:false,selected:false,recorded:false,rerolled:false,selectedMenus:new Map()});daily.get(day(row.time)).starts++;}
    }
    const f=flows.get(key);if(!f)continue;
    if(row.name==='recommendation_completed')f.complete=true;
    if(row.name==='recommendation_result_viewed'&&f.complete)f.result=true;
    if(row.name==='alternative_menu_selected'&&f.result)f.rerolled=true;
    if(row.name==='menu_selected'&&f.result){
      if(!f.selected)daily.get(day(row.time)).selections++;f.selected=true;
      if(row.properties?.menuId&&!f.selectedMenus.has(String(row.properties.menuId)))f.selectedMenus.set(String(row.properties.menuId),row.time);
    }
    if(row.name==='meal_record_created'&&f.selected&&row.properties?.recordId){
      const selectedAt=f.selectedMenus.get(String(row.properties.menuId)),mealAt=Date.parse(row.properties.mealOccurredAt);
      if(selectedAt!==undefined&&mealAt>=Math.floor(selectedAt/60000)*60000&&mealAt<=row.time)f.recorded=true;
    }
  }
  const group=[...flows.values()],total=prop=>group.filter(x=>x[prop]).length;
  const completed=total('complete'),results=total('result'),selected=total('selected'),recorded=total('recorded');
  return {
    generatedAt:new Date().toISOString(),period:{from:options.from,to:options.to,timezone:'Asia/Seoul',excludeTests:options.excludeTests,excludedBrowserIds:excluded.size},
    overview:{events:rows.length,browsers:users.size,sessions:sessions.size,excludedEvents,unlinkedEvents:rows.filter(x=>!x.recommendationId).length,invalidTimestamps},
    funnel:{starts:group.length,completed,results,selected,recorded,rerolled:total('rerolled'),completionRate:rate(completed,group.length),selectionRate:rate(selected,results),recordRate:rate(recorded,selected)},
    daily:[...daily.values()].map(({users,...x})=>({...x,browsers:users.size})),eventsByName:counts(names),
    errors:counts(errors).map(x=>{const[event,code]=JSON.parse(x.name);return {event,code,count:x.count};}),
    definitions:'기간 안에 시작한 추천만 집계하며, 종료일까지 발생한 완료 → 결과 → 결정 → 기록을 순서대로 연결합니다. 기록은 사용자 입력이며 실제 식사를 검증하지 않습니다. ID가 없는 과거 이벤트와 일반 행동은 이벤트 횟수에만 포함됩니다.',
  };
}
export async function readAnalyticsReport(directory,options){
  const {rows,malformed}=await readEventRows(directory);const report=aggregateEvents(rows,options);report.overview.malformedLines=malformed;return report;
}
