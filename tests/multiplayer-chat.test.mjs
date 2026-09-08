import test from 'node:test';
import assert from 'node:assert/strict';
import {apply,cpuJudgement,onRequestPost} from '../functions/api/multiplayer.js';
import {makeCPU} from '../lib/multiplayer-chat.js';
import {DatabaseSync} from 'node:sqlite';
function fixture(){const room={mode:'time',kind:'battle',phase:'lobby',host:'h',players:[['h','Host'],['g','Guest'],['a','Admin']].map(([id,name])=>({id,token:id,name,creator:id==='a',seen:1000,ready:true,stats:{miss:0}}))};return room;}
const chat=text=>({action:'chat',text,requestId:crypto.randomUUID()});
test('chat visible to room; command permission uses stored identity; auto has no shared messages',()=>{
 const r=fixture();apply(r,'g',chat('こんにちは <script>alert(1)</script>'),1000);assert.equal(r.chat[0].name,'Guest');
 assert.throws(()=>apply(r,'g',{...chat('/auto Host True'),creator:true},2000),/ホスト／管理者/);
 const command=chat('/auto Guest True');apply(r,'h',command,2000);assert.equal(r.players[1].commandAuto,true);assert.equal(r.chat.length,1);
 apply(r,'h',command,2100);assert.equal(r.chat.length,1);
 apply(r,'a',chat('/auto Guest False'),3000);assert.equal(r.players[1].commandAuto,false);assert.equal(r.chat.length,1);
});
test('BOT command validates count, levels, room capacity and phase; retry cannot add twice',()=>{
 const r=fixture();r.players.pop();const command=chat('/bot 2 3 5');apply(r,'h',command,1000);assert.equal(r.players.length,4);assert.deepEqual(r.players.slice(2).map(p=>p.level),[3,5]);
 apply(r,'h',command,2000);assert.equal(r.players.length,4);assert.equal(r.chat.length,1);
 assert.throws(()=>apply(r,'h',chat('/bot 1 1'),3000),/4人/);
 const other=fixture();assert.throws(()=>apply(other,'h',chat('/bot 2 3'),1000),/人数分/);assert.throws(()=>apply(other,'h',chat('/bot 1 6'),1000),/正しくありません/);
 other.phase='playing';other.startAt=100000;assert.throws(()=>apply(other,'h',chat('/bot 1 1'),1000),/待機画面/);
});
test('BOT level accuracy increases monotonically, level 3 is baseline and level 5 always perfect',()=>{
 const rates=[];for(let level=1;level<=5;level++){const p=makeCPU({players:[]},level,1000);p.rng=123;let score=0;for(let i=0;i<50000;i++)score+=cpuJudgement(p);rates.push(score/50000);}
 assert.ok(rates.every((r,i)=>i===0||r>rates[i-1]));assert.ok(rates[2]>70&&rates[2]<80);assert.equal(rates[4],100);
});
test('kick and ban remove selected member; cannot self-kick or accidentally target duplicate names',()=>{
 const r=fixture();apply(r,'a',chat('/ban Host'),1000);assert.equal(r.host,'g');assert.equal(r.players.some(p=>p.id==='h'),false);
 assert.throws(()=>apply(r,'h',{action:'sync'},1000),/接続が終了/);
 assert.throws(()=>apply(r,'g',chat('/kick Guest'),2000),/自分自身/);
 r.players.push({...r.players[1],id:'b',token:'b'});assert.throws(()=>apply(r,'g',chat('/kick Admin'),2000),/同名/);
});
test('mode is manager-only, resets readiness and teams, and cannot change an active round',()=>{
 const r=fixture();apply(r,'a',chat('/mode'),1000);assert.match(r.chat[0].text,/設定を開き/);
 const change={action:'changeMode',mode:'cosmos',kind:'team',specials:true,requestId:crypto.randomUUID()};
 assert.throws(()=>apply(r,'g',change,2000),/ホスト／管理者/);apply(r,'a',change,2000);assert.equal(r.mode,'cosmos');assert.equal(r.kind,'team');assert.ok(r.players.every(p=>!p.ready));
 r.phase='playing';r.startAt=100000;assert.throws(()=>apply(r,'a',{...change,requestId:crypto.randomUUID()},3000),/待機画面/);
});
test('chat is bounded and rate-limited; results reject chat',()=>{
 const r=fixture();for(let i=0;i<65;i++){r.players.forEach(p=>p.seen=1000+i*600);apply(r,'g',chat('message '+i),1000+i*600);}
 assert.equal(r.chat.length,60);assert.throws(()=>apply(r,'g',chat('fast'),1000+64*600),/間をあけ/);
 r.phase='finished';assert.throws(()=>apply(r,'g',chat('お疲れさま'),50000),/待機画面/);
});
test('API snapshots carry chat and private mode response; auto text is never persisted',async()=>{
 const db=new DatabaseSync(':memory:'),token=crypto.randomUUID();const env={DB:{prepare(sql){let args=[];return{bind(...a){args=a;return this},async run(){return{meta:{changes:db.prepare(sql).run(...args).changes}}},async first(){return db.prepare(sql).get(...args)}}}}};
 const request=async body=>{const response=await onRequestPost({env,request:new Request('https://example.test/api/multiplayer',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({code:'ABCD23',...body})})});assert.ok(response.ok,await response.clone().text());return response.json();};
 try{
 await request({action:'create',name:'Host',mode:'time',kind:'battle'});
 const r=await request(chat('/auto Host True'));assert.equal(r.players[0].commandAuto,true);assert.equal(r.chat,undefined);
 const stored=db.prepare('SELECT state FROM multiplayer_rooms').get().state;assert.equal(stored.includes('/auto'),false);assert.equal(JSON.stringify(r).includes(token),false);assert.equal(r.players[0].chatRequests,undefined);
 }finally{db.close();}
});
