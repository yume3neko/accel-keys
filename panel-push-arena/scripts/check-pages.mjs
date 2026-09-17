import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {onRequestPost} from '../pages-output/pages-function.js';
const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync('pages-init.sql','utf8'));
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
