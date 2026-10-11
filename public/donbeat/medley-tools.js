'use strict';

// Start options are kept separate from the source course and its exam rules.
let danStartOwner=null;
function refreshDanStartOptions(){
 const select=document.getElementById('danStartSong');if(!select)return;
 const changed=danStartOwner!==pendingDan,old=changed?'0':select.value;danStartOwner=pendingDan;
 select.replaceChildren();
 if(pendingDan)pendingDan.config.songs.forEach((song,i)=>{const option=danNode('option',(i+1)+'. '+danPendingTitle(song,i));option.value=String(i);select.append(option)});
 select.value=old;if(select.selectedIndex<0&&select.options.length)select.selectedIndex=0;
 select.disabled=!pendingDan;
 const practice=document.getElementById('danStartMode').value==='practice';
 document.getElementById('danStartSongLabel').hidden=!practice;document.getElementById('danStartHint').hidden=!practice;
}
function danStartConfig(config){
 const practice=document.getElementById('danStartMode')?.value==='practice';
 const startIndex=practice?Number(document.getElementById('danStartSong')?.value||0):0;
 if(!Number.isInteger(startIndex)||startIndex<0||startIndex>=config.songs.length)throw Error('開始する曲を選択してください。');
 const specs=pendingDan.config.songs.map(s=>({...s,range:s.range?.slice(),measures:s.measures?.slice()}));
 return {...config,practice,startIndex,originalCount:config.songs.length,songs:config.songs.slice(startIndex),specs:specs.slice(startIndex),
  previousSong:startIndex?config.songs[startIndex-1]:null,previousSpec:startIndex?specs[startIndex-1]:null,
  conditions:practice?[]:config.conditions};
}
async function prepareDanAudio(c){
 if(c.builtinDemo||c.generated)return null;
 if(c.preloadedAudio)return c.preloadedAudio;
 if(c.serverAudio&&!c.audioFile)c.audioFile=await serverFile(c.serverAudio,c.meta.WAVE||'music');
 const file=chartAudioSource(c);if(!file)throw Error('音源がありません：'+(c.meta.TITLE||'無題'));
 c.preloadedAudio=await audio().decodeAudioData(await file.arrayBuffer());return c.preloadedAudio;
}
function danLeadInPlan(config,c){
 const previous=config.previousSong.chart;
 const to=config.mode==='MEDLEY'?medleyRange(previous,config.previousSpec,false).to:Math.max(previous.duration||0,previous.preloadedAudio?.duration||0,...previous.notes.map(n=>(n.end??n.time)+.001));
 return {buffer:previous.preloadedAudio||null,from:to-3,to,endTime:config.mode==='MEDLEY'?0:Math.min(0,c.notes[0]?.time||0)};
}
function danLeadInActive(t){return !!danRun?.leadIn&&danRun.index===0&&t<danRun.leadIn.endTime}
function scheduleDanLeadIn(t){
 const lead=danRun?.leadIn;if(!lead||danRun.index!==0||!lead.buffer||t>=lead.endTime)return;
 const begin=Math.max(t,lead.endTime-3,lead.endTime-lead.to),offset=lead.to+begin-lead.endTime;
 const duration=Math.min(lead.endTime-begin,lead.buffer.duration-offset);if(duration<=0)return;
 const node=audio().createBufferSource();node.buffer=lead.buffer;node.playbackRate.value=activeSongRate;node.connect(musicGain);
 node.start(startAt+begin/activeSongRate,offset,duration);medleySources.push(node);
}
function serializeDanConfig(config){
 const lines=['TITLE:'+config.name,'MODE:'+config.mode];
 config.songs.forEach((song,i)=>{const n=i+1;lines.push('SONG'+n+':"'+song.chart.replace(/"/g,'""')+'"'+(song.course===undefined?'':','+song.course));if(song.range)lines.push('RANGE'+n+':'+song.range.join(','));if(song.measures)lines.push('MEASURES'+n+':'+song.measures.join(','))});
 lines.push('EXAM1:'+config.gauge+','+config.goldGauge);
 const types={good:'best',ok:'good',miss:'miss',score:'score',rolls:'roll',maxCombo:'combo',allcombo:'allcombo'};
 config.conditions.forEach((c,i)=>{const key='EXAM'+(i+2),value=j=>(c.ops?.[j]||'m')+','+c.red[j]+','+c.gold[j];if(c.scope==='total')lines.push(key+':1,'+types[c.type]+','+value(0));else{lines.push(key+':2,'+types[c.type]);config.songs.forEach((_,j)=>lines.push(key+'-'+(j+1)+':'+value(j)))}});
 if(config.hide?.length)lines.push('HIDE:'+config.hide.join(','));return lines.join('\n')+'\n';
}

let medleyEditorState=null,medleyPreviewNodes=[],medleyPreviewFrame=0,medleyPreviewPlaying=false,medleyPreviewEpoch=0,medleyPreviewToken=0,medleyPreviewGain=null,medleyPreviewCursor=null,medleyPerformanceMount=null;
function stopMedleyPreview(){
 medleyPreviewToken++;medleyPreviewPlaying=false;cancelAnimationFrame(medleyPreviewFrame);
 for(const node of medleyPreviewNodes){try{node.stop()}catch{}node.disconnect()}medleyPreviewNodes=[];
 if(medleyPreviewGain){medleyPreviewGain.disconnect();medleyPreviewGain=null;}
 document.getElementById('medleyPreviewPlay').disabled=false;
}
function medleyEditorMessage(message){document.getElementById('medleyEditorStatus').textContent=message}
function openMedleyEditor(){
 if(loading||importing||danRun||state==='playing'||state==='paused')return;
 stopMedleyPreview();rememberDanCharts();const dialog=document.getElementById('medleyEditor');
 document.getElementById('medleyEditorBody').hidden=true;medleyEditorState=null;
 try{
  if(!pendingDan||pendingDan.config.mode!=='MEDLEY')throw Error('まず「段位・課題曲を読み込む」からメドレー設定と課題曲を読み込んでください。');
  if(pendingDan.config.songs.length<2)throw Error('つなぎ目の調整には2曲以上のメドレーが必要です。');
  const entries=resolveDanConfig(true).songs,draft=JSON.parse(JSON.stringify(pendingDan.config));
  buildMedley(entries,draft.songs);
  medleyEditorState={owner:pendingDan,entries,draft,index:0,built:null};
  const select=document.getElementById('medleyJoin');select.replaceChildren();
  entries.slice(0,-1).forEach((e,i)=>{const option=danNode('option',(i+1)+'. '+danPendingTitle(draft.songs[i],i)+' → '+(i+2)+'. '+danPendingTitle(draft.songs[i+1],i+1));option.value=String(i);select.append(option)});
  document.getElementById('medleyEditorBody').hidden=false;loadMedleyJoin();medleyEditorMessage('試聴するつなぎ目を選んでください。');
 }catch(e){medleyEditorMessage(e.message)}
 if(!dialog.open)dialog.showModal();
 if(medleyEditorState?.built){mountMedleyPerformance();resize();}
}
// MEASURES end is exclusive: [9,17] plays measures 9 through 16.
function medleyMeasureSelection(c,spec,finalSong=false){
 const list=c.measures||[];if(!list.length)throw Error('小節情報のない譜面は小節単位で調整できません。');
 if(spec.measures)return spec.measures.slice();
 const range=medleyRange(c,spec,finalSong),boundaries=[...list.map(m=>m.time),list[list.length-1].end];
 const nearest=(time,max)=>{let best=0;for(let i=1;i<max;i++)if(Math.abs(boundaries[i]-time)<Math.abs(boundaries[best]-time))best=i;return best+1};
 const from=nearest(range.from,list.length),to=nearest(range.to,boundaries.length);
 return [from,Math.max(from+1,to)];
}
function loadMedleyJoin(){
 stopMedleyPreview();const ed=medleyEditorState;if(!ed)return;
 ed.index=Number(document.getElementById('medleyJoin').value);ed.built=buildMedley(ed.entries,ed.draft.songs);
 const previous=medleyMeasureSelection(ed.entries[ed.index].chart,ed.draft.songs[ed.index]),next=medleyMeasureSelection(ed.entries[ed.index+1].chart,ed.draft.songs[ed.index+1],ed.index+1===ed.entries.length-1);
 const endInput=document.getElementById('medleyEnd'),fromInput=document.getElementById('medleyFrom');
 endInput.value=previous[1];endInput.min=previous[0]+1;endInput.max=ed.entries[ed.index].chart.measures.length+1;
 fromInput.value=next[0];fromInput.min=1;fromInput.max=Math.min(ed.entries[ed.index+1].chart.measures.length,next[1]-1);
 medleyPreviewCursor=null;updateMedleyPadLabels();drawMedleyPreview();
}
function applyMedleyBoundary(){
 const ed=medleyEditorState;if(!ed)return false;
 try{
  const endText=document.getElementById('medleyEnd').value,fromText=document.getElementById('medleyFrom').value,end=Number(endText),from=Number(fromText);
  if(!endText||!fromText||!Number.isSafeInteger(end)||!Number.isSafeInteger(from))throw Error('小節番号を整数で入力してください。');
  const candidate=JSON.parse(JSON.stringify(ed.draft)),i=ed.index,previous=medleyMeasureSelection(ed.entries[i].chart,candidate.songs[i]),next=medleyMeasureSelection(ed.entries[i+1].chart,candidate.songs[i+1],i+1===ed.entries.length-1);
  if(end<=previous[0]||end>ed.entries[i].chart.measures.length+1||from<1||from>=next[1]||from>ed.entries[i+1].chart.measures.length)throw Error('開始より後の終了小節と、譜面内の開始小節を指定してください。');
  if(end!==previous[1]){candidate.songs[i].measures=[previous[0],end];delete candidate.songs[i].range;}
  if(from!==next[0]){candidate.songs[i+1].measures=[from,next[1]];delete candidate.songs[i+1].range;}
  const built=buildMedley(ed.entries,candidate.songs);ed.draft=candidate;ed.built=built;drawMedleyPreview();medleyEditorMessage('未適用の調整です。「調整を段位に適用」で反映します。');return true;
 }catch(e){medleyEditorMessage(e.message);return false}
}
function medleyPreviewWindow(){
 const ed=medleyEditorState,segments=ed.built.segments,join=segments[ed.index].end;
 return {join,start:Math.max(segments[ed.index].start,join-3),end:Math.min(segments[ed.index+1].end,join+3)};
}
function medleyPerformanceActive(){return !!medleyPerformanceMount&&!!medleyEditorState?.built&&document.getElementById('medleyEditor').open}
function mountMedleyPerformance(){
 if(medleyPerformanceMount)return;
 const host=document.getElementById('medleyPerformance'),lane=document.getElementById('canvas').parentElement,pads=document.querySelector('.pads');
 medleyPerformanceMount=[lane,pads].map(node=>{const marker=document.createComment('medley-performance-home');node.before(marker);host.append(node);return {node,marker}});
 updateMedleyPadLabels();
}
function unmountMedleyPerformance(){
 stopMedleyPreview();if(!medleyPerformanceMount)return;
 for(const {node,marker} of medleyPerformanceMount){marker.replaceWith(node);node.querySelectorAll('[data-medley-label]').forEach(label=>label.remove());}
 medleyPerformanceMount=null;medleyPreviewCursor=null;resize();
}
function updateMedleyPadLabels(){
 if(!medleyPerformanceMount)return;
 const labels=['前の曲へ','−1小節','＋1小節','次の曲へ'];
 document.querySelectorAll('.pads [data-hit]').forEach((button,i)=>{button.disabled=false;let label=button.querySelector('[data-medley-label]');if(!label){label=document.createElement('span');label.dataset.medleyLabel='';button.append(label)}label.textContent=labels[i]});
}
function drawMedleyPreview(cursor=null){
 const ed=medleyEditorState;if(!ed?.built)return;
 const {join,start}=medleyPreviewWindow(),t=cursor??start,s=ed.built.segments.find(s=>t<s.end)||ed.built.segments[ed.built.segments.length-1];
 const side=document.getElementById('medleyAdjustSide')?.value||'end',target=ed.index+(side==='from'?1:0);
 document.getElementById('medleyMeasureHint').textContent='調整対象：'+(target+1)+'曲目 '+(side==='end'?'終了小節 '+document.getElementById('medleyEnd').value+' の直前まで':'開始小節 '+document.getElementById('medleyFrom').value+' から')+' ／ 再生：'+(t<join?'前の曲':'次の曲');
 if(!medleyPerformanceActive())return;
 // Render with the same chart distance, note shapes and judgment line as play.
 // Restore the engine state immediately; preview never judges or changes scores.
 const old={chart,notes,danRun,state,pausedTime,auto,feedback,pauseResumeUntil};
 try{
  chart={...ed.built.chart,meta:{...s.original.meta},videoFile:null,spinnerFile:null,_fadeEnabled:false};notes=chart.notes;
  danRun={index:s.index,config:{songs:ed.entries,conditions:[]},medley:ed.built};state='ready';pausedTime=t;auto=false;feedback='';pauseResumeUntil=-Infinity;
  drawGame(true);
  const targetX=width<600?76:125,joinNote={time:join,bpm:ed.built.segments[ed.index+1].original.bpm||120,scroll:1,medleyIndex:ed.index+1};
  const x=targetX+medleyDistance(joinNote,t)*Number(document.getElementById('speed').value)*240;
  ctx.globalAlpha=1;ctx.strokeStyle='#ffd565';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,height);ctx.stroke();
  ctx.fillStyle='#ffd565';ctx.font='bold 14px sans-serif';ctx.textAlign='left';ctx.fillText('曲の切り替え',Math.max(6,Math.min(width-110,x+6)),20);
 }finally{({chart,notes,danRun,state,pausedTime,auto,feedback,pauseResumeUntil}=old);}
}
function nudgeMedleyMeasure(amount){
 const side=document.getElementById('medleyAdjustSide').value,input=document.getElementById(side==='from'?'medleyFrom':'medleyEnd'),old=input.value,playing=medleyPreviewPlaying;
 stopMedleyPreview();input.value=String(Number(old)+amount);
 if(!applyMedleyBoundary()){input.value=old;if(playing)playMedleyPreview();return false}
 if(playing)playMedleyPreview();return true;
}
function switchMedleyAdjustment(amount){
 const ed=medleyEditorState;if(!ed)return;
 const side=document.getElementById('medleyAdjustSide'),position=ed.index*2+(side.value==='from'?1:0),next=Math.max(0,Math.min((ed.entries.length-1)*2-1,position+amount));
 if(next===position)return;
 const playing=medleyPreviewPlaying;document.getElementById('medleyJoin').value=String(Math.floor(next/2));side.value=next%2?'from':'end';
 try{loadMedleyJoin();if(playing)playMedleyPreview()}catch(e){medleyEditorMessage(e.message)}
}
function handleMedleyPad(index){
 if(!medleyPerformanceActive())return false;
 if(index===0)switchMedleyAdjustment(-1);else if(index===3)switchMedleyAdjustment(1);else nudgeMedleyMeasure(index===1?-1:1);return true;
}
function createMedleyPreviewGain(ac){
 const gain=ac.createGain(),volume=Number(document.getElementById('musicVolume').value);
 gain.gain.cancelScheduledValues(ac.currentTime);gain.gain.setValueAtTime(Number.isFinite(volume)?Math.max(0,Math.min(1,volume/100)):.7,ac.currentTime);
 gain.connect(ac.destination);return gain;
}
async function playMedleyPreview(){
 stopMedleyPreview();if(!applyMedleyBoundary())return;const ed=medleyEditorState,token=medleyPreviewToken;
 document.getElementById('medleyPreviewPlay').disabled=true;medleyEditorMessage('前後の音源を読み込んでいます…');
 try{
  await audio().resume();await Promise.all(ed.entries.slice(ed.index,ed.index+2).map(e=>prepareDanAudio(e.chart)));
  if(token!==medleyPreviewToken||ed!==medleyEditorState||!document.getElementById('medleyEditor').open)return;
  ed.built=buildMedley(ed.entries,ed.draft.songs);const {start,end}=medleyPreviewWindow();
  medleyPreviewGain=createMedleyPreviewGain(audio());
  medleyPreviewEpoch=audio().currentTime+.05;medleyPreviewPlaying=true;
  for(const s of ed.built.segments.slice(ed.index,ed.index+2)){
   if(!s.buffer)continue;const begin=Math.max(start,s.start,s.shift),finish=Math.min(end,s.end,s.shift+s.buffer.duration);if(finish<=begin)continue;
   const node=audio().createBufferSource();node.buffer=s.buffer;node.connect(medleyPreviewGain);node.start(medleyPreviewEpoch+begin-start,begin-s.shift,finish-begin);medleyPreviewNodes.push(node);
  }
  medleyEditorMessage('試聴中 · 数値を変更すると新しい位置で再生し直します。');
  const frame=()=>{if(!medleyPreviewPlaying)return;const t=start+audio().currentTime-medleyPreviewEpoch;medleyPreviewCursor=Math.max(start,t);drawMedleyPreview(medleyPreviewCursor);if(t>=end){const repeat=document.getElementById('medleyPreviewLoop').checked;stopMedleyPreview();if(repeat)playMedleyPreview();else medleyEditorMessage('試聴終了');return}medleyPreviewFrame=requestAnimationFrame(frame)};frame();
 }catch(e){if(token===medleyPreviewToken){stopMedleyPreview();medleyEditorMessage('試聴できません：'+e.message)}}
}
function commitMedleyEdits(){
 if(!applyMedleyBoundary())return false;const ed=medleyEditorState;
 if(pendingDan!==ed.owner){medleyEditorMessage('段位が変更されました。調整画面を開き直してください。');return false}
 pendingDan.config=JSON.parse(JSON.stringify(ed.draft));refreshDanSongs();medleyEditorMessage('現在の段位に適用しました。次回用には.danを保存してください。');return true;
}
function initMedleyTools(){
 document.getElementById('danStartMode').onchange=refreshDanStartOptions;
 document.getElementById('medleyEditorOpen').onclick=openMedleyEditor;
 const dialog=document.getElementById('medleyEditor');
 document.getElementById('medleyEditorClose').onclick=()=>{unmountMedleyPerformance();dialog.close()};dialog.addEventListener('close',unmountMedleyPerformance);dialog.addEventListener('cancel',stopMedleyPreview);
 document.getElementById('medleyEditorLoad').onclick=()=>{unmountMedleyPerformance();dialog.close();openDan()};
 document.getElementById('medleyJoin').onchange=()=>{try{loadMedleyJoin()}catch(e){medleyEditorMessage(e.message)}};
 const change=()=>{const playing=medleyPreviewPlaying;stopMedleyPreview();if(applyMedleyBoundary()&&playing)playMedleyPreview()};
 for(const id of ['medleyEnd','medleyFrom'])document.getElementById(id).onchange=change;
 document.querySelectorAll('[data-seam-nudge]').forEach(button=>button.onclick=()=>{const [side,amount]=button.dataset.seamNudge.split(':'),input=document.getElementById(side==='end'?'medleyEnd':'medleyFrom');input.value=String(Number(input.value)+Number(amount));change()});
 document.getElementById('medleyAdjustSide').onchange=()=>drawMedleyPreview(medleyPreviewCursor);
 document.getElementById('medleyPerformance').addEventListener('pointerdown',event=>{const button=event.target.closest('[data-hit]');if(!button||!medleyPerformanceActive())return;event.preventDefault();event.stopImmediatePropagation();handleMedleyPad([...document.querySelectorAll('.pads [data-hit]')].indexOf(button));},true);
 window.addEventListener('keydown',event=>{if(!medleyPerformanceActive()||['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName))return;const index=['d','f','j','k'].indexOf(event.key.toLowerCase());if(index<0)return;event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)handleMedleyPad(index);});
 document.getElementById('medleyPreviewPlay').onclick=playMedleyPreview;
 document.getElementById('medleyPreviewStop').onclick=()=>{stopMedleyPreview();drawMedleyPreview();medleyEditorMessage('停止しました。')};
 document.getElementById('medleyApply').onclick=commitMedleyEdits;
 document.getElementById('medleyDiscard').onclick=openMedleyEditor;
 document.getElementById('medleyExport').onclick=()=>{if(!commitMedleyEdits())return;const text=serializeDanConfig(medleyEditorState.draft),url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=(pendingDan.path.split('/').pop().replace(/\.[^.]+$/,'')||'medley')+'_調整済み.dan';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stopMedleyPreview()});
}
if(typeof document!=='undefined')initMedleyTools();
