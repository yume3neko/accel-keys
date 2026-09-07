import {identifyName} from '../../lib/creator-identity.js';
import {makeChart,multiplier} from '../../public/accel-keys/multiplayer-engine.js';
const TTL=2*60*60*1000, DISCONNECT=15000;
const reply=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const blank=()=>({seq:0,score:0,combo:0,bestCombo:0,miss:0,hits:0,elapsed:0});
const cleanName=value=>String(value??'').trim().replace(/[<>\x00-\x1f]/g,'').slice(0,12);
function person(token,name,now,creator=false){return {id:crypto.randomUUID(),token,name,creator,ready:false,seen:now,left:false,stats:blank()};}
function debugRoom(body,now){
  return {code:'000000',debug:true,mode:body.mode==='cosmos'?'cosmos':'time',kind:body.kind==='coop'?'coop':'battle',phase:'lobby',host:null,players:[],createdAt:now,startAt:0};
}
function cpuRandom(cpu){cpu.rng=(Math.imul(cpu.rng,1664525)+1013904223)>>>0;return cpu.rng/4294967296;}
export function cpuJudgement(cpu){
  if(cpuRandom(cpu)<cpu.missRate)return 0;
  const value=cpuRandom(cpu);
  return value<.3?100:value<.8?80:50;
}
function advanceCPUs(room,now){
  if(!room.players.some(p=>p.cpu)||now<room.startAt)return;
  const chart=makeChart(room.mode,room.seed,room.cpuChart?.cursor);
  let next=room.cpuChart?.next??chart.next();
  const elapsed=now-room.startAt;
  while(next.at+170<=elapsed){
    for(const p of room.players.filter(p=>p.cpu&&!p.left&&(room.kind==='coop'||p.stats.miss<4))){
      const value=cpuJudgement(p),s=p.stats;
      s.seq++;s.elapsed=Math.floor(next.at+170);
      if(!value){s.miss++;s.combo=0;}
      else{s.hits++;s.combo++;s.bestCombo=Math.max(s.bestCombo,s.combo);s.score+=Math.round(value*multiplier(room.mode,next.at)*(1+Math.min(s.combo,50)*.01));}
      if(room.kind==='coop'&&room.players.reduce((sum,p)=>sum+p.stats.miss,0)>=room.life)break;
    }
    next=chart.next();
    if(room.kind==='coop'&&room.players.reduce((sum,p)=>sum+p.stats.miss,0)>=room.life)break;
    if(room.kind==='battle'&&room.players.filter(p=>!p.left&&p.stats.miss<4).length<=1)break;
  }
  room.cpuChart={cursor:chart.save(),next};
}
export function maintain(room,now){
  if(room.phase==='lobby'){
    room.players=room.players.filter(p=>!p.left&&(p.cpu||now-p.seen<=DISCONNECT));
    if(!room.players.some(p=>!p.cpu&&p.id===room.host))room.host=room.players.find(p=>!p.cpu)?.id??null;
    return;
  }
  if(room.phase==='finished')return;
  for(const p of room.players)if(!p.cpu&&!p.left&&now-p.seen>DISCONNECT){p.left=true;p.stats.miss=4;}
  if(now<room.startAt)return;
  advanceCPUs(room,now);
  if(room.kind==='coop'){
    if(room.players.some(p=>p.left)){room.phase='finished';room.reason='disconnect';}
    else if(room.players.reduce((n,p)=>n+p.stats.miss,0)>=room.life){room.phase='finished';room.reason='life';}
  }else{
    const alive=room.players.filter(p=>!p.left&&p.stats.miss<4);
    if(alive.length<=1&&!room.settleAt)room.settleAt=now+2500;
    if(room.settleAt&&now>=room.settleAt){room.phase='finished';room.winner=alive[0]?.id??null;room.reason=alive.length?'survivor':'draw';}
  }
  if(room.phase==='finished')room.finishedAt=now;
}
export function apply(room,token,body,now){
  // A returning player cannot revive after the disconnect grace period.
  maintain(room,now);
  let player=room.players.find(p=>p.token===token&&!p.left);
  if(body.action==='join'){
    if(!player){
      if(room.phase!=='lobby')fail('このルームはすでに開始しています。',409);
      if(room.players.length>=4)fail('ルームは満員です。',409);
      const name=cleanName(body.name);if(!name)fail('名前を入力してください。');
      player=person(token,name,now,body.creator);room.players.push(player);
      if(!room.host)room.host=player.id;
    }
  }
  if(body.action==='join'&&player){player.name=cleanName(body.name);player.creator=body.creator===true;}
  // Finished participants may still fetch the result after timing out.
  if(!player&&room.phase==='finished')player=room.players.find(p=>p.token===token);
  if(!player)fail('ルームへの接続が終了しました。入り直してください。',403);
  player.seen=now;
  if(body.action==='addCPU'||body.action==='removeCPU'){
    if(room.code!=='000000'||!room.debug||room.host!==player.id)fail('CPU操作はデバッグルームのホスト専用です。',403);
    if(room.phase!=='lobby')fail('CPU操作は開始前に行ってください。',409);
    if(body.action==='addCPU'){
      if(room.players.length>=4)fail('CPUを含めて4人までです。',409);
      const numbers=new Set(room.players.filter(p=>p.cpu).map(p=>p.name));
      let i=1;while(numbers.has('CPU '+i))i++;
      const cpu=person(null,'CPU '+i,now);
      Object.assign(cpu,{cpu:true,ready:true,rng:crypto.getRandomValues(new Uint32Array(1))[0],missRate:.05+crypto.getRandomValues(new Uint32Array(1))[0]/4294967296*.05});
      room.players.push(cpu);
    }else room.players=room.players.filter(p=>!(p.cpu&&p.id===body.id));
  }else if(body.action==='ready'){
    if(room.phase!=='lobby')fail('対戦は開始済みです。',409);
    player.ready=Boolean(body.ready);
  }else if(body.action==='start'){
    if(room.host!==player.id)fail('開始できるのはルームを作った人です。',403);
    if(room.phase==='lobby'){
      if(room.players.length<2||room.players.some(p=>!p.ready))fail('2人以上で、全員が準備完了にしてください。',409);
      room.phase='playing';room.startAt=now+5000;room.life=room.players.length*4;
      room.seed=crypto.getRandomValues(new Uint32Array(1))[0];room.match=crypto.randomUUID();
      delete room.cpuChart;
      for(const p of room.players)p.stats=blank();
    }
  }else if(body.action==='sync'&&room.phase==='playing'&&body.stats&&now>=room.startAt){
    if(body.match!==room.match)fail('対戦情報が更新されました。',409);
    const s=body.stats,old=player.stats;
    const values=['seq','score','combo','bestCombo','miss','hits','elapsed'];
    if(values.some(k=>!Number.isSafeInteger(s[k])||s[k]<0))fail('プレイ情報が正しくありません。');
    if(s.elapsed>now-room.startAt+2000||s.score>1e12||s.hits>1e6||s.miss>1e6||s.combo>s.hits||s.bestCombo>s.hits)fail('プレイ情報が範囲外です。');
    if(s.seq>old.seq&&!player.left&&(room.kind==='coop'||old.miss<4)){
      if(s.score<old.score||s.hits<old.hits||s.miss<old.miss||s.bestCombo<old.bestCombo||s.elapsed<old.elapsed)fail('プレイ情報が逆行しています。');
      player.stats=Object.fromEntries(values.map(k=>[k,s[k]]));
    }
  }else if(body.action==='leave'){
    player.left=true;player.stats.miss=Math.max(4,player.stats.miss);
  }
  maintain(room,now);
  return player.id;
}
function snapshot(room,you,now){const {cpuChart,...visible}=room;return {...visible,you,serverNow:now,players:room.players.map(({token,rng,missRate,...p})=>p)};}
export async function onRequestPost({request,env}){
  try{
    const origin=request.headers.get('origin');
    if(origin&&origin!==new URL(request.url).origin)return reply({error:'接続元が正しくありません。'},403);
    if(Number(request.headers.get('content-length')||0)>8192)return reply({error:'送信内容が大きすぎます。'},413);
    const raw=await request.text();if(raw.length>8192)return reply({error:'送信内容が大きすぎます。'},413);
    let body;try{body=JSON.parse(raw);}catch{return reply({error:'送信形式が正しくありません。'},400);}
    const token=request.headers.get('authorization')?.replace(/^Bearer /,'');
    if(!/^[0-9a-f-]{36}$/.test(token??''))return reply({error:'参加情報を取得できません。再読み込みしてください。'},401);
    if(!body||!['create','join','ready','start','sync','leave','addCPU','removeCPU'].includes(body.action))return reply({error:'操作が正しくありません。'},400);
    const debugJoin=body.action==='join'&&String(body.code??'').trim()==='000000';
    if(body.action==='create'&&body.code==='000000')fail('000000は予約済みです。「参加する」から認証してください。',403);
    if(debugJoin){
      if(!env.ADMIN_TOKEN||typeof body.name!=='string'||body.name!==env.ADMIN_TOKEN)fail('管理者パスワードが正しくありません。',401);
      // Never persist or reflect the password as a player name.
      body={...body,name:'ゆめみねこ',creator:true};
    }
    if(!debugJoin&&['create','join'].includes(body.action)){
      const identity=identifyName(body.name,body.adminPassword,env);
      body={...body,...identity};
      delete body.adminPassword;
    }
    const db=env.DB.withSession?env.DB.withSession('first-primary'):env.DB;
    await db.prepare(`CREATE TABLE IF NOT EXISTS multiplayer_rooms(code TEXT PRIMARY KEY,state TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 0,expires INTEGER NOT NULL)`).run();
    const now=Date.now();
    if(body.action==='create'){
      const name=cleanName(body.name);
      if(!name||!['time','cosmos'].includes(body.mode)||!['battle','coop'].includes(body.kind))fail('名前・モードを確認してください。');
      // Creation is idempotent per proposed room code and participant token.
      if(!/^[A-HJ-NP-Z2-9]{6}$/.test(body.code??''))fail('ルーム番号が正しくありません。');
      await db.prepare('DELETE FROM multiplayer_rooms WHERE expires < ?').bind(now).run();
      const p=person(token,name,now,body.creator);
      const room={code:body.code,mode:body.mode,kind:body.kind,phase:'lobby',host:p.id,players:[p],createdAt:now,startAt:0};
      const result=await db.prepare('INSERT OR IGNORE INTO multiplayer_rooms(code,state,expires) VALUES(?,?,?)').bind(body.code,JSON.stringify(room),now+TTL).run();
      if(!result.meta?.changes){
        const row=await db.prepare('SELECT state FROM multiplayer_rooms WHERE code=?').bind(body.code).first();
        const existing=JSON.parse(row.state);const owner=existing.players.find(x=>x.token===token);
        if(!owner)fail('ルーム番号が使用中です。もう一度作成してください。',409);
        return reply(snapshot(existing,owner.id,now));
      }
      return reply(snapshot(room,p.id,now),201);
    }
    const code=String(body.code??'').toUpperCase();if(code!=='000000'&&!/^[A-HJ-NP-Z2-9]{6}$/.test(code))fail('6文字のルーム番号を入力してください。');
    if(debugJoin)await db.prepare('INSERT OR IGNORE INTO multiplayer_rooms(code,state,expires) VALUES(?,?,?)').bind(code,JSON.stringify(debugRoom(body,now)),now+TTL).run();
    for(let attempt=0;attempt<8;attempt++){
      const row=await db.prepare('SELECT state,version,expires FROM multiplayer_rooms WHERE code=?').bind(code).first();
      if(!row||(row.expires<now&&!debugJoin))fail('ルームが見つからないか、有効期限が切れています。',404);
      let room=JSON.parse(row.state);
      if(debugJoin&&(row.expires<now||room.phase==='finished'||!room.players.some(p=>!p.cpu&&!p.left&&now-p.seen<=DISCONNECT)))room=debugRoom(body,now);
      const you=apply(room,token,body,now);
      const result=await db.prepare('UPDATE multiplayer_rooms SET state=?,version=version+1,expires=? WHERE code=? AND version=?').bind(JSON.stringify(room),now+TTL,code,row.version).run();
      if(result.meta?.changes)return reply(snapshot(room,you,now));
    }
    return reply({error:'通信が混み合っています。再試行します。'},503);
  }catch(error){return reply({error:error.status?error.message:'ルームに接続できませんでした。少し待って再試行してください。',code:error.code},error.status??500);}
}


