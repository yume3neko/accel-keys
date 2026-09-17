"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crown, LogIn, MessageCircle, Plus, RotateCcw, Send, Sparkles, Target, Trophy, Users, Zap } from "lucide-react";

type Player = { id:string; name:string; score:number; combo:number; bestCombo:number; round:number; pressed:number[]; mistakes:number; perfects:number; online:boolean };
type Difficulty="easy"|"normal"|"hard"|"expert"|"master"|"lunatic";
type Room = { code:string; status:"waiting"|"playing"|"finished"; hostId:string; duration:number; difficulty:Difficulty; seed:number; startedAt:number|null; endsAt:number|null };
type ChatMessage={id:number;playerId:string;name:string;body:string;createdAt:number};
type Snapshot = { room:Room; players:Player[]; messages:ChatMessage[]; now:number };

const API = "/api/panel-push";
const palette = ["#ff4d6d","#ff9f1c","#ffe047","#42e9a9","#28c7fa","#8b7bff"];

function pattern(seed:number, round:number, count:number){
  let x=(seed ^ Math.imul(round+1, 0x9e3779b1))>>>0;
  const cells=Array.from({length:25},(_,i)=>i);
  for(let i=24;i>0;i--){ x=(Math.imul(x,1664525)+1013904223)>>>0; const j=x%(i+1); [cells[i],cells[j]]=[cells[j],cells[i]]; }
  return cells.slice(0,count);
}
const difficultyRanges:Record<Difficulty,[number,number]>={easy:[1,3],normal:[3,7],hard:[5,10],expert:[7,15],master:[9,17],lunatic:[12,22]};
function targetCount(difficulty:Difficulty,round:number){const [min,max]=difficultyRanges[difficulty];return Math.min(max,min+Math.floor(round/2))}
function deviceToken(){
  let token=localStorage.getItem("panel-push-token");
  if(!token){ token=crypto.randomUUID(); localStorage.setItem("panel-push-token",token); }
  return token;
}
async function call(body:Record<string,unknown>){
  const res=await fetch(API,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...body,token:deviceToken()}),cache:"no-store"});
  const json=await res.json(); if(!res.ok) throw new Error(json.error||"通信に失敗しました"); return json;
}

