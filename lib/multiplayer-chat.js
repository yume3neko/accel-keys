const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
export const canManage=(room,p)=>p.id===room.host||p.creator===true;
export function addMessage(room,p,text,now,system=false){
  room.chat??=[];room.chat.push({id:crypto.randomUUID(),name:system?'システム':p.name,creator:!system&&p.creator===true,text,at:now});room.chat=room.chat.slice(-60);
}
export function makeCPU(room,level,now){
  let n=1;while(room.players.some(p=>p.name==='CPU '+n))n++;
  const random=crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;
  const rates={1:[.25,.1],2:[.15,.05],3:[.05,.05],4:[.01,.02],5:[0,0]};
  return {id:crypto.randomUUID(),token:null,name:'CPU '+n,cpu:true,level,ready:true,seen:now,left:false,rng:crypto.getRandomValues(new Uint32Array(1))[0],missRate:rates[level][0]+random*rates[level][1],stats:{seq:0,score:0,combo:0,bestCombo:0,miss:0,hits:0,elapsed:0}};
}
function target(room,name){const candidates=room.players.filter(p=>!p.left&&p.name===name);if(candidates.length!==1)fail(candidates.length?'同名のプレイヤーが複数いるため指定できません。':'対象のプレイヤーが見つかりません。');return candidates[0];}
export function chatAction(room,p,body,now){
  if(p.left)fail('退出済みです。',403);
  if(typeof body.requestId!=='string'||! /^[\w-]{8,64}$/.test(body.requestId))fail('送信IDが正しくありません。');
  p.chatRequests??=[];
  if(p.chatRequests.includes(body.requestId))return;
  if(now-(p.lastChat??-Infinity)<500)fail('少し間をあけて送信してください。',429);
  if(body.action==='changeMode'){
    if(!canManage(room,p))fail('ホスト／管理者専用です。',403);
    if(room.phase!=='lobby')fail('モード変更は開始前に行ってください。',409);
    if(!['time','cosmos'].includes(body.mode)||!['battle','coop','team'].includes(body.kind)||typeof body.specials!=='boolean')fail('モード設定が正しくありません。');
    const changedTeam=room.kind!==body.kind;room.mode=body.mode;room.kind=body.kind;room.specials=body.specials;
    for(const q of room.players){if(!q.cpu)q.ready=false;if(changedTeam)delete q.team;}
    addMessage(room,p,`${p.name} がモードを変更しました：${room.mode==='cosmos'?'大宇宙':'通常'} / ${{battle:'個人戦',coop:'協力',team:'チーム戦'}[room.kind]} / 特殊ノーツ${room.specials?'ON':'OFF'}`,now,true);
  }else{
    if(typeof body.text!=='string'||!body.text.trim()||body.text.length>200)fail('メッセージは1〜200文字で入力してください。');
    const text=body.text.trim().replace(/[\x00-\x1f\x7f]/g,' ');
    if(!text.startsWith('/'))addMessage(room,p,text,now);
    else{
      if(!canManage(room,p))fail('コマンドはホスト／管理者専用です。',403);
      let m;
      if((m=text.match(/^\/auto (.+) (true|false)$/i))){
        target(room,m[1]).commandAuto=m[2].toLowerCase()==='true';
        // Do not put command text, target, or acknowledgement in shared chat.
      }else if((m=text.match(/^\/(?:ban|kick) (.+)$/i))){
        const q=target(room,m[1]);if(q.id===p.id)fail('自分自身は退出させられません。');
        q.left=true;q.kicked=true;q.stats.miss=Math.max(4,q.stats.miss);q.hp=0;
        addMessage(room,p,`${p.name} が ${q.name} を退出させました。`,now,true);
      }else if((m=text.match(/^\/bot ([1-3])((?: [1-5]){1,3})$/i))){
        if(room.phase!=='lobby')fail('BOT追加は開始前に行ってください。',409);
        const count=Number(m[1]),levels=m[2].trim().split(' ').map(Number);
        if(levels.length!==count)fail('BOTの人数分のレベルを指定してください。');
        if(room.players.filter(q=>!q.left).length+count>4)fail('BOTを含めて4人までです。');
        for(const level of levels)room.players.push(makeCPU(room,level,now));
        addMessage(room,p,`${p.name} がBOTを${count}人追加しました（レベル ${levels.join(', ')}）。`,now,true);
      }else if(/^\/mode$/i.test(text)){
        if(room.phase!=='lobby')fail('モード変更は開始前に行ってください。',409);
        addMessage(room,p,`${p.name} がモード設定を開きました。`,now,true);
      }else fail('使い方：/auto 名前 True|False、/bot 人数 レベル…、/kick 名前、/mode');
    }
  }
  p.lastChat=now;p.chatRequests.push(body.requestId);p.chatRequests=p.chatRequests.slice(-100);
}
