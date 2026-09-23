/* ESE remote browser. TJA is fetched only when a song is selected; audio stays user-supplied. */
const eseState={open:false,path:'',items:[],query:'',loading:false,error:'',busyPath:'',cache:new Map(),requestId:0};
function eseControl(tag,cls,textContent){
 const el=document.createElement(tag);
 if(cls)el.className=cls;
 if(textContent!=null)el.textContent=textContent;
 return el;
}
async function eseBrowse(path){
 if(eseState.loading)return;
 eseState.path=path;eseState.query='';eseState.error='';
 if(eseState.cache.has(path)){eseState.items=eseState.cache.get(path);renderSongSelection();return}
 eseState.loading=true;eseState.items=[];const id=++eseState.requestId;renderSongSelection();
 try{
  const res=await fetch('/api/donbeat/ese?type=list&path='+encodeURIComponent(path));
  const data=await res.json();
  if(!res.ok)throw Error(data.error||'ESEのフォルダを取得できませんでした。');
  if(!Array.isArray(data.items))throw Error('フォルダ一覧の形式が不正です。');
  if(id!==eseState.requestId)return;
  eseState.cache.set(path,data.items);eseState.items=data.items;
 }catch(e){if(id===eseState.requestId)eseState.error=e.message||String(e)}
 finally{if(id===eseState.requestId){eseState.loading=false;renderSongSelection()}}
}
async function eseImport(item){
 if(eseState.busyPath||loading||importing||danRun)return;
 eseState.busyPath=item.path;eseState.error='';renderSongSelection();
 try{
  const existing=charts.find(c=>c._esePath===item.path);
  if(existing){
   openSongFolder='official';songFolderTouched=true;expandedSong='official::'+(existing.meta.TITLE||'無題');
   $('course').value=charts.indexOf(existing);await choose();return;
  }
  const res=await fetch('/api/donbeat/ese?type=chart&path='+encodeURIComponent(item.path));
  if(!res.ok){let data={};try{data=await res.json()}catch{}throw Error(data.error||'ESEのTJAを取得できませんでした。')}
  const bytes=await res.arrayBuffer();
  let source;try{source=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{source=new TextDecoder('shift-jis').decode(bytes)}
  const parsed=parseTJA(source);
  const imported=parsed.charts.filter(c=>String(c.meta?.STYLE||'').toUpperCase()!=='DOUBLE');
  if(!imported.length)throw Error('通常プレイ用の譜面が見つかりませんでした。');
  const fallback=item.name.replace(/\.tja$/i,'');
  for(const c of imported){
   c.meta.TITLE=c.meta.TITLEJA||c.meta.TITLE||fallback;
   c.category='official';
   c._esePath=item.path;c.sourcePath=item.path;
   c.warnings=[...(parsed.warnings||[])];
   // Only reuse audio already published by the owner on this site.
   const shared=charts.find(other=>other.serverEntry?.audio&&normalizeSongTitle(other.meta?.TITLE||other.serverEntry.title)===normalizeSongTitle(c.meta.TITLE));
   if(shared){try{c.serverAudio=serverURL(shared.serverEntry.audio,location.href)}catch{}}
   const wave=(c.meta.WAVE||'').replace(/\\/g,'/').split('/').pop().toLowerCase();
   if(!c.serverAudio&&audioFiles.has(wave))c.audioFile=audioFiles.get(wave);
  }
  charts.push(...imported);
  fillCourses();$('course').value=charts.indexOf(imported[0]);
  expandedSong='official::'+imported[0].meta.TITLE;
  openSongFolder='official';songFolderTouched=true;
  await choose();
 }catch(e){eseState.error=e.message||String(e)}
 finally{eseState.busyPath='';renderSongSelection()}
}
function renderESEBrowser(host){
 const wrapper=eseControl('section','ese-browser');
 const toggle=eseControl('button','ese-browser-toggle','ESEから本家譜面を探す');
 toggle.type='button';toggle.setAttribute('aria-expanded',String(eseState.open));
 toggle.onclick=()=>{eseState.open=!eseState.open;if(eseState.open&&!eseState.cache.has(eseState.path)&&!eseState.loading)void eseBrowse(eseState.path);else renderSongSelection()};
 wrapper.append(toggle);host.append(wrapper);
 if(!eseState.open)return;
 const panel=eseControl('div','ese-browser-panel');
 const note=eseControl('p','ese-browser-note','ESEのGitリポジトリから選択したTJAのみ取得します。音源は既存の収録曲のものを使うか、お手持ちのファイルを指定してください。');
 panel.append(note);
 const upstream=eseControl('a','ese-source-link','ESEリポジトリを開く ↗');
 upstream.href='https://ese.tjadataba.se/ESE/ESE';upstream.target='_blank';upstream.rel='noopener noreferrer';panel.append(upstream);
 const nav=eseControl('div','ese-browser-nav');
 if(eseState.path){
  const back=eseControl('button','ese-back','← 親フォルダ');
  back.type='button';back.disabled=eseState.loading||!!eseState.busyPath;
  back.onclick=()=>void eseBrowse(eseState.path.split('/').slice(0,-1).join('/'));
  nav.append(back);
 }
 const current=eseControl('span','ese-current-path',eseState.path||'ESE / すべてのジャンル');
 nav.append(current);panel.append(nav);
 if(eseState.error){const alert=eseControl('p','ese-error',eseState.error);alert.setAttribute('role','alert');panel.append(alert)}
 if(eseState.loading){panel.append(eseControl('p','ese-loading','ESEから一覧を取得中…'));wrapper.append(panel);return}
 const search=eseControl('input','ese-search');
 search.type='search';search.placeholder='このフォルダ内で曲名・フォルダ名を検索';
 search.setAttribute('aria-label','ESEフォルダ内検索');search.value=eseState.query;
 panel.append(search);
 const results=eseControl('div','ese-results');
 const paint=()=>{
  results.replaceChildren();
  const term=eseState.query.normalize('NFKC').toLowerCase().trim();
  const items=eseState.items.filter(x=>String(x.name||'').normalize('NFKC').toLowerCase().includes(term));
  if(!items.length){results.append(eseControl('p','ese-browser-note',eseState.items.length?'一致する曲がありません。':'このフォルダにはTJAまたはサブフォルダがありません。'));return}
  for(const item of items){
   const button=eseControl('button','ese-entry '+(item.type==='dir'?'ese-dir':'ese-chart'),(item.type==='dir'?'📁 ':'♫ ')+item.name+(item.type==='dir'?' ›':''));
   button.type='button';button.disabled=!!eseState.busyPath;
   button.onclick=()=>item.type==='dir'?void eseBrowse(item.path):void eseImport(item);
   if(item.path===eseState.busyPath)button.textContent='譜面を読み込み中…';
   results.append(button);
  }
 };
 search.oninput=()=>{eseState.query=search.value;paint()};
 paint();panel.append(results);wrapper.append(panel);
}
function attachESEAudio(c,file){
 if(!file||!c?._esePath)return;
 c.audioFile=file;c.serverAudio=null;
 if(c===chart){audioBuffer=null;reset()}
 else renderSongSelection();
}
// The main script is loaded before this optional feature.
if(typeof renderSongSelection==='function')renderSongSelection();