export default function Home(){
  const [screen,setScreen]=useState<"home"|"lobby"|"game">("home");
  const [name,setName]=useState(""); const [joinCode,setJoinCode]=useState("");
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null); const [meId,setMeId]=useState("");
  const [duration,setDuration]=useState(60); const [difficulty,setDifficulty]=useState<Difficulty>("normal"); const [chatText,setChatText]=useState("");
  const [error,setError]=useState(""); const [busy,setBusy]=useState(false); const [tick,setTick]=useState(Date.now());
  const [flash,setFlash]=useState<"good"|"miss"|"perfect"|null>(null); const flashTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const inputQueue=useRef<Promise<void>>(Promise.resolve());
  const room=snapshot?.room; const me=snapshot?.players.find(p=>p.id===meId); const isHost=room?.hostId===meId;
  const active=useMemo(()=>room&&me?pattern(room.seed,me.round,targetCount(room.difficulty,me.round)):[],[room,me]);
  const remaining=room?.endsAt?Math.max(0,Math.ceil((room.endsAt-tick)/1000)):room?.duration??60;

  const refresh=useCallback(async()=>{
    if(!room?.code) return;
    try { const data=await call({action:"state",code:room.code}); setSnapshot(data); if(data.room.status==="playing") setScreen("game"); }
    catch(e){ setError(e instanceof Error?e.message:"通信エラー"); }
  },[room?.code]);

  useEffect(()=>{ if(!room?.code)return; const id=setInterval(refresh,850); return()=>clearInterval(id); },[room?.code,refresh]);
  useEffect(()=>{ const id=setInterval(()=>setTick(Date.now()),200); return()=>clearInterval(id); },[]);

  async function enter(action:"create"|"join"){
    if(!name.trim()){setError("プレイヤー名を入力してください");return;} setBusy(true);setError("");
    try{ const data=await call({action,name:name.trim().slice(0,12),code:joinCode.toUpperCase(),duration,difficulty}); setSnapshot(data);setMeId(data.meId);setScreen("lobby"); }
    catch(e){setError(e instanceof Error?e.message:"参加できませんでした");}finally{setBusy(false);}
  }
  useEffect(()=>{
    const context=(document as unknown as {modelContext?:{registerTool?:(tool:unknown,options?:{signal?:AbortSignal})=>void|Promise<void>}}).modelContext;
    if(!context?.registerTool)return;
    const lifecycle=new AbortController();
    void Promise.resolve(context.registerTool({name:"create_game_room",title:"対戦ルームを作成",description:"指定したプレイヤー名と難易度で新しいパネルプッシュ対戦ルームを作成し、ロビーを表示します。",inputSchema:{type:"object",properties:{playerName:{type:"string",minLength:1,maxLength:12},duration:{type:"integer",enum:[30,60,90]},difficulty:{type:"string",enum:["easy","normal","hard","expert","master","lunatic"]}},required:["playerName"],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:async(input:unknown)=>{const v=input as {playerName?:string;duration?:number;difficulty?:Difficulty};if(!v.playerName?.trim())throw new Error("playerName is required");const data=await call({action:"create",name:v.playerName.trim().slice(0,12),duration:v.duration??60,difficulty:v.difficulty??"normal"});setName(v.playerName);setSnapshot(data);setMeId(data.meId);setScreen("lobby");return {roomCode:data.room.code,status:"waiting"}}},{signal:lifecycle.signal})).catch(()=>{});
    return()=>lifecycle.abort();
  },[]);
  async function start(){ if(!room)return;setBusy(true);try{const d=await call({action:"start",code:room.code});setSnapshot(d);setScreen("game");}catch(e){setError(e instanceof Error?e.message:"開始できませんでした");}finally{setBusy(false);} }
  async function sendChat(){if(!room||!chatText.trim())return;const message=chatText.trim();setChatText("");try{const d=await call({action:"chat_send",code:room.code,message});setSnapshot(d);}catch(e){setChatText(message);setError(e instanceof Error?e.message:"送信できませんでした");}}
  async function pushCell(index:number){
    if(!room||!me||room.status!=="playing")return;
    const wanted=active.includes(index)&&!me.pressed.includes(index); const willPerfect=wanted&&me.pressed.length+1===active.length&&me.mistakes===0;
    setFlash(willPerfect?"perfect":wanted?"good":"miss"); if(flashTimer.current)clearTimeout(flashTimer.current);flashTimer.current=setTimeout(()=>setFlash(null),350);
    inputQueue.current=inputQueue.current.then(async()=>{try{const current=snapshot?.players.find(p=>p.id===meId);const d=await call({action:"push",code:room.code,index,round:current?.round??me.round});setSnapshot(d);}catch(e){setError(e instanceof Error?e.message:"入力を送れませんでした");}});
  }
  function leave(){setSnapshot(null);setMeId("");setScreen("home");setError("");}

  if(screen==="home") return <main className="shell home-shell">
    <section className="brand-block"><div className="logo-mark"><span/><span/><span/><span/></div><p>ACCURACY × SPEED</p><h1>PANEL<br/><em>PUSH</em> ARENA</h1><div className="rule-line"><span><Target size={18}/> 正確に押す</span><span><Zap size={18}/> 素早くクリア</span><span><Trophy size={18}/> 最高得点を狙う</span></div></section>
    <section className="entry-card">
      <div className="eyebrow">PLAYER ENTRY</div><h2>対戦に参加</h2>
      <label>プレイヤー名<input value={name} onChange={e=>setName(e.target.value)} maxLength={12} placeholder="なまえを入力"/></label>
      <div className="settings"><label>制限時間<select value={duration} onChange={e=>setDuration(+e.target.value)}><option value={30}>30秒</option><option value={60}>60秒</option><option value={90}>90秒</option></select></label><label>難易度<select value={difficulty} onChange={e=>setDifficulty(e.target.value as Difficulty)}><option value="easy">EASY（1–3枚）</option><option value="normal">NORMAL（3–7枚）</option><option value="hard">HARD（5–10枚）</option><option value="expert">EXPERT（7–15枚）</option><option value="master">MASTER（9–17枚）</option><option value="lunatic">LUNATIC（12–22枚）</option></select></label></div>
      <button className="primary" disabled={busy} onClick={()=>enter("create")}><Plus/>ルームを作る</button>
      <div className="or"><span/>または<span/></div>
      <div className="join-row"><input aria-label="ルームコード" value={joinCode} onChange={e=>setJoinCode(e.target.value.replace(/[^a-z0-9]/gi,"").slice(0,6))} placeholder="6桁コード"/><button disabled={busy||joinCode.length!==6} onClick={()=>enter("join")}><LogIn/>参加</button></div>
      {error&&<p className="error">{error}</p>}
    </section>
  </main>;

  if(screen==="lobby"&&room) return <main className="shell lobby-shell"><header className="mini-head"><b>PANEL <em>PUSH</em></b><button onClick={leave}>退出</button></header><section className="lobby-card">
    <div className="eyebrow">ROOM CODE</div><div className="room-code">{room.code}</div><p className="share-hint">このコードを対戦相手に共有してください</p>
    <div className="lobby-info"><span><Users/> {snapshot.players.length}人</span><span>{room.duration}秒</span><span>{room.difficulty.toUpperCase()} {difficultyRanges[room.difficulty][0]}–{difficultyRanges[room.difficulty][1]}枚</span></div>
    <div className="player-list">{snapshot.players.map((p,i)=><div className="player-wait" key={p.id}><span className="avatar" style={{background:palette[i%palette.length]}}>{p.name[0]}</span><strong>{p.name}{p.id===meId&&<small> YOU</small>}</strong>{p.id===room.hostId&&<Crown className="crown"/>}<i className={p.online?"online":"offline"}/></div>)}</div>
    <section className="lobby-chat"><h3><MessageCircle/> 待機チャット</h3><div className="chat-log">{snapshot.messages.length?snapshot.messages.map(m=><div className={m.playerId===meId?"chat-message mine":"chat-message"} key={m.id}><b>{m.name}</b><p>{m.body}</p></div>):<p className="chat-empty">まだメッセージはありません</p>}</div><div className="chat-compose"><input value={chatText} onChange={e=>setChatText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.nativeEvent.isComposing)void sendChat()}} maxLength={120} placeholder="メッセージを入力"/><button onClick={sendChat} disabled={!chatText.trim()} aria-label="送信"><Send/></button></div></section>
    {isHost?<button className="primary start" disabled={busy} onClick={start}><Zap/>ゲームスタート</button>:<div className="waiting"><span/><span/><span/> ホストの開始を待っています</div>}
    {error&&<p className="error">{error}</p>}
  </section></main>;

  if(!room||!me)return null;
  const ranking=[...snapshot!.players].sort((a,b)=>b.score-a.score||b.round-a.round);
  const ended=room.status==="finished"||remaining<=0;
  return <main className="game-shell"><header className="game-head"><b>PANEL <em>PUSH</em></b><div className="room-pill">ROOM {room.code}</div><div className="live"><i/> LIVE</div></header>
    <section className="game-stats"><div><small>SCORE</small><strong>{me.score.toLocaleString()}</strong></div><div className="timer"><small>TIME</small><strong>{remaining}</strong><span>SEC</span></div><div><small>COMBO</small><strong>{me.combo}<span>x</span></strong></div></section>
    <section className="arena"><div className="board-wrap"><div className={`callout ${flash||""}`}>{flash==="miss"?"MISS  −50":flash==="perfect"?"PERFECT!  +BONUS":flash==="good"?"NICE!":"光っているパネルを全部押せ！"}</div><div className="board">{Array.from({length:25},(_,i)=>{const lit=active.includes(i)&&!me.pressed.includes(i);return <button key={i} aria-label={`${i+1}番パネル${lit?" 光っています":""}`} className={lit?"panel lit":"panel"} style={lit?{"--panel-color":palette[(i+me.round)%palette.length]} as React.CSSProperties:undefined} onPointerDown={()=>pushCell(i)}><span>{lit&&<Sparkles/>}</span></button>})}</div><div className="round-label">ROUND <b>{me.round+1}</b><span>{active.length-me.pressed.length} LEFT</span></div></div>
      <aside className="ranking"><div className="rank-title"><Trophy/> LIVE RANKING</div>{ranking.map((p,i)=><div className={`rank-row ${p.id===meId?"mine":""}`} key={p.id}><b className="place">{i+1}</b><span className="avatar" style={{background:palette[Math.max(0,snapshot!.players.findIndex(x=>x.id===p.id))%palette.length]}}>{p.name[0]}</span><div><strong>{p.name}</strong><small>ROUND {p.round+1} · {p.perfects} PERFECT</small></div><em>{p.score.toLocaleString()}</em></div>)}</aside>
    </section>
    {ended&&<div className="result-overlay"><section className="result-card"><div className="eyebrow">TIME UP</div><Trophy className="big-trophy"/><h2>{ranking[0]?.id===meId?"あなたの勝利！":"ゲーム終了！"}</h2><div className="podium">{ranking.slice(0,3).map((p,i)=><div key={p.id}><span>{i+1}</span><strong>{p.name}</strong><b>{p.score.toLocaleString()}</b></div>)}</div><div className="result-actions">{isHost&&<button className="primary" onClick={start}><RotateCcw/>もう一度</button>}<button onClick={leave}>タイトルへ</button></div></section></div>}
  </main>;
}
