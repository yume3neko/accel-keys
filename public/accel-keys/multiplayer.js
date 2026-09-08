import {enhanced,hp,teamHP,active,windows,special} from './multiplayer-rules.js';
import {makeChart,bpm,multiplier} from './multiplayer-engine.js';
const $=id=>document.getElementById(id), K=['D','F','J','K'];
const guide=new AccelMetronome();guide.mount();
const token=sessionStorage.getItem('accel-multi-token')||crypto.randomUUID();
sessionStorage.setItem('accel-multi-token',token);
let room=null,activeMatch=null,startPerf=0,chart=null,next=null,notes=[],pollTimer=0,raf=0,lastOK=performance.now();
let events=[],eventSeq=0;
let stats=empty(), chain=Promise.resolve(), gameActive=false, closing=false, judgeTimer=0;
let hs=readSetting('accel-keys-hs',1,.5,2),line=readSetting('accel-keys-line-offset',0,-15,160);
function readSetting(key,def,min,max){const v=Number(localStorage.getItem(key)??def);return Number.isFinite(v)?Math.min(max,Math.max(min,v)):def;}
function empty(){return {seq:0,score:0,combo:0,bestCombo:0,miss:0,hits:0,elapsed:0};}
const modeName=m=>m==='cosmos'?'加速する大宇宙':'通常モード';
const kindName=k=>k==='team'?'チームバトル（2対2）':k==='coop'?'協力モード':'サバイバルバトル';
const rules=k=>k==='team'?'各チーム2人・合計HP8。HP0でも支援は続行できますが回復は受けられません。チーム全員のHP0で敗北。':k==='coop'?'全員で「人数×4回」のミス枠を共有。1つでも長くつなごう。途中退出・15秒以上の通信切断で協力終了。':'各自4ミスで脱落。最後まで残った人が勝利。同時に全員脱落した場合は引き分け。';
$('name').value=localStorage.getItem('accel-multi-name')||'';
$('hs').value=hs;$('line').value=line;
function settings(){hs=Number($('hs').value);line=Number($('line').value);$('hsText').textContent='×'+hs.toFixed(1);$('lineText').textContent=line===0?'標準':(line>0?'上へ ':'下へ ')+Math.abs(line)+'px';localStorage.setItem('accel-keys-hs',hs);localStorage.setItem('accel-keys-line-offset',line);}
$('hs').oninput=settings;$('line').oninput=settings;settings();
$('kind').onchange=()=>{$('rule').textContent=rules($('kind').value);};$('kind').onchange();
const invited=new URL(location.href).searchParams.get('room');if(invited)$('codeInput').value=invited.toUpperCase();
let debugInput=false;
function updateDebugInput(){
  const debug=$('codeInput').value.trim()==='000000';
  if(debug!==debugInput){
    if(!debug)$('name').value=localStorage.getItem('accel-multi-name')||'';
    else if($('name').value===(localStorage.getItem('accel-multi-name')||''))$('name').value='';
    debugInput=debug;
  }
  $('name').type=debug?'password':'text';
  $('name').maxLength=4096;
  $('name').autocomplete=debug?'off':'nickname';
  $('name').placeholder=debug?'管理者パスワード':'12文字まで';
  $('nameLabel').textContent=debug?'管理者パスワード（デバッグルーム）':'プレイヤー名';
  $('create').disabled=debug;
}
$('codeInput').oninput=updateDebugInput;updateDebugInput();
function name(){if($('codeInput').value.trim()==='000000')throw Error('デバッグルームは「参加する」から入室してください。');const n=$('name').value;if(!n.trim())throw Error('プレイヤー名を入力してください。');$('name').value='';return n;}
function roomCode(){const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return [...crypto.getRandomValues(new Uint8Array(6))].map(v=>alphabet[v%alphabet.length]).join('');}
function send(action,extra={}){
  const operation=chain.catch(()=>{}).then(async()=>{
    const before=performance.now();
    const body={action,code:room?.code,...extra};
    if(action==='sync'&&gameActive&&room?.phase==='playing'){
      stats.elapsed=Math.max(stats.elapsed,Math.floor(Math.max(0,before-startPerf)));
      body.stats={...stats,seq:++stats.seq};body.match=activeMatch;if(enhanced(room))body.events=events.slice(0,80);
    }
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);
    try{
      const response=await fetch('/api/multiplayer',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(body),signal:controller.signal});
      const data=await response.json();
      if(!response.ok)throw Object.assign(new Error(data.error||'接続できませんでした。'),{status:response.status,code:data.code});
      const received=performance.now();lastOK=received;
      if(!closing)receive(data,received,(received-before)/2);
      return data;
    }finally{clearTimeout(timer);}
  });chain=operation;return operation;
}
async function action(button,fn){button.disabled=true;$('message').textContent='';try{await fn();}catch(e){$('message').textContent=e.name==='AbortError'?'通信がタイムアウトしました。もう一度お試しください。':e.message;}finally{button.disabled=false;if(room)renderRoom();}}
function badge(element,player){if(player?.creator){const b=document.createElement('span');b.className='creator-badge';b.textContent='製作者';element.append(b);}}
$('create').onclick=()=>action($('create'),async()=>{await send('create',{name:name(),mode:$('mode').value,kind:$('kind').value,code:roomCode()});schedule();});
$('joinForm').onsubmit=e=>{e.preventDefault();return action($('join'),async()=>{
  const code=$('codeInput').value.trim().toUpperCase(),debug=code==='000000';
  const enteredName=debug?$('name').value:name();
  if(debug)$('name').value='';
  await send('join',{name:enteredName,code,mode:$('mode').value,kind:$('kind').value});schedule();
});};
$('specials').onchange=()=>action($('specials'),()=>send('settings',{specials:$('specials').value==='on'}));
$('addCPU').onclick=()=>action($('addCPU'),()=>send('addCPU'));
$('ready').onclick=()=>action($('ready'),()=>send('ready',{ready:!room.players.find(p=>p.id===room.you)?.ready}));
$('start').onclick=()=>action($('start'),()=>send('start'));
$('copy').onclick=()=>action($('copy'),async()=>{const url=new URL(location.href);url.searchParams.set('room',room.code);try{await navigator.clipboard.writeText(url.href);$('message').textContent='招待リンクをコピーしました。';}catch{$('message').textContent='ルーム番号 '+room.code+' を友だちに伝えてください。';}});
async function leave(){
  if(!room)return;
  if(room.phase==='playing'&&!confirm(room.kind==='coop'?'退出すると全員の協力プレイが終了します。退出しますか？':'退出すると脱落します。退出しますか？'))return;
  guide.stop();closing=true;clearTimeout(pollTimer);
  try{await send('leave');}catch{}
  room=null;activeMatch=null;gameActive=false;closing=false;cancelAnimationFrame(raf);notes=[];
  $('play').hidden=true;$('lobby').hidden=true;$('results').hidden=true;$('setup').hidden=false;
  $('connection').textContent='';$('message').textContent='';document.body.style.overflow='';
}
$('leave').onclick=leave;$('quit').onclick=leave;$('again').onclick=leave;
function schedule(){clearTimeout(pollTimer);if(room&&!closing&&room.phase!=='finished')pollTimer=setTimeout(poll,900);}
async function poll(){
  try{await send('sync');$('connection').textContent='接続中';$('netStatus').textContent='';}
  catch(e){
    $('connection').textContent='再接続中…';$('netStatus').textContent='再接続中…15秒以上切れると退出扱いになります。';
    if([403,404].includes(e.status)){$('message').textContent=e.message;clearTimeout(pollTimer);gameActive=false;guide.stop();$('overlay').textContent=e.message;return;}
  }finally{if(gameActive&&performance.now()-lastOK>15000)$('netStatus').textContent='通信が切れています。再接続を待っています…';}
  schedule();
}
function receive(data,received,halfRTT){
  room=data;events=events.filter(e=>e.seq>(room.players.find(p=>p.id===room.you)?.eventSeq??0));
  $('setup').hidden=true;$('lobby').hidden=room.phase!=='lobby';$('results').hidden=room.phase!=='finished';
  if(room.phase==='playing'&&activeMatch!==room.match){
    activeMatch=room.match;startPerf=received+(room.startAt-room.serverNow)-halfRTT;
    chart=makeChart(room.mode,room.seed);next=chart.next();notes=[];stats=empty();events=[];eventSeq=0;gameActive=true;
    guide.start(startPerf+2500,t=>bpm(room.mode,t),room.mode==='cosmos'?4000:3000,()=>gameActive&&(performance.now()<startPerf||!stopped()));
    $('play').hidden=false;document.body.style.overflow='hidden';resize();cancelAnimationFrame(raf);raf=requestAnimationFrame(frame);
  }
  if(room.phase==='finished'){gameActive=false;guide.stop();cancelAnimationFrame(raf);$('play').hidden=true;document.body.style.overflow='';renderResults();clearTimeout(pollTimer);}
  renderRoom();
}
function member(parent,p,result=false){
  const row=document.createElement('div');row.className='member'+(p.left?' out':'');
  const who=document.createElement('span');who.textContent=p.name+(p.id===room.you?'（あなた）':'')+(p.id===room.host?' / ホスト':'');
  const detail=document.createElement('small');detail.textContent=result?`${p.stats.score.toLocaleString()}点 / 最大${p.stats.bestCombo}コンボ / ${p.stats.miss}ミス${p.left?' / 退出':''}`:(p.ready?'準備完了':'準備中');
  badge(who,p);
  row.append(who,detail);
  if(room.kind==='team'){
    const select=document.createElement('select');select.setAttribute('aria-label',p.name+'のチーム');
    for(const value of ['', 'A','B']){const o=document.createElement('option');o.value=value;o.textContent=value?'チーム '+value:'チームを選択';select.append(o);}
    select.value=p.team||'';select.disabled=result||room.phase!=='lobby'||(p.id!==room.you&&room.host!==room.you);
    select.onchange=()=>action(select,()=>send('team',{id:p.id,team:select.value}));row.append(select);
  }
  if(!result&&p.cpu&&room.debug&&room.host===room.you){
    const remove=document.createElement('button');remove.className='secondary';remove.textContent='削除';
    remove.onclick=()=>action(remove,()=>send('removeCPU',{id:p.id}));row.append(remove);
  }
  parent.append(row);
}
function renderRoom(){
  $('roomTitle').textContent=modeName(room.mode)+' / '+kindName(room.kind);$('roomCode').textContent=room.code;$('roomRule').textContent=rules(room.kind);
  $('specials').value=room.specials?'on':'off';$('specials').disabled=room.host!==room.you||room.phase!=='lobby';
  $('members').replaceChildren();room.players.forEach(p=>member($('members'),p));
  const me=room.players.find(p=>p.id===room.you);$('ready').textContent=me?.ready?'準備を取り消す':'準備完了';
  $('start').hidden=room.host!==room.you;$('start').disabled=room.phase!=='lobby'||room.players.length<2||room.players.some(p=>!p.ready)||(room.kind==='team'&&(room.players.length!==4||['A','B'].some(t=>room.players.filter(p=>p.team===t).length!==2)));
  $('addCPU').hidden=!room.debug||room.host!==room.you||room.phase!=='lobby';
  $('addCPU').disabled=room.players.length>=4;
  if(room.debug)$('roomRule').textContent+=' CPU：平均精度約74%、ミス率5〜10%（短いプレイではばらつきます）。';
  $('rivals').replaceChildren();
  for(const p of room.players){
    const row=document.createElement('div');row.className='rival'+(p.left||(room.kind==='battle'&&hp(p)<=0)?' out':'');
    const who=document.createElement('strong');who.textContent=(room.kind==='team'?'['+p.team+'] ':'')+p.name+(p.id===room.you?' · YOU':'');
    const value=document.createElement('span');value.textContent=p.stats.score.toLocaleString()+'点';
    const status=document.createElement('span');status.textContent=p.left?'退出':room.kind==='team'?`HP ${hp(p)}${hp(p)===0?' · 支援中':''}`:room.kind==='battle'?(hp(p)<=0?'脱落':`残り${hp(p)}ミス`):`${p.stats.miss}ミス`;
    badge(who,p);
    row.append(who,value,status);$('rivals').append(row);
  }
}
function renderResults(){
  const winner=room.players.find(p=>p.id===room.winner);
  $('resultTitle').textContent=room.kind==='coop'?'協力プレイ終了':winner?(winner.id===room.you?'あなたの勝利！':winner.name+' の勝利！'):'引き分け';
  if(room.kind==='team')$('resultTitle').textContent=room.winner?'チーム '+room.winner+' の勝利！':'引き分け';
  if(winner)badge($('resultTitle'),winner);
  const elapsed=Math.max(0,...room.players.map(p=>p.stats.elapsed));
  $('resultReason').textContent=room.kind==='coop'?`${(elapsed/1000).toFixed(1)}秒をつなぎました。合計${room.players.reduce((n,p)=>n+p.stats.score,0).toLocaleString()}点。`+(room.reason==='disconnect'?'参加者の退出・通信切断により終了しました。':'共有ミス枠を使い切りました。'):'同じ譜面でのサバイバル結果です。';
  $('resultRows').replaceChildren();[...room.players].sort((a,b)=>Number(b.id===room.winner)-Number(a.id===room.winner)||b.stats.score-a.stats.score).forEach(p=>member($('resultRows'),p,true));
}
const canvas=$('canvas'),ctx=canvas.getContext('2d');
function resize(){const r=canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);canvas.width=Math.max(1,Math.round(r.width*d));canvas.height=Math.max(1,Math.round(r.height*d));ctx.setTransform(d,0,0,d,0,0);}
new ResizeObserver(resize).observe(canvas);addEventListener('resize',resize);
function sharedMiss(){return room.players.reduce((n,p)=>n+(p.id===room.you?Math.max(p.stats.miss,stats.miss):p.stats.miss),0);}
function me(){return room?.players.find(p=>p.id===room.you)||{};}
function currentHP(){return Math.max(0,hp(me())-events.filter(e=>e.value===0&&!active(me(),'shield',e.at)).length);}
function stopped(){return !gameActive||performance.now()<startPerf||performance.now()-lastOK>15000||(room.kind==='team'?teamHP(room,me().team)<=0:room.kind==='battle'?(enhanced(room)?currentHP()<=0:stats.miss>=4):sharedMiss()>=room.life);}
function record(note,value){if(enhanced(room))events.push({seq:++eventSeq,note:note.id,value,at:Math.floor(performance.now()-startPerf)});}
function showJudge(text,color){$('judge').textContent=text;$('judge').style.color=color;clearTimeout(judgeTimer);judgeTimer=setTimeout(()=>{$('judge').textContent='';},240);}
function miss(note){record(note,0);if(active(me(),'shield',performance.now()-startPerf)){showJudge('SHIELD','#54e8ff');return;}stats.miss++;stats.combo=0;stats.elapsed=Math.max(stats.elapsed,Math.floor(performance.now()-startPerf));showJudge('MISS','#ff4964');}
function press(lane,automatic=null){
  if(stopped())return;
  const elapsed=performance.now()-startPerf;
  const bounds=windows(me(),elapsed);
  const note=automatic||notes.find(n=>!n.done&&n.lane===lane&&Math.abs(n.at-elapsed)<=bounds[2]);if(!note)return;
  note.done=true;const diff=Math.abs(note.at-elapsed),value=automatic?100:diff<=bounds[0]?100:diff<=bounds[1]?80:50;record(note,value);
  stats.hits++;stats.combo++;stats.bestCombo=Math.max(stats.bestCombo,stats.combo);stats.elapsed=Math.max(stats.elapsed,Math.floor(elapsed));
  stats.score+=Math.round(value*multiplier(room.mode,elapsed)*(1+Math.min(stats.combo,50)*.01));showJudge(value===100?'PERFECT':value===80?'GREAT':'GOOD',value===100?'#adff2f':value===80?'#54e8ff':'#ffe66a');
  const button=document.querySelector(`[data-lane="${lane}"]`);button.classList.add('active');setTimeout(()=>button.classList.remove('active'),80);
}
for(const button of document.querySelectorAll('[data-lane]'))button.onpointerdown=e=>{e.preventDefault();press(Number(button.dataset.lane));};
canvas.onpointerdown=e=>{e.preventDefault();const r=canvas.getBoundingClientRect();press(Math.min(3,Math.max(0,Math.floor((e.clientX-r.left)/(r.width/4)))));};
addEventListener('keydown',e=>{if($('play').hidden)return;const lane=K.indexOf(e.key.toUpperCase());if(lane>=0&&!e.repeat){e.preventDefault();press(lane);}});
function frame(now){
  if(!gameActive)return;
  const elapsed=now-startPerf,w=canvas.clientWidth,h=canvas.clientHeight,lane=w/4,lineY=Math.min(h-8,Math.max(30,h-45-line));
  const speed=multiplier(room.mode,elapsed),scroll=room.mode==='cosmos'?1:Math.max(1,speed-3);
  const pixelsPerMs=.145*hs*scroll;
  if(!stopped()){
    while(next.at<=elapsed+Math.max(6000,(lineY+28)/pixelsPerMs)){notes.push(next);next=chart.next();}
    for(const n of notes){if(!n.done&&active(me(),'auto',elapsed)&&n.at<=elapsed)press(n.lane,n);if(!n.done&&elapsed-n.at>windows(me(),elapsed)[2]){n.done=true;miss(n);if(stopped())break;}}
  }
  notes=notes.filter(n=>!n.done&&n.at>elapsed-300);
  ctx.clearRect(0,0,w,h);
  for(let i=0;i<4;i++){ctx.fillStyle=i%2?'#101a1e':'#081013';ctx.fillRect(i*lane,0,lane,h);ctx.strokeStyle='#2a353a';ctx.beginPath();ctx.moveTo(i*lane,0);ctx.lineTo(i*lane,h);ctx.stroke();}
  const lost=room.kind==='team'?4-currentHP():room.kind==='battle'?(enhanced(room)?4-currentHP():stats.miss):Math.floor(sharedMiss()/room.life*4);
  for(let i=0;i<4;i++){ctx.strokeStyle=i>=4-Math.min(4,lost)?'#ff4964':'#adff2f';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(i*lane,lineY);ctx.lineTo((i+1)*lane,lineY);ctx.stroke();}
  if(!stopped())for(const n of notes){const y=lineY+(elapsed-n.at)*pixelsPerMs;if(y< -22||y>h+22)continue;const gold=room.specials&&special(n.id,room.seed);ctx.fillStyle=gold?'#ffe16a':'#baff85';ctx.fillRect(n.lane*lane+6,y-11,lane-12,22);ctx.fillStyle='#071006';ctx.font='bold 13px Arial';ctx.textAlign='center';ctx.fillText((gold?'★ ':'')+K[n.lane],(n.lane+.5)*lane,y+5);}
  drawEffects(elapsed,w,h,lineY);
  $('score').textContent=stats.score.toLocaleString();$('combo').textContent=stats.combo;$('speed').textContent='×'+speed.toFixed(2);$('density').textContent='BPM '+bpm(room.mode,elapsed).toFixed(1);
  $('life').textContent=room.kind==='team'?`チーム${me().team} HP ${teamHP(room,me().team)} / 8・自分 ${currentHP()}${currentHP()===0?'（支援中・回復不可）':''}`:room.kind==='coop'?`共有：あと${Math.max(0,room.life-sharedMiss())}ミス / ${room.life}`:`あと${(enhanced(room)?currentHP():Math.max(0,4-stats.miss))}ミス`;
  $('overlay').textContent=elapsed<0?String(Math.ceil(-elapsed/1000)):performance.now()-lastOK>15000?'再接続を待っています…':stopped()?(room.kind==='battle'?'脱落しました。結果を待っています…':'協力プレイ終了。結果を確認しています…'):room.settleAt?'勝敗を確認しています…':'';
  raf=requestAnimationFrame(frame);
}
addEventListener('pagehide',()=>{if(room&&room.phase!=='finished')fetch('/api/multiplayer',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({action:'leave',code:room.code}),keepalive:true}).catch(()=>{});});







