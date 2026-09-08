// Shared timing and life rules. Effects are selected by the server only.
export const enhanced=r=>r.kind==='team'||r.specials===true;
export const hp=p=>p.left?0:Math.max(0,p.hp??(4-p.stats.miss));
export const teamHP=(r,t)=>r.players.filter(p=>p.team===t).reduce((n,p)=>n+hp(p),0);
export function special(id,seed){let x=Math.imul(id^(seed>>>0),0x45d9f3b);x=Math.imul(x^(x>>>16),0x45d9f3b);return ((x^(x>>>16))>>>0)%10===0;}
export const active=(p,key,t)=>t>=0&&(key==='auto'&&p.commandAuto===true||(p.effects?.[key]??0)>t);
export function windows(p,t){const scale=(active(p,'strict',t)?.65:1)*(active(p,'boost',t)?1.5:1);return [60,110,170].map(v=>v*scale);}
export function initPlayer(p){p.hp=4;p.eventSeq=0;p.effects={};p.challenge=null;p.usedNotes=[];}
export function reward(room,p,t,random=Math.random){
  const enemies=room.players.filter(q=>q.id!==p.id&&!q.left&&(room.kind==='team'?q.team!==p.team&&teamHP(room,q.team)>0:hp(q)>0));
  const friends=room.players.filter(q=>q.id!==p.id&&q.team===p.team&&hp(q)>0&&hp(q)<4);
  const pool=['shield','boost','challenge'];if(room.kind!=='coop'&&enemies.length)pool.push('attack');if(room.kind==='team'&&friends.length)pool.push('heal');
  const effect=pool[Math.floor(random()*pool.length)];
  p.notice={effect,at:t};
  if(effect==='heal'){const q=friends[Math.floor(random()*friends.length)];q.hp++;p.notice.target=q.name;}
  else if(effect==='attack'){const q=enemies[Math.floor(random()*enemies.length)],key=['bottom','top','strict','noise'][Math.floor(random()*4)];q.effects??={};q.effects[key]=t+5000+Math.floor(random()*5001);p.notice.target=q.name;}
  else if(effect==='challenge')p.challenge={count:0};
  else p.effects[effect]=t+(effect==='shield'?5000:10000);
  return effect;
}
export function judgeEvent(room,p,event,t,random=Math.random){
  if(event.seq<=(p.eventSeq??0))return false;
  if(event.seq!==(p.eventSeq??0)+1)throw Error('判定の送信順が正しくありません。');
  if(!Number.isSafeInteger(event.note)||event.note<1||event.note>1e6||![0,50,80,100].includes(event.value))throw Error('判定が正しくありません。');
  p.usedNotes??=[];
  if(p.usedNotes.includes(event.note)||event.note<(p.maxNote??0)-256)throw Error('同じノーツを再判定できません。');
  p.usedNotes.push(event.note);p.maxNote=Math.max(p.maxNote??0,event.note);p.usedNotes=p.usedNotes.filter(n=>n>=p.maxNote-256);p.eventSeq=event.seq;
  if(!event.value){if(!active(p,'shield',t)){p.hp=Math.max(0,p.hp-1);p.challenge=null;}}
  else if(p.challenge){if(++p.challenge.count>=100){p.effects.auto=t+15000;p.challenge=null;p.notice={effect:'auto',at:t};}}
  if(room.specials&&event.value&&special(event.note,room.seed))reward(room,p,t,random);
  return true;
}
