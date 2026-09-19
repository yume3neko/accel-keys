'use strict';
let balloonRolls=0,balloonPops=0;
const autoPadUntil=[0,0,0,0],autoPadSide={1:0,2:0};
let mvFile=null,mvURL=null,mvPlaying=false;
const $=id=>document.getElementById(id),canvas=$('canvas'),ctx=canvas.getContext('2d');let charts=[],chart,audioFiles=new Map(),audioBuffer=null,audioContext,source,state='ready',notes=[],startAt=0,pausedTime=0,score=0,combo=0,maxCombo=0,good=0,ok=0,miss=0,rolls=0,soul=0,feedback='',feedbackAt=-10,auto=false,demoMode=true,beatIndex=0,width=1000,height=230,raf=0,loading=false,practiceTarget=null,judgeFrom=-Infinity,pauseResumeUntil=-Infinity,importing=false;
const demo=`TITLE:練習譜面\nSUBTITLE:伴奏なし・打音のみ\nBPM:120\nOFFSET:0\nCOURSE:Easy\nLEVEL:3\nBALLOON:8\n#START\n0000,\n1000100010001000,\n1000200010002000,\n1010100010102000,\n1020102010201020,\n3000400030004000,\n5000000000000008,\n#GOGOSTART\n1010202010102020,\n1110200011102000,\n1020102010201020,\n7000000000000008,\n#GOGOEND\n3000400030004000,\n1000200010201000,\n1000000000000000,\n0000,\n#END\nCOURSE:Normal\nLEVEL:4\nBALLOON:8,10,12\n#START\n0000,\n1000100010001000,\n1000200010002000,\n1010000010100000,\n1000101020002000,\n1010200010102000,\n3000000040000000,\n5000000000000008,\n7000000000000008,\n1000100010001000,\n1000200010002000,\n1010000010100000,\n1000101020002000,\n1010200010102000,\n3000000040000000,\n5000000000000008,\n7000000000000008,\n#GOGOSTART\n1000100010001000,\n1000200010002000,\n1010000010100000,\n1000101020002000,\n1010200010102000,\n3000000040000000,\n5000000000000008,\n7000000000000008,\n#GOGOEND\n3000400030004000,\n1000000000000000,\n0000,\n#END\nCOURSE:Hard\nLEVEL:6\nBALLOON:12,14,16\n#START\n0000,\n1010101010101010,\n1010202010102020,\n1110000022200000,\n1011101020222020,\n1120102011201020,\n3010401030104010,\n5000000000000008,\n7000000000000008,\n1010101010101010,\n1010202010102020,\n1110000022200000,\n1011101020222020,\n1120102011201020,\n3010401030104010,\n5000000000000008,\n7000000000000008,\n#GOGOSTART\n1010101010101010,\n1010202010102020,\n1110000022200000,\n1011101020222020,\n1120102011201020,\n3010401030104010,\n5000000000000008,\n7000000000000008,\n#GOGOEND\n3000400030004000,\n1000000000000000,\n0000,\n#END\nCOURSE:Oni\nLEVEL:8\nBALLOON:16,20,24\n#START\n0000,\n1110111022202220,\n1120112011202220,\n1212121012121220,\n1111222011112220,\n1122112211202220,\n1110101110102220,\n5000000000000008,\n7000000000000008,\n1110111022202220,\n1120112011202220,\n1212121012121220,\n1111222011112220,\n1122112211202220,\n1110101110102220,\n5000000000000008,\n7000000000000008,\n#GOGOSTART\n1110111022202220,\n1120112011202220,\n1212121012121220,\n1111222011112220,\n1122112211202220,\n1110101110102220,\n5000000000000008,\n7000000000000008,\n#GOGOEND\n3000400030004000,\n1000000000000000,\n0000,\n#END\nCOURSE:Edit\nLEVEL:10\nBALLOON:24,30,36\n#START\n0000,\n1112112211121122,\n1211221212112212,\n1111222211221122,\n111222111222111222111222,\n1121211211221211,\n11112111211121112111211121112222,\n5000000000000008,\n7000000000000008,\n1112112211121122,\n1211221212112212,\n1111222211221122,\n111222111222111222111222,\n1121211211221211,\n11112111211121112111211121112222,\n5000000000000008,\n7000000000000008,\n#GOGOSTART\n1112112211121122,\n1211221212112212,\n1111222211221122,\n111222111222111222111222,\n1121211211221211,\n11112111211121112111211121112222,\n5000000000000008,\n7000000000000008,\n#GOGOEND\n3000400030004000,\n1000000000000000,\n0000,\n#END`;
const names={Easy:'かんたん',Normal:'ふつう',Hard:'むずかしい',Oni:'おに',Edit:'裏',0:'かんたん',1:'ふつう',2:'むずかしい',3:'おに',4:'裏'};
let musicGain,effectGain;
function audio(){if(!audioContext)audioContext=new (window.AudioContext||window.webkitAudioContext)();if(!musicGain){musicGain=audioContext.createGain();effectGain=audioContext.createGain();musicGain.connect(audioContext.destination);effectGain.connect(audioContext.destination);applyVolumes()}return audioContext}
function tone(type,when){const ac=audio(),osc=ac.createOscillator(),gain=ac.createGain();osc.type=type===1?'sine':'triangle';const t=when??ac.currentTime;osc.frequency.setValueAtTime(type===1?180:900,t);osc.frequency.exponentialRampToValueAtTime(type===1?55:250,t+.085);gain.gain.setValueAtTime(.23,t);gain.gain.exponentialRampToValueAtTime(.001,t+.12);osc.connect(gain).connect(effectGain);osc.start(t);osc.stop(t+.13)}
function time(){return state==='playing'?audioContext.currentTime-startAt:pausedTime}
function stopAudio(){clearAutoPads();stopMV();if(source){try{source.stop()}catch{}source=null}}
function scheduleAudio(t){stopAudio();if(!audioBuffer)return;source=audio().createBufferSource();source.buffer=audioBuffer;source.connect(musicGain);if(t<0)source.start(audioContext.currentTime-t);else if(t<audioBuffer.duration)source.start(audioContext.currentTime,t)}
function reset(){document.body.classList.add('selecting');dummyPlayback=null;balloonRolls=balloonPops=0;if(danRun){exitDan();return}practiceTarget=null;judgeFrom=-Infinity;pauseResumeUntil=-Infinity;cancelAnimationFrame(raf);stopAudio();state='ready';leavePlayFullscreen();document.body.classList.remove('playing');$('pause').disabled=true;setPauseIcon(false);notes=chart.notes.map(n=>({...n,done:false,hits:0}));score=combo=maxCombo=good=ok=miss=rolls=soul=0;pausedTime=Math.min(-2,(chart.notes[0]?.time||0)-2);feedback='';beatIndex=0;update();$('overlay').style.display='flex';$('overlay').replaceChildren();const e=document.createElement('span');e.className='eyebrow';e.textContent='READY TO DRUM?';const h=document.createElement('h2');h.hidden=true;const p=document.createElement('p');p.hidden=true;const b=document.createElement('button');b.className='primary';b.textContent='▶ 演奏スタート';b.onclick=()=>start();const seek=document.createElement('button');seek.className='seek-start';seek.textContent='途中からはじめる';seek.onclick=openSeek;const buttons=document.createElement('div');buttons.className='seek-buttons';const ab=document.createElement('button');ab.textContent='オートプレイでスタート';ab.onclick=()=>start({auto:true});buttons.append(b,ab,seek);$('overlay').append(e,h,p,buttons);$('status').textContent=demoMode||audioBuffer?'準備完了':'音源の追加が必要です';if(!demoMode&&!audioBuffer){h.hidden=false;p.hidden=false;h.textContent='音源を追加してください';p.textContent='譜面に対応する音源を選ぶと演奏できます。';b.disabled=true;ab.disabled=true;seek.disabled=true}renderSongSelection();draw()}
function syncRebuiltChart(next){
 let index=charts.indexOf(chart);
 if(index<0){
  const source=normalizedPath(chart?.sourcePath||''),course=String(chart?.meta?.COURSE||''),title=String(chart?.meta?.TITLE||'');
  index=charts.findIndex(c=>
   (source&&normalizedPath(c.sourcePath||'')===source&&String(c.meta?.COURSE||'')===course)||
   (!source&&String(c.meta?.TITLE||'')===title&&String(c.meta?.COURSE||'')===course)
  );
 }
 if(index>=0){charts[index]=next;$('course').value=index}
 chart=next;
 return next;
}
async function start(options={}){
 if(loading||importing||state==='playing'||(danRun&&!options.dan)||(!demoMode&&!audioBuffer))return;loading=true;enterPlayFullscreen();
 try{if(!options.seamless||audio().state==='suspended')await audio().resume();if(!options.seamless)await waitForLandscape()}catch(e){loading=false;$('status').textContent='音声を開始できません。もう一度お試しください。';return}loading=false;
 cancelAnimationFrame(raf);stopAudio();auto=danRun?danRun.config.auto:Boolean(options.auto);
 practiceTarget=Number.isFinite(options.target)?options.target:null;judgeFrom=practiceTarget??-Infinity;pauseResumeUntil=-Infinity;
 if(chart._tja){syncRebuiltChart(rebuildTjaBranches(chart,[]))}branchChoices=[];branchScoreLog=[];branchRollLog=[];branchTransitions=[];notes=chart.notes.map(n=>({...n,done:false,hits:0,ghost:false}));if(!options.carry){score=combo=maxCombo=good=ok=miss=rolls=soul=0;balloonRolls=balloonPops=0;}feedback='';feedbackAt=-10;
 const plan=practiceTarget===null?null:practicePlan(chart,practiceTarget,auto);
 pausedTime=plan?plan.lead:Math.min(0,(notes[0]?.time||0)-4);
 // Manual pre-roll is visible but excluded from every judgment and score path.
 if(plan){for(const n of notes){if(n.time>=plan.target)continue;if(auto){if(n.type===9){n.done=true;continue}if(n.type<=4)judge(n,0);else{addRollHits(n,autoRollHits(n,plan.target-1e-9));if(n.end<plan.target)n.done=true}}else{n.ghost=true;if((n.end??n.time)<plan.lead)n.done=true}}}
 feedback='';feedbackAt=-10;beatIndex=chart.beats.findIndex(b=>b.time>=pausedTime);if(beatIndex<0)beatIndex=chart.beats.length;
 resetDummyPlayback(pausedTime);resetHibiki(pausedTime);startAt=audioContext.currentTime-pausedTime;scheduleAudio(pausedTime);state='playing';document.body.classList.remove('selecting');document.body.classList.add('playing');$('overlay').style.display='none';$('pause').disabled=false;setPauseIcon(false);['course','files','folder','demo','danOpen','danFiles','danFolder'].forEach(id=>$(id).disabled=true);
 update();resize();loop();
}
function pauseRewindTime(t){
 const measures=chart?.measures||[];
 if(!measures.length)return Math.max(Math.min(0,(chart?.notes?.[0]?.time||0)-4),t-4);
 let index=measures.findIndex(m=>m.time<=t&&t<m.end);
 if(index<0){for(let i=measures.length-1;i>=0;i--)if(measures[i].time<=t){index=i;break}}
 if(index<0)return Math.min(t,measures[0].time);
 if(index<2)return Math.min(t,measures[0].time);
 const current=measures[index],target=measures[index-2];
 const span=current.end-current.time,progress=span>1e-9?Math.max(0,Math.min(1,(t-current.time)/span)):0;
 return target.time+(target.end-target.time)*progress;
}
function resumeFromPause(){
 if(state!=='paused')return;
 if(danRun&&(danRun.pauseCount||0)>2)return;
 const resumePoint=pausedTime,rewind=pauseRewindTime(resumePoint);
 pauseResumeUntil=resumePoint;
 pausedTime=rewind;
 feedback='';feedbackAt=-10;
 resetDummyPlayback(resumePoint);
 resetHibiki(rewind);
 audio().resume().then(()=>{
  startAt=audioContext.currentTime-rewind;
  scheduleAudio(rewind);
  state='playing';
  $('overlay').style.display='none';
  setPauseIcon(false);
  loop();
 });
}
function togglePause(){
 if(state==='playing'){
  pausedTime=time();state='paused';stopAudio();draw();cancelAnimationFrame(raf);setPauseIcon(true);
  if(danRun)danRun.pauseCount=(danRun.pauseCount||0)+1;
  updateDanPauseRemaining();
  const canResume=!danRun||(danRun.pauseCount||0)<=2;
  $('overlay').style.display='flex';$('overlay').replaceChildren();
  const h=document.createElement('h2');h.textContent='一時停止';
  const actions=document.createElement('div');actions.className='pause-actions';
  const b=document.createElement('button');b.textContent=canResume?'▶ 再開':'再開できません';b.className='primary';b.disabled=!canResume;b.onclick=resumeFromPause;
  const restart=document.createElement('button');restart.textContent='↻ 最初から';restart.onclick=()=>{const automatic=danRun?danRun.config.auto:auto;if(danRun){exitDan();launchDan(automatic)}else{state='ready';start({auto:automatic})}};
  const q=document.createElement('button');q.textContent='選曲に戻る';q.onclick=()=>{if(danRun)exitDan();else{unlock();reset()}};
  actions.append(b,restart,q);$('overlay').append(h,actions);
  if(danRun){const p=document.createElement('p');p.className='pause-resume-limit';p.textContent=canResume?'段位の再開：'+(danRun.pauseCount||0)+'/2回使用':'段位では再開を2回まで使用できます。';$('overlay').append(p)}
 }else if(state==='paused')resumeFromPause();
}
function unlock(){['course','files','folder','demo','danOpen','danFiles','danFolder'].forEach(id=>$(id).disabled=false);}
function update(){$('score').textContent=String(score).padStart(7,'0');$('combo').textContent=combo;$('good').textContent=good;$('ok').textContent=ok;$('miss').textContent=miss;$('roll').textContent=rolls;$('gauge').style.width=soul+'%';$('gaugeText').textContent=Math.floor(soul)+'%';updateDanHUD();updateDanPauseRemaining()}
function judgmentWindows(){const level=Number(chart?.meta?.LEVEL);return Number.isFinite(level)&&level>0&&level<=5?{good:.041708,ok:.108442,miss:.125125}:{good:.025025,ok:.075075,miss:.108442}}
function judgeCore(n,error){notifyDanJudgment(error);n.done=true;const total=branchReferenceNoteCount(chart);if(error<=judgmentWindows().good){good++;score+=Math.floor(1000000/Math.max(1,total)/10)*10;soul=Math.min(100,soul+130/soulNoteCount());feedback='良'}else if(error<=judgmentWindows().ok){ok++;score+=Math.floor(1000000/Math.max(1,total)/2/10)*10;soul=Math.min(100,soul+65/soulNoteCount());feedback='可'}else{miss++;combo=0;soul=Math.max(0,soul-260/soulNoteCount());feedback='不可';feedbackAt=time();update();return}combo++;maxCombo=Math.max(combo,maxCombo);feedbackAt=time();update()}
// Auto balloon ceiling for this game: 60 hits/sec, independent of display refresh rate.
const AUTO_BALLOON_MAX_HZ=60;
function autoBalloonHits(n,t){
  const duration=n.end-n.time;
  if(!(duration>0)||t<n.time)return 0;
  const interval=Math.max(1/AUTO_BALLOON_MAX_HZ,Math.min(.065,duration/n.required));
  const elapsed=Math.min(t-n.time,Math.max(0,duration-1e-9));
  return Math.min(n.required,Math.floor((elapsed+1e-12)/interval)+1);
}
function autoRollHits(n,t){if(n.type===7)return autoBalloonHits(n,t);const duration=n.end-n.time;if(duration<=0||t<n.time)return 0;return Math.floor((Math.min(t-n.time,duration-1e-9)+1e-12)/.065)+1}
function addRollHitsCore(r,count=1){
  if(r.done||count<=0)return;
  if(r.type===7)count=Math.min(count,r.required-r.hits);
  r.hits+=count;rolls+=count;if(r.type===7)balloonRolls+=count;score+=count*100;
  feedback='';
  if(r.type===7&&r.hits>=r.required){r.done=true;score+=5000;balloonPops++;feedback=''}
  feedbackAt=time();update();
}
function hit(type,automatic=false){if(!automatic&&autoInputLocked())return;if(state!=='playing'){if(state==='ready'){audio().resume();tone(type)}return}if(auto&&!automatic)return;tone(type);const playTime=time();if(playTime<pauseResumeUntil)return;const t=playTime-Number($('offset').value||0)/1000;if(t<judgeFrom)return;const damage=notes.find(n=>n.type===9&&!n.done&&!n.ghost&&Math.abs(n.time-t)<=judgmentWindows().miss);if(damage){judgeCore(damage,1);return}const n=notes.find(n=>!n.done&&!n.ghost&&n.type<=4&&Math.abs(n.time-t)<=judgmentWindows().miss);if(n&&(n.type===1||n.type===3?1:2)===type){judge(n,Math.abs(n.time-t));return}const r=notes.find(n=>!n.done&&!n.ghost&&(n.type>=5&&n.type<=7)&&t>=n.time&&t<=n.end);if(r&&(r.type!==7||type===1))addRollHits(r)}
function songDuration(){return Math.max(.001,chart.duration+(danRun?0:1),danRun?Math.max(0,...chart.notes.map(n=>(n.end??n.time)+judgmentWindows().miss+.001)):0,audioBuffer?.duration||0)}
function updateProgress(t=time()){
  const songFraction=state==='result'?1:state==='ready'?0:Math.max(0,Math.min(1,t/songDuration()));
  const percent=danRun?Math.min(100,(danRun.index+((state==='dan-break'||danRun.results.length>danRun.index)?1:songFraction))/Math.max(1,danRun.config.songs.length)*100):songFraction*100;
  $('songProgressFill').style.transform=`scaleX(${songFraction})`;
  $('courseProgress').hidden=!danRun;
  $('courseProgressFill').style.transform=`scaleX(${percent/100})`;
  $('courseProgress').setAttribute('aria-valuenow',String(Math.floor(percent)));
  $('songProgress').setAttribute('aria-valuenow',String(Math.floor(songFraction*100)));
}
function finish(){if(danRun){finishDanSong();return}pausedTime=time();state='result';updateProgress();stopAudio();document.body.classList.remove('playing');unlock();$('pause').disabled=true;showSingleResult();}

