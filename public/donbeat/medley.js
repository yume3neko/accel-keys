'use strict';

// A medley uses one chart clock. Audio sources are reserved against that same
// AudioContext clock; animation-frame latency never controls the next song.
function medleyRange(c,spec={},finalSong=false){
 let from=Math.min(0,c.measures?.[0]?.time??c.notes[0]?.time??0),to=Math.max(c.duration||0,c.preloadedAudio?.duration||0,...c.notes.map(n=>(n.end??n.time)+.001));
 if(spec.range){[from,to]=spec.range}
 if(spec.measures){const [a,b]=spec.measures,list=c.measures||[];if(a>list.length||(!finalSong&&b>list.length+1))throw Error('小節の指定が譜面の範囲を超えています。');from=list[a-1].time;if(!finalSong)to=b===list.length+1?list[list.length-1].end:list[b-1].time}
 const first=c.measures?.[0]?.time??Math.min(0,c.notes[0]?.time??0),last=Math.max(c.duration||0,c.preloadedAudio?.duration||0,...c.notes.map(n=>(n.end??n.time)+.001));
 if(finalSong)to=last;
 if(!Number.isFinite(from)||!Number.isFinite(to)||to<=from)throw Error('メドレーの演奏区間が不正です。');
 if(from<Math.min(0,first)-1e-7||to>last+1e-7)throw Error('メドレーの演奏区間が譜面・音源の範囲を超えています。');
 return {from,to};
}
function buildMedley(entries,specs){
 const combined={meta:{...entries[0].chart.meta},bpm:entries[0].chart.bpm,notes:[],dummyNotes:[],bars:[],measures:[],beats:[],motion:[],gogoEvents:[],fades:[],duration:0},segments=[];
 for(let i=0;i<entries.length;i++){
  const original=entries[i].chart,c=original._tja?rebuildTjaBranches(original,[]):original,{from,to}=medleyRange(c,specs[i],i===entries.length-1);
  const start=combined.duration,end=start+to-from,shift=start-from;
  const segment={index:i,original:c,from,to,start,end,shift,buffer:original.preloadedAudio||null};segments.push(segment);
  const move=n=>({...n,time:n.time+shift,...(n.end!==undefined?{end:Math.min(n.end,to)+shift}:{}),medleyIndex:i});
  for(const key of ['notes','dummyNotes','bars','beats'])combined[key].push(...(c[key]||[]).filter(n=>n.time>=from&&n.time<to).map(move));
  combined.measures.push(...(c.measures||[]).filter(m=>m.end>from&&m.time<to).map(m=>({...move(m),time:Math.max(m.time,from)+shift})));
  // Seed persistent motion at each entry, including changes before the cut.
  let motion={bpm:c.bpm,scroll:1,hs:1};for(const e of c.motion||c.visual||[]){if(e.time>from)break;motion={...motion,...e}}
  combined.motion.push({...motion,time:start});
  combined.motion.push(...(c.motion||c.visual||[]).filter(e=>e.time>from&&e.time<to).map(move));
  let gogo=false;for(const e of c.gogoEvents||[]){if(e.time>from)break;gogo=e.active}
  combined.gogoEvents.push({time:start,active:gogo},...(c.gogoEvents||[]).filter(e=>e.time>from&&e.time<to).map(move));
  segment.chart={...c,_tja:undefined,_branchScoreBasis:undefined,_branchMasterNoteCount:undefined,notes:combined.notes.filter(n=>n.medleyIndex===i),duration:end};
  // Preserve each original chart's scoring basis rather than awarding a
  // million points independently to every short excerpt.
  segment.noteScore=chartNoteScore(c);
  combined.duration=end;
 }
 return {chart:combined,segments};
}
function medleyActive(){return !!danRun?.medley}
function medleySegmentAt(t){const segments=danRun.medley.segments;return segments.find(s=>t<s.end)||segments[segments.length-1]}
function medleySourceChart(n){return medleyActive()&&n?.medleyIndex!==undefined?danRun.medley.segments[n.medleyIndex].original:chart}
function medleyDistance(n,t){const s=danRun.medley.segments[n.medleyIndex],c=s.original,local=t-s.shift,nt=n.time-s.shift;return c.visual?malodyDistance(c,nt,n.scroll)-malodyDistance(c,local,n.scroll):(n.time-t)*(n.bpm/120)*n.scroll}
function medleyEmptyStats(){return {score:0,good:0,ok:0,miss:0,rolls:0,maxCombo:0,balloonRolls:0,balloonPops:0,allcombo:0,soul:0,combo:0}}
function medleyRecord(n,before,error){
 if(!medleyActive()||n.medleyIndex===undefined)return;
 const s=danRun.medley.stats[n.medleyIndex],after=danStats();
 for(const key of ['score','good','ok','miss','rolls','balloonRolls','balloonPops','allcombo'])s[key]+=after[key]-before[key];
 if(error!==undefined){s.combo=error<=judgmentWindows(n).ok?s.combo+1:0;s.maxCombo=Math.max(s.maxCombo,s.combo)}
 s.soul=soul;
}
let medleySources=[];
function stopMedleyAudio(){for(const s of medleySources){try{s.stop()}catch{}s.disconnect()}medleySources=[]}
function scheduleMedleyAudio(t){
 const ac=audio();
 for(const s of danRun.medley.segments){
  if(!s.buffer||s.end<=t)continue;
  const begin=Math.max(t,s.start,s.shift),offset=begin-s.shift,duration=Math.min(s.end-begin,s.buffer.duration-offset);
  if(duration<=0)continue;
  const node=ac.createBufferSource();node.buffer=s.buffer;node.playbackRate.value=activeSongRate;node.connect(musicGain);
  node.start(startAt+begin/activeSongRate,offset,duration);medleySources.push(node);
 }
}
async function beginMedley(){
 const run=danRun;
 state='ready';document.body.classList.remove('selecting');document.body.classList.add('playing');
 $('overlay').replaceChildren(danNode('h2','メドレーを準備中'),danNode('p','全曲の音源・譜面を読み込んでいます…'));$('overlay').style.display='flex';
 await enterPlayFullscreen();await waitForLandscape();await run.audioResumePromise;
 for(let i=0;i<run.config.songs.length;i++){
  if(danRun!==run)return;
  const e=run.config.songs[i];chart=e.chart;demoMode=e.demo;
  $('status').textContent=(i+1)+'/'+run.config.songs.length+'曲目を読み込み中…';
  if(!e.demo)await preparePlaybackAssets(chart);
 }
 if(danRun!==run)return;
 const built=buildMedley(run.config.songs,pendingDan.config.songs);
 run.medley={...built,stats:built.segments.map(medleyEmptyStats),displayIndex:-1};
 run.config.songs=run.config.songs.map((e,i)=>({...e,chart:built.segments[i].chart}));
 chart=built.chart;audioBuffer=null;playbackVisualChart=chart;demoMode=false;
 loading=false;await start({dan:true,seamless:true});
}
function updateMedleyDisplay(t){
 if(!medleyActive())return;
 const s=medleySegmentAt(t),run=danRun;run.index=s.index;
 if(run.medley.displayIndex===s.index)return;
 if(run.medley.displayIndex>=0)run.medley.stats[run.medley.displayIndex].soul=soul;
 run.medley.displayIndex=s.index;chart.meta={...s.original.meta};chart.videoFile=s.original.videoFile;chart.spinnerFile=s.original.spinnerFile;chart._mvEnabled=s.original._mvEnabled;chart._fadeEnabled=s.original._fadeEnabled;
 $('title').textContent=chart.meta.TITLE||'無題';$('subtitle').textContent=run.config.name+' / メドレー '+(s.index+1)+'曲目';$('level').textContent='★ '+(chart.meta.LEVEL||'?');$('bpm').textContent=s.original.bpm+' BPM';
 updateDesktopPlayInfo(s.original);updateDanHUD();
}
function medleyFailed(){
 const run=danRun,t=time()-judgmentOffsetSeconds(),m=run.medley;
 const possible=m.stats.map(s=>({...s}));let remaining=0;
 for(const n of notes){if(n.done)continue;const p=possible[n.medleyIndex],s=m.segments[n.medleyIndex];
  if(n.type<=4){p.good++;p.ok++;p.miss++;p.allcombo++;p.score+=s.noteScore;p.maxCombo++;remaining++}
  else if(n.type===10){if(!run.config.auto)p.miss++}
  else if(n.end>=t){const hits=run.config.auto?Math.max(0,autoRollHits(n,n.end)-(n.hits||0)):[7,9].includes(n.type)?Math.max(0,n.required-(n.hits||0)):Infinity;p.rolls+=hits;p.allcombo+=hits;p.score+=hits*100}
 }
 const totals=danStats(),whole={...totals};for(const key of ['score','good','ok','miss','rolls','allcombo'])whole[key]=possible.reduce((sum,p)=>sum+p[key],0);whole.maxCombo=Math.max(maxCombo,combo+remaining);
 for(const c of run.config.conditions){
  for(let i=0;i<(c.scope==='total'?1:m.segments.length);i++){
   const current=c.scope==='total'?totals:m.stats[i],upper=c.scope==='total'?whole:possible[i],value=danOp(c,i)==='m'?upper[c.type]:current[c.type];
   if(!danPass(value,c.red[i],c,i))return true;
  }
 }
 return Math.min(100,soul+remaining*130/soulNoteCount())+1e-9<run.config.gauge;
}
function finishMedley(forced=false){
 const run=danRun;run.results=run.medley.stats.slice(0,forced?run.index+1:undefined).map(s=>({...s}));
 showDanResult(forced);
}
