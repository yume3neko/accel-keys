import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {onRequestPost} from '../pages-output/pages-function.js';
const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync('pages-init.sql','utf8'));
sql.exec(fs.readFileSync('commands-migration.sql','utf8'));
const db={
 prepare(text){return {bind(...args){
  const statement=sql.prepare(text);
  return {async first(){return statement.get(...args)??null},async all(){return {results:statement.all(...args)}},async run(){return {meta:{changes:statement.run(...args).changes}}}};
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
 assert.equal((await call(host,{action:'start',code})).status,409);
 await call(host,{action:'ready',code,ready:true});
 assert.equal((await call(host,{action:'start',code})).status,409);
 await call(guest,{action:'ready',code,ready:true});
 r=await call(host,{action:'start',code});assert.equal(r.status,200);assert.equal(r.data.room.endsAt-r.data.room.startedAt,60000);assert.ok(r.data.room.startedAt>r.data.now);
 const early=await call(host,{action:'push',code,index:0,round:0});assert.equal(early.data.players.find(p=>p.id===id).score,0);
 assert.equal((await call(host,{action:'start',code})).status,409);
 sql.prepare('UPDATE rooms SET started_at=? WHERE code=?').run(Date.now()-1,code);
 const seed=r.data.room.seed;
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
await call(host,{action:'ready',code,ready:true});await call(guest,{action:'ready',code,ready:true});
r=await call(host,{action:'start',code});assert.equal(r.status,200);assert.ok(r.data.players.filter(p=>p.botLevel).every(p=>p.ready));assert.equal(r.data.players.find(p=>p.name==='参加 者').score,1200);assert.equal(r.data.players.find(p=>p.name==='主催').score,-500);
assert.equal((await call(host,{action:'settings',code,duration:30,difficulty:'easy'})).status,409);
assert.equal((await call(host,{action:'chat_send',code,message:'/bot 1 1'})).status,409);
sql.prepare('UPDATE rooms SET started_at=?,ends_at=? WHERE code=?').run(Date.now()-10000,Date.now()+80000,code);
await Promise.all([call(host,{action:'state',code}),call(guest,{action:'state',code})]);
const bots=sql.prepare('SELECT * FROM players WHERE room_code=? AND bot_level>0 ORDER BY bot_level').all(code);
assert.deepEqual(bots.map(b=>b.bot_tick),[20,25,30,35,40]);assert.ok(bots.every(b=>b.score>0));
const scores=bots.map(b=>b.score);await call(host,{action:'state',code});assert.deepEqual(sql.prepare('SELECT score FROM players WHERE room_code=? AND bot_level>0 ORDER BY bot_level').all(code).map(b=>b.score),scores);
console.log('PASS: BOT levels/rates, no duplicate ticks, signed handicap, name with spaces, command validation, settings permissions and phase checks');

sql.prepare("UPDATE rooms SET status='finished' WHERE code=?").run(code);
assert.equal((await call(guest,{action:'lobby',code})).status,403);
r=await call(host,{action:'lobby',code});assert.equal(r.data.room.status,'waiting');assert.ok(r.data.players.filter(p=>!p.botLevel).every(p=>!p.ready));
await call(host,{action:'ready',code,ready:true});await call(guest,{action:'ready',code,ready:true});
r=await call(host,{action:'settings',code,duration:30,difficulty:'easy'});assert.ok(r.data.players.filter(p=>!p.botLevel).every(p=>!p.ready));
console.log('PASS: all-player readiness gate, three-second countdown, early input block, bot readiness, rematch and settings reset');
assert.equal((await call(guest,{action:'chat_send',code,message:'/kick 主催'})).status,403);
assert.equal((await call(host,{action:'chat_send',code,message:'/kick 主催'})).status,400);
assert.equal((await call(host,{action:'chat_send',code,message:'/kick 不在'})).status,400);
r=await call(host,{action:'chat_send',code,message:'/kick 参加 者'});assert.equal(r.status,200);assert.ok(!r.data.players.some(p=>p.name==='参加 者'));
assert.equal((await call(guest,{action:'state',code})).status,403);
r=await call(host,{action:'chat_send',code,message:'/kick BOT1'});assert.equal(r.status,200);assert.ok(!r.data.players.some(p=>p.name==='BOT1'));
assert.equal((await call(guest,{action:'join',code,name:'参加 者'})).status,200);
await call('duplicate',{action:'join',code,name:'参加 者'});
assert.equal((await call(host,{action:'chat_send',code,message:'/kick 参加 者'})).status,400);
sql.prepare("UPDATE rooms SET status='playing' WHERE code=?").run(code);
assert.equal((await call(host,{action:'chat_send',code,message:'/kick BOT2'})).status,409);
console.log('PASS: kick host-only, self/unknown/duplicate rejection, spaced names, BOT removal, membership revoked, rejoin allowed and playing-phase rejection');
const ts=(await import('typescript')).default;
const rules=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(fs.readFileSync('lib/panel-rules.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022}}).outputText).toString('base64'));
for(const difficulty of Object.keys(rules.difficultyRanges).filter(d=>d.startsWith('ura_'))){
 const rates=new Set();
 for(let round=0;round<150;round++){const b=rules.boardPattern(12345,round,difficulty);rates.add(b.rate);assert.ok(b.safe.length>0);assert.equal(b.safe.length+b.damage.length,rules.targetCount(difficulty,round));assert.ok(!b.safe.some(i=>b.damage.includes(i)));assert.deepEqual(b,rules.boardPattern(12345,round,difficulty));assert.ok(b.rate>=10&&b.rate<=50)}
 if(difficulty==='ura_lunatic')assert.ok(rates.size>20);else assert.equal(rates.size,1);
 const token='ura-'+difficulty;let r=await call(token,{action:'create',name:'裏テスト',difficulty});const code=r.data.room.code,id=r.data.meId;
 await call(token,{action:'ready',code,ready:true});r=await call(token,{action:'start',code});assert.equal(r.status,200);
 sql.prepare('UPDATE rooms SET started_at=? WHERE code=?').run(Date.now()-1,code);
 let round=2,b;do{b=rules.boardPattern(r.data.room.seed,round++,difficulty)}while(!b.damage.length);round--;
 sql.prepare('UPDATE players SET current_round=?,score=1000,combo=5 WHERE id=?').run(round,id);
 r=await call(token,{action:'push',code,round,index:b.damage[0]});let p=r.data.players.find(p=>p.id===id);assert.equal(p.score,950);assert.equal(p.combo,0);assert.equal(p.round,round+1);assert.deepEqual(p.pressed,[]);assert.equal(p.perfects,0);
 // Old queued inputs must not affect the replacement board.
 r=await call(token,{action:'push',code,round,index:b.safe[0]});assert.equal(r.data.players.find(p=>p.id===id).score,950);
 round++;b=rules.boardPattern(r.data.room.seed,round,difficulty);
 for(const index of b.safe)r=await call(token,{action:'push',code,round,index});p=r.data.players.find(p=>p.id===id);assert.equal(p.round,round+1);assert.equal(p.perfects,1);
}
let d=await call('disband-host',{action:'create',name:'解体主'});const dc=d.data.room.code;
await call('disband-guest',{action:'join',code:dc,name:'参加者'});
assert.equal((await call('disband-guest',{action:'chat_send',code:dc,message:'/kick'})).status,403);
await call('disband-host',{action:'chat_send',code:dc,message:'/bot 1 2'});
assert.equal((await call('disband-host',{action:'chat_send',code:dc,message:'/kick   '})).data.disbanded,true);
for(const table of ['players','messages','panel_readiness'])assert.equal(sql.prepare(`SELECT count(*) n FROM ${table} WHERE room_code=?`).get(dc).n,0);
assert.equal(sql.prepare('SELECT count(*) n FROM rooms WHERE code=?').get(dc).n,0);
assert.equal((await call('disband-guest',{action:'state',code:dc})).status,403);
assert.equal((await call('disband-host',{action:'state',code:dc})).status,403);
assert.equal((await call('new-guest',{action:'join',code:dc,name:'新規'})).status,404);
console.log('PASS: six hidden difficulties, variable rates, safe-board guarantee, damage penalty/reset, stale inputs, clear without damage, and room disband');