function loop(){
 updateBranchRoute();
 const t=time(),adjust=Number($('offset').value||0)/1000,resumeLead=t<pauseResumeUntil;
 if(!resumeLead)updateDummyPlayback(t-adjust);
 if(!resumeLead){
  for(const n of notes){
   if(n.done)continue;
   if(n.type===9){if(t-adjust>n.time+judgmentWindows().miss)n.done=true;continue}
   if(n.ghost){if(t>(n.end??n.time)+.15)n.done=true;continue}
   if(n.type<=4){
    if(auto&&t>=n.time+adjust){pulseAutoPad(n.type===1||n.type===3?1:2,n.type===3||n.type===4);tone(n.type===1||n.type===3?1:2);judge(n,0)}
    else if(t-adjust>n.time+judgmentWindows().miss)judge(n,1)
   }else if(auto){
    const count=autoRollHits(n,t-adjust)-n.hits;
    if(count>0){addRollHits(n,count);pulseAutoPad(n.type===7?1:n.hits%2+1);tone(n.type===7?1:n.hits%2+1)}
   }
  }
 }
 if(danRun&&!danRun.failed&&danCurrentFailed()){danRun.failed=true;updateDanHUD()}
 $('status').textContent=resumeLead?'2小節巻き戻し中 · 判定なし':danRun?.failed?'不合格確定 · この曲の終了まで演奏できます':!auto&&t-adjust<judgeFrom?'助走中 · 判定なし → '+judgeFrom.toFixed(2)+'秒から':auto?'オートプレイ中':practiceTarget===null?'演奏中':'途中から演奏中';
 draw();if(t>songDuration()){finish();return}raf=requestAnimationFrame(loop)
}
function resize(){const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);width=r.width;height=r.height;canvas.width=width*dpr;canvas.height=height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);draw()}
function isGogoTime(c,t){const events=c.gogoEvents||[];let lo=0,hi=events.length;while(lo<hi){const mid=(lo+hi)>>1;if(events[mid].time<=t)lo=mid+1;else hi=mid}return lo>0&&events[lo-1].active;}
function draw(){updateHibiki();updateAutoPads();syncMV();updateProgress();const t=time(),fade=applyChartFade(t),y=height*.5,target=width<600?76:125,speed=Number($('speed').value),r=Math.min(26,height*.19);updateVisualBpm(t,fade.lane);ctx.globalAlpha=fade.lane;ctx.clearRect(0,0,width,height);ctx.fillStyle=chart.videoFile?'#171b2044':'#171b20';ctx.fillRect(0,y-r-20,width,2*r+40);if(isGogoTime(chart,t)){const glow=ctx.createLinearGradient(0,0,width,0);glow.addColorStop(0,'rgba(240,120,40,0.35)');glow.addColorStop(1,'rgba(240,120,40,0)');ctx.fillStyle=glow;ctx.fillRect(0,y-r-20,width,2*r+40)}drawBranchLaneShade(t,y,r,fade.lane);ctx.strokeStyle='#333940';ctx.lineWidth=1;for(let i of [-1,1]){ctx.beginPath();ctx.moveTo(0,y+i*(r+20));ctx.lineTo(width,y+i*(r+20));ctx.stroke()}ctx.fillStyle='#f8c2590c';ctx.fillRect(0,0,target+40,height);const pos=n=>target+(chart.visual?malodyDistance(chart,n.time,n.scroll)-malodyDistance(chart,t,n.scroll):(n.time-t)*(n.bpm/120)*n.scroll)*speed*240;for(const b of chart.bars){const x=pos(b);if(x<0||x>width)continue;ctx.strokeStyle='#ffffff20';ctx.beginPath();ctx.moveTo(x,y-r-18);ctx.lineTo(x,y+r+18);ctx.stroke()}ctx.strokeStyle='#dbd3bd';ctx.lineWidth=3;ctx.beginPath();ctx.arc(target,y,r+8,0,Math.PI*2);ctx.stroke();ctx.strokeStyle='#d6c9a05c';ctx.lineWidth=1;ctx.beginPath();ctx.arc(target,y,r+14,0,Math.PI*2);ctx.stroke();const visibleNotes=renderNotes();for(let i=visibleNotes.length-1;i>=0;i--){
 const n=visibleNotes[i];if(n.done||(t<pauseResumeUntil&&n.time<pauseResumeUntil)||(n.dummy&&t>(n.end??n.time)+.15))continue;
 let x=pos(n),nr=n.type===3||n.type===4||n.type===6?r*1.25:r,noteY=branchNoteY(t,n,y,2*r+40);
 ctx.globalAlpha=(n.ghost?.25:1)*(n.dummy?(n.dummyOpacity??.7):1)*fade.note;
 if((n.type>=5&&n.type<=7)){
  let end=pos({...n,time:n.end});if(Math.max(x,end)<-50||Math.min(x,end)>width+50||t>n.end)continue;
  ctx.strokeStyle='#daa738';ctx.lineWidth=nr*1.6;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(Math.max(target,x),noteY);ctx.lineTo(Math.max(target,end),noteY);ctx.stroke();x=Math.max(target,x)
 }else if(x< -50||x>width+50)continue;
 ctx.fillStyle=n.type===9?'#b569eb':(n.type>=5&&n.type<=7)?'#f5c757':n.type===1||n.type===3?'#f66b51':'#55bbd2';
 ctx.strokeStyle='#f4e8cc';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,noteY,nr,0,Math.PI*2);ctx.fill();ctx.stroke();
 ctx.fillStyle='#17242a';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`900 ${nr*.7}px sans-serif`;
 if(n.type===9){ctx.fillStyle='#fff';ctx.fillText('×',x,noteY)}
 if((n.type>=5&&n.type<=7))ctx.fillText(n.type===7?String(Math.max(0,n.required-n.hits)):(t>=n.time?String(n.hits||0):'連'),x,noteY)
}if(danRun){ctx.globalAlpha=fade.lane;ctx.fillStyle='#fff';ctx.font='700 14px sans-serif';ctx.textAlign='left';ctx.textBaseline='bottom';const remaining=notes.filter(n=>n.type<=4&&!n.done).length+danRun.config.songs.slice(danRun.index+1).reduce((sum,e)=>sum+e.chart.notes.filter(n=>n.type<=4).length,0);ctx.fillText('残り '+remaining+' ノーツ',12,height-6)}drawBranchDetails(t,fade.lane);ctx.globalAlpha=fade.lane;ctx.textAlign='center';const judgment=$('judgmentOverlay');judgment.textContent=feedback&&t-feedbackAt<.45?feedback:'';judgment.style.left=target+'px';judgment.style.top=Math.max(20,y-r-36)+'px';judgment.style.color=feedback==='不可'?'#aaa':feedback==='可'?'#fff':'#ffd565';judgment.style.opacity=fade.lane;$('status').style.opacity=1;if(state==='playing'&&t<(notes[0]?.time??0)-.2){ctx.font='700 15px sans-serif';ctx.fillStyle='#bfc2c3';ctx.fillText('まもなくスタート',width/2,height-18)}}
async function choose(){if(importing||danRun)return;seekTarget=0;let chosen=charts[Number($('course').value)||0];loading=true;try{if(chosen.serverEntry){chosen=await prepareServerChart(chosen)}}catch(e){loading=false;$('fileinfo').textContent='収録曲の読み込みエラー：'+e.message;renderSongSelection();return}chart=chosen;demoMode=!!chart.builtinDemo;audioBuffer=null;const wave=(chart.meta.WAVE||'').replace(/\\/g,'/').split('/').pop().toLowerCase();const file=chart.audioFile||audioFiles.get(wave);loading=true;$('title').textContent=chart.meta.TITLE||'無題';$('subtitle').textContent=(chart.meta.SUBTITLE||'').replace(/^(--|\+\+)/,'')||'TJA譜面';$('level').textContent='★ '+(chart.meta.LEVEL||'?');$('bpm').textContent=chart.bpm+' BPM';try{if(file){chart.audioFile=file;audioBuffer=chart.preloadedAudio||await audio().decodeAudioData(await file.arrayBuffer());delete chart.preloadedAudio}$('fileinfo').textContent=demoMode?'伴奏なし・打音のみで練習できます':file?'音源：'+file.name:wave?'音源未選択：'+chart.meta.WAVE+' を追加してください':'音源を追加すると演奏できます'}catch(e){$('fileinfo').textContent='音源を再生できません。MP3 / WAVなど別形式をお試しください。'}finally{loading=false;rememberDanCharts();reset();if(chart.warnings?.length)$('fileinfo').textContent+=' ／ 注意：'+chart.warnings.join('、')}}
function fillCourses(){const s=$('course');s.replaceChildren();charts.forEach((c,i)=>{const o=document.createElement('option');o.value=i;o.textContent=(c.meta.TITLE||'無題')+' / '+(names[c.meta.COURSE]||c.meta.COURSE||'おに')+' ★'+(c.meta.LEVEL||'?');s.append(o)})}

