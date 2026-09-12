'use strict';
let balloonRolls=0,balloonPops=0;
const autoPadUntil=[0,0,0,0],autoPadSide={1:0,2:0};
let mvFile=null,mvURL=null,mvPlaying=false;
const $=id=>document.getElementById(id),canvas=$('canvas'),ctx=canvas.getContext('2d');let charts=[],chart,audioFiles=new Map(),audioBuffer=null,audioContext,source,state='ready',notes=[],startAt=0,pausedTime=0,score=0,combo=0,maxCombo=0,good=0,ok=0,miss=0,rolls=0,soul=0,feedback='',feedbackAt=-10,auto=false,demoMode=true,beatIndex=0,width=1000,height=230,raf=0,loading=false,practiceTarget=null,judgeFrom=-Infinity,importing=false;
const demo=`TITLE:夜祭ビート\nSUBTITLE:オリジナル練習曲\nBPM:120\nOFFSET:0\nCOURSE:Easy\nLEVEL:3\nBALLOON:8\n#START\n0000,\n1000100010001000,\n1000200010002000,\n1010100010102000,\n1020102010201020,\n3000400030004000,\n5000000000000008,\n#GOGOSTART\n1010202010102020,\n1110200011102000,\n1020102010201020,\n7000000000000008,\n#GOGOEND\n3000400030004000,\n1000200010201000,\n1000000000000000,\n0000,\n#END`;
const names={Easy:'かんたん',Normal:'ふつう',Hard:'むずかしい',Oni:'おに',Edit:'裏',0:'かんたん',1:'ふつう',2:'むずかしい',3:'おに',4:'裏'};
let musicGain,effectGain;
function audio(){if(!audioContext)audioContext=new (window.AudioContext||window.webkitAudioContext)();if(!musicGain){musicGain=audioContext.createGain();effectGain=audioContext.createGain();musicGain.connect(audioContext.destination);effectGain.connect(audioContext.destination);applyVolumes()}return audioContext}
function tone(type,when){const ac=audio(),osc=ac.createOscillator(),gain=ac.createGain();osc.type=type===1?'sine':'triangle';const t=when??ac.currentTime;osc.frequency.setValueAtTime(type===1?180:900,t);osc.frequency.exponentialRampToValueAtTime(type===1?55:250,t+.085);gain.gain.setValueAtTime(.23,t);gain.gain.exponentialRampToValueAtTime(.001,t+.12);osc.connect(gain).connect(effectGain);osc.start(t);osc.stop(t+.13)}
function time(){return state==='playing'?audioContext.currentTime-startAt:pausedTime}
function stopAudio(){clearAutoPads();stopMV();if(source){try{source.stop()}catch{}source=null}}
function scheduleAudio(t){stopAudio();if(!audioBuffer)return;source=audio().createBufferSource();source.buffer=audioBuffer;source.connect(musicGain);if(t<0)source.start(audioContext.currentTime-t);else if(t<audioBuffer.duration)source.start(audioContext.currentTime,t)}
function reset(){balloonRolls=balloonPops=0;if(danRun){exitDan();return}practiceTarget=null;judgeFrom=-Infinity;cancelAnimationFrame(raf);stopAudio();state='ready';leavePlayFullscreen();document.body.classList.remove('playing');$('pause').disabled=true;setPauseIcon(false);notes=chart.notes.map(n=>({...n,done:false,hits:0}));score=combo=maxCombo=good=ok=miss=rolls=soul=0;pausedTime=Math.min(-2,(chart.notes[0]?.time||0)-2);feedback='';beatIndex=0;update();$('overlay').style.display='flex';$('overlay').replaceChildren();const e=document.createElement('span');e.className='eyebrow';e.textContent='READY TO DRUM?';const h=document.createElement('h2');h.hidden=true;const p=document.createElement('p');p.hidden=true;const b=document.createElement('button');b.className='primary';b.textContent='▶ 演奏スタート';b.onclick=()=>start();const seek=document.createElement('button');seek.className='seek-start';seek.textContent='途中からはじめる';seek.onclick=openSeek;const buttons=document.createElement('div');buttons.className='seek-buttons';const ab=document.createElement('button');ab.textContent='オートプレイでスタート';ab.onclick=()=>start({auto:true});buttons.append(b,ab,seek);$('overlay').append(e,h,p,buttons);$('status').textContent=demoMode||audioBuffer?'準備完了':'音源の追加が必要です';if(!demoMode&&!audioBuffer){h.hidden=false;p.hidden=false;h.textContent='音源を追加してください';p.textContent='譜面に対応する音源を選ぶと演奏できます。';b.disabled=true;ab.disabled=true;seek.disabled=true}draw()}
async function start(options={}){
 if(loading||importing||state==='playing'||(danRun&&!options.dan)||(!demoMode&&!audioBuffer))return;loading=true;enterPlayFullscreen();
 try{if(!options.seamless||audio().state==='suspended')await audio().resume()}catch(e){loading=false;$('status').textContent='音声を開始できません。もう一度お試しください。';return}loading=false;
 cancelAnimationFrame(raf);stopAudio();auto=danRun?danRun.config.auto:Boolean(options.auto);
 practiceTarget=Number.isFinite(options.target)?options.target:null;judgeFrom=practiceTarget??-Infinity;
 if(chart._tja){chart=rebuildTjaBranches(chart,[])}branchChoices=[];branchScoreLog=[];branchRollLog=[];notes=chart.notes.map(n=>({...n,done:false,hits:0,ghost:false}));if(!options.carry){score=combo=maxCombo=good=ok=miss=rolls=soul=0;balloonRolls=balloonPops=0;}feedback='';feedbackAt=-10;
 const plan=practiceTarget===null?null:practicePlan(chart,practiceTarget,auto);
 pausedTime=plan?plan.lead:Math.min(0,(notes[0]?.time||0)-4);
 // Manual pre-roll is visible but excluded from every judgment and score path.
 if(plan){for(const n of notes){if(n.time>=plan.target)continue;if(auto){if(n.type<=4)judge(n,0);else{addRollHits(n,autoRollHits(n,plan.target-1e-9));if(n.end<plan.target)n.done=true}}else{n.ghost=true;if((n.end??n.time)<plan.lead)n.done=true}}}
 feedback='';feedbackAt=-10;beatIndex=chart.beats.findIndex(b=>b.time>=pausedTime);if(beatIndex<0)beatIndex=chart.beats.length;
 resetHibiki(pausedTime);startAt=audioContext.currentTime-pausedTime;scheduleAudio(pausedTime);state='playing';document.body.classList.add('playing');$('overlay').style.display='none';$('pause').disabled=false;setPauseIcon(false);['course','files','folder','demo','danOpen','danFiles','danFolder'].forEach(id=>$(id).disabled=true);
 update();resize();loop();
}
function togglePause(){if(state==='playing'){pausedTime=time();state='paused';stopAudio();draw();cancelAnimationFrame(raf);setPauseIcon(true);$('overlay').style.display='flex';$('overlay').replaceChildren();const h=document.createElement('h2');h.textContent='一時停止';const b=document.createElement('button');b.textContent='▶ 再開';b.className='primary';b.onclick=togglePause;const q=document.createElement('button');q.textContent='選曲に戻る';q.onclick=()=>{if(danRun)exitDan();else{unlock();reset()}};$('overlay').append(h,b,q)}else if(state==='paused'){audio().resume().then(()=>{startAt=audioContext.currentTime-pausedTime;scheduleAudio(pausedTime);state='playing';$('overlay').style.display='none';setPauseIcon(false);loop()})}}
function unlock(){['course','files','folder','demo','danOpen','danFiles','danFolder'].forEach(id=>$(id).disabled=false);}
function update(){$('score').textContent=String(score).padStart(7,'0');$('combo').textContent=combo;$('good').textContent=good;$('ok').textContent=ok;$('miss').textContent=miss;$('roll').textContent=rolls;$('gauge').style.width=soul+'%';$('gaugeText').textContent=Math.floor(soul)+'%';updateDanHUD()}
function judgmentWindows(){const level=Number(chart?.meta?.LEVEL);return Number.isFinite(level)&&level>0&&level<=5?{good:.041708,ok:.108442,miss:.125125}:{good:.025025,ok:.075075,miss:.108442}}
function judgeCore(n,error){notifyDanJudgment(error);n.done=true;const total=chart.notes.filter(n=>n.type<=4).length;if(error<=judgmentWindows().good){good++;score+=Math.floor(1000000/Math.max(1,total)/10)*10;soul=Math.min(100,soul+130/soulNoteCount());feedback='良'}else if(error<=judgmentWindows().ok){ok++;score+=Math.floor(1000000/Math.max(1,total)/2/10)*10;soul=Math.min(100,soul+65/soulNoteCount());feedback='可'}else{miss++;combo=0;soul=Math.max(0,soul-260/soulNoteCount());feedback='不可';feedbackAt=time();update();return}combo++;maxCombo=Math.max(combo,maxCombo);feedbackAt=time();update()}
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
function hit(type,automatic=false){if(!automatic&&autoInputLocked())return;if(state!=='playing'){if(state==='ready'){audio().resume();tone(type)}return}if(auto&&!automatic)return;tone(type);const t=time()-Number($('offset').value||0)/1000;if(t<judgeFrom)return;const n=notes.find(n=>!n.done&&!n.ghost&&n.type<=4&&Math.abs(n.time-t)<=judgmentWindows().miss);if(n&&(n.type===1||n.type===3?1:2)===type){judge(n,Math.abs(n.time-t));return}const r=notes.find(n=>!n.done&&!n.ghost&&n.type>=5&&t>=n.time&&t<=n.end);if(r&&(r.type!==7||type===1))addRollHits(r)}
function songDuration(){return Math.max(.001,chart.duration+(danRun?0:1),danRun?Math.max(0,...chart.notes.map(n=>(n.end??n.time)+judgmentWindows().miss+.001)):0,audioBuffer?.duration||0)}
function updateProgress(t=time()){
  const percent=state==='result'?100:state==='ready'?0:Math.max(0,Math.min(100,t/songDuration()*100));
  $('songProgressFill').style.transform=`scaleX(${percent/100})`;
  $('songProgress').setAttribute('aria-valuenow',String(Math.floor(percent)));
}
function finish(){if(danRun){finishDanSong();return}pausedTime=time();state='result';updateProgress();stopAudio();document.body.classList.remove('playing');unlock();$('pause').disabled=true;showSingleResult();}

