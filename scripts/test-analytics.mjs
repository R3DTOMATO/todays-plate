import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,readFile,readdir,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync,createSign } from 'node:crypto';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { reportOptions,aggregateEvents,readAnalyticsReport } from '../server/analytics-report.mjs';
const options=reportOptions({from:'2026-09-09',to:'2026-09-09'});let serial=0;
const event=(name,minute,extra={})=>({eventId:'e'+ ++serial,name,anonymousUserId:'a',sessionId:'s',recommendationId:'r',timestamp:`2026-09-09T01:${String(minute).padStart(2,'0')}:00Z`,properties:{},...extra});
const flow=()=>[event('recommendation_started',0),event('recommendation_completed',1),event('recommendation_result_viewed',2),event('menu_selected',3,{properties:{menuId:'kimchi'}})];
test('KST date boundaries and invalid ranges',()=>{
 assert.equal(new Date(options.start).toISOString(),'2026-09-08T15:00:00.000Z');assert.equal(new Date(options.end).toISOString(),'2026-09-09T15:00:00.000Z');
 for(const params of [{from:'2026-02-30'},{from:'bad'},{from:'2026-10-01',to:'2026-09-01'},{from:'2024-01-01',to:'2026-01-01'}])assert.throws(()=>reportOptions(params));
});
test('repeated decisions and duplicate event IDs do not inflate rates',()=>{const data=flow();data.push({...data[3]},event('menu_selected',4,{properties:{menuId:'kimchi'}}));const r=aggregateEvents(data,options);assert.equal(r.funnel.starts,1);assert.equal(r.funnel.selected,1);assert.equal(r.funnel.selectionRate,100);assert.equal(r.overview.events,5);});
test('legacy events and starts outside period are not new cohorts',()=>{const data=flow();data[0].timestamp='2026-09-08T01:00:00Z';data.push(event('recommendation_started',4),...flow().map(x=>({...x,recommendationId:''})));const r=aggregateEvents(data,options);assert.equal(r.funnel.starts,0);assert.equal(r.funnel.selectionRate,null);assert.equal(r.overview.unlinkedEvents,4);});
test('wrong order is not a conversion',()=>{const r=aggregateEvents([event('menu_selected',0),event('recommendation_started',1),event('recommendation_result_viewed',2),event('recommendation_completed',3)],options);assert.equal(r.funnel.completed,1);assert.equal(r.funnel.results,0);assert.equal(r.funnel.selected,0);});
test('test flags and browser exclusions affect all metrics',()=>{const data=[...flow(),...flow().map(x=>({...x,anonymousUserId:'test',isTestTraffic:true})),...flow().map(x=>({...x,anonymousUserId:'internal'}))];const r=aggregateEvents(data,{...options,excludedIds:['internal']});assert.equal(r.funnel.starts,1);assert.equal(r.overview.excludedEvents,8);assert.equal(aggregateEvents(data,{...options,excludeTests:false}).funnel.starts,3);});
test('records require matching selected menu and plausible meal date',()=>{const data=flow();data.push(event('meal_record_created',4,{properties:{recordId:'meal1',menuId:'other',mealOccurredAt:'2026-09-09T01:04:00Z'}}),event('meal_record_created',5,{properties:{recordId:'meal2',menuId:'kimchi',mealOccurredAt:'2026-09-08T01:04:00Z'}}));assert.equal(aggregateEvents(data,options).funnel.recorded,0);data.push(event('meal_record_created',6,{properties:{recordId:'meal3',menuId:'kimchi',mealOccurredAt:'2026-09-09T01:05:00Z'}}));assert.equal(aggregateEvents(data,options).funnel.recorded,1);});
test('browser identity scopes flows and raw error messages are not exposed',()=>{const data=[...flow(),...flow().map(x=>({...x,anonymousUserId:'b'})),event('client_error',7,{properties:{errorCode:'API_HEALTH_001',message:'private details'}})];const r=aggregateEvents(data,options);assert.equal(r.funnel.starts,2);assert.equal(r.overview.sessions,2);assert.equal(r.errors[0].code,'API_HEALTH_001');assert.ok(!JSON.stringify(r).includes('private details'));});
test('reader deduplicates monthly and legacy files, reports malformed lines',async()=>{const dir=await mkdtemp(join(tmpdir(),'plate-report-'));try{const data=flow();await writeFile(join(dir,'events.jsonl'),data.map(x=>JSON.stringify(x)).join('\n'));await writeFile(join(dir,'events-2026-09.jsonl'),JSON.stringify(data[0])+'\ninvalid\n');const r=await readAnalyticsReport(dir,options);assert.equal(r.overview.events,4);assert.equal(r.overview.malformedLines,1);}finally{await rm(dir,{recursive:true,force:true});}});
test('HTTP admin authentication, allowlist, persistence, acknowledgements and test filtering',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'plate-api-'));const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});const pem=publicKey.export({type:'spki',format:'pem'});
 // Replace only Google's public-key lookup. Real JWT signature checking stays enabled.
 const preload=join(dir,'google-fixture.mjs');await writeFile(preload,`globalThis.fetch=async url=>{if(String(url)!=='https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com')throw Error('unexpected network');return new Response(JSON.stringify({fixture:${JSON.stringify(pem)}}),{headers:{'Cache-Control':'max-age=3600'}})};`);
 const socket=createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(r=>socket.close(r));
 const child=spawn(process.execPath,['--import',preload,'server/kakao-nearby-proxy.mjs'],{env:{...process.env,PORT:String(port),DATA_DIR:dir,FIREBASE_PROJECT_ID:'fixture',FIREBASE_CLIENT_EMAIL:'fixture@example.test',FIREBASE_PRIVATE_KEY:'fixture',ADMIN_UIDS:'admin',ANALYTICS_EXCLUDED_IDS:''},stdio:['ignore','pipe','pipe']});
 const base=`http://127.0.0.1:${port}`;
 const token=uid=>{const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),now=Math.floor(Date.now()/1000);const body=encode({alg:'RS256',kid:'fixture'})+'.'+encode({aud:'fixture',iss:'https://securetoken.google.com/fixture',sub:uid,iat:now,exp:now+600});const sign=createSign('RSA-SHA256');sign.update(body);sign.end();return body+'.'+sign.sign(privateKey).toString('base64url');};
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('startup timeout')),10000);child.stdout.on('data',chunk=>{if(String(chunk).includes('Retention:')){clearTimeout(timer);resolve();}});child.once('exit',code=>{clearTimeout(timer);reject(Error('server exit '+code));});});
  const url=base+'/api/admin/analytics';assert.equal((await fetch(url)).status,401);assert.equal((await fetch(url,{headers:{Authorization:'Bearer invalid'}})).status,401);assert.equal((await fetch(url,{headers:{Authorization:'Bearer '+token('member')}})).status,403);
  const row={...event('recommendation_started',0),occurredAt:new Date().toISOString(),timestamp:undefined,isTestTraffic:true};
  const upload=()=>fetch(base+'/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({events:[row]})});const ack=await(await upload()).json();assert.equal(ack.accepted,1);assert.deepEqual(ack.acknowledgedEventIds,[row.eventId]);assert.equal((await(await upload()).json()).duplicates,1);
  const file=(await readdir(dir)).find(x=>/^events-/.test(x));const saved=JSON.parse((await readFile(join(dir,file),'utf8')).trim());assert.equal(saved.recommendationId,'r');assert.equal(saved.isTestTraffic,true);
  const auth={Authorization:'Bearer '+token('admin')};const res=await fetch(url,{headers:auth});assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'no-store');assert.equal((await res.json()).overview.events,0);assert.equal((await(await fetch(url+'?includeTests=true',{headers:auth})).json()).overview.events,1);assert.equal((await fetch(url+'?from=bad',{headers:auth})).status,400);
 }finally{child.kill();if(child.exitCode===null)await once(child,'exit');await rm(dir,{recursive:true,force:true});}
});