function filePath(f){return (f.chartPath||f.webkitRelativePath||f.name).replace(/\\/g,'/').normalize('NFC')}
function normalizedPath(s){const parts=[];for(const p of s.split('/')){if(p==='..')parts.pop();else if(p&&p!=='.')parts.push(p)}return parts.join('/').toLowerCase()}
async function loadFiles(files){
 if(loading||importing||danRun||state==='playing'||state==='paused')return;
 importing=true;loading=true;['course','files','folder','demo','danOpen','danFiles','danFolder'].forEach(id=>$(id).disabled=true);$('fileinfo').textContent='譜面と音源を読み込み中…';
 try{
  let expanded=[];for(const f of files){if(/\.(mcz|zip)$/i.test(f.name)){const entries=await readChartArchive(f);for(const entry of entries)entry.importName=f.name;expanded.push(...entries);}else expanded.push(f)}
  const chartFiles=expanded.filter(f=>/\.(mc|tja)$/i.test(f.name)),sounds=expanded.filter(f=>/\.(ogg|mp3|wav|m4a|flac)$/i.test(f.name));
  const configs=[];
  for(const f of expanded.filter(f=>/\.(dan|txt|json)$/i.test(f.name))){const text=await decodeDanText(f);if(/\.dan$/i.test(f.name)||/^\s*(?:SONG1|EXAM1)\s*:/mi.test(text))configs.push({file:f,text});}
  if(configs.length>1)throw Error('段位設定ファイルは1つずつ読み込んでください。');
  const incoming=configs.length?{config:parseDanConfig(configs[0].text),path:filePath(configs[0].file),armed:true}:null;
  const loaded=[],skipped=[];
  for(const f of chartFiles){
   let parsed;try{const bytes=await f.arrayBuffer();let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{text=new TextDecoder('shift-jis').decode(bytes)}parsed=/\.mc$/i.test(f.name)?parseMalody(text):parseTJA(text)}catch(e){skipped.push(f.name+'：'+e.message);continue}
   for(const c of parsed.charts){
    c.sourcePath=filePath(f);c.importName=f.importName||f.name;c.warnings=[...(parsed.warnings||[])];const wave=(c.meta.WAVE||'').replace(/\\/g,'/').normalize('NFC'),dir=filePath(f).split('/').slice(0,-1).join('/');
    const exact=sounds.filter(a=>normalizedPath(filePath(a))===normalizedPath(dir+'/'+wave));
    const matches=exact.length?exact:sounds.filter(a=>a.name.normalize('NFC').toLowerCase()===wave.split('/').pop().toLowerCase());
    if(matches.length===1)c.audioFile=matches[0];else if(matches.length===0)c.audioFile=audioFiles.get(wave.split('/').pop().toLowerCase());if(matches.length>1)c.warnings.push('同名の音源が複数あります。音源を個別に選択してください');
    loaded.push(c);
   }
  }
  if(chartFiles.length&&!loaded.length)throw Error(skipped.join(' ／ '));
  if(!chartFiles.length&&sounds.length){
   const attachedToPool=new Set();for(const f of sounds)for(const entry of danPool){const c=entry.chart;const wave=(c.meta.WAVE||'').replace(/\\/g,'/').split('/').pop().normalize('NFC').toLowerCase();if(!entry.demo&&!c.generated&&!c.audioFile&&wave&&wave===f.name.normalize('NFC').toLowerCase()){c.audioFile=f;attachedToPool.add(f)}}
   const expected=(chart.meta.WAVE||'').replace(/\\/g,'/').split('/').pop().normalize('NFC').toLowerCase();
   const matching=sounds.find(f=>f.name.normalize('NFC').toLowerCase()===expected);
   // An audio file matching an imported chart completes that chart; otherwise request a chart.
   if(attachedToPool.size===sounds.length){
    // The imported audio completes previously added course songs.
   }else if(!demoMode&&!chart.generated&&!audioBuffer&&(matching||!expected&&sounds.length===1)){
    const attached=matching||sounds[0];for(const existing of charts)if(existing===chart||(expected&&(existing.meta.WAVE||'').replace(/\\/g,'/').split('/').pop().normalize('NFC').toLowerCase()===expected))existing.audioFile=attached;
   }else{
    throw Error('音源に対応する譜面ファイルも追加してください。');
   }
  }

  attachVideos([...danPool.map(e=>e.chart),...loaded],expanded);
  // Commit only after parsing succeeds; importing a broken package keeps the current song.
  if(loaded.length){audioFiles=new Map();charts=[...loaded,...charts.filter(c=>c.serverEntry)];demoMode=false;fillCourses()}
  for(const f of sounds)if(sounds.filter(a=>a.name.toLowerCase()===f.name.toLowerCase()).length===1)audioFiles.set(f.name.toLowerCase(),f);
  if(!loaded.length&&sounds.length){const match=audioFiles.get((chart.meta.WAVE||'').replace(/\\/g,'/').split('/').pop().toLowerCase());if(match)chart.audioFile=match}
  if(incoming)pendingDan=incoming;
  importing=false;await choose();if(skipped.length)$('fileinfo').textContent+=' ／ 読み飛ばし：'+skipped.join('、');
 }catch(e){$('fileinfo').textContent='読み込みエラー：'+e.message;$('danError').textContent=$('fileinfo').textContent;return}finally{importing=false;loading=false;unlock();$('files').value='';$('folder').value=''}
 await tryStartPendingDan();
}
$('files').onchange=e=>loadFiles(e.target.files);$('folder').onchange=e=>loadFiles(e.target.files);$('course').onchange=choose;$('demo').onclick=()=>{if(loading||importing||danRun)return;demoMode=true;charts=parseTJA(demo).charts.map(c=>({...c,builtinDemo:true}));fillCourses();choose()};$('pause').onclick=togglePause;document.querySelectorAll('[data-hit]').forEach(b=>{b.addEventListener('pointerdown',e=>{e.preventDefault();if(autoInputLocked())return;b.setPointerCapture(e.pointerId);b.classList.add('active');hit(Number(b.dataset.hit))});for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,()=>b.classList.remove('active'))});window.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;const key=e.key.toLowerCase();if(e.repeat)return;if(['d','f','j','k'].includes(key)){e.preventDefault();hit(key==='d'||key==='k'?2:1)}else if(key==='escape'||key===' '){e.preventDefault();togglePause()}});document.addEventListener('visibilitychange',()=>{if(document.hidden&&state==='playing')togglePause()});window.addEventListener('resize',resize);$('speed').onchange=draw;initPractice();initDan();charts=parseTJA(demo).charts.map(c=>({...c,builtinDemo:true}));fillCourses();choose();new ResizeObserver(resize).observe(canvas);