function loop(){updateBranchRoute();const t=time(),adjust=Number($('offset').value||0)/1000;for(const n of notes){if(n.done)continue;if(n.ghost){if(t>(n.end??n.time)+.15)n.done=true;continue}if(n.type<=4){if(auto&&t>=n.time+adjust){pulseAutoPad(n.type===1||n.type===3?1:2,n.type===3||n.type===4);tone(n.type===1||n.type===3?1:2);judge(n,0)}else if(t-adjust>n.time+judgmentWindows().miss)judge(n,1)}else if(auto){const count=autoRollHits(n,t-adjust)-n.hits;if(count>0){addRollHits(n,count);pulseAutoPad(n.type===7?1:n.hits%2+1);tone(n.type===7?1:n.hits%2+1)}}}if(danRun&&!danRun.failed&&danCurrentFailed()){danRun.failed=true;updateDanHUD()}if(demoMode){while(beatIndex<chart.beats.length&&chart.beats[beatIndex].time<=t+.07){const beat=chart.beats[beatIndex++];if(beat.time>=t-.04)tone(beat.accent?1:2,Math.max(audioContext.currentTime,startAt+beat.time))}}$('status').textContent=danRun?.failed?'不合格確定 · この曲の終了まで演奏できます':!auto&&t-adjust<judgeFrom?'助走中 · 判定なし → '+judgeFrom.toFixed(2)+'秒から':auto?'AUTO · 記録対象外':practiceTarget===null?'演奏中':'途中から演奏中';draw();if(t>songDuration()){finish();return}raf=requestAnimationFrame(loop)}
function resize(){const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);width=r.width;height=r.height;canvas.width=width*dpr;canvas.height=height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);draw()}
function draw(){updateHibiki();updateAutoPads();syncMV();updateProgress();const t=time(),fade=applyChartFade(t),y=height*.5,target=width<600?76:125,speed=Number($('speed').value),r=Math.min(26,height*.19);ctx.globalAlpha=fade.lane;ctx.clearRect(0,0,width,height);ctx.fillStyle=chart.videoFile?'#171b2044':'#171b20';ctx.fillRect(0,y-r-20,width,2*r+40);ctx.strokeStyle='#333940';ctx.lineWidth=1;for(let i of [-1,1]){ctx.beginPath();ctx.moveTo(0,y+i*(r+20));ctx.lineTo(width,y+i*(r+20));ctx.stroke()}ctx.fillStyle='#f8c2590c';ctx.fillRect(0,0,target+40,height);const pos=n=>target+(chart.visual?malodyDistance(chart,n.time,n.scroll)-malodyDistance(chart,t,n.scroll):(n.time-t)*(n.bpm/120)*n.scroll)*speed*240;for(const b of chart.bars){const x=pos(b);if(x<0||x>width)continue;ctx.strokeStyle='#ffffff20';ctx.beginPath();ctx.moveTo(x,y-r-18);ctx.lineTo(x,y+r+18);ctx.stroke()}ctx.strokeStyle='#dbd3bd';ctx.lineWidth=3;ctx.beginPath();ctx.arc(target,y,r+8,0,Math.PI*2);ctx.stroke();ctx.strokeStyle='#d6c9a05c';ctx.lineWidth=1;ctx.beginPath();ctx.arc(target,y,r+14,0,Math.PI*2);ctx.stroke();for(let i=notes.length-1;i>=0;i--){const n=notes[i];if(n.done)continue;let x=pos(n),nr=n.type===3||n.type===4||n.type===6?r*1.25:r;ctx.globalAlpha=(n.ghost?.25:1)*fade.note;if(n.type>=5){let end=pos({...n,time:n.end});if(Math.max(x,end)<-50||Math.min(x,end)>width+50||t>n.end)continue;ctx.strokeStyle='#daa738';ctx.lineWidth=nr*1.6;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(Math.max(target,x),y);ctx.lineTo(Math.max(target,end),y);ctx.stroke();x=Math.max(target,x)}else if(x< -50||x>width+50)continue;ctx.fillStyle=n.type>=5?'#f5c757':n.type===1||n.type===3?'#f66b51':'#55bbd2';ctx.strokeStyle='#f4e8cc';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,nr,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#17242a';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`900 ${nr*.7}px sans-serif`;if(n.type>=5)ctx.fillText(n.type===7?String(Math.max(0,n.required-n.hits)):(t>=n.time?String(n.hits||0):'連'),x,y)}if(danRun){ctx.globalAlpha=fade.lane;ctx.fillStyle='#fff';ctx.font='700 14px sans-serif';ctx.textAlign='left';ctx.textBaseline='bottom';const remaining=notes.filter(n=>n.type<=4&&!n.done).length+danRun.config.songs.slice(danRun.index+1).reduce((sum,e)=>sum+e.chart.notes.filter(n=>n.type<=4).length,0);ctx.fillText('残り '+remaining+' ノーツ',12,height-6)}drawBranchDetails(t,fade.lane);ctx.globalAlpha=fade.lane;ctx.textAlign='center';if(feedback&&t-feedbackAt<.45){ctx.font='900 26px sans-serif';ctx.fillStyle=feedback==='不可'?'#aaa':feedback==='可'?'#fff':'#ffd565';ctx.fillText(feedback,target,Math.max(20,y-r-36))}if(state==='playing'&&t<notes[0].time-.2){ctx.font='700 15px sans-serif';ctx.fillStyle='#bfc2c3';ctx.fillText('まもなくスタート',width/2,height-18)}}
async function choose(){if(importing||danRun)return;seekTarget=0;chart=charts[Number($('course').value)||0];audioBuffer=null;const wave=(chart.meta.WAVE||'').replace(/\\/g,'/').split('/').pop().toLowerCase();const file=chart.audioFile||audioFiles.get(wave);loading=true;$('title').textContent=chart.meta.TITLE||'無題';$('subtitle').textContent=(chart.meta.SUBTITLE||'').replace(/^(--|\+\+)/,'')||'TJA譜面';$('level').textContent='★ '+(chart.meta.LEVEL||'?');$('bpm').textContent=chart.bpm+' BPM';try{if(file){chart.audioFile=file;audioBuffer=chart.preloadedAudio||await audio().decodeAudioData(await file.arrayBuffer());delete chart.preloadedAudio}$('fileinfo').textContent=demoMode?'オリジナルのリズム音で練習できます':file?'音源：'+file.name:wave?'音源未選択：'+chart.meta.WAVE+' を追加してください':'音源を追加すると演奏できます'}catch(e){$('fileinfo').textContent='音源を再生できません。MP3 / WAVなど別形式をお試しください。'}finally{loading=false;rememberDanCharts();reset();if(chart.warnings?.length)$('fileinfo').textContent+=' ／ 注意：'+chart.warnings.join('、')}}
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
  if(loaded.length){audioFiles=new Map();charts=loaded;demoMode=false;fillCourses()}
  for(const f of sounds)if(sounds.filter(a=>a.name.toLowerCase()===f.name.toLowerCase()).length===1)audioFiles.set(f.name.toLowerCase(),f);
  if(!loaded.length&&sounds.length){const match=audioFiles.get((chart.meta.WAVE||'').replace(/\\/g,'/').split('/').pop().toLowerCase());if(match)chart.audioFile=match}
  if(incoming)pendingDan=incoming;
  importing=false;await choose();if(skipped.length)$('fileinfo').textContent+=' ／ 読み飛ばし：'+skipped.join('、');
 }catch(e){$('fileinfo').textContent='読み込みエラー：'+e.message;$('danError').textContent=$('fileinfo').textContent;return}finally{importing=false;loading=false;unlock();$('files').value='';$('folder').value=''}
 await tryStartPendingDan();
}
$('files').onchange=e=>loadFiles(e.target.files);$('folder').onchange=e=>loadFiles(e.target.files);$('course').onchange=choose;$('demo').onclick=()=>{if(loading||importing||danRun)return;demoMode=true;charts=parseTJA(demo).charts;fillCourses();choose()};$('pause').onclick=togglePause;document.querySelectorAll('[data-hit]').forEach(b=>{b.addEventListener('pointerdown',e=>{e.preventDefault();if(autoInputLocked())return;b.setPointerCapture(e.pointerId);b.classList.add('active');hit(Number(b.dataset.hit))});for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,()=>b.classList.remove('active'))});window.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;const key=e.key.toLowerCase();if(e.repeat)return;if(['d','f','j','k'].includes(key)){e.preventDefault();hit(key==='d'||key==='k'?2:1)}else if(key==='escape'||key===' '){e.preventDefault();togglePause()}});document.addEventListener('visibilitychange',()=>{if(document.hidden&&state==='playing')togglePause()});window.addEventListener('resize',resize);$('speed').onchange=draw;initPractice();initDan();charts=parseTJA(demo).charts;fillCourses();choose();new ResizeObserver(resize).observe(canvas);

