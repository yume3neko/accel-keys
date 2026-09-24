/* ESE category 08 — a festival is a setlist, not a standalone song. */
const eseFestivalCache=new Map();
let eseFestival=null;
function eseFestivalName(name){
 return String(name||'ライブフェスティバル').replace(/^\d{1,3}\s*[-_．. ]+\s*/,'').trim();
}
function eseFestivalCourseNumber(course){
 const key=String(course??'').trim().toLowerCase();
 const map={easy:0,normal:1,hard:2,oni:3,edit:4,ura:4};
 return Object.hasOwn(map,key)?map[key]:/^[0-4]$/.test(key)?Number(key):-1;
}
function eseFestivalDuration(c){
 const last=Math.max(0,Number(c.duration)||0,...(c.notes||[]).map(n=>Number(n.end??n.time)||0));
 return Math.max(last,Number(c.preloadedAudio?.duration)||0);
}
function eseFestivalTime(seconds){
 const s=Math.ceil(seconds);
 return (s>=3600?Math.floor(s/3600)+':':'')+String(Math.floor(s%3600/60)).padStart(s>=3600?2:1,'0')+':'+String(s%60).padStart(2,'0');
}
function eseFestivalExtractParts(text,track){
 // Some festival TJAs contain #NEXTSONG instead of one TJA per song.
 const matches=[...text.matchAll(/^\s*#NEXTSONG\s+(.+)\s*$/gmi)];
 if(!matches.length)return [{text,title:track.title,audio:track.audio,video:track.video}];
 const header=text.split(/^\s*#START\b/im)[0].replace(/^\s*(?:TITLE|TITLEJA|SUBTITLE|SUBTITLEJA|WAVE)\s*:.*$/gmi,'').trim();
 const chunks=text.split(/^\s*#NEXTSONG\s+.+$/gmi);
 return chunks.map((part,i)=>{
  const meta=i?track.segments?.[i-1]||{}:track;
  if(!part.trim())return null;
  let t=part;
  if(i){
   const nextStart=/^\s*#START\b/im.test(part);
   t=header+'\nTITLE:'+String(meta.title||track.title||'無題')+'\nWAVE:'+String(meta.wave||'')+'\n'+(nextStart?'':'#START\n')+part;
  }
  if(!/^\s*#END\b/im.test(t))t+='\n#END';
  return {text:t,title:meta.title||track.title||'無題',audio:meta.audio||null,
   video:i?null:track.video};
 }).filter(Boolean);
}
async function eseFestivalParseTrack(track){
 const res=await fetch(eseApi('chart',track.path));
 if(!res.ok){let data={};try{data=await res.json()}catch{}throw Error(data.error||'譜面を取得できません：'+track.title)}
 const bytes=await res.arrayBuffer();let text;
 try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}
 catch{text=new TextDecoder('shift-jis').decode(bytes)}
 const pieces=eseFestivalExtractParts(text,track);
 return pieces.map((piece,index)=>{
  let parsed;
  try{parsed=parseTJA(piece.text)}
  catch(e){throw Error(track.title+'（'+(index+1)+'曲目）：'+e.message)}
  const options=parsed.charts.filter(c=>String(c.meta?.STYLE||'').toUpperCase()!=='DOUBLE');
  if(!options.length)throw Error(track.title+'に1人用の譜面がありません。');
  for(const c of options){
   c.meta.TITLE=String(c.meta.TITLEJA||'').trim()||piece.title||c.meta.TITLE||'無題';
   c.meta.SUBTITLE=String(c.meta.SUBTITLEJA||'').trim()||c.meta.SUBTITLE||'';
   c.category='official';c._esePath=track.path;c._eseTja=track.path;
   c._eseFolder=eseFestival.path;c._eseFestival=eseFestival.path;
   c.sourcePath=track.path+'#festival-'+index;
   if(piece.audio)c.serverAudio=eseApi('audio',piece.audio);
   if(piece.video){c.serverVideo=eseApi('video',piece.video);c.meta.VIDEO=piece.video.split('/').pop()}
   else{delete c.meta.VIDEO;if(c.features)c.features.mv=false}
   c.warnings=[...(parsed.warnings||[])];
  }
  return {title:piece.title||options[0].meta.TITLE,path:track.path,options,
   selected:null,audio:piece.audio||null};
 });
}
function eseFestivalChooseDefault(song,course){
 const expected=eseFestivalCourseNumber(course);
 return song.options.find(c=>eseFestivalCourseNumber(c.meta.COURSE)===expected)||
  song.options.find(c=>eseFestivalCourseNumber(c.meta.COURSE)===3)||
  song.options[song.options.length-1];
}
async function eseLoadFestival(path){
 if(eseState.loading||eseState.fetchingSong||loading||importing||danRun)return;
 eseState.activeSongPath=path;eseState.detailsOpen=true;
 eseState.activeCharts=[];eseState.audioError='';eseState.error='';
 eseState.busyPath=path;eseState.fetchingSong=true;
 eseFestival={path,name:eseFestivalName(path.split('/').pop()),songs:[],error:'',loading:true};
 eseState.activeInfo={title:eseFestival.name,path};renderSongSelection();
 try{
  if(eseFestivalCache.has(path)){
   eseFestival=eseFestivalCache.get(path);
  }else{
   const response=await fetch('/api/donbeat/ese-festival?path='+encodeURIComponent(path));
   const data=await response.json();
   if(!response.ok)throw Error(data.error||'コース情報を読み込めませんでした。');
   if(!Array.isArray(data.songs)||!data.songs.length)throw Error('収録曲を確認できませんでした。');
   eseFestival.name=data.name||eseFestival.name;
   const entries=data.songs,groups=[];
   // Bound simultaneous chart requests so large sets do not overwhelm the proxy.
   let cursor=0;
   const worker=async()=>{
    while(cursor<entries.length){
     const index=cursor++,entry=entries[index];
     const options=[entry,...(entry.alternates||[])];
     const variants=[];
     for(const candidate of options){
      const parts=await eseFestivalParseTrack(candidate);
      variants.push(parts);
     }
     if(variants[0].length>1){
      // #NEXTSONG produces distinct playable tracks from a single setlist TJA.
      for(let part=0;part<variants[0].length;part++){
       const song=variants[0][part];
       if(part===0)for(const alt of variants.slice(1))if(alt.length===1)song.options.push(...alt[0].options);
       song.selected=eseFestivalChooseDefault(song,part===0?entry.selectedCourse:undefined);
       groups[index+part/1000]=song;
      }
     }else{
      const song=variants[0][0];
      for(const alt of variants.slice(1))for(const a of alt)song.options.push(...a.options);
      song.selected=eseFestivalChooseDefault(song,entry.selectedCourse);
      groups[index]=song;
     }
    }
   };
   await Promise.all(Array.from({length:Math.min(3,entries.length)},worker));
   eseFestival.songs=Object.keys(groups).sort((a,b)=>Number(a)-Number(b)).map(k=>groups[k]);
   eseFestivalCache.set(path,eseFestival);
  }
  eseState.activeInfo={title:eseFestival.name,path};
 }catch(e){eseFestival.error=e?.message||String(e);eseState.error=eseFestival.error}
 finally{eseFestival.loading=false;eseState.busyPath='';eseState.fetchingSong=false;renderSongSelection()}
}
function eseFestivalReady(){
 return !!eseFestival?.songs.length&&eseFestival.songs.every(s=>s.selected&&playbackAssetsAvailable(s.selected));
}
function eseFestivalInfo(panel){
 const f=eseFestival;
 if(!f||f.path!==eseState.activeSongPath){
  panel.append(eseControl('p','ese-loading','コース情報を読み込み中…'));return;
 }
 panel.append(eseControl('p','ese-browser-note','条件なしの連続演奏です。各曲の難易度を選び、全曲終了まで通してプレイできます。'));
 if(f.loading)panel.append(eseControl('p','ese-loading','曲順・譜面を読み込み中…'));
 if(f.error){const err=eseControl('p','ese-error',f.error);err.setAttribute('role','alert');panel.append(err)}
 if(!f.songs.length)return;
 const total=f.songs.reduce((sum,s)=>sum+branchReferenceNoteCount(s.selected),0);
 const duration=f.songs.reduce((sum,s)=>sum+eseFestivalDuration(s.selected),0)+Math.max(0,f.songs.length-1)*3;
 panel.append(eseControl('p','ese-song-stats',f.songs.length+'曲 ／ 約'+eseFestivalTime(duration)+' ／ '+total.toLocaleString()+'ノーツ（選択中の難易度）'));
 const songs=eseControl('div','result-song-list ese-festival-songs');
 f.songs.forEach((song,i)=>{
  const card=eseControl('section','result-song');
  card.append(eseControl('h3','',String(i+1)+'. '+song.title));
  const label=eseControl('label','ese-difficulty-label','難易度');
  const select=eseControl('select','ese-difficulty');
  song.options.forEach((c,n)=>{
   const course=names[c.meta.COURSE]||c.meta.COURSE||'不明';
   const option=eseControl('option','',course+' ★'+(c.meta.LEVEL||'?'));
   option.value=String(n);select.append(option);
  });
  select.value=String(Math.max(0,song.options.indexOf(song.selected)));
  select.disabled=loading||importing||eseState.fetchingSong;
  select.onchange=()=>{song.selected=song.options[Number(select.value)];renderSongSelection()};
  label.append(select);card.append(label);
  const info=eseControl('p','ese-song-stats',
   (song.selected?.bpm||'—')+' BPM ／ '+branchReferenceNoteCount(song.selected)+' ノーツ');
  card.append(info);
  if(!playbackAssetsAvailable(song.selected)){
   const notice=eseControl('p','ese-error','音源が見つかりません。以下から、この曲の音源を指定してください。');
   card.append(notice);
   const picker=eseControl('label','ese-audio-picker','＋ '+song.title+' の音源を選択');
   const input=eseControl('input');input.type='file';input.accept='.ogg,.mp3,.wav,.m4a,.flac,.opus,.aac,audio/*';
   input.onchange=()=>{const file=input.files?.[0];if(!file)return;
    for(const c of song.options){c.audioFile=file;c.preloadedAudio=null;c.serverAudio=null}
    renderSongSelection();
   };
   picker.append(input);card.append(picker);
  }
  songs.append(card);
 });
 panel.append(songs);
 const ready=eseFestivalReady();
 panel.append(eseControl('p',ready?'muted':'ese-error',
  ready?'全曲の譜面を読み込みました。音源は各曲の演奏開始時に読み込みます。':'音源が不足している曲があります。音源を選択してください。'));
 const actions=eseControl('div','song-choice-actions ese-song-actions');
 for(const [title,automatic] of [['▶ フェスティバルを開始',false],['オートプレイでスタート',true]]){
  const button=eseControl('button',automatic?'':'primary',title);
  button.disabled=!ready||f.loading||eseState.fetchingSong||loading||importing||!!danRun;
  button.onclick=async()=>{try{f.error='';await launchFestival({name:f.name,songs:f.songs.map(s=>({chart:s.selected}))},automatic)}
   catch(e){f.error=e?.message||String(e);renderSongSelection()}};
  actions.append(button);
 }
 panel.append(actions);
 const link=eseControl('a','ese-source-link','ESEのコースデータを開く ↗');
 link.href=ESE_ROOT+'/src/branch/master/'+f.path.split('/').map(encodeURIComponent).join('/');
 link.target='_blank';link.rel='noopener noreferrer';panel.append(link);
}
