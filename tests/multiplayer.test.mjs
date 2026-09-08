import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {onRequestPost,apply,maintain,cpuJudgement} from '../functions/api/multiplayer.js';
import {makeChart,bpm,multiplier} from '../public/accel-keys/multiplayer-engine.js';
function fixture(){
 const db=new DatabaseSync(':memory:');
 const env={ADMIN_TOKEN:'debug-test-password-more-than-12',DB:{prepare(sql){let args=[];return {bind(...a){args=a;return this;},async run(){return {meta:{changes:db.prepare(sql).run(...args).changes}};},async first(){return db.prepare(sql).get(...args);}};}}};
 const tokens=Array.from({length:5},()=>crypto.randomUUID());
 async function request(i,body){const response=await onRequestPost({env,request:new Request('https://example.test/api/multiplayer',{method:'POST',headers:{authorization:'Bearer '+tokens[i],origin:'https://example.test','content-type':'application/json'},body:JSON.stringify({code:'ABCD23',...body})})});return {status:response.status,...await response.json()};}
 function time(value){const row=db.prepare('SELECT state FROM multiplayer_rooms WHERE code=?').get('ABCD23');const r=JSON.parse(row.state);r.startAt=value;for(const p of r.players)p.seen=Date.now();db.prepare('UPDATE multiplayer_rooms SET state=? WHERE code=?').run(JSON.stringify(r),'ABCD23');return r;}
 return {db,tokens,request,time};
}
const stats=(miss=0,seq=1)=>({seq,miss,score:100,combo:1,bestCombo:1,hits:1,elapsed:100});
test('same seeds produce identical charts; normal never repeats and cosmos order stays fixed',()=>{
 for(const mode of ['time','cosmos']){
 const a=makeChart(mode,42),b=makeChart(mode,42);let prev=-1,last=0;
 for(let i=0;i<5000;i++){const n=a.next();assert.deepEqual(n,b.next());assert.ok(n.at>last);last=n.at;if(mode==='cosmos')assert.equal(n.lane,[3,1,2,0][i%4]);else assert.notEqual(n.lane,prev);prev=n.lane;}
 }
 assert.equal(multiplier('time',600000),8);assert.equal(multiplier('cosmos',600000),21);
 assert.ok(bpm('time',600000)>bpm('time',300000));assert.ok(bpm('cosmos',600000)>bpm('cosmos',300000));
});
for(const mode of ['time','cosmos'])for(const kind of ['battle','coop'])test(`${mode}/${kind}: two players can join, start, report and finish`,async()=>{
 const f=fixture();try{
 const host=await f.request(0,{action:'create',name:'Host',mode,kind});assert.equal(host.status,201);assert.equal(JSON.stringify(host).includes(f.tokens[0]),false);
 assert.equal((await f.request(0,{action:'create',name:'Host',mode,kind})).status,200);
 assert.equal((await f.request(0,{action:'start'})).status,409);
 const guest=await f.request(1,{action:'join',name:'Guest'});assert.equal(guest.players.length,2);
 await Promise.all([f.request(0,{action:'ready',ready:true}),f.request(1,{action:'ready',ready:true})]);
 assert.equal((await f.request(1,{action:'start'})).status,403);
 const started=await f.request(0,{action:'start'});assert.equal(started.phase,'playing');assert.equal(started.life,8);
 assert.equal((await f.request(2,{action:'join',name:'late'})).status,409);
 assert.equal((await f.request(0,{action:'sync',stats:stats(4),match:started.match})).players[0].stats.miss,0);
 f.time(Date.now()-1000);
 const a=await f.request(0,{action:'sync',match:started.match,stats:stats(kind==='coop'?5:4)});assert.equal(a.phase,'playing');assert.equal(a.players[0].stats.miss,kind==='coop'?5:4);
 const duplicate=await f.request(0,{action:'sync',match:started.match,stats:stats(0)});assert.equal(duplicate.players[0].stats.miss,kind==='coop'?5:4);
 if(kind==='coop'){
 const done=await f.request(1,{action:'sync',match:started.match,stats:stats(3)});assert.equal(done.phase,'finished');assert.equal(done.reason,'life');
 }else{
 const row=f.db.prepare('SELECT state FROM multiplayer_rooms WHERE code=?').get('ABCD23'),room=JSON.parse(row.state);room.settleAt=Date.now()-1;f.db.prepare('UPDATE multiplayer_rooms SET state=? WHERE code=?').run(JSON.stringify(room),'ABCD23');
 const done=await f.request(1,{action:'sync'});assert.equal(done.phase,'finished');assert.equal(done.winner,guest.you);
 }
 }finally{f.db.close();}
});
test('CAS retains concurrent joins, max four players, host transfers on departure',async()=>{
 const f=fixture();try{await f.request(0,{action:'create',name:'Host',mode:'time',kind:'battle'});
 const joined=await Promise.all([1,2,3].map(i=>f.request(i,{action:'join',name:'P'+i})));assert.ok(joined.every(r=>r.status===200));
 assert.equal((await f.request(4,{action:'join',name:'extra'})).status,409);
 const lobby=await f.request(0,{action:'sync'});assert.equal(lobby.players.length,4);
 await f.request(0,{action:'leave'});const next=await f.request(1,{action:'sync'});assert.equal(next.players.length,3);assert.notEqual(next.host,lobby.host);
 assert.equal((await f.request(4,{action:'sync'})).status,403);
 }finally{f.db.close();}
});
test('shared misses from concurrent reports are not lost; invalid match and regressions rejected',async()=>{
 const f=fixture();try{await f.request(0,{action:'create',name:'A',mode:'cosmos',kind:'coop'});await f.request(1,{action:'join',name:'B'});await f.request(0,{action:'ready',ready:true});await f.request(1,{action:'ready',ready:true});const r=await f.request(0,{action:'start'});f.time(Date.now()-1000);
 assert.equal((await f.request(0,{action:'sync',match:'wrong',stats:stats()})).status,409);
 await Promise.all([0,1].map(i=>f.request(i,{action:'sync',match:r.match,stats:stats(2)})));
 const snapshot=await f.request(0,{action:'sync'});assert.equal(snapshot.players.reduce((n,p)=>n+p.stats.miss,0),4);
 assert.equal((await f.request(0,{action:'sync',match:r.match,stats:stats(0,2)})).status,400);
 }finally{f.db.close();}
});
test('disconnect ends coop, last two simultaneous eliminations draw, readiness expires',()=>{
 const now=100000,player=i=>({id:String(i),token:String(i),seen:now,ready:true,left:false,stats:stats()});
 const coop={phase:'playing',kind:'coop',startAt:1,life:8,players:[player(1),player(2)]};coop.players[0].seen=now-16000;maintain(coop,now);assert.equal(coop.reason,'disconnect');
 const battle={phase:'playing',kind:'battle',startAt:1,players:[player(1),player(2)]};battle.players.forEach(p=>p.stats.miss=4);maintain(battle,now);maintain(battle,now+2600);assert.equal(battle.reason,'draw');assert.equal(battle.winner,null);
 const lobby={phase:'lobby',host:'1',players:[player(1),player(2)]};lobby.players[0].seen=now-16000;maintain(lobby,now);assert.equal(lobby.host,'2');assert.equal(lobby.players.length,1);
});