async function decodeDanText(file){const bytes=await file.arrayBuffer();try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{return new TextDecoder('shift-jis').decode(bytes)}}

function soulNoteCount(){return Math.max(1,danRun?danRun.config.songs.reduce((sum,e)=>sum+e.chart.notes.filter(n=>n.type<=4).length,0):chart.notes.filter(n=>n.type<=4).length)}

function applyVolumes(){const music=Number($('musicVolume').value||0),effects=Number($('effectVolume').value||0);if(musicGain)musicGain.gain.value=music/100;if(effectGain)effectGain.gain.value=effects/100;$('musicVolumeValue').textContent=music+'%';$('effectVolumeValue').textContent=effects+'%';}
$('musicVolume').oninput=applyVolumes;$('effectVolume').oninput=applyVolumes;
$('volumeOpen').onclick=()=>$('volumeDialog').showModal();$('volumeClose').onclick=()=>$('volumeDialog').close();applyVolumes();


function attachVideos(list,files){for(const c of list){const name=c.meta.VIDEO;if(typeof name!=='string'||!name)continue;const dir=(c.sourcePath||'').split('/').slice(0,-1).join('/');let matches=files.filter(f=>normalizedPath(filePath(f))===normalizedPath(dir+'/'+name));if(!matches.length)matches=files.filter(f=>normalizedPath(f.name)===normalizedPath(name.split('/').pop()));if(matches.length===1)c.videoFile=matches[0];}}
function stopMV(){const v=$('mv');if(v&&typeof v.pause==='function')v.pause();mvPlaying=false;}
function syncMV(){const v=$('mv');if(!v||typeof v.play!=='function')return;const file=chart?.videoFile||null;
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
function applyChartFade(t){const fade=state==='playing'?chartFadeAt(chart.fades,t):{info:1,lane:1,note:1,button:1};document.querySelectorAll('.scorebar,#danHud,.game-footer,.song-progress').forEach(n=>n.style.opacity=fade.info);document.querySelectorAll('.pads').forEach(n=>n.style.opacity=fade.button);const lane=canvas.parentElement;if(lane){lane.style.backgroundColor=chart.videoFile?'rgba(16,19,23,'+(.267*fade.lane)+')':'rgba(16,19,23,'+fade.lane+')';lane.style.borderColor='rgba(68,68,68,'+fade.lane+')'}return fade;}

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
function updateAutoPads(){const now=audioContext?.currentTime||0;document.querySelectorAll('[data-hit]').forEach((b,i)=>{const locked=autoInputLocked();b.disabled=locked;if(locked)b.classList.remove('active');if(state==='playing'&&auto&&autoPadUntil[i]>now)b.classList.add('auto-active');else b.classList.remove('auto-active')});}

function setPauseIcon(paused){const b=$('pause');b.textContent=paused?'▶':'Ⅱ';b.setAttribute('aria-label',paused?'再開':'一時停止');b.title=paused?'再開':'一時停止';}
async function enterPlayFullscreen(){try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();if(screen.orientation?.lock)await screen.orientation.lock('landscape')}catch{}}
function leavePlayFullscreen(){try{screen.orientation?.unlock?.()}catch{}if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});}

