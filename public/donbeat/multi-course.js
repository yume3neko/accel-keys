'use strict';
let multiRun=null;
function multiCourseLabel(c){return (names[c.meta.COURSE]||c.meta.COURSE||'おに')+' ★'+(c.meta.LEVEL||'?')}
function clearMultiCourse(){multiRun=null;document.body.classList.remove('multi-course')}
function makeMultiLane(c){
 // Each difficulty owns its notes and counters. Branch charts use the normal route.
 const rendered=c._tja?rebuildTjaBranches(c,Array(c.branchEvents?.length||0).fill('N')):c;
 return {chart:rendered,notes:rendered.notes.map(n=>({...n,done:false,hits:0})),score:0,combo:0,good:0,rolls:0,feedbackAt:-Infinity};
}
function resetMultiLanes(){if(multiRun)multiRun.lanes=multiRun.charts.map(makeMultiLane)}
function advanceMultiLane(lane,t){
 let sound=0;const c=lane.chart;
 for(const n of lane.notes){
  if(n.done||n.time>t)continue;
  if(n.type>=1&&n.type<=4){n.done=true;lane.good++;lane.combo++;lane.score+=chartNoteScore(c);lane.feedbackAt=t;sound=n.type===1||n.type===3?1:2;}
  else if([5,6,7,9].includes(n.type)){
   const total=autoRollHits(n,t),count=Math.max(0,total-n.hits);
   if(count){n.hits+=count;lane.rolls+=count;lane.score+=count*100;sound=n.type===7||n.type===9?1:n.hits%2+1;}
   if((n.type===7||n.type===9)&&n.hits>=n.required)n.done=true;
   if(t>n.end)n.done=true;
  }else n.done=true;
 }
 return sound;
}
function loopMultiCourse(){
 const t=time();if(t>=pauseResumeUntil){const sounds=new Set();for(const lane of multiRun.lanes){const sound=advanceMultiLane(lane,t);if(sound)sounds.add(sound)}for(const sound of sounds)tone(sound)}
 syncMV();drawMultiCourse();
 if(t>Math.max(audioBuffer?.duration||0,...multiRun.lanes.map(l=>l.chart.duration))+1){finishMultiCourse();return}
 raf=requestAnimationFrame(loop);
}
function drawMultiCourse(){
 const t=time(),rows=multiRun.lanes.length,rowHeight=height/rows,info=Math.min(180,width*.22),target=info+Math.min(70,(width-info)*.12),speed=(Number($('speed').value)||1)*240;
 ctx.clearRect(0,0,width,height);
 multiRun.lanes.forEach((lane,i)=>{
  const c=lane.chart,top=i*rowHeight,y=top+rowHeight*.53,r=Math.min(24,rowHeight*.21),colors=['#ce5946','#77a948','#4788b5','#995ba8','#735db5'];
  ctx.save();ctx.beginPath();ctx.rect(0,top,width,rowHeight);ctx.clip();
  ctx.fillStyle=isGogoTime(c,t)?'#593327':(i%2?'#20242a':'#191d22');ctx.fillRect(0,top,width,rowHeight);
  ctx.fillStyle=colors[i%colors.length];ctx.fillRect(0,top,info,rowHeight);ctx.fillStyle='#fff';ctx.textAlign='left';ctx.textBaseline='middle';ctx.font='700 '+Math.max(11,Math.min(18,rowHeight*.15))+'px sans-serif';
  ctx.fillText(multiCourseLabel(c),10,top+rowHeight*.2,info-20);ctx.font='700 '+Math.max(13,Math.min(24,rowHeight*.2))+'px sans-serif';ctx.fillText(String(lane.score).padStart(7,'0'),10,top+rowHeight*.48,info-20);
  ctx.font=Math.max(10,Math.min(15,rowHeight*.13))+'px sans-serif';ctx.fillText('AUTO · '+lane.combo+' COMBO',10,top+rowHeight*.75,info-20);
  ctx.beginPath();ctx.rect(info,top,width-info,rowHeight);ctx.clip();ctx.strokeStyle='#c8bba9';ctx.lineWidth=2;ctx.beginPath();ctx.arc(target,y,r+5,0,Math.PI*2);ctx.stroke();
  const pos=n=>target+(c.visual?malodyDistance(c,n.time,n.scroll)-malodyDistance(c,t,n.scroll):(n.time-t)*(n.bpm/120)*n.scroll)*speed;
  ctx.strokeStyle='#ffffff24';ctx.lineWidth=1;for(const b of c.bars||[]){const x=pos(b);if(x>=info&&x<=width){ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,top+rowHeight);ctx.stroke()}}
  for(const n of [...lane.notes,...(c.dummyNotes||[])].reverse()){
   if(n.done||t>(n.end??n.time)+.2)continue;
   let x=pos(n),nr=[3,4,6].includes(n.type)?r*1.22:r;
   if([5,6,7,9].includes(n.type)){const end=pos({...n,time:n.end});if(Math.max(x,end)<info||Math.min(x,end)>width)continue;ctx.strokeStyle='#edbf4d';ctx.lineWidth=nr*1.5;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(Math.max(target,x),y);ctx.lineTo(Math.max(target,end),y);ctx.stroke();x=Math.max(target,x)}
   if(x<info-nr||x>width+nr)continue;ctx.globalAlpha=n.dummy?.35:1;ctx.fillStyle=n.type===10?'#b569eb':[5,6,7,9].includes(n.type)?'#efc447':[1,3].includes(n.type)?'#ef654f':'#56b7c6';ctx.strokeStyle='#f4eadd';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,nr,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#25292c';ctx.beginPath();ctx.arc(x-nr*.3,y-nr*.1,Math.max(1.5,nr*.12),0,Math.PI*2);ctx.arc(x+nr*.3,y-nr*.1,Math.max(1.5,nr*.12),0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
  }
  if(t-lane.feedbackAt<.3){ctx.fillStyle='#ffd565';ctx.textAlign='center';ctx.font='700 14px sans-serif';ctx.fillText('良',target,top+12)}
  ctx.restore();ctx.strokeStyle='#07090b';ctx.beginPath();ctx.moveTo(0,top+rowHeight);ctx.lineTo(width,top+rowHeight);ctx.stroke();
 });
 $('judgmentOverlay').textContent='';$('currentSongTitle').textContent=chart.meta.TITLE||'無題';$('status').textContent='複数難易度 · AUTO';
}
function finishMultiCourse(){
 pausedTime=time();state='result';stopAudio();cancelAnimationFrame(raf);unlock();$('pause').disabled=true;
 const overlay=$('overlay');overlay.style.display='flex';overlay.replaceChildren();const h=document.createElement('h2');h.textContent='複数難易度 再生結果';overlay.append(h);
 for(const lane of multiRun.lanes){const p=document.createElement('p');p.textContent=multiCourseLabel(lane.chart)+' ／ '+lane.score+'点 ／ '+lane.combo+'コンボ ／ 連打 '+lane.rolls;overlay.append(p)}
 const again=document.createElement('button');again.textContent='もう一度再生';again.onclick=()=>{state='ready';start({auto:true})};const back=document.createElement('button');back.textContent='選曲に戻る';back.onclick=()=>{unlock();reset()};overlay.append(again,back);
}
function openMultiCourse(entries){
 if(loading||importing||danRun)return;
 const dialog=$('multiCourseDialog'),list=$('multiCourseChoices');list.replaceChildren();$('multiCourseError').textContent='';
 for(const e of entries){const label=document.createElement('label'),box=document.createElement('input');box.type='checkbox';box.value=e.index;box.checked=true;label.append(box,document.createTextNode(multiCourseLabel(e.c)));list.append(label)}
 dialog.showModal();
}
async function launchMultiCourse(){
 const selected=[...$('multiCourseChoices').querySelectorAll('input:checked')].map(n=>Number(n.value));
 if(selected.length<2){$('multiCourseError').textContent='難易度を2つ以上選んでください。';return}
 if(loading||importing)return;loading=true;$('multiCoursePlay').disabled=true;
 try{
  const prepared=[];for(const index of selected){let c=charts[index];if(c.serverEntry)c=await prepareServerChart(c);prepared.push(c)}
  if(!prepared.every(c=>c.builtinDemo||playbackAssetsAvailable(c)))throw Error('音源が不足している難易度があります。');
  chart=prepared[0];$('course').value=charts.indexOf(chart);demoMode=!!chart.builtinDemo;audioBuffer=null;
  multiRun={charts:prepared,lanes:[]};resetMultiLanes();document.body.classList.add('multi-course');$('multiCourseDialog').close();loading=false;await start({auto:true});
 }catch(e){$('multiCourseError').textContent=e.message||String(e)}finally{loading=false;$('multiCoursePlay').disabled=false}
}
