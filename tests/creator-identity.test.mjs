import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {identifyName,reservedName,displayRecord,CREATOR_RECORD} from '../lib/creator-identity.js';
import * as scores from '../functions/api/scores.js';
import {onRequestPost as multi} from '../functions/api/multiplayer.js';
const secret='test-only-long-admin-password';
function env(){const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE scores(id INTEGER PRIMARY KEY,player_name TEXT,score INTEGER,mode TEXT,max_speed REAL,best_combo INTEGER,player_id TEXT UNIQUE,perfect_count INTEGER,great_count INTEGER,good_count INTEGER,miss_count INTEGER,high_speed REAL,replay_data TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);return {db,ADMIN_TOKEN:secret,DB:{prepare(sql){let args=[];return{bind(...a){args=a;return this},async run(){return{meta:{changes:db.prepare(sql).run(...args).changes}}},async first(){return db.prepare(sql).get(...args)},async all(){return{results:db.prepare(sql).all(...args)}}}}}};}
test('reserved substrings and invisible/whitespace variants require authentication',()=>{
 for(const n of ['ゆめみねこ','偽ゆめみねこ123','prefix ゆめみねこ suffix','ゆ めみねこ','ゆめ\u200bみねこ','ゆめみねこ(製作者)']){assert.ok(reservedName(n));assert.throws(()=>identifyName(n,'wrong',{ADMIN_TOKEN:secret}),{status:401});assert.deepEqual(identifyName(n,secret,{ADMIN_TOKEN:secret}),{name:'ゆめみねこ',creator:true});}
 assert.deepEqual(identifyName(secret,null,{ADMIN_TOKEN:secret}),{name:'ゆめみねこ',creator:true});
 assert.deepEqual(identifyName('normal',null,{ADMIN_TOKEN:secret}),{name:'normal',creator:false});
 assert.equal(displayRecord({name:CREATOR_RECORD}).creator,true);assert.equal(displayRecord({name:'ゆめみねこ'}).creator,false);
});
test('normal multiplayer password names are converted before persistence; spoof flags denied',async()=>{
 const e=env();const owner=crypto.randomUUID(),guest=crypto.randomUUID();
 async function call(token,body){const r=await multi({env:e,request:new Request('https://test/api/multiplayer',{method:'POST',headers:{authorization:'Bearer '+token},body:JSON.stringify({code:'ABCD23',...body})})});return{status:r.status,...await r.json()};}
 try{
 const a=await call(owner,{action:'create',name:secret,mode:'time',kind:'battle'});assert.equal(a.status,201);assert.equal(a.players[0].name,'ゆめみねこ');assert.equal(a.players[0].creator,true);assert.ok(!JSON.stringify(a).includes(secret));assert.ok(!e.db.prepare('SELECT state FROM multiplayer_rooms').get().state.includes(secret));
 assert.equal((await call(guest,{action:'join',name:'xxゆめみねこ',creator:true})).code,'CREATOR_AUTH_REQUIRED');
 const b=await call(guest,{action:'join',name:'xxゆめみねこ',adminPassword:secret});assert.equal(b.players.find(p=>p.id===b.you).creator,true);
 const c=await call(guest,{action:'join',name:'normal',creator:true});assert.equal(c.players.find(p=>p.id===c.you).creator,false);
 }finally{e.db.close();}
});
test('both rankings protect reserved names and expose legacy badge without changing scores',async()=>{
 const e=env();try{for(const mode of ['time','cosmos']){
 const cookie='accel_player_id='+crypto.randomUUID();
 async function post(name,auth=''){const r=await scores.onRequestPost({env:e,request:new Request('https://test/api/scores',{method:'POST',headers:{cookie,authorization:'Bearer '+auth},body:JSON.stringify({mode,name,score:100,maxSpeed:1,bestCombo:1})})});return r.status;}
 assert.equal(await post('xゆめみねこx'),401);assert.equal(await post('xゆめみねこx',secret),201);
 const r=await scores.onRequestGet({env:e,request:new Request('https://test/api/scores?mode='+mode)});const d=await r.json();assert.equal(d.scores[0].name,'ゆめみねこ');assert.equal(d.scores[0].creator,true);assert.equal(d.scores[0].score,100);
 const detail=await scores.onRequestGet({env:e,request:new Request('https://test/api/scores?mode='+mode+'&id='+d.scores[0].id)});assert.equal((await detail.json()).record.creator,true);
 }}finally{e.db.close();}
});