function drawEffects(t,w,h,lineY){
  const p=me(),labels={bottom:'下部妨害',top:'上部妨害',strict:'判定妨害',noise:'ノイズ',shield:'シールド',boost:'判定強化',auto:'オートプレイ'};
  const text=Object.entries(labels).filter(([k])=>active(p,k,t)).map(([k,label])=>label+' '+Math.ceil((p.effects[k]-t)/1000)+'秒');
  if(p.challenge)text.push('チャレンジ '+p.challenge.count+' / 100');
  if(p.notice&&t-p.notice.at<2500)text.push('発動：'+({attack:'おじゃま',heal:'味方HP+1',challenge:'100コンボチャレンジ',...labels}[p.notice.effect]||p.notice.effect)+(p.notice.target?' → '+p.notice.target:''));
  $('effects').textContent=text.join(' / ');
  ctx.fillStyle='#030508';if(active(p,'bottom',t))ctx.fillRect(0,lineY-h*.05,w,h*.05);if(active(p,'top',t))ctx.fillRect(0,0,w,h*.1);
  if(active(p,'noise',t)){ctx.fillStyle='rgba(170,190,190,.24)';for(let i=0;i<18;i++){const y=(i*71+Math.floor(t/100)*37)%h;ctx.fillRect((i*83)%w,y,w*.45,2+i%3);}}
}