async function requestLandscape(){try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();if(screen.orientation?.lock)await screen.orientation.lock('landscape');else throw Error('unsupported');}catch{$('status').textContent='横向き固定に対応していない場合は、端末の自動回転を有効にして横にしてください。';}}
$('landscapeOpen').onclick=requestLandscape;
$('landscapePlay').onclick=requestLandscape;

var branchChoices=[],branchScoreLog=[],branchRollLog=[];
function judge(n,error){n.branchQuality=error<=judgmentWindows().good?1:error<=judgmentWindows().ok?.5:0;const before=score;judgeCore(n,error);branchScoreLog.push({time:n.time,score:score-before});}
function addRollHits(r,count=1){const before=r.hits||0;addRollHitsCore(r,count);const hits=(r.hits||0)-before;if(hits>0)branchRollLog.push({time:time(),hits});}
function branchDetails(e){
 const from=Math.max(-Infinity,...(chart.sections||[]).filter(t=>t<=e.time));
 const judged=notes.filter(n=>n.type<=4&&n.time>=from&&n.time<e.time);
 let value=0;
 if(e.kind==='p'){const done=judged.filter(n=>n.done);value=done.length?done.reduce((sum,n)=>sum+(n.branchQuality||0),0)/done.length*100:0;}
 else if(e.kind==='r')value=branchRollLog.filter(x=>x.time>=from&&x.time<e.time).reduce((s,x)=>s+x.hits,0);
 else value=branchScoreLog.filter(x=>x.time>=from&&x.time<e.time).reduce((s,x)=>s+x.score,0);
 let route=value<e.low?'N':value<e.high?'E':'M';
 const locked=(chart.holds||[]).some(t=>t>=from&&t<=e.time);
 if(locked)route=branchChoices[branchChoices.length-1]||'N';
 return {value,route,locked};
}
function updateBranchRoute(){
 if(danRun||!chart.branchEvents?.length)return;
 const now=time()-Number($('offset').value||0)/1000;
 while(branchChoices.length<chart.branchEvents.length){
 const e=chart.branchEvents[branchChoices.length];if(now<e.time)break;
 for(const n of notes){if(n.type<=4&&!n.done&&!n.ghost&&n.time<e.time){if(auto)judge(n,0);else if(now>n.time+judgmentWindows().miss)judge(n,1)}}
 const detail=branchDetails(e);branchChoices.push(detail.route);
 const old=notes;chart=rebuildTjaBranches(chart,branchChoices);
 const prior=new Map(old.filter(n=>n.time<e.time).map(n=>[n.time+':'+n.type,n]));
 notes=chart.notes.map(n=>prior.get(n.time+':'+n.type)||({...n,done:false,hits:0,ghost:false}));
 }
}
function drawBranchDetails(t,opacity){
 if(danRun||!chart.branchEvents?.length)return;
 const e=chart.branchEvents[Math.min(branchChoices.length,chart.branchEvents.length-1)],d=branchDetails(e);
 const names={N:'普通',E:'玄人',M:'達人'},unit=e.kind==='p'?'%':e.kind==='r'?'打':'点';
 ctx.save();ctx.globalAlpha=opacity;ctx.textAlign='right';ctx.textBaseline='bottom';ctx.fillStyle='#fff';ctx.font='700 12px sans-serif';
 ctx.fillText((e.kind==='p'?'精度':e.kind==='r'?'連打':'スコア')+' '+d.value.toFixed(e.kind==='p'?1:0)+unit+' / 玄人 '+e.low+'・達人 '+e.high+' → '+names[d.route]+(d.locked?'（固定）':''),width-12,height-6);ctx.restore();
}