async function decodeDanText(file){const bytes=await file.arrayBuffer();try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{return new TextDecoder('shift-jis').decode(bytes)}}

function soulNoteCount(){return Math.max(1,danRun?danRun.config.songs.reduce((sum,e)=>sum+branchReferenceNoteCount(e.chart),0):branchReferenceNoteCount(chart))}

function applyVolumes(){const music=Number($('musicVolume').value||0),effects=Number($('effectVolume').value||0);if(musicGain)musicGain.gain.value=music/100;if(effectGain)effectGain.gain.value=effects/100;$('musicVolumeValue').textContent=music+'%';$('effectVolumeValue').textContent=effects+'%';}
$('musicVolume').oninput=applyVolumes;$('effectVolume').oninput=applyVolumes;
$('volumeOpen').onclick=()=>$('volumeDialog').showModal();$('volumeClose').onclick=()=>$('volumeDialog').close();applyVolumes();


function attachVideos(list,files){for(const c of list){const name=c.meta.VIDEO;if(typeof name!=='string'||!name)continue;const dir=(c.sourcePath||'').split('/').slice(0,-1).join('/');let matches=files.filter(f=>normalizedPath(filePath(f))===normalizedPath(dir+'/'+name));if(!matches.length)matches=files.filter(f=>normalizedPath(f.name)===normalizedPath(name.split('/').pop()));if(matches.length===1)c.videoFile=matches[0];}}
function stopMV(){const v=$('mv');if(v&&typeof v.pause==='function')v.pause();mvPlaying=false;}
function syncMV(){const v=$('mv');if(!v||typeof v.play!=='function')return;const file=chart?._mvEnabled===false?null:(chart?.videoFile||null);
 if(file!==mvFile){stopMV();if(mvURL)URL.revokeObjectURL(mvURL);mvFile=file;mvURL=file?URL.createObjectURL(file):null;v.removeAttribute('src');if(mvURL)v.src=mvURL;v.load();v.parentElement.classList.toggle('has-mv',!!file);v.onerror=()=>{v.parentElement.classList.remove('has-mv');};}
 if(!file)return;const t=time();if(state!=='playing'||t<0){stopMV();return}if(v.readyState<1)return;
 const desired=Math.min(t,Number.isFinite(v.duration)?v.duration:t);if(Math.abs(v.currentTime-desired)>.2)v.currentTime=desired;
 if(!mvPlaying&&!v.ended){mvPlaying=true;v.muted=true;v.play().catch(()=>{mvPlaying=false})}}

