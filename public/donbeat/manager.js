'use strict';
(()=>{
 const $=id=>document.getElementById(id);
 const url='/api/donbeat/manage';
 const GENRES=['ポップス','アニメ','ボーカロイド','キッズ','バラエティ','クラシック','ゲームミュージック','ナムコオリジナル','その他'];
 let managerData={songs:[],dans:[],disabledStatic:[]},staticPresets=[],danEditId=null,working=false;
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function showTab(tab){
  $('tabUpload').hidden=tab!=='upload';$('tabManage').hidden=tab!=='manage';
  document.querySelectorAll('[data-db-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.dbTab===tab)));
  if(tab==='manage')void loadManager();
 }
 window.DONBEATAdminTabs=showTab;
 document.querySelectorAll('[data-db-tab]').forEach(button=>button.onclick=()=>showTab(button.dataset.dbTab));
 async function api(query='',options={}){
  const response=await fetch(url+query,{...options,credentials:'same-origin',cache:'no-store'});
  if(response.status===401){location.replace('admin-login.html');throw Error('ログイン期限が切れました。')}
  const body=await response.json().catch(()=>({error:'サーバーからの応答が不正です。'}));
  if(!response.ok)throw Error(body.error||'操作できませんでした。');
  return body;
 }
 function songParams(song){return '?action=song&id='+encodeURIComponent(song.id)+'&index='+encodeURIComponent(song.index)}
 function danParams(dan){return '?action=dan&id='+encodeURIComponent(dan.id)}
 function staticParams(dan){return '?action=dan-static&key='+encodeURIComponent(dan.id)}
 function renderSongs(){
  const node=$('dbmSongs');
  node.innerHTML=managerData.songs.length?managerData.songs.map((song,i)=>{
   const category=song.category==='official'?'official':'creative',genre=GENRES.includes(song.genre)?song.genre:'その他';
   return '<article class="dbm-item" data-song="'+i+'">'+
    '<b>'+esc(song.title)+'</b><small>'+esc(song.file)+'</small>'+
    '<div class="dbm-actions"><label>譜面分類 <select data-category>'+
    '<option value="official"'+(category==='official'?' selected':'')+'>本家譜面</option>'+
    '<option value="creative"'+(category==='creative'?' selected':'')+'>創作譜面</option></select></label>'+
    '<label>ジャンル <select data-genre>'+GENRES.map(g=>'<option'+(genre===g?' selected':'')+'>'+esc(g)+'</option>').join('')+'</select></label>'+
    '<button class="secondary" type="button" data-replace>差し替え</button>'+
    '<button class="danger" type="button" data-delete>削除</button></div></article>';
  }).join(''):'<p class="dbm-muted">アップロードされた収録曲はまだありません。</p>';
  for(const item of node.querySelectorAll('[data-song]')){
   const s=managerData.songs[Number(item.dataset.song)];
   item.querySelector('[data-category]').onchange=async e=>{try{await api(songParams(s),{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({category:e.target.value})});s.category=e.target.value;$('manageStatus').textContent='「'+s.title+'」の分類を変更しました。'}catch(err){$('manageStatus').textContent=err.message;renderSongs()}};
   item.querySelector('[data-genre]').onchange=async e=>{try{await api(songParams(s),{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({genre:e.target.value})});s.genre=e.target.value;$('manageStatus').textContent='「'+s.title+'」のジャンルを変更しました。'}catch(err){$('manageStatus').textContent=err.message;renderSongs()}};
   item.querySelector('[data-replace]').onclick=()=>{
    if(!window.DONBEATAdminUpload){$('manageStatus').textContent='アップロード画面を読み込めませんでした。';return}
    window.DONBEATAdminUpload.startReplace(s);showTab('upload');window.scrollTo({top:0,behavior:'smooth'});
   };
   item.querySelector('[data-delete]').onclick=async()=>{
    if(!confirm('「'+s.title+'」を収録曲から削除しますか？ この曲を使用している段位に影響する場合があります。'))return;
    try{$('manageStatus').textContent='削除中…';await api(songParams(s),{method:'DELETE'});await loadManager()}catch(err){$('manageStatus').textContent='削除できませんでした：'+err.message}
   };
  }
 }
 function renderDans(){
  const hidden=new Set(managerData.disabledStatic||[]);
  const shown=[...staticPresets.filter(x=>!hidden.has(String(x.id||''))).map(x=>({...x,_static:true})),...(managerData.dans||[])];
  $('dbmDans').innerHTML=shown.length?shown.map((dan,i)=>
   '<article class="dbm-item" data-dan="'+i+'"><b>'+esc(dan.title)+(dan._static?' <span class="badge">固定プリセット</span>':'')+'</b>'+
   '<small>'+esc(dan.file||'')+'</small><div class="dbm-actions">'+
   (dan._static?'':'<button class="secondary" type="button" data-edit>編集</button>')+
   '<button class="danger" type="button" data-delete>'+(dan._static?'非表示':'削除')+'</button></div></article>'
  ).join(''):'<p class="dbm-muted">実装済み段位はありません。</p>';
  for(const item of $('dbmDans').querySelectorAll('[data-dan]')){
   const dan=shown[Number(item.dataset.dan)];
   const edit=item.querySelector('[data-edit]');
   if(edit)edit.onclick=async()=>{
    try{
     const current=await api(danParams(dan));danEditId=dan.id;
     $('danTitle').value=current.title||'';$('danContent').value=current.content||'';
     $('danSave').textContent='変更を保存';$('danStatus').textContent='「'+current.title+'」を編集しています。';
     $('danTitle').scrollIntoView({behavior:'smooth',block:'center'});
    }catch(err){$('danStatus').textContent=err.message}
   };
   item.querySelector('[data-delete]').onclick=async()=>{
    if(!confirm('「'+dan.title+'」を'+(dan._static?'非表示に':'削除')+'しますか？'))return;
    try{
     await api(dan._static?staticParams(dan):danParams(dan),{method:'DELETE'});
     if(danEditId===dan.id)resetDanEditor();
     await loadManager();
    }catch(err){$('manageStatus').textContent='段位を変更できませんでした：'+err.message}
   };
  }
  const suppressed=staticPresets.filter(x=>hidden.has(String(x.id||'')));
  $('dbmDisabledDans').innerHTML=suppressed.length?suppressed.map((dan,i)=>
   '<div class="dbm-item" data-hidden="'+i+'"><b>'+esc(dan.title)+'</b><button class="secondary" data-restore type="button">再表示</button></div>'
  ).join(''):'<p class="dbm-muted">非表示の固定段位はありません。</p>';
  for(const node of $('dbmDisabledDans').querySelectorAll('[data-hidden]')){
   const d=suppressed[Number(node.dataset.hidden)];
   node.querySelector('[data-restore]').onclick=async()=>{try{await api(staticParams(d),{method:'POST'});await loadManager()}catch(e){$('manageStatus').textContent=e.message}};
  }
 }
 async function loadManager(){
  if(working)return;
  $('manageStatus').textContent='収録曲・段位を読み込み中…';
  try{
   const [remote,local]=await Promise.all([api(),fetch('dan-presets/catalog.json',{cache:'no-cache'}).then(r=>r.ok?r.json():{}).catch(()=>({}))]);
   managerData=remote;staticPresets=Array.isArray(local.presets)?local.presets:[];
   renderSongs();renderDans();
   $('manageStatus').textContent='収録曲 '+managerData.songs.length+'件 ／ 登録段位 '+(managerData.dans||[]).length+'件';
  }catch(err){$('manageStatus').textContent='一覧を取得できません：'+err.message}
 }
 function resetDanEditor(){
  danEditId=null;$('danTitle').value='';$('danContent').value='';$('danFile').value='';
  $('danSave').textContent='段位を実装';$('danStatus').textContent='';
 }
 $('danFile').onchange=async e=>{
  const f=e.target.files?.[0];if(!f)return;
  if(!/\.(dan|txt)$/i.test(f.name)){$('danStatus').textContent='段位設定は .dan または .txt を選択してください。';return}
  try{const bytes=await f.arrayBuffer();let source;try{source=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{source=new TextDecoder('shift-jis').decode(bytes)}
   $('danContent').value=source;$('danTitle').value=source.match(/^\s*TITLE\s*:\s*(.+)$/mi)?.[1]?.trim()||f.name.replace(/\.[^.]+$/,'');
   $('danStatus').textContent=f.name+' を読み込みました。';
  }catch(err){$('danStatus').textContent='読み込めませんでした：'+err.message}
 };
 $('danSave').onclick=async()=>{
  if(working)return;
  const title=$('danTitle').value.trim(),content=$('danContent').value;
  if(!title||!/^\s*SONG1\s*:/mi.test(content)){$('danStatus').textContent='段位名と、SONG1を含む段位設定が必要です。';return}
  working=true;$('danSave').disabled=true;
  const updated=!!danEditId;
  try{
   await api('?action=dan&id='+encodeURIComponent(danEditId||crypto.randomUUID()),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title,content})});
   resetDanEditor();$('danStatus').textContent=updated?'段位の変更を保存しました。':'段位を実装しました。';
  }catch(e){$('danStatus').textContent='段位を保存できません：'+e.message}
  finally{working=false;$('danSave').disabled=false}
  await loadManager();
 };
 $('danCancel').onclick=resetDanEditor;
 $('dbmRefresh').onclick=loadManager;
 $('dbmAddSong').onclick=()=>{window.DONBEATAdminUpload?.cancelReplace();showTab('upload')};
 $('logout').onclick=async()=>{
  try{await fetch('/api/donbeat/session',{method:'DELETE',credentials:'same-origin',cache:'no-store'})}
  finally{location.replace('admin-login.html')}
 };
 window.addEventListener('donbeat-catalog-updated',()=>void loadManager());
 // The page is server-side gated; this check also handles cookies that have expired while the tab was open.
 fetch('/api/donbeat/session',{credentials:'same-origin',cache:'no-store'}).then(r=>r.json()).then(d=>{if(!d.authenticated)location.replace('admin-login.html')}).catch(()=>{});
})();
