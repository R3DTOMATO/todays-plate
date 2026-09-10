import { onAuthChange, signInWithEmail, signInWithGoogle, signOutUser } from './auth.js';
const $=id=>document.getElementById(id), testKey='todaysplate_analytics_test_v1', idKey='todaysplate_anonymous_user_v1';
let user=null,generation=0,request=null;
const day=ms=>new Date(ms+32400000).toISOString().slice(0,10);
$('to').value=day(Date.now());$('from').value=day(Date.now()-29*86400000);
$('browserId').textContent=localStorage.getItem(idKey)||'아직 없음 — 같은 주소의 앱을 먼저 사용하세요';
$('testTraffic').checked=localStorage.getItem(testKey)==='true';$('excludeOwn').checked=$('testTraffic').checked;
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
function rows(id,data){const host=$(id);host.replaceChildren();for(const values of data){const tr=document.createElement('tr');for(const value of values){const td=document.createElement('td');td.textContent=String(value);tr.append(td);}host.append(tr);}}
const percent=value=>value===null?'—':value+'%';
function render(report){
  const o=report.overview,f=report.funnel;
  for(const key of ['browsers','sessions','events'])$(key).textContent=o[key].toLocaleString('ko-KR');
  $('errors').textContent=report.errors.reduce((n,x)=>n+x.count,0).toLocaleString('ko-KR');
  $('excludedCount').textContent=`필터로 제외한 이벤트 ${o.excludedEvents}건`;
  $('definitions').textContent=report.definitions;$('cohortEmpty').hidden=f.starts!==0;
  rows('funnel',[['추천 시작',f.starts,'기준'],['추천 완료',f.completed,percent(f.completionRate)+' · 시작 대비'],['결과 확인',f.results,''],['메뉴 결정',f.selected,percent(f.selectionRate)+' · 결과 대비'],['결정 메뉴 기록',f.recorded,percent(f.recordRate)+' · 결정 대비']]);
  $('rerolls').textContent=`다른 후보를 확인한 추천: ${f.rerolled}건`;
  rows('daily',report.daily.map(x=>[x.date,x.browsers,x.starts,x.selections]));
  rows('errorRows',report.errors.length?report.errors.map(x=>[x.event,x.code,x.count]):[['실패·오류 없음','—',0]]);
  rows('eventRows',report.eventsByName.length?report.eventsByName.map(x=>[x.name,x.count]):[['수집된 이벤트 없음',0]]);
  $('quality').textContent=`추천 ID가 없는 일반·과거 이벤트 ${o.unlinkedEvents}건. 전체 파일에서 읽지 못한 행 ${o.malformedLines}건, 날짜가 잘못된 이벤트 ${o.invalidTimestamps}건.`;
  $('updated').textContent='집계 시각: '+new Date(report.generatedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' (한국 시간)';$('report').hidden=false;
}
async function refresh(){
  request?.abort();const token=++generation;$('report').hidden=true;if(!user)return;
  request=new AbortController();const controller=request,timeout=setTimeout(()=>controller.abort(),30000);
  $('refresh').disabled=true;status('통계를 불러오고 있습니다.');
  try{
    const params=new URLSearchParams({from:$('from').value,to:$('to').value,includeTests:String($('includeTests').checked)});
    params.set('excludeIds',[$('excludedIds').value,$('excludeOwn').checked?localStorage.getItem(idKey):''].filter(Boolean).join(','));
    const idToken=await user.getIdToken();if(token!==generation)return;
    const response=await fetch(`${window.APP_CONFIG.API_BASE_URL}/api/admin/analytics?${params}`,{headers:{Authorization:`Bearer ${idToken}`},signal:controller.signal,cache:'no-store'});
    if(!response.ok)throw new Error(({401:'로그인이 만료됐습니다. 다시 로그인해 주세요.',403:'이 계정은 관리자 권한이 없습니다.',503:'서버의 관리자 설정을 확인해 주세요.',400:'날짜 범위와 제외 ID를 확인해 주세요.',404:'서버에 통계 API가 아직 배포되지 않았습니다.'})[response.status]||'통계를 불러오지 못했습니다. 다시 시도해 주세요.');
    const report=await response.json();if(token!==generation)return;
    render(report);status(`${report.period.from} ~ ${report.period.to} · 한국 시간 기준`);
  }catch(e){if(token===generation)status(e.name==='AbortError'?'응답이 지연됩니다. 다시 조회해 주세요.':e.message,true);}
  finally{clearTimeout(timeout);if(token===generation)$('refresh').disabled=false;}
}
$('filters').addEventListener('submit',e=>{e.preventDefault();refresh();});
$('testTraffic').addEventListener('change',()=>{localStorage.setItem(testKey,String($('testTraffic').checked));if($('testTraffic').checked)$('excludeOwn').checked=true;status('테스트 표시를 저장했습니다. 앱의 다음 이벤트부터 적용됩니다. 조회 버튼으로 통계를 갱신하세요.');});
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();try{await signInWithEmail($('email').value.trim(),$('password').value);}catch{status('이메일과 비밀번호를 확인해 주세요.',true);}finally{$('password').value='';}});
$('googleLogin').addEventListener('click',async()=>{try{await signInWithGoogle();}catch{status('Google 로그인을 완료하지 못했습니다.',true);}});
$('signout').addEventListener('click',async()=>{try{await signOutUser();}catch{status('로그아웃하지 못했습니다. 다시 시도해 주세요.',true);}});
onAuthChange(next=>{request?.abort();generation++;user=next;$('report').hidden=true;$('loginPanel').hidden=!!next;$('controls').hidden=!next;$('signout').hidden=!next;$('refresh').disabled=false;if(next)refresh();else status('관리자 계정으로 로그인해 주세요.');});