function chartFadeAt(events,t){
 const keys=['info','lane','note','button'],tracks={};
 const valueAt=(track,time)=>!track?1:track.from+(track.to-track.from)*(track.end===track.time?1:Math.max(0,Math.min(1,(time-track.time)/(track.end-track.time))));
 for(const e of [...(events||[])].sort((a,b)=>a.time-b.time)){if(e.time>t)break;for(const key of e.mode==='all'?keys:[e.mode]){if(!keys.includes(key))continue;const from=valueAt(tracks[key],e.time);tracks[key]={from,to:e.direction,time:e.time,end:e.end};}}
 return Object.fromEntries(keys.map(key=>[key,valueAt(tracks[key],t)]));
}
function applyChartFade(t){const fade=state==='playing'&&chart?._fadeEnabled!==false?chartFadeAt(chart.fades,t):{info:1,lane:1,note:1,button:1};document.querySelectorAll('.scorebar,#danHud,.song-progress').forEach(n=>n.style.opacity=fade.info);document.querySelectorAll('.pads').forEach(n=>n.style.opacity=fade.button);const lane=canvas.parentElement;if(lane){const mvActive=chart?._mvEnabled!==false&&!!chart.videoFile;lane.style.backgroundColor=mvActive?'rgba(16,19,23,'+(.267*fade.lane)+')':'rgba(16,19,23,'+fade.lane+')';lane.style.borderColor='rgba(68,68,68,'+fade.lane+')'}return fade;}

// Four beats per revolution at x1; signed scroll supports stops and reverse motion.
var hibikiMotion;
function resetHibiki(t){hibikiMotion={chart,time:t,angle:0};}
function hibikiTravel(c,from,to){
 const events=c.motion||c.visual||[];
 let bpm=c.bpm||120,scroll=1,hs=1,cursor=from,total=0;
 for(const e of events){
  if(e.time>to)break;
  if(e.time>from){total+=(e.time-cursor)*bpm*scroll*hs;cursor=e.time;}
  bpm=e.bpm??bpm;scroll=e.scroll??scroll;hs=e.hs??hs;
 }
 return total+(to-cursor)*bpm*scroll*hs;
}
function updateHibiki(){
 const label=$('hibiki');if(!label||!chart)return;
 const t=time();
 if(!hibikiMotion||hibikiMotion.chart!==chart||state==='ready'||t<hibikiMotion.time)resetHibiki(t);
 if(state==='playing'||state==='paused'){
  hibikiMotion.angle=(hibikiMotion.angle+hibikiTravel(chart,hibikiMotion.time,t)*Number($('speed').value)*1.5)%360;
 }
 hibikiMotion.time=t;
 label.style.transform=`rotate(${hibikiMotion.angle}deg)`;
}
function autoInputLocked(){return auto&&(state==='playing'||state==='paused'||state==='dan-break'||state==='dan-result');}
function pulseAutoPad(type,big=false){const ids=type===1?[1,2]:[0,3],until=(audioContext?.currentTime||0)+.085;if(big){for(const i of ids)autoPadUntil[i]=until}else{autoPadUntil[ids[autoPadSide[type]]]=until;autoPadSide[type]=1-autoPadSide[type]}}
function clearAutoPads(){autoPadUntil.fill(0);document.querySelectorAll('[data-hit]').forEach(b=>b.classList.remove('auto-active'));}
function updateAutoPads(){const now=audioContext?.currentTime||0;document.querySelectorAll('[data-hit]').forEach((b,i)=>{const locked=autoInputLocked();b.disabled=locked;if(locked)b.classList.remove('active');if(state==='playing'&&autoPadUntil[i]>now)b.classList.add('auto-active');else b.classList.remove('auto-active')});}

function updateDanPauseRemaining(){
 const label=$('danPauseRemaining');if(!label)return;
 if(!danRun){label.hidden=true;return}
 const remaining=Math.max(0,2-(danRun.pauseCount||0));
 label.hidden=false;label.textContent='再開あと'+remaining+'回';
}
function setPauseIcon(paused){const b=$('pause');b.textContent=paused?'▶':'Ⅱ';b.setAttribute('aria-label',paused?'再開':'一時停止');b.title=paused?'再開':'一時停止';updateDanPauseRemaining();}
async function enterPlayFullscreen(){try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();if(screen.orientation?.lock)await screen.orientation.lock('landscape')}catch{}}
function leavePlayFullscreen(){try{screen.orientation?.unlock?.()}catch{}if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});}

