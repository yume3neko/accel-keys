/* ESE: open the official folder directly, lazily display TJA Japanese titles and fetch matching audio. */
const eseState={
 path:'',items:[],query:'',loading:false,error:'',busyPath:'',
 cache:new Map(),infoCache:new Map(),requestId:0,pageSize:24,visible:24,
 activeInfo:null,activeCharts:[],audioError:'',fetchingSong:false
};
const ESE_ROOT='https://ese.tjadataba.se/ESE/ESE';
function eseControl(tag,css,text){
 const el=document.createElement(tag);
 if(css)el.className=css;
 if(text!==undefined)el.textContent=text;
 return el;
}
function eseApi(type,path){
 return '/api/donbeat/ese?type='+encodeURIComponent(type)+'&path='+encodeURIComponent(path||'');
}
function eseDepth(path){return path?path.split('/').length:0}
function eseGenreName(folder){
 const raw=String(folder||''),number=raw.match(/^(\d{1,2})\b/)?.[1];
 const code=number?number.padStart(2,'0'):null;
 const map={
  '01':'ポップス','02':'アニメ','03':'ボーカロイド',
  '04':'キッズ・民謡','05':'バラエティ','06':'クラシック',
  '07':'ゲームミュージック','09':'ナムコオリジナル'
 };
 const original=raw.replace(/^\d+\s*[-_ ]*\s*/,'').toLowerCase();
 const guess=[
  [/namco|ナムコ/,'ナムコオリジナル'],[/vocaloid|ボーカロイド|ボカロ/,'ボーカロイド'],
  [/anime|アニメ/,'アニメ'],[/pop|ポップ/,'ポップス'],[/children|folk|kids|童謡|民謡/,'キッズ・民謡'],
  [/variety|バラエティ/,'バラエティ'],[/classical|クラシック/,'クラシック'],
  [/game|ゲーム/,'ゲームミュージック'],[/original|オリジナル/,'オリジナル']
 ].find(([test])=>test.test(original));
 const translated=guess?.[1]||map[code]||(/[\u3040-\u30ff\u3400-\u9fff]/.test(original)?original:code?'その他のジャンル':'その他');
 return (code?code+'　':'')+translated;
}
function eseInfoFor(item){return eseState.infoCache.get(item.path)}
async function eseReadInfo(path){
 if(eseState.infoCache.has(path))return eseState.infoCache.get(path);
 const res=await fetch(eseApi('info',path));
 const data=await res.json();
 if(!res.ok)throw Error(data.error||'曲情報を取得できませんでした。');
 eseState.infoCache.set(path,data);
 return data;
}
function esePreviewLabel(item){
 const cached=eseInfoFor(item);
 return cached?.title||'曲名を取得中…';
}
async function eseLoadVisibleTitles(){
 if(eseDepth(eseState.path)!==1||eseState.loading)return;
 const path=eseState.path,visible=eseState.items.slice(0,eseState.visible)
  .filter(item=>item.type==='dir'||item.type==='file'&&/\.tja$/i.test(item.name));
 let offset=0;
 const worker=async()=>{
  while(path===eseState.path&&offset<visible.length){
   const item=visible[offset++];
   if(eseInfoFor(item))continue;
   try{
    const info=await eseReadInfo(item.path);
    if(path!==eseState.path)return;
    document.querySelectorAll('[data-ese-item]').forEach(button=>{
     if(button.dataset.eseItem===item.path)button.textContent='♫ '+info.title+' ›';
    });
   }catch{
    if(path!==eseState.path)return;
    document.querySelectorAll('[data-ese-item]').forEach(button=>{
     if(button.dataset.eseItem===item.path)button.textContent='⚠ 曲情報を取得できません。タップして再試行';
    });
   }
  }
 };
 await Promise.all([worker(),worker(),worker()]);
}
async function eseBrowse(path){
 if(eseState.loading||eseState.fetchingSong)return;
 eseState.path=path;eseState.error='';eseState.query='';
 eseState.activeInfo=null;eseState.activeCharts=[];eseState.audioError='';
 eseState.visible=eseState.pageSize;
 const id=++eseState.requestId;
 if(eseState.cache.has(path)){
  eseState.items=eseState.cache.get(path);renderSongSelection();
  if(eseDepth(path)===1)void eseLoadVisibleTitles();
  return;
 }
 eseState.loading=true;eseState.items=[];renderSongSelection();
 try{
  const res=await fetch(eseApi('list',path));
  const data=await res.json();
  if(!res.ok)throw Error(data.error||'ESEの一覧を取得できませんでした。');
  if(!Array.isArray(data.items))throw Error('ESEのフォルダ一覧の形式が不正です。');
  if(id!==eseState.requestId)return;
  eseState.cache.set(path,data.items);eseState.items=data.items;
 }catch(e){if(id===eseState.requestId)eseState.error=e.message||String(e)}
 finally{
  if(id===eseState.requestId){
   eseState.loading=false;renderSongSelection();
   if(eseDepth(path)===1)void eseLoadVisibleTitles();
  }
 }
}
function eseOpenRoot(){
 if(typeof openSongFolder==='string'){openSongFolder='official';songFolderTouched=true}
 if(!eseState.loading&&!eseState.fetchingSong)void eseBrowse('');
 else renderSongSelection();
}
async function eseFetchChart(path){
 const res=await fetch(eseApi('chart',path));
 if(!res.ok){let body={};try{body=await res.json()}catch{}throw Error(body.error||'ESEの譜面を読み込めませんでした。')}
 const bytes=await res.arrayBuffer();
 let text;
 try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}
 catch{text=new TextDecoder('shift-jis').decode(bytes)}
 const parsed=parseTJA(text);
 return parsed.charts.filter(c=>String(c.meta?.STYLE||'').toUpperCase()!=='DOUBLE').map(c=>({...c,warnings:[...(parsed.warnings||[])]}));
}
async function eseDownloadAudio(path){
 const res=await fetch(eseApi('audio',path));
 if(!res.ok){let body={};try{body=await res.json()}catch{}throw Error(body.error||'音源を取得できませんでした。')}
 const blob=await res.blob();
 if(!blob.size)throw Error('音源ファイルが空でした。');
 return new File([blob],path.split('/').pop(),{type:blob.type||'audio/ogg'});
}
async function eseOpenSong(path){
 if(eseState.fetchingSong||eseState.loading||loading||importing||danRun)return;
 eseState.path=path;eseState.error='';eseState.query='';
 eseState.activeInfo=eseState.infoCache.get(path)||null;
 eseState.activeCharts=[];eseState.audioError='';eseState.busyPath=path;
 eseState.fetchingSong=true;renderSongSelection();
 try{
  const info=await eseReadInfo(path);
  eseState.activeInfo=info;renderSongSelection();
  const tjas=info.tjas?.length?info.tjas.map(x=>x.path):[info.primaryTja];
  const existing=charts.filter(c=>c._eseFolder===info.path&&c._eseTja&&tjas.includes(c._eseTja));
  let selectedCharts=existing;
  const chartTask=existing.length?Promise.resolve(existing):Promise.all(tjas.slice(0,12).map(async filePath=>{
   try{
    const parsed=await eseFetchChart(filePath);
    for(const c of parsed){
     c.meta.TITLE=c.meta.TITLEJA||info.title||c.meta.TITLE;
     if(c.meta.SUBTITLEJA)c.meta.SUBTITLE=c.meta.SUBTITLEJA;
     c.category='official';
     c._esePath=filePath;c._eseTja=filePath;c._eseFolder=info.path;c.sourcePath=filePath;
    }
    return parsed;
   }catch(e){
    // Other charts can still load if one optional TJA is invalid.
    if(filePath===info.primaryTja)throw e;
    return [];
   }
  })).then(rows=>{
   const collected=rows.flat();
   if(!collected.length)throw Error('通常プレイ用のTJAが見つかりませんでした。');
   return collected;
  });
  const audioTask=info.audio?eseDownloadAudio(info.audio).then(file=>({file})).catch(e=>({error:e.message||String(e)})):Promise.resolve({error:'ESEの曲フォルダに音源がありません。'});
  const [chartResult,audioResult]=await Promise.allSettled([chartTask,audioTask]);
  if(chartResult.status==='rejected')throw chartResult.reason;
  selectedCharts=chartResult.value;
  const audio=audioResult.status==='fulfilled'?audioResult.value:{error:String(audioResult.reason)};
  eseState.audioError=audio.error||'';
  for(const c of selectedCharts){
   if(audio.file){
    c.audioFile=audio.file;c.preloadedAudio=null;
    c.serverAudio=null;
   }else if(!c.audioFile&&!c.serverAudio){
    // Keep a same-title previously published audio as a fallback only when ESE is missing.
    const fallback=charts.find(other=>other.serverEntry?.audio&&normalizeSongTitle(other.meta?.TITLE||other.serverEntry.title)===normalizeSongTitle(c.meta.TITLE));
    if(fallback){try{c.serverAudio=serverURL(fallback.serverEntry.audio,location.href)}catch{}}
   }
  }
  if(!existing.length){charts.push(...selectedCharts);fillCourses()}
  eseState.activeCharts=selectedCharts;
  const current=selectedCharts.includes(chart)?chart:selectedCharts[0];
  $('course').value=charts.indexOf(current);
  expandedSong='official::'+current.meta.TITLE;
  await choose();
 }catch(e){eseState.error=e.message||String(e)}
 finally{eseState.busyPath='';eseState.fetchingSong=false;renderSongSelection()}
}
async function eseImport(item){
 if(item.type==='dir'||item.type==='file'&&/\.tja$/i.test(item.name))return eseOpenSong(item.path);
}
function attachESEAudio(c,file){
 if(!file||!c?._esePath)return;
 const sameFolder=charts.filter(other=>other._eseFolder===c._eseFolder);
 for(const other of sameFolder){other.audioFile=file;other.serverAudio=null;other.preloadedAudio=null}
 eseState.audioError='';
 if(sameFolder.includes(chart)){audioBuffer=null;reset()}
 else renderSongSelection();
}
function eseAudioPicker(c){
 const label=eseControl('label','ese-audio-picker','音源ファイルを指定');
 const input=eseControl('input');
 input.type='file';input.accept='.ogg,.mp3,.wav,.m4a,.flac,.opus,.aac,audio/*';
 input.onchange=()=>attachESEAudio(c,input.files?.[0]);
 label.append(input);return label;
}
function eseSongInfo(panel){
 const info=eseState.activeInfo;
 const box=eseControl('section','ese-song-info');
 const heading=eseControl('h3','ese-song-title',info?.title||'曲情報を読み込んでいます…');
 box.append(heading);
 if(info){
  if(info.subtitle)box.append(eseControl('p','ese-song-subtitle',info.subtitle.replace(/^(--|\+\+)/,'')));
  const stats=eseControl('p','ese-song-stats',(info.bpm?info.bpm+' BPM　':'')+(info.charts?.length?info.charts.map(x=>x.course+' ★'+x.level).join(' / '):'譜面を確認中'));
  box.append(stats);
  if(eseState.fetchingSong)box.append(eseControl('p','ese-loading','譜面と音源を自動ダウンロード中…'));
  if(eseState.audioError)box.append(eseControl('p','ese-error','音源：'+eseState.audioError));
  if(eseState.activeCharts.length){
   const playable=eseState.activeCharts.filter(x=>!!(x.audioFile||x.serverAudio));
   const label=eseControl('label','ese-difficulty-label','難易度');
   const select=eseControl('select','ese-difficulty');
   for(const c of eseState.activeCharts){
    const option=eseControl('option','',((typeof names!=='undefined'&&names[c.meta.COURSE])||c.meta.COURSE||'難易度不明')+' ★'+(c.meta.LEVEL||'?'));
    option.value=String(charts.indexOf(c));select.append(option);
   }
   select.value=String(charts.indexOf(chart));
   select.onchange=async()=>{$('course').value=select.value;await choose()};
   label.append(select);box.append(label);
   const actions=eseControl('div','ese-song-actions');
   const play=eseControl('button','primary','▶ 演奏スタート');
   play.disabled=!playable.length||!playbackAssetsAvailable(chart);
   play.onclick=()=>start();
   const auto=eseControl('button','','オートプレイ');
   auto.disabled=play.disabled;auto.onclick=()=>start({auto:true});
   actions.append(play,auto);box.append(actions);
   if(!playable.length)box.append(eseAudioPicker(chart));
  }
  const credit=eseControl('a','ese-source-link','元のTJA・音源をESEで確認 ↗');
  credit.href=ESE_ROOT+'/src/branch/master/'+info.path.split('/').map(encodeURIComponent).join('/');
  credit.target='_blank';credit.rel='noopener noreferrer';box.append(credit);
 }
 panel.append(box);
}
function renderESEBrowser(host){
 const wrapper=eseControl('section','ese-browser');
 const panel=eseControl('div','ese-browser-panel');wrapper.append(panel);host.append(wrapper);
 const nav=eseControl('div','ese-browser-nav');
 const depth=eseDepth(eseState.path),isFile=/\.tja$/i.test(eseState.path);
 if(depth){
  const back=eseControl('button','ese-back','← '+(depth>=2?'曲一覧へ':'ジャンル一覧へ'));
  back.type='button';back.disabled=eseState.loading||eseState.fetchingSong;
  back.onclick=()=>void eseBrowse(isFile?eseState.path.split('/').slice(0,-1).join('/'):eseState.path.split('/').slice(0,-1).join('/'));
  nav.append(back);
 }
 const current=eseControl('strong','ese-current-path',depth?depth>=2?eseState.activeInfo?.title||'曲情報を読み込み中…':eseGenreName(eseState.path.split('/')[0]):'ジャンル一覧');
 nav.append(current);panel.append(nav);
 if(depth<=1){
  const description=eseControl('p','ese-browser-note',depth?'曲名は各TJAに書かれた日本語タイトルから取得します。':'ジャンルを選ぶと、ESEの曲フォルダを開きます。');
  panel.append(description);
 }
 if(eseState.error){const alert=eseControl('p','ese-error',eseState.error);alert.setAttribute('role','alert');panel.append(alert)}
 if(depth>=2){eseSongInfo(panel);return}
 if(eseState.loading){panel.append(eseControl('p','ese-loading','ESEからフォルダ一覧を取得中…'));return}
 const search=eseControl('input','ese-search');
 search.type='search';search.placeholder=depth?'表示中の曲名を検索':'ジャンルを検索';
 search.setAttribute('aria-label','ESE内検索');
 search.value=eseState.query;panel.append(search);
 const results=eseControl('div','ese-results');
 const draw=()=>{
  results.replaceChildren();
  const term=eseState.query.normalize('NFKC').toLowerCase().trim();
  const currentList=eseState.items.slice(0,eseState.visible);
  const items=currentList.filter(item=>{
   const label=depth===0?eseGenreName(item.name):esePreviewLabel(item);
   return !term||label.normalize('NFKC').toLowerCase().includes(term)||item.name.normalize('NFKC').toLowerCase().includes(term);
  });
  if(!items.length)results.append(eseControl('p','ese-browser-note',eseState.items.length?'一致する項目がありません。':'このフォルダは空です。'));
  for(const item of items){
   const isGenre=depth===0;
   const label=isGenre?eseGenreName(item.name):esePreviewLabel(item);
   const button=eseControl('button','ese-entry '+(isGenre?'ese-dir':'ese-chart'),(isGenre?'📁 ':'♫ ')+label+' ›');
   button.type='button';button.dataset.eseItem=item.path;
   button.title=item.name;button.disabled=eseState.fetchingSong;
   button.onclick=()=>isGenre?void eseBrowse(item.path):void eseOpenSong(item.path);
   results.append(button);
  }
  const old=panel.querySelector('.ese-load-more');if(old)old.remove();
  if(depth===1&&eseState.visible<eseState.items.length){
   const more=eseControl('button','ese-load-more','さらに曲を表示（'+Math.min(eseState.pageSize,eseState.items.length-eseState.visible)+'曲）');
   more.onclick=()=>{eseState.visible+=eseState.pageSize;draw();void eseLoadVisibleTitles()};
   panel.append(more);
  }
 };
 search.oninput=()=>{eseState.query=search.value;draw()};
 draw();panel.append(results);
 const link=eseControl('a','ese-source-link','ESEリポジトリを開く ↗');
 link.href=ESE_ROOT;link.target='_blank';link.rel='noopener noreferrer';panel.append(link);
}
// Main game script is evaluated before this optional feature.
if(typeof renderSongSelection==='function'){
 if(openSongFolder==='official')void eseBrowse('');
 else renderSongSelection();
}
