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

let medleyEditorState=null,medleyPreviewNodes=[],medleyPreviewFrame=0,medleyPreviewPlaying=false,medleyPreviewEpoch=0,medleyPreviewToken=0;
function stopMedleyPreview(){
 medleyPreviewToken++;medleyPreviewPlaying=false;cancelAnimationFrame(medleyPreviewFrame);
 for(const node of medleyPreviewNodes){try{node.stop()}catch{}node.disconnect()}medleyPreviewNodes=[];
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
 drawMedleyPreview();
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
function drawMedleyPreview(cursor=null){
 const ed=medleyEditorState;if(!ed?.built)return;
 const c=document.getElementById('medleyPreview'),g=c.getContext('2d'),w=c.width,h=c.height,{join,start,end}=medleyPreviewWindow(),x=t=>(t-start)/(end-start)*w;
 g.clearRect(0,0,w,h);g.fillStyle='#101317';g.fillRect(0,0,w,h);
 for(const segment of ed.built.segments.slice(ed.index,ed.index+2)){
  const left=Math.max(start,segment.start),right=Math.min(end,segment.end);g.fillStyle=segment.index===ed.index?'#55bbd220':'#ff996620';g.fillRect(x(left),0,x(right)-x(left),h);
  const data=segment.buffer?.getChannelData(0),sampleRate=segment.buffer?.sampleRate;
  if(data){g.strokeStyle=segment.index===ed.index?'#55bbd2':'#ff9966';g.beginPath();for(let px=Math.max(0,Math.floor(x(left)));px<Math.min(w,Math.ceil(x(right)));px+=2){const local=start+px/w*(end-start)-segment.shift,a=Math.floor(local*sampleRate),b=Math.floor((local+2/w*(end-start))*sampleRate);let peak=0;for(let j=Math.max(0,a);j<Math.min(data.length,b);j+=Math.max(1,Math.floor((b-a)/24)))peak=Math.max(peak,Math.abs(data[j]));g.moveTo(px,65-peak*43);g.lineTo(px,65+peak*43)}g.stroke()}
 }
 g.strokeStyle='#ffffff44';g.beginPath();g.moveTo(0,158);g.lineTo(w,158);g.stroke();
 for(const n of ed.built.chart.notes){if(n.time<start||n.time>end)continue;g.fillStyle=n.type===1||n.type===3?'#f66b51':n.type===2||n.type===4?'#55bbd2':'#f8c259';if(n.end){g.fillRect(x(n.time),153,Math.max(2,x(Math.min(n.end,end))-x(n.time)),10)}g.beginPath();g.arc(x(n.time),158,n.type===3||n.type===4?10:7,0,Math.PI*2);g.fill()}
 g.strokeStyle='#ffd565';g.lineWidth=2;g.beginPath();g.moveTo(x(join),0);g.lineTo(x(join),h);g.stroke();
 g.fillStyle='#eee';g.font='16px sans-serif';g.textAlign='center';g.fillText('切り替え',x(join),h-12);
 if(cursor!==null){g.strokeStyle='#fff';g.beginPath();g.moveTo(x(cursor),0);g.lineTo(x(cursor),h);g.stroke()}
 const a=ed.built.segments[ed.index],b=ed.built.segments[ed.index+1];
 const measure=(c,t)=>{const list=c.measures||[];let i=list.findIndex(m=>t>=m.time&&t<m.end);if(i<0)i=list.length-1;return i>=0?(i+1)+'小節付近':'小節情報なし'};
 document.getElementById('medleyMeasureHint').textContent='終了：'+a.to.toFixed(3)+'秒（'+measure(a.original,a.to)+'） → 開始：'+b.from.toFixed(3)+'秒（'+measure(b.original,b.from)+'）';
}
async function playMedleyPreview(){
 stopMedleyPreview();if(!applyMedleyBoundary())return;const ed=medleyEditorState,token=medleyPreviewToken;
 document.getElementById('medleyPreviewPlay').disabled=true;medleyEditorMessage('前後の音源を読み込んでいます…');
 try{
  await audio().resume();await Promise.all(ed.entries.slice(ed.index,ed.index+2).map(e=>prepareDanAudio(e.chart)));
  if(token!==medleyPreviewToken||ed!==medleyEditorState||!document.getElementById('medleyEditor').open)return;
  ed.built=buildMedley(ed.entries,ed.draft.songs);const {start,end}=medleyPreviewWindow();
  medleyPreviewEpoch=audio().currentTime+.05;medleyPreviewPlaying=true;
  for(const s of ed.built.segments.slice(ed.index,ed.index+2)){
   if(!s.buffer)continue;const begin=Math.max(start,s.start,s.shift),finish=Math.min(end,s.end,s.shift+s.buffer.duration);if(finish<=begin)continue;
   const node=audio().createBufferSource();node.buffer=s.buffer;node.connect(musicGain);node.start(medleyPreviewEpoch+begin-start,begin-s.shift,finish-begin);medleyPreviewNodes.push(node);
  }
  medleyEditorMessage('試聴中 · 数値を変更すると新しい位置で再生し直します。');
  const frame=()=>{if(!medleyPreviewPlaying)return;const t=start+audio().currentTime-medleyPreviewEpoch;drawMedleyPreview(Math.max(start,t));if(t>=end){const repeat=document.getElementById('medleyPreviewLoop').checked;stopMedleyPreview();if(repeat)playMedleyPreview();else medleyEditorMessage('試聴終了');return}medleyPreviewFrame=requestAnimationFrame(frame)};frame();
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
 document.getElementById('medleyEditorClose').onclick=()=>dialog.close();dialog.addEventListener('close',stopMedleyPreview);dialog.addEventListener('cancel',stopMedleyPreview);
 document.getElementById('medleyEditorLoad').onclick=()=>{dialog.close();openDan()};
 document.getElementById('medleyJoin').onchange=()=>{try{loadMedleyJoin()}catch(e){medleyEditorMessage(e.message)}};
 const change=()=>{const playing=medleyPreviewPlaying;stopMedleyPreview();if(applyMedleyBoundary()&&playing)playMedleyPreview()};
 for(const id of ['medleyEnd','medleyFrom'])document.getElementById(id).onchange=change;
 document.querySelectorAll('[data-seam-nudge]').forEach(button=>button.onclick=()=>{const [side,amount]=button.dataset.seamNudge.split(':'),input=document.getElementById(side==='end'?'medleyEnd':'medleyFrom');input.value=String(Number(input.value)+Number(amount));change()});
 document.getElementById('medleyPreviewPlay').onclick=playMedleyPreview;
 document.getElementById('medleyPreviewStop').onclick=()=>{stopMedleyPreview();drawMedleyPreview();medleyEditorMessage('停止しました。')};
 document.getElementById('medleyApply').onclick=commitMedleyEdits;
 document.getElementById('medleyDiscard').onclick=openMedleyEditor;
 document.getElementById('medleyExport').onclick=()=>{if(!commitMedleyEdits())return;const text=serializeDanConfig(medleyEditorState.draft),url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=(pendingDan.path.split('/').pop().replace(/\.[^.]+$/,'')||'medley')+'_調整済み.dan';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stopMedleyPreview()});
}
if(typeof document!=='undefined')initMedleyTools();
