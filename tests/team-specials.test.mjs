import test from 'node:test';
import assert from 'node:assert/strict';
import {initPlayer,judgeEvent,reward,hp,teamHP,windows,special,active} from '../public/accel-keys/multiplayer-rules.js';
import {apply,maintain} from '../functions/api/multiplayer.js';
function room(){const r={kind:'team',mode:'cosmos',phase:'lobby',host:'0',players:[],seed:7,startAt:1000};for(let i=0;i<4;i++){const p={id:String(i),token:String(i),name:'P'+i,team:i<2?'A':'B',ready:true,seen:1000,stats:{seq:0,score:0,combo:0,bestCombo:0,miss:0,hits:0,elapsed:0}};initPlayer(p);r.players.push(p);}return r;}
test('team requires four ready players with two on each team; host controls settings',()=>{
 const r=room();assert.throws(()=>apply(r,'1',{action:'settings',specials:true},1000),/ホスト/);
 apply(r,'0',{action:'settings',specials:true},1000);assert.ok(r.specials);assert.ok(r.players.every(p=>!p.ready));
 r.players.forEach(p=>p.ready=true);r.players[3].team='A';assert.throws(()=>apply(r,'0',{action:'start'},1000),/2人ずつ/);
 r.players[3].team='B';apply(r,'0',{action:'start'},1000);assert.equal(r.phase,'playing');assert.equal(teamHP(r,'A'),8);
 assert.throws(()=>apply(r,'0',{action:'settings'},1000),/開始前/);
});
test('HP0 supports partner, heals never revive, team survives until both are down',()=>{
 const r=room(),p=r.players[0],q=r.players[1];r.phase='playing';p.hp=0;q.hp=2;
 assert.equal(reward(r,p,1000,()=>.999),'heal');assert.equal(q.hp,3);assert.equal(p.hp,0);
 q.hp=4;for(let i=0;i<20;i++)reward(r,q,1000,()=>.999);assert.equal(p.hp,0);assert.equal(hp(q),4);
 maintain(r,1000);assert.equal(r.settleAt,undefined);q.hp=0;maintain(r,1000);assert.equal(r.settleAt,3500);maintain(r,3500);assert.equal(r.winner,'B');
});
test('special claim is deterministic, replay is idempotent and note cannot be claimed twice',()=>{
 const r=room(),p=r.players[0];r.specials=true;let note=1;while(!special(note,r.seed))note++;
 const e={seq:1,note,value:100};judgeEvent(r,p,e,1000,()=>0);assert.equal(p.effects.shield,6000);
 assert.equal(judgeEvent(r,p,e,2000,()=>0),false);assert.equal(p.effects.shield,6000);
 assert.throws(()=>judgeEvent(r,p,{...e,seq:2},3000),/再判定/);
});
test('shield expiry, stricter/boosted windows and 100 subsequent hits trigger 15-second auto',()=>{
 const r=room(),p=r.players[0];reward(r,p,1000,()=>0);
 judgeEvent(r,p,{seq:1,note:1,value:0},5999);assert.equal(p.hp,4);
 judgeEvent(r,p,{seq:2,note:2,value:0},6000);assert.equal(p.hp,3);
 p.effects.strict=20000;assert.ok(windows(p,7000)[2]<170);p.effects.strict=0;p.effects.boost=20000;assert.equal(windows(p,7000)[2],255);
 p.challenge={count:0};for(let n=3;n<102;n++)judgeEvent(r,p,{seq:n,note:n,value:100},7000+n);
 assert.equal(p.challenge.count,99);assert.equal(active(p,'auto',7102),false);
 judgeEvent(r,p,{seq:102,note:102,value:100},7102);assert.equal(p.effects.auto,22102);assert.equal(p.challenge,null);
 p.challenge={count:13};judgeEvent(r,p,{seq:103,note:103,value:0},23000);assert.equal(p.challenge,null);
 assert.equal(active({},'shield',-1000),false);
});
test('attack selects only an opponent and has a 5–10 second expiry',()=>{
 const r=room(),p=r.players[0];const draws=[.8,0,.6,.5];reward(r,p,1000,()=>draws.shift());
 assert.equal(r.players[2].effects.strict,8500);assert.deepEqual(r.players[1].effects,{});
});

test('debug team CPUs advance with effects and a down CPU keeps supporting its teammate',()=>{
 const r=room();r.phase='playing';r.specials=true;r.seed=7;
 for(const p of r.players){p.cpu=true;p.rng=123+Number(p.id);p.missRate=.08;}
 r.players[0].hp=0;
 maintain(r,10000);
 assert.ok(r.players[0].stats.hits>0);assert.equal(r.players[0].hp,0);
 assert.ok(r.players.every(p=>p.eventSeq>0));
 for(let now=11000;now<180000&&r.phase==='playing';now+=1000)maintain(r,now);
 assert.equal(r.phase,'finished');assert.ok(['A','B',null].includes(r.winner));
});