async function requestLandscape(){try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();if(screen.orientation?.lock)await screen.orientation.lock('landscape');else throw Error('unsupported');}catch{$('status').textContent='横向き固定に対応していない場合は、端末の自動回転を有効にして横にしてください。';}}
$('landscapeOpen').onclick=requestLandscape;


var branchChoices=[],branchScoreLog=[],branchRollLog=[],branchTransitions=[];
function branchJudgeTime(e){return Number.isFinite(e?.judgeTime)?e.judgeTime:e.time}
function branchRank(route){return route==='M'?2:route==='E'?1:0}
function branchTransitionWindow(e){
 const start=branchJudgeTime(e),fullEnd=e.time;
 if(fullEnd>start)return {start,end:start+(fullEnd-start)*.5};
 const measures=chart.measures||[];
 let index=measures.findIndex(m=>Math.abs(m.time-start)<1e-6||(m.time<=start&&m.end>start));
 const fallback=index>=0?measures[index]?.end:null;
 return {start,end:fallback>start?start+(fallback-start)*.5:start+.001};
}
function activeBranchTransition(t){
 if(danRun||!chart.branchEvents?.length||!(state==='playing'||state==='paused'))return null;
 const now=t-Number($('offset').value||0)/1000;
 const active=[...branchTransitions].reverse().find(x=>now>=x.start&&now<x.end);
 if(!active)return null;
 const raw=Math.max(0,Math.min(1,(now-active.start)/Math.max(.001,active.end-active.start)));
 return {active,p:raw*raw*(3-2*raw)};
}
function paintBranchShade(route,y,r,opacity,clipTop=null,clipHeight=null){
 const colors={N:'255,255,255',E:'85,187,210',M:'181,105,235'},rgb=colors[route]||colors.N;
 const left=width*.72,top=y-r-20,w=width*.28,h=2*r+40;
 ctx.save();ctx.globalAlpha=opacity;
 if(clipTop!==null&&clipHeight!==null){ctx.beginPath();ctx.rect(left,clipTop,w,Math.max(0,clipHeight));ctx.clip()}
 const shade=ctx.createLinearGradient(left,0,width,0);shade.addColorStop(0,'rgba('+rgb+',0)');shade.addColorStop(1,'rgba('+rgb+',0.35)');
 ctx.fillStyle=shade;ctx.fillRect(left,top,w,h);ctx.restore();
}
function drawBranchLaneShade(t,y,r,opacity){
 if(danRun||!chart.branchEvents?.length||!(state==='playing'||state==='paused'))return;
 const transition=activeBranchTransition(t),route=branchChoices[branchChoices.length-1]||'N';
 if(!transition){paintBranchShade(route,y,r,opacity);return}
 const {active,p}=transition;
 paintBranchShade(active.from,y,r,opacity);
 const top=y-r-20,h=2*r+40;
 if(active.direction==='down')paintBranchShade(active.to,y,r,opacity,top,h*p);
 else paintBranchShade(active.to,y,r,opacity,top+h*(1-p),h*p);
}
function branchNoteY(t,n,baseY,laneHeight){
 const transition=activeBranchTransition(t);
 if(!transition||n.time<transition.active.branchTime)return baseY;
 const {active,p}=transition,offset=laneHeight*(1-p);
 return baseY+(active.direction==='down'?-offset:offset);
}
function judge(n,error){n.branchQuality=error<=judgmentWindows().good?1:error<=judgmentWindows().ok?.5:0;const before=score;judgeCore(n,error);branchScoreLog.push({time:n.time,score:score-before});}
function addRollHits(r,count=1){const before=r.hits||0;addRollHitsCore(r,count);const hits=(r.hits||0)-before;if(hits>0)branchRollLog.push({time:time(),hits});}
function branchReachableRoutes(e){
 const routeAt=v=>v>=e.high?'M':v>=e.low?'E':'N',set=new Set(),eps=1e-7;
 let values;
 if(e.kind==='p'){
  values=[0,100,e.low,e.high,e.low-eps,e.low+eps,e.high-eps,e.high+eps]
   .map(v=>Math.max(0,Math.min(100,v)));
 }else{
  const top=Math.max(0,e.low,e.high)+1;
  values=[0,top,e.low,e.high,e.low-eps,e.low+eps,e.high-eps,e.high+eps]
   .map(v=>Math.max(0,v));
 }
 for(const v of values)if(Number.isFinite(v))set.add(routeAt(v));
 return ['N','E','M'].filter(r=>set.has(r));
}
function branchDetails(e,decideRandom=false){
 const at=branchJudgeTime(e);
 const from=Math.max(-Infinity,...(chart.sections||[]).filter(t=>t<=at));
 const judged=notes.filter(n=>n.type<=4&&n.time>=from&&n.time<at);
 let value=0;
 if(e.kind==='p'){const done=judged.filter(n=>n.done);value=done.length?done.reduce((sum,n)=>sum+(n.branchQuality||0),0)/done.length*100:0;}
 else if(e.kind==='r')value=branchRollLog.filter(x=>x.time>=from&&x.time<at).reduce((sum,x)=>sum+x.hits,0);
 else value=branchScoreLog.filter(x=>x.time>=from&&x.time<at).reduce((sum,x)=>sum+x.score,0);
 const mode=chart?._branchForce||null,fixed=['N','E','M'].includes(mode)?mode:null;
 const autoRoute=value>=e.high?'M':value>=e.low?'E':'N';
 const levelHeld=(chart.holds||[]).some(t=>t<=at);
 const available=branchReachableRoutes(e);
 let route=autoRoute,locked=false,random=false,forced=false;
 if(fixed){route=fixed;forced=true}
 else if(levelHeld){route=branchChoices[branchChoices.length-1]||'N';locked=true}
 else if(mode==='random'){
  if(available.length<=1){route=available[0]||autoRoute;forced=true}
  else{random=true;if(decideRandom)route=available[Math.floor(Math.random()*available.length)]}
 }
 return {value,route,locked,forced,random,available};
}
function updateBranchRoute(){
 if(danRun||!chart.branchEvents?.length)return;
 const now=time()-Number($('offset').value||0)/1000;
 while(branchChoices.length<chart.branchEvents.length){
  const index=branchChoices.length,e=chart.branchEvents[index],judgeAt=branchJudgeTime(e);if(now<judgeAt)break;
  for(const n of notes){if(n.type<=4&&!n.done&&!n.ghost&&n.time<judgeAt){if(auto)judge(n,0);else if(now>n.time+judgmentWindows().miss)judge(n,1)}}
  const detail=branchDetails(e,true),fromRoute=branchChoices[branchChoices.length-1]||'N';
  branchChoices.push(detail.route);
  const old=notes;syncRebuiltChart(rebuildTjaBranches(chart,branchChoices));
  const prior=new Map(old.filter(n=>n.time<e.time).map(n=>[n.time+':'+n.type,n]));
  notes=chart.notes.map(n=>prior.get(n.time+':'+n.type)||({...n,done:false,hits:0,ghost:false}));
  if(branchRank(fromRoute)!==branchRank(detail.route)){
   const selectedEvent=chart.branchEvents?.[index]||e,window=branchTransitionWindow(selectedEvent);
   branchTransitions.push({start:window.start,end:window.end,branchTime:selectedEvent.time,from:fromRoute,to:detail.route,direction:branchRank(detail.route)>branchRank(fromRoute)?'down':'up'});
  }
 }
}
function drawBranchDetails(t,opacity){
 const bar=$('branchProgress'),active=state==='playing'||state==='paused';
 const e=!danRun&&active?chart.branchEvents?.[branchChoices.length]:null;
 bar.hidden=!e;if(!e)return;
 const now=t-Number($('offset').value||0)/1000,judgeAt=branchJudgeTime(e);
 const previous=branchChoices.length?branchJudgeTime(chart.branchEvents[branchChoices.length-1]):Math.min(0,(chart.notes[0]?.time||0)-4);
 const start=Math.max(previous,...(chart.sections||[]).filter(x=>x<judgeAt));
 const progress=Math.max(0,Math.min(1,(now-start)/Math.max(.001,judgeAt-start)));
 $('branchProgressFill').style.width=(progress*100)+'%';bar.style.opacity=opacity;
 bar.setAttribute('aria-valuenow',String(Math.round(progress*100)));
 bar.setAttribute('aria-valuetext','次の分岐判定まで '+Math.max(0,judgeAt-now).toFixed(1)+'秒');
 bar.title='次の分岐判定まで '+Math.max(0,judgeAt-now).toFixed(1)+'秒';
 const d=branchDetails(e);
 const names={N:'普通',E:'玄人',M:'達人'},unit=e.kind==='p'?'%':e.kind==='r'?'打':'点';
 ctx.save();ctx.globalAlpha=opacity;ctx.textAlign='right';ctx.textBaseline='bottom';ctx.fillStyle='#fff';ctx.font='700 12px sans-serif';
 const max=e.kind==='p'?100:Infinity,routeAt=v=>v>=e.high?'M':v>=e.low?'E':'N',forced=routeAt(0)===routeAt(max);
 const randomNames=d.available.map(r=>names[r]).join(' / ');const text=d.locked?'LEVELHOLD → '+names[d.route]+'固定':d.random?'ランダム → '+randomNames:d.forced?(chart?._branchForce&&chart._branchForce!=='random'?'分岐先固定 → ':'強制分岐 → ')+names[d.route]:forced?'強制分岐 → '+names[routeAt(0)]: (e.kind==='p'?'精度':e.kind==='r'?'連打':'スコア')+' '+d.value.toFixed(e.kind==='p'?1:0)+unit+' / '+(e.low>=e.high?'達人 '+e.high+unit+'以上':'玄人 '+e.low+'・達人 '+e.high)+' → '+names[d.route];
 ctx.fillText(text,width-12,height-6);ctx.restore();
}

