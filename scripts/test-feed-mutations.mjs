import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const code = name => readFileSync(`js/${name}`,'utf8').replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];\s*/g,'').replace(/export /g,'');
function fixture() {
 const data=new Map(), removed=[], user={uid:'a'};
 let photoSuccess=true;
 const ctx=vm.createContext({window:{FIREBASE_CONFIG:{}},console:{log(){},error(){}},FIREBASE_READY:true,
 getCurrentUser:()=>user,requireAuth:async()=>user,getApps:()=>[{}],getFirestore:()=>({}),
 doc:(_,...parts)=>parts.join('/'),collection:(_,...parts)=>parts.join('/'),query:(path,cap)=>({path,cap}),limit:n=>n,
 getDoc:async path=>({exists:()=>data.has(path),data:()=>data.get(path)}),
 getDocs:async({path,cap})=>({docs:[...data.keys()].filter(k=>k.startsWith(path+'/')&&k.split('/').length===path.split('/').length+1).slice(0,cap).map(k=>({id:k.split('/').at(-1)}))}),
 updateDoc:async(path,patch)=>{assert(data.has(path));Object.assign(data.get(path),patch)},
 setDoc:async(path,value)=>data.set(path,value),deleteDoc:async path=>{removed.push(path);data.delete(path)},
 serverTimestamp:()=>123,uploadFeedPhoto:async()=>({url:'new-photo',path:'feedPhotos/a/new'}),deleteFeedPhoto:async()=>photoSuccess,describeUploadError:()=> 'failed'
 });
 vm.runInContext(code('feed-posts.js'),ctx);
 return {api:ctx.window.feedPosts,data,removed,failPhoto:()=>photoSuccess=false,retryPhoto:()=>photoSuccess=true};
}
test('new publish and repeated record update preserve aggregates and remove photo',async()=>{
 const f=fixture();const record={id:'r',menu:{name:'김밥'},memo:'first',photoDataUrl:'data:'};
 assert.equal((await f.api.publish(record)).ok,true);
 f.data.get('posts/a_r').likeCount=8;
 assert.equal((await f.api.publish({...record,menu:{name:'국밥'},memo:'edited',satisfaction:5,photoDataUrl:null})).ok,true);
 const saved=f.data.get('posts/a_r');assert.equal(saved.memo,'edited');assert.equal(saved.menuName,'국밥');assert.equal(saved.satisfaction,5);assert.equal(saved.likeCount,8);assert.equal(saved.photoPath,null);
});
test('failed photo cleanup retains frozen post; retry drains all children before deleting parent',async()=>{
 const f=fixture();f.data.set('posts/a_r',{status:'visible',photoPath:'feedPhotos/a/photo'});
 for(let i=0;i<205;i++)f.data.set(`posts/a_r/comments/${i}`,{});
 f.data.set('posts/a_r/likes/b',{});f.failPhoto();
 assert.equal((await f.api.remove('a_r')).ok,false);assert.equal(f.data.get('posts/a_r').status,'deleting');assert.equal(f.data.size,1);
 f.retryPhoto();assert.equal((await f.api.remove('a_r')).ok,true);assert.equal(f.data.size,0);assert.equal(f.removed.at(-1),'posts/a_r');
});
test('saving with unchanged public toggle updates published content',async()=>{
 const published=[];const elements={recordFeedPublic:{checked:true}};
 const ctx=vm.createContext({window:{},document:{readyState:'loading',addEventListener(){},getElementById:id=>elements[id]},console,
 publishRecord:async record=>{published.push(record);return {ok:true}},unpublishRecord:async()=>{throw Error('unexpected')}
 });
 vm.runInContext(code('feed-share-ui.js'),ctx);vm.runInContext('wasPublished=true',ctx);
 await ctx.onRecordSaved({detail:{record:{id:'r',memo:'changed'}}});assert.equal(published.length,1);assert.equal(published[0].memo,'changed');
});
