import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountDeletion } from '../server/account-deletion.mjs';

function fixture({ many = false, failure = '', conflict = false } = {}) {
  const db = new Map(), calls = [], auth = [];
  const full = path => `projects/demo-plate/databases/(default)/documents${path}`;
  let revision = 0;
  const fields = data => Object.fromEntries(Object.entries(data).map(([k,v])=>[k,typeof v === 'number' ? {integerValue:String(v)} : {stringValue:v}]));
  const put = (path, data) => db.set(path, {name:full(path),fields:fields(data),updateTime:String(++revision)});
  const n = many ? 501 : 1;
  for (let i=0;i<n;i++) {
    put(`/posts/own${i}`, {authorUid:'a',status:'visible',photoPath:i===0?'feedPhotos/a/photo.jpg':''});
    put(`/posts/other${i}`, {authorUid:'b',likeCount:1});
    put(`/posts/other${i}/likes/a`, {uid:'a'});
    put(`/posts/other${i}/comments/a`, {authorUid:'a',authorName:'A'});
  }
  for(let i=0;i<(many?301:1);i++) put(`/posts/own0/comments/${i}`,{authorUid:'b'});
  put('/users/a/private/taste',{homeCountry:'KR'});
  put('/users/a',{displayName:'A'});
  const fs = async(path, options={}) => {
    const method=options.method||'GET'; calls.push([method,path]);
    if(failure === 'children' && path.includes('/own0/comments?')) throw Error('firestore_403: denied');
    if(path === ':runQuery') {
      const q=JSON.parse(options.body).structuredQuery, f=q.where.fieldFilter;
      return [...db.values()].filter(d=>d.name.split('/').at(-2)===q.from[0].collectionId && d.fields[f.field.fieldPath]?.stringValue===f.value.stringValue).slice(0,q.limit).map(document=>({document}));
    }
    if(path === ':commit') {
      if(conflict){conflict=false;throw Error('firestore_409: conflict');}
      if(failure === 'commit') throw Error('firestore_503: unavailable');
      const writes=JSON.parse(options.body).writes;
      // No mutation until every precondition has passed.
      for(const w of writes) assert.equal(db.get((w.delete||w.update.name).split('/documents')[1]).updateTime,w.currentDocument.updateTime);
      for(const w of writes) {
        const p=(w.delete||w.update.name).split('/documents')[1];
        if(w.delete) db.delete(p); else {db.get(p).fields.likeCount=w.update.fields.likeCount;db.get(p).updateTime=String(++revision);}
      }
      return {};
    }
    const p=path.split('?')[0];
    if(method==='DELETE'){if(failure==='user'&&p==='/users/a')throw Error('firestore_403: denied'); db.delete(p);return {};}
    if(method==='PATCH') {
      const update=JSON.parse(options.body).fields;
      const old=db.get(p)||{name:full(p),fields:{}};
      db.set(p,{...old,fields:{...old.fields,...update},updateTime:String(++revision)});return {};
    }
    if(path.includes('pageSize'))return {documents:[...db.values()].filter(d=>d.name.split('/documents')[1].replace(/\/[^/]+$/,'')===p).slice(0,300)};
    if(!db.has(p))throw Error('firestore_404: missing');
    return structuredClone(db.get(p));
  };
  let storagePage=0;
  const fetch=async(url,options={})=>{
    if(url.includes('accounts:delete')){auth.push(url);return {ok:true};}
    if(options.method==='DELETE')return {ok:failure!=='storage',status:failure==='storage'?403:204};
    if(failure==='list')return {ok:false,status:503};
    storagePage++;
    return {ok:true,json:async()=>({items:[{name:`feedPhotos/a/orphan${storagePage}`}],...(storagePage===1?{nextPageToken:'page two'}:{})})};
  };
  return {db,calls,auth,delete:createAccountDeletion({firestoreRequest:fs,getAccessToken:async()=>'fixture',fetch,project:()=> 'demo-plate',bucket:'demo-bucket'})};
}

test('drains more than 500 matches / 300 children, paginates photos, commits likes and deletes Auth last',async()=>{
 const f=fixture({many:true,conflict:true});const result=await f.delete('a');
 assert.equal(result.posts,501);assert.equal(result.likes,501);assert.equal(result.comments,501);assert.equal(result.photos,3);assert.equal(f.auth.length,1);
 assert(![...f.db.keys()].some(k=>k.startsWith('/posts/own')||k.startsWith('/users/a')));
 assert.equal(f.db.get('/posts/other500').fields.likeCount.integerValue,'0');
 assert.equal(f.db.get('/posts/other500/comments/a').fields.authorUid.stringValue,'deleted');
 assert(f.db.has('/accountDeletions/a'));
});
for(const failure of ['children','storage','list','user','commit'])test(`${failure} failure prevents Auth deletion`,async()=>{
 const f=fixture({failure});await assert.rejects(f.delete('a'));assert.equal(f.auth.length,0);
 if(failure==='commit'){assert(f.db.has('/posts/other0/likes/a'));assert.equal(f.db.get('/posts/other0').fields.likeCount.integerValue,'1');}
});
test('missing storage configuration fails before any destructive work',async()=>{
 let called=false;const remove=createAccountDeletion({bucket:'',firestoreRequest:async()=>{called=true}});
 await assert.rejects(remove('a'),/storage_bucket/);assert.equal(called,false);
});