async function waitForLandscape(){
 if(window.innerWidth>=window.innerHeight)return;
 const dialog=document.createElement('dialog'),title=document.createElement('h2'),message=document.createElement('p');
 title.textContent='端末を横向きにしてください';dialog.append(title,message);document.body.append(dialog);dialog.showModal();
 await new Promise(resolve=>{
 const deadline=Date.now()+10000;
 const finish=()=>{clearInterval(timer);window.removeEventListener('resize',check);dialog.close();dialog.remove();resolve()};
 const check=()=>{if(window.innerWidth>=window.innerHeight||Date.now()>=deadline){finish();return}message.textContent='横向きになると開始します。あと '+Math.ceil((deadline-Date.now())/1000)+' 秒で、そのまま開始します。'};
 dialog.addEventListener('cancel',e=>e.preventDefault());
 const timer=setInterval(check,100);window.addEventListener('resize',check);check();
 });
}


var renderNoteCache,dummyPlayback;
function dummyKey(n){return [n.time,n.type,n.end,n.required,n.scroll,n.bpm,n.dummyOpacity].join(':')}
function resetDummyPlayback(t){
 dummyPlayback={source:chart.dummyNotes,list:(chart.dummyNotes||[]).map(n=>({...n,done:(n.end??n.time)<t,hits:n.end?autoRollHits(n,t-1e-9):0}))};
 renderNoteCache=null;
}
function dummyNotesForPlay(){
 if(!dummyPlayback)resetDummyPlayback(state==='playing'?time():-Infinity);
 if(dummyPlayback.source!==chart.dummyNotes){
  const prior=new Map();for(const n of dummyPlayback.list){const key=dummyKey(n);if(!prior.has(key))prior.set(key,[]);prior.get(key).push(n)}
  dummyPlayback={source:chart.dummyNotes,list:(chart.dummyNotes||[]).map(n=>prior.get(dummyKey(n))?.shift()||({...n,done:(n.end??n.time)<time(),hits:0}))};
 }
 return dummyPlayback.list;
}
function updateDummyPlayback(t){
 for(const n of dummyNotesForPlay()){
  if(n.done||t<n.time)continue;
  if(n.type<=4){
   const type=n.type===1||n.type===3?1:2;
   pulseAutoPad(type,n.type===3||n.type===4);tone(type);n.done=true;
  }else if(n.type<=7){
   const hits=autoRollHits(n,t),count=hits-(n.hits||0);
   if(count>0){n.hits=hits;const type=n.type===7?1:n.hits%2+1;pulseAutoPad(type);tone(type)}
   if(t>=n.end||(n.type===7&&n.hits>=n.required))n.done=true;
  }else n.done=true;
 }
}
function renderNotes(){const dummy=dummyNotesForPlay();if(!renderNoteCache||renderNoteCache.notes!==notes||renderNoteCache.dummy!==dummy){renderNoteCache={notes,dummy,list:[...notes,...dummy].sort((a,b)=>a.time-b.time)}}return renderNoteCache.list;}

// Touch cancellation supplements touch-action for Safari double-tap gestures.
// Judgment remains pointerdown-only, preserving simultaneous and rapid hits.
document.querySelectorAll('.pads').forEach(region=>{
 for(const event of ['touchstart','touchend','dblclick','gesturestart'])
  region.addEventListener(event,e=>{if(e.cancelable)e.preventDefault()},{passive:false});
 region.addEventListener('contextmenu',e=>e.preventDefault());
});

var expandedSong=null;
function songGroups(){
 const groups=new Map();
 charts.forEach((c,index)=>{const key=c.meta.TITLE||'無題';if(!groups.has(key))groups.set(key,[]);groups.get(key).push({c,index})});
 return groups;
}
function renderSongSelection(){
 const host=$('songSelectionList');if(!host)return;host.replaceChildren();
 for(const [title,entries] of songGroups()){
  const item=document.createElement('article');item.className='song-choice';
  const heading=document.createElement('button');heading.className='song-choice-title';heading.textContent=title;
  const opened=expandedSong===title;heading.setAttribute('aria-expanded',String(opened));
  const panel=document.createElement('div');panel.className='song-choice-panel';panel.id='song-panel-'+entries[0].index;panel.hidden=!opened;heading.setAttribute('aria-controls',panel.id);
  heading.onclick=async()=>{
   if(expandedSong===title){expandedSong=null;renderSongSelection();return}
   if(loading||importing||danRun)return;
   expandedSong=title;
   const index=entries.some(e=>e.c===chart)?charts.indexOf(chart):entries[0].index;
   $('course').value=index;
   const pending=choose();renderSongSelection();await pending;
  };
  if(opened){
   const selected=entries.find(e=>e.c===chart)||entries[0],c=selected.c;
   const label=document.createElement('label');label.textContent='譜面・難易度 ';
   const select=document.createElement('select');select.disabled=loading||importing;
   for(const e of entries){const opt=document.createElement('option');opt.value=e.index;opt.textContent=(names[e.c.meta.COURSE]||e.c.meta.COURSE||'難易度不明')+' ★'+(e.c.meta.LEVEL||'?');select.append(opt)}
   select.value=selected.index;
   select.onchange=async()=>{if(loading||importing)return;$('course').value=select.value;const pending=choose();renderSongSelection();await pending};
   label.append(select);panel.append(label,featureBadges([c]));
   const info=document.createElement('p'),duration=Math.max(0,c.duration||0,c===chart?audioBuffer?.duration||0:0);
   info.textContent=c.bpm+' BPM ／ '+Math.floor(duration/60)+':'+String(Math.floor(duration%60)).padStart(2,'0')+' ／ '+branchReferenceNoteCount(c)+' ノーツ';panel.append(info);
   if(c.meta.SUBTITLE){const sub=document.createElement('p');sub.textContent=c.meta.SUBTITLE.replace(/^(--|\+\+)/,'');panel.append(sub)}
   const status=document.createElement('p');status.className='muted';status.textContent=loading?'音源を読み込み中…':demoMode?'練習曲':audioBuffer?'演奏できます':'音源を追加してください';panel.append(status);
   const actions=document.createElement('div');actions.className='song-choice-actions';
   for(const [text,action,primary] of [['▶ 演奏スタート',()=>start(),true],['オートプレイでスタート',()=>start({auto:true}),false],['途中からはじめる',()=>openSeek(),false]]){
    const button=document.createElement('button');button.textContent=text;if(primary)button.className='primary';button.disabled=loading||importing||(!demoMode&&!audioBuffer)||c!==chart;button.onclick=action;actions.append(button);
   }
   panel.append(actions);
  }
  const badges=featureBadges(entries.map(e=>e.c));heading.append(badges);item.append(heading,panel);host.append(item);
 }
}

