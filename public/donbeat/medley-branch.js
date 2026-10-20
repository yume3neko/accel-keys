'use strict';

// A single hidden fork reuses the regular medley compiler. SONG1..SONGn are
// shared; the last two SONG entries are alternative endings, never consecutive.
function parseMedleyBranch(fields,songs,mode,fail){
 const keys=[...fields.keys()].filter(k=>/^BRANCH\d+$/.test(k));
 if(mode!=='MEDLEY'||keys.length!==1)fail('隠し分岐は MODE:MEDLEY で1か所指定してください。');
 const key=keys[0],index=Number(key.slice(6))-1;
 const parts=fields.get(key).split(',').map(s=>s.trim());
 const [metric,op,value,yes,no]=parts,threshold=Number(value),pass=Number(yes)-1,reject=Number(no)-1;
 const metrics=['accuracy','best','good','miss','score','roll','combo','allcombo','soul'];
 if(index<0||!Number.isSafeInteger(index)||songs.length!==index+3)fail(key+' の後に通常用・達成時用の2区間を指定してください。');
 if(parts.length!==5||!metrics.includes(metric)||!['m','l'].includes(op)||!value||!Number.isFinite(threshold)||threshold<0||
   (['accuracy','soul'].includes(metric)?threshold>100:!Number.isSafeInteger(threshold)))fail(key+' は 条件種類,m/l,条件値,達成時の曲番号,未達時の曲番号 です。');
 if(!/^\d+$/.test(yes)||!/^\d+$/.test(no)||pass===reject||![pass,reject].every(i=>i===index+1||i===index+2))fail(key+' の分岐先には後続の2区間をそれぞれ指定してください。');
 return {index,metric,op,threshold,pass,reject};
}

function buildBranchedMedley(entries,specs,rule){
 const prefix=entries.slice(0,rule.index+1),prefixSpecs=specs.slice(0,rule.index+1);
 const make=target=>{
  const selected=[...prefix,entries[target]];
  return {...buildMedley(selected,[...prefixSpecs,specs[target]]),entries:selected};
 };
 const yes=make(rule.pass),no=make(rule.reject),boundary=no.segments[rule.index].end;
 return {...no,branch:{rule,yes,no,boundary,decided:false,passed:false,pendingPass:false,gates:[]}};
}

function medleyBranchActive(){return !!danRun?.medley?.branch}

function medleyBranchPreviewSegment(n){
 const m=danRun.medley,b=m.branch;
 return b&&!b.decided&&n.medleyIndex>b.rule.index?(b.pendingPass?b.yes:b.no).segments[n.medleyIndex]:m.segments[n.medleyIndex];
}

function medleyBranchRenderNotes(){
 const m=danRun.medley,b=m.branch;
 if(b.decided){
  const dummy=dummyNotesForPlay(),old=b.finalPreviewCache;
  if(old?.notes!==notes||old.dummy!==dummy)b.finalPreviewCache={notes,dummy,list:[...notes,...dummy].sort((a,b)=>a.time-b.time)};
  return b.finalPreviewCache.list;
 }
 const old=b.previewCache;
 if(old?.notes===notes&&old.passed===b.pendingPass)return old.list;
 const plan=b.pendingPass?b.yes:b.no;
 const list=[...notes.filter(n=>n.medleyIndex<=b.rule.index),
  ...plan.chart.notes.filter(n=>n.medleyIndex>b.rule.index),...(plan.chart.dummyNotes||[])].sort((a,b)=>a.time-b.time);
 b.previewCache={notes,passed:b.pendingPass,list};return list;
}

// Pending shared notes count as misses for this condition only. This predicts
// the result at the boundary, so the audio gate can be reserved ahead of time
// and revised on every input without an animation frame starting the audio.
function medleyBranchStats(){
 const run=danRun,m=run.medley,b=m.branch,common=m.segments.slice(0,b.rule.index+1);
 const result=medleyEmptyStats();
 for(const s of m.stats.slice(0,b.rule.index+1)){
  for(const key of ['good','ok','miss','score','rolls','allcombo'])result[key]+=s[key];
  result.maxCombo=Math.max(result.maxCombo,s.maxCombo);
 }
 const pending=notes.filter(n=>n.medleyIndex<=b.rule.index&&n.type<=4&&!n.done&&!n.ghost);
 if(run.config.auto){
  // Autoplay is known before the first audio quantum, including coarse frames.
  result.good=common.reduce((n,s)=>n+s.chart.notes.filter(x=>x.type<=4).length,0);result.ok=result.miss=0;
  result.rolls=0;result.score=0;
  for(const s of common){
   result.score+=s.chart.notes.filter(n=>n.type<=4).length*s.noteScore;
   for(const n of s.chart.notes)if(n.type>=5&&n.type<=9&&n.type!==8){const hits=autoRollHits(n,n.end);result.rolls+=hits;result.score+=hits*100}
  }
  result.allcombo=result.good+result.rolls;result.maxCombo=result.good;
  result.soul=Math.min(100,result.good*130/soulNoteCount());
 }else{
  result.miss+=pending.length;result.soul=Math.max(0,soul-pending.length*260/soulNoteCount());
  // maxCombo is continuous across shared excerpts; tail notes cannot be hit
  // before the fork and therefore cannot contribute to the shared condition.
  result.maxCombo=maxCombo;
 }
 const total=result.good+result.ok+result.miss;
 result.accuracy=total?(result.good+result.ok*.5)/total*100:100;
 return result;
}

