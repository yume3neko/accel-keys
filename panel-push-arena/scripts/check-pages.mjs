import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {onRequestPost} from '../pages-output/pages-function.js';
const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync('pages-init.sql','utf8'));
sql.exec(fs.readFileSync('commands-migration.sql','utf8'));
const db={
 prepare(text){return {bind(...args){
  const statement=sql.prepare(text);
  return {async first(){return statement.get(...args)??null},async all(){return {results:statement.all(...args)}},async run(){return statement.run(...args)}};
 }}},
 async batch(items){return Promise.all(items.map(x=>x.run()))}
};
async function call(token,body){const res=await onRequestPost({env:{PANEL_DB:db},request:new Request('https://test/api/panel-push',{method:'POST',body:JSON.stringify({token,...body})})});return {status:res.status,data:await res.json()}}
for(const [difficulty,min,max] of [['easy',1,3],['normal',3,7],['hard',5,10],['expert',7,15],['master',9,17],['lunatic',12,22]]){
 const host='host-'+difficulty,guest='guest-'+difficulty;
 let r=await call(host,{action:'create',name:'ホスト',difficulty});assert.equal(r.status,201);const code=r.data.room.code,id=r.data.meId;assert.notEqual(id,host);
 assert.equal((await call(guest,{action:'join',code,name:'ゲスト'})).status,200);
 assert.equal((await call(guest,{action:'chat_send',code,message:'よろしく！'})).data.messages.length,1);
 assert.equal((await call(guest,{action:'start',code})).status,403);
 r=await call(host,{action:'start',code});const seed=r.data.room.seed;
 assert.equal((await call(guest,{action:'chat_send',code,message:'試合中'})).status,409);
 for(const round of [0,2,100]){
  sql.prepare("UPDATE players SET current_round=?,pressed='[]',mistakes=0,score=0,combo=0 WHERE id=?").run(round,id);
  let x=(seed^Math.imul(round+1,0x9e3779b1))>>>0;const a=Array.from({length:25},(_,i)=>i);for(let i=24;i>0;i--){x=(Math.imul(x,1664525)+1013904223)>>>0;const j=x%(i+1);[a[i],a[j]]=[a[j],a[i]]}const count=Math.min(max,min+Math.floor(round/2));
  for(const index of a.slice(0,count))r=await call(host,{action:'push',code,round,index});
  const p=r.data.players.find(p=>p.id===id);assert.equal(p.round,round+1);assert.ok(p.score>=100*count+750);
 }
 sql.prepare('UPDATE rooms SET ends_at=0 WHERE code=?').run(code);
 assert.equal((await call(host,{action:'push',code,round:101,index:0})).data.players.find(p=>p.id===id).round,101);
}
console.log('PASS: 6 difficulties, progression/caps, two-player rooms, host checks, lobby-only chat, scoring and timeout');
const host='commands-host',guest='commands-guest';
let r=await call(host,{action:'create',name:'主催'});const code=r.data.room.code;
await call(guest,{action:'join',code,name:'参加 者'});
assert.equal((await call(guest,{action:'chat_send',code,message:'/bot 1 5'})).status,403);
assert.equal((await call(guest,{action:'settings',code,duration:90,difficulty:'master'})).status,403);
assert.equal((await call(host,{action:'chat_send',code,message:'/bot 0 1'})).status,400);
assert.equal((await call(host,{action:'chat_send',code,message:'/bot 7 5'})).status,400);
for(let level=1;level<=5;level++)assert.equal((await call(host,{action:'chat_send',code,message:'/bot 1 '+level})).status,200);
assert.equal((await call(host,{action:'chat_send',code,message:'/handicap 参加 者 1200'})).status,200);
assert.equal((await call(host,{action:'chat_send',code,message:'/handicap 主催 -500'})).status,200);
assert.equal((await call(host,{action:'chat_send',code,message:'/handicap 不在 10'})).status,400);
r=await call(host,{action:'settings',code,duration:90,difficulty:'master'});assert.equal(r.data.room.difficulty,'master');assert.equal(r.data.room.duration,90);
r=await call(host,{action:'start',code});assert.equal(r.data.players.find(p=>p.name==='参加 者').score,1200);assert.equal(r.data.players.find(p=>p.name==='主催').score,-500);
assert.equal((await call(host,{action:'settings',code,duration:30,difficulty:'easy'})).status,409);
assert.equal((await call(host,{action:'chat_send',code,message:'/bot 1 1'})).status,409);
sql.prepare('UPDATE rooms SET started_at=?,ends_at=? WHERE code=?').run(Date.now()-10000,Date.now()+80000,code);
await Promise.all([call(host,{action:'state',code}),call(guest,{action:'state',code})]);
const bots=sql.prepare('SELECT * FROM players WHERE room_code=? AND bot_level>0 ORDER BY bot_level').all(code);
assert.deepEqual(bots.map(b=>b.bot_tick),[20,25,30,35,40]);assert.ok(bots.every(b=>b.score>0));
const scores=bots.map(b=>b.score);await call(host,{action:'state',code});assert.deepEqual(sql.prepare('SELECT score FROM players WHERE room_code=? AND bot_level>0 ORDER BY bot_level').all(code).map(b=>b.score),scores);
console.log('PASS: BOT levels/rates, no duplicate ticks, signed handicap, name with spaces, command validation, settings permissions and phase checks');