function chartFeatures(c){
 const result={fadeOnNotes:!!c.features?.fadeOnNotes,scrollOnNotes:!!c.features?.scrollOnNotes,soflan:!!c.features?.soflan,fadeout:!!c.features?.fadeout,branch:!!c.features?.branch||!!c.branchEvents?.length,dummy:!!c.features?.dummy||!!c.dummyNotes?.length,damage:!!c.features?.damage||!!c.notes?.some(n=>n.type===9),mv:!!(c.features?.mv||c.videoFile||c.meta.VIDEO)};
 if(c._tja){
  for(const line of c._tja.lines){
   if(/^#BRANCHSTART\b/i.test(line))result.branch=true;
   if(/^#DUMMYSTART\b/i.test(line))result.dummy=true;
   if(!line.startsWith('#')&&/9/.test(line))result.damage=true;
   const match=line.match(/^#(BPMCHANGE|ABSCROLL|SCROLL)\s+([+-]?[\d.]+)/i);
   if(match){const command=match[1].toUpperCase(),value=Number(match[2]);if(command==='BPMCHANGE'&&value!==c.bpm||command==='ABSCROLL'&&value!==1||command==='SCROLL'&&value<0)result.soflan=true}
   if(/^#FADE\s*,\s*0\s*,/i.test(line))result.fadeout=true;
  }
 }
 return result;
}
function featureBadges(list){
 const box=document.createElement('span');box.className='feature-badges';
 const flags=list.map(chartFeatures);
 for(const [key,icon,label] of [['soflan','↔','ソフランあり'],['branch','⑂','譜面分岐あり'],['dummy','◇','ダミーノーツあり'],['damage','⚠','ダメージノーツあり'],['fadeout','◐','フェードアウトあり'],['mv','▶','MV付き']]){
  if(!flags.some(f=>f[key]))continue;
  const badge=document.createElement('span');badge.className='feature-badge '+key+(key==='soflan'&&flags.some(f=>f.scrollOnNotes)?' scroll-on-notes':'')+(key==='fadeout'&&flags.some(f=>f.fadeOnNotes)?' fade-on-notes':'');badge.title=label;badge.setAttribute('aria-label',label);badge.textContent=icon+' '+label;box.append(badge);
 }
 return box;
}
function serverURL(path,base){
 const u=new URL(path,base);
 if(u.origin!==location.origin||!['http:','https:'].includes(u.protocol))throw Error('収録曲は同じサイト内のパスを指定してください');
 return u.href;
}
async function serverFile(url,name){
 const res=await fetch(url);if(!res.ok)throw Error(name+' (HTTP '+res.status+')');
 return new File([await res.blob()],name);
}
async function prepareServerChart(c){
 const entry=c.serverEntry;
 if(c.serverPlaceholder){
  let parsed;
  if(/\.(mcz|zip)(?:\?|$)/i.test(entry.url)){
   const file=await serverFile(entry.url,decodeURIComponent(new URL(entry.url).pathname.split('/').pop()));
   const files=await readChartArchive(file);parsed=[];
   for(const f of files.filter(f=>/\.(mc|tja)$/i.test(f.name))){
    let result;try{const bytes=await f.arrayBuffer();let source;try{source=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{source=new TextDecoder('shift-jis').decode(bytes)}result=/\.mc$/i.test(f.name)?parseMalody(source):parseTJA(source)}catch{continue}
    for(const chart of result.charts){chart.sourcePath=filePath(f);const dir=chart.sourcePath.split('/').slice(0,-1).join('/');const wave=chart.meta.WAVE||'';chart.audioFile=files.find(x=>normalizedPath(filePath(x))===normalizedPath(dir+'/'+wave));parsed.push(chart)}
   }
   attachVideos(parsed,files);
  }else{
   const response=await fetch(entry.url);if(!response.ok)throw Error('譜面 HTTP '+response.status);
   const bytes=await response.arrayBuffer();let source;try{source=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{source=new TextDecoder('shift-jis').decode(bytes)}
   parsed=(/\.mc(?:\?|$)/i.test(entry.url)?parseMalody(source):parseTJA(source)).charts;
   for(const chart of parsed){
    const wave=entry.audio||chart.meta.WAVE,video=entry.video||chart.meta.VIDEO;
    if(wave)chart.serverAudio=serverURL(wave,entry.url);
    if(video){if(entry.videoParts?.length)chart.serverVideoParts=entry.videoParts.map(p=>serverURL(p,entry.url));else chart.serverVideo=serverURL(video,entry.url);chart.meta.VIDEO=video}
   }
  }
  if(!parsed.length)throw Error('対応する譜面がありません');
  for(const chart of parsed){chart.serverEntry=entry;chart.meta.TITLE=chart.meta.TITLE||entry.title;}
  const index=charts.indexOf(c);charts.splice(index,1,...parsed);c=parsed[0];expandedSong=c.meta.TITLE;fillCourses();$('course').value=index;
 }
 if(c.serverAudio&&!c.audioFile)c.audioFile=await serverFile(c.serverAudio,c.meta.WAVE||'music');
 if(c.serverVideoParts&&!c.videoFile){const parts=[];for(const url of c.serverVideoParts)parts.push(await serverFile(url,'part'));c.videoFile=new File(parts,c.meta.VIDEO||'video.mp4',{type:'video/mp4'})}
 if(c.serverVideo&&!c.videoFile)c.videoFile=await serverFile(c.serverVideo,c.meta.VIDEO||'video.mp4');
 return c;
}
async function loadServerCatalog(){
 try{
  const url=new URL('songs/catalog.json',location.href),response=await fetch(url,{cache:'no-cache'});
  if(response.status===404)return;if(!response.ok)throw Error('一覧 HTTP '+response.status);
  const data=await response.json();try{const uploaded=await fetch('/api/donbeat/catalog',{cache:'no-store'});if(uploaded.ok){const remote=await uploaded.json();if(Array.isArray(remote.songs))data.songs.push(...remote.songs)}}catch{}if(!Array.isArray(data.songs))throw Error('songs配列が必要です');
  const added=data.songs.map((e,i)=>{
   if(typeof e.file!=='string'||!e.file||typeof e.title!=='string')throw Error('曲のtitleとfileを指定してください');
   const entry={...e,url:serverURL(e.file,url)};
   return {features:e.features||{},serverEntry:entry,serverPlaceholder:true,meta:{TITLE:e.title,COURSE:'読み込み前',LEVEL:'?'},notes:[],dummyNotes:[],bars:[],beats:[],bpm:'—',duration:0};
  });
  charts.push(...added);const selected=charts.indexOf(chart);fillCourses();$('course').value=Math.max(0,selected);renderSongSelection();
 }catch(e){$('fileinfo').textContent='収録曲一覧を読み込めません：'+e.message}
}
loadServerCatalog();

function visualBpmState(c,t){
 const events=c.motion||c.visual||[];let lo=0,hi=events.length;
 while(lo<hi){const mid=(lo+hi)>>1;if(events[mid].time<=t)lo=mid+1;else hi=mid}
 const e=lo?events[lo-1]:null,bpm=e?.bpm??c.bpm??120,hs=e?.hs??1,scroll=e?.scroll??1;
 return {bpm,hs,scroll,value:bpm*hs*scroll};
}
function updateVisualBpm(t,opacity){
 let label=$('visualBpm');
 if(!label){label=document.createElement('div');label.id='visualBpm';label.style.cssText='position:absolute;right:10px;top:5px;z-index:35;pointer-events:none;font:600 clamp(10px,1.5vw,13px) sans-serif;color:#eee;text-shadow:0 1px 3px #000;background:#10131799;padding:3px 6px;border-radius:4px;max-width:calc(100% - 20px);text-align:right;overflow-wrap:anywhere';canvas.parentElement.append(label)}
 const n=visualBpmState(chart,t),playerSpeed=Number($('speed').value)||1,format=v=>Number(v.toFixed(3)).toLocaleString('ja-JP',{maximumFractionDigits:3});
 const value='見た目 '+format(n.bpm)+' BPM × '+format(n.hs)+' HS'+(n.scroll!==1?' × '+format(n.scroll):'')+(playerSpeed!==1?' × '+format(playerSpeed)+' 設定':'')+' = '+format(n.value*playerSpeed)+' BPM';
 if(label.textContent!==value)label.textContent=value;
 label.style.opacity=opacity;
}