function refreshMedleyBranchAudio(){
 if(!medleyBranchActive())return;
 const b=danRun.medley.branch;
 if(b.decided||(Number.isFinite(b.audioBoundary)&&audio().currentTime>=b.audioBoundary))return;
 const stats=medleyBranchStats(),types={best:'good',good:'ok',roll:'rolls',combo:'maxCombo'};
 const value=stats[types[b.rule.metric]||b.rule.metric];
 b.pendingPass=b.rule.op==='m'?value>=b.rule.threshold:value<b.rule.threshold;
 for(const gate of b.gates){
  gate.node.gain.cancelScheduledValues(b.audioBoundary);
  gate.node.gain.setValueAtTime(gate.pass===b.pendingPass?1:0,b.audioBoundary);
 }
}

function setBranchedMedleyConfig(run,plan){
 run.config.songs=plan.entries.map((e,i)=>({...e,chart:plan.segments[i].chart}));
}

function updateMedleyBranch(t){
 if(!medleyBranchActive())return;
 const run=danRun,m=run.medley,b=m.branch;
 if(b.decided||t<b.boundary)return;
 b.decided=true;b.passed=b.pendingPass;
 const plan=b.passed?b.yes:b.no;
 // Shared objects retain judgments, roll hits and ghost flags. Only the tail
 // changes; the score, combo and gauge stay on the same play clock.
 const shared=notes.filter(n=>n.medleyIndex<=b.rule.index),byKey=new Map(shared.map(n=>[n.medleyIndex+':'+n.time+':'+n.type,n]));
 m.chart=plan.chart;m.segments=plan.segments;chart=plan.chart;
 notes=chart.notes.map(n=>byKey.get(n.medleyIndex+':'+n.time+':'+n.type)||({...n,done:false,hits:0,ghost:false}));
 setBranchedMedleyConfig(run,plan);m.displayIndex=-1;
 playbackVisualChart=chart;resetDummyPlayback(t);
 beatIndex=chart.beats.findIndex(e=>e.time>=t);if(beatIndex<0)beatIndex=chart.beats.length;
}

function medleyBranchJudgmentAllowed(n){
 if(!medleyBranchActive())return true;
 const b=danRun.medley.branch;
 return b.decided||n.medleyIndex<=b.rule.index;
}

function hideMedleyBranchCandidates(){
 if(!pendingDan?.config.branch)return;
 const key=c=>normalizedPath(c.sourcePath||c.meta.TITLE||'');
 const common=new Set(),endings=new Set(),b=pendingDan.config.branch;
 pendingDan.config.songs.forEach((_,i)=>{
  try{const c=resolveDanConfig(true,i).songs[0]?.chart;if(c)(i<=b.index?common:endings).add(key(c))}catch{}
 });
 try{const first=resolveDanConfig(true,0).songs[0]?.chart;if(first&&!charts.includes(first))charts.unshift(first)}catch{}
 for(const c of charts)c._hiddenMedleyCandidate=endings.has(key(c))&&!common.has(key(c));
}

function pendingHiddenMedley(c=chart){
 if(!pendingDan?.config.branch)return false;
 try{return resolveDanConfig(true,0).songs[0]?.chart===c}catch{return false}
}

function showHiddenMedleyResult(){
 const run=danRun,passed=soul>=run.config.gauge,title=auto?'オート演奏終了':passed?'クリア！':'演奏終了';
 run.finished=true;pausedTime=time();state='dan-result';stopAudio();cancelAnimationFrame(raf);document.body.classList.remove('playing');$('pause').disabled=true;
 const box=$('danResultContent');box.replaceChildren(danNode('p',run.config.name),danNode('h2',title,'dan-result-title'),danNode('p',resultDifficulty(chart)),resultSoul(soul,run.config.gauge,run.config.goldGauge),resultStats(danStats()));
 const replay=async automatic=>{exitDan();await launchDan(automatic)};
 $('danResultEdit').onclick=()=>replay(false);$('danResultEditAuto').onclick=()=>replay(true);$('danResultExit').onclick=exitDan;
 $('overlay').replaceChildren();$('overlay').style.display='flex';const view=danNode('button','リザルトを見る','primary');view.onclick=()=>$('danResult').showModal();$('overlay').append(view);
 $('status').textContent=title;arrangeResult(false);$('danResult').showModal();
}