test('reserved room authenticates before creation and never stores or returns password',async()=>{
 const f=fixture();try{
 assert.equal((await f.request(0,{action:'create',code:'000000',name:'x',mode:'time',kind:'battle'})).status,403);
 assert.equal((await f.request(0,{action:'join',code:'000000',name:'wrong'})).status,401);
 const joined=await f.request(0,{action:'join',code:'000000',name:'debug-test-password-more-than-12',mode:'cosmos',kind:'coop'});
 assert.equal(joined.status,200);assert.equal(joined.debug,true);assert.equal(joined.players[0].name,'ゆめみねこ');assert.equal(joined.mode,'cosmos');
 assert.equal(JSON.stringify(joined).includes('debug-test-password'),false);
 assert.equal(f.db.prepare('SELECT state FROM multiplayer_rooms WHERE code=?').get('000000').state.includes('debug-test-password'),false);
 assert.equal((await f.request(1,{action:'sync',code:'000000'})).status,403);
 assert.equal((await f.request(1,{action:'join',code:'000000',name:'wrong'})).status,401);
 for(let i=0;i<3;i++)assert.equal((await f.request(0,{action:'addCPU',code:'000000'})).status,200);
 assert.equal((await f.request(0,{action:'addCPU',code:'000000'})).status,409);
 const r=await f.request(0,{action:'sync',code:'000000'});assert.equal(r.players.filter(p=>p.cpu).length,3);
 await f.request(0,{action:'removeCPU',code:'000000',id:r.players.find(p=>p.cpu).id});
 assert.equal((await f.request(0,{action:'sync',code:'000000'})).players.length,3);
 await f.request(0,{action:'create',name:'normal',mode:'time',kind:'battle'});
 assert.equal((await f.request(0,{action:'addCPU'})).status,403);
 }finally{f.db.close();}
});
for(const mode of ['time','cosmos'])for(const kind of ['battle','coop'])test(`debug CPU progresses and finishes ${mode}/${kind}`,async()=>{
 const f=fixture();try{
 const auth={code:'000000'};
 await f.request(0,{...auth,action:'join',name:'debug-test-password-more-than-12',mode,kind});await f.request(0,{...auth,action:'addCPU'});await f.request(0,{...auth,action:'ready',ready:true});const started=await f.request(0,{...auth,action:'start'});assert.equal(started.phase,'playing');
 assert.equal((await f.request(0,{...auth,action:'addCPU'})).status,409);
 let state=JSON.parse(f.db.prepare('SELECT state FROM multiplayer_rooms WHERE code=?').get('000000').state);
 const start=Date.now();state.startAt=start;const bot=state.players.find(p=>p.cpu);bot.rng=42;bot.missRate=.075;
 for(let elapsed=1000;elapsed<=300000&&state.phase!=='finished';elapsed+=1000){state.players.find(p=>!p.cpu).seen=start+elapsed;maintain(state,start+elapsed);}
 assert.equal(state.phase,'finished');assert.equal(bot.left,false);assert.ok(bot.stats.hits>0);assert.ok(bot.stats.score>0);
 if(kind==='battle'){assert.equal(bot.stats.miss,4);assert.equal(state.winner,started.you);}else assert.equal(bot.stats.miss,8);
 // Re-entry after a completed test makes the reserved room reusable.
 f.db.prepare('UPDATE multiplayer_rooms SET state=? WHERE code=?').run(JSON.stringify(state),'000000');
 const fresh=await f.request(0,{...auth,action:'join',name:'debug-test-password-more-than-12',mode,kind});assert.equal(fresh.phase,'lobby');assert.equal(fresh.players.length,1);
 }finally{f.db.close();}
});
test('CPU weighted accuracy and miss rates match requested long-run ranges',()=>{
 for(const missRate of [.05,.075,.10]){const cpu={rng:12345,missRate};let total=0,misses=0;for(let i=0;i<100000;i++){const value=cpuJudgement(cpu);total+=value;if(!value)misses++;}assert.ok(total/100000>=70&&total/100000<=80);assert.ok(Math.abs(misses/100000-missRate)<.005);}
});
test('serialized chart resumes without changing CPU note schedule',()=>{
 for(const mode of ['time','cosmos']){const a=makeChart(mode,123);for(let i=0;i<23;i++)a.next();const b=makeChart(mode,0,JSON.parse(JSON.stringify(a.save())));for(let i=0;i<100;i++)assert.deepEqual(a.next(),b.next());}
});


test('BPM is the scheduling unit: cosmos starts at 90 and adds 6 every 4 seconds',()=>{
 assert.equal(bpm('cosmos',0),90);assert.equal(bpm('cosmos',3999),90);assert.equal(bpm('cosmos',4000),96);assert.equal(bpm('cosmos',8000),102);assert.equal(bpm('cosmos',4000000),6090);
 const chart=makeChart('cosmos',42);assert.ok(Math.abs(chart.next().at-2500-60000/90)<1e-6);
 assert.ok(Math.abs(bpm('time',0)-60000/1050)<1e-6);
 assert.ok(Math.abs(bpm('time',228000)-bpm('time',213000)-30)<1e-6);
});
