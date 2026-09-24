'use strict';
(()=>{
 const $=id=>document.getElementById(id);
 const CHART=/\.(?:tja|mc)$/i, AUDIO=/\.(?:ogg|mp3|wav|m4a|flac|opus|aac)$/i;
 const ALLOWED=/\.(?:tja|mc|ogg|mp3|wav|m4a|flac|opus|aac|mp4|webm|m4v|png|jpg|jpeg|webp|gif)$/i;
 const API='/api/donbeat/admin-upload', MAX_FILE=90*1024*1024, MAX_CHART=8*1024*1024;
 const chosen=new Map(),uploaded=new Set();
 let batch=null,ready=false,busy=false,issues=[],missing=[],published=false,replaceTarget=null;
 const norm=s=>String(s||'').normalize('NFC').toLowerCase();
 const cleanPath=s=>String(s||'').normalize('NFC').replace(/\\/g,'/');
 const basename=s=>s.split('/').pop();
 const dirname=s=>s.split('/').slice(0,-1).join('/');
 function error(message){$('status').dataset.kind='error';$('status').textContent=message}
 function status(message,ok=false){$('status').dataset.kind=ok?'success':'';$('status').textContent=message}
 function resetUpload(){batch=null;uploaded.clear();published=false;status('')}
 function draw(){
  const files=[...chosen.entries()];
  const total=files.reduce((s,[,f])=>s+f.size,0);
  $('summary').textContent=files.length+'ファイル ／ '+(total/1048576).toFixed(1)+' MB ／ 譜面 '+files.filter(([p])=>CHART.test(p)).length+'件';
  $('files').replaceChildren();
  const show=files.length<=80?files:files.slice(0,80);
  for(const [path,file] of show){const li=document.createElement('li');li.textContent=path+' ('+(file.size/1048576).toFixed(2)+' MB)';$('files').append(li)}
  if(files.length>80){const li=document.createElement('li');li.textContent='ほか '+(files.length-80)+' ファイル';$('files').append(li)}
  $('issues').textContent=issues.join('\n');
  $('publish').disabled=!ready||busy||published;
  $('newBatch').hidden=!published;
  $('publish').textContent=published?'公開済み':busy?'アップロード中…':'R2にアップロードして公開する';
 }
 function resolve(chart,wave){
  if(!wave||/^(?:[a-z]+:|\/)/i.test(wave))return null;
  const parts=dirname(chart).split('/').filter(Boolean);
  for(const s of cleanPath(wave).split('/')){
   if(!s||s==='.')continue;
   if(s==='..'){if(!parts.length)return null;parts.pop()}else parts.push(s);
  }
  return parts.join('/');
 }
 function matchAudio(path,wave,paths){
  const audios=paths.filter(p=>AUDIO.test(p));
  if(wave){const wanted=resolve(path,wave);return audios.find(p=>norm(p)===norm(wanted))||null}
  const same=audios.filter(p=>norm(dirname(p))===norm(dirname(path)));
  const stem=basename(path).replace(CHART,'');
  return same.find(p=>norm(basename(p).replace(AUDIO,''))===norm(stem))||(same.length===1?same[0]:null);
 }
 async function parse(file,path){
  const bytes=await file.arrayBuffer();let text;
  try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}
  catch{text=new TextDecoder('shift-jis').decode(bytes)}
  if(/\.mc$/i.test(path)){
   const d=JSON.parse(text);
   if(Number(d.meta?.mode)!==5||!Array.isArray(d.note)||!Array.isArray(d.time)||!d.time.length)throw Error('対応するMalody太鼓譜面ではありません。');
   if(!d.note.some(n=>n.sound===undefined&&Number.isFinite(Number(n.style))))throw Error('音符がありません。');
   return [...new Set(d.note.filter(n=>Number(n.type)===1&&typeof n.sound==='string'&&n.sound.trim()).map(n=>n.sound.trim()))];
  }
  if(!/^\s*#START\b/im.test(text))throw Error('#START がありません。');
  const lines=text.split(/\r?\n/),waves=[],seenNotes=[];
  let inChart=false,style='';
  for(const raw of lines){
   const line=raw.replace(/\/\/.*$/,'').trim();
   if(/^STYLE\s*:/i.test(line))style=line.slice(line.indexOf(':')+1).trim().toUpperCase();
   if(/^#START\b/i.test(line)){inChart=true;continue}
   if(/^#END\b/i.test(line)){inChart=false;continue}
   if(!inChart){
    const m=line.match(/^WAVE\s*:\s*(.+)$/i);if(m)waves.push(m[1].trim());
   }else if(style!=='DOUBLE'&&!line.startsWith('#')&&/[1-7]/.test(line.replace(/,.*$/,'')))seenNotes.push(true);
  }
  if(!seenNotes.length)throw Error('演奏できる1人用の音符がありません。');
  if(new Set(waves.map(norm)).size>1)throw Error('異なるWAVEを含むTJAは譜面ごとに分けてください。');
  return waves.slice(0,1);
 }
 async function inspect(){
  ready=false;issues=[];missing=[];const paths=[...chosen.keys()],scores=paths.filter(p=>CHART.test(p));
  if(!scores.length)issues.push('TJAまたはMC譜面を選択してください。');
  if(replaceTarget&&scores.length!==1)issues.push('差し替えでは譜面ファイルを1つだけ選択してください。');
  if(paths.length>1200)issues.push('1回にアップロードできるのは1200ファイルまでです。');
  if([...chosen.values()].reduce((sum,f)=>sum+f.size,0)>4*1024**3)issues.push('合計サイズは4GB以下にしてください。');
  for(const [path,file] of chosen){
   if(!file.size||file.size>MAX_FILE)issues.push(path+'：ファイルは1バイト以上90MB以下にしてください。');
   if(CHART.test(path)&&file.size>MAX_CHART)issues.push(path+'：譜面は8MB以下にしてください。');
  }
  if(issues.length){draw();return}
  for(const path of scores){
   let waves;
   try{waves=await parse(chosen.get(path),path)}
   catch(e){issues.push(path+'：'+(e.message||String(e)));continue}
   const check=waves.length?waves:[''];
   for(const wave of check){
    if(!matchAudio(path,wave,paths)){
     const expected=wave?resolve(path,wave):null;
     if(expected)missing.push(expected);
     issues.push(path+'：音源が見つかりません'+(wave?'（'+wave+'）':'（WAVE未指定・音源を特定できません）'));
    }
   }
  }
  ready=!issues.length;draw();
 }
 async function add(files,replace=false){
  if(busy||published)return;
  if(replace)chosen.clear();
  const incoming=Array.from(files||[]).filter(file=>ALLOWED.test(file.name));
  // An extra loose audio file can fill a unique WAVE reference automatically.
  for(const file of incoming){
   let path=cleanPath(file.webkitRelativePath||file.name);
   if(!file.webkitRelativePath&&AUDIO.test(file.name)){
    const candidates=[...new Set(missing)].filter(p=>norm(basename(p))===norm(file.name));
    if(candidates.length===1)path=candidates[0];
   }
   if(path.split('/').some(p=>!p||p==='.'||p==='..'||p.length>180)){
    error('ファイル名またはフォルダ名が不正です: '+path);continue;
   }
   chosen.set(path,file);
  }
  resetUpload();await inspect();
 }
 async function requestJSON(action,payload={}){
  const res=await fetch(API,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},
   body:JSON.stringify({action,...payload}),cache:'no-store'});
  const body=await res.json().catch(()=>({error:'サーバーからの応答を取得できませんでした。'}));
  if(!res.ok)throw Error(body.error+(body.details?.length?'\n'+body.details.join('\n'):''));
  return body;
 }
 async function pushFile(path,file){
  const url=API+'?batch='+encodeURIComponent(batch)+'&path='+encodeURIComponent(path);
  const res=await fetch(url,{method:'PUT',credentials:'same-origin',body:file,cache:'no-store'});
  const data=await res.json().catch(()=>({error:'アップロード応答が不正です。'}));
  if(!res.ok)throw Error(path+'：'+data.error);
  uploaded.add(path);
 }
 async function publish(){
  if(!ready||busy||published)return;
  busy=true;draw();$('progress').hidden=false;
  try{
   const files=[...chosen.entries()];
   if(!batch){
    status('アップロードを準備中…');
    const begun=await requestJSON('begin',{files:files.map(([path,file])=>({path,size:file.size})),genre:$('genre').value});
    batch=begun.batch;
   }
   let cursor=0,finished=uploaded.size,failures=[];
   $('progress').max=files.length;$('progress').value=finished;
   const worker=async()=>{
    while(cursor<files.length){
     const [path,file]=files[cursor++];
     if(uploaded.has(path))continue;
     try{await pushFile(path,file)}
     catch(e){failures.push(e.message||String(e))}
     finished++;$('progress').value=finished;status('R2にアップロード中… '+finished+' / '+files.length);
    }
   };
   await Promise.all(Array.from({length:Math.min(3,files.length)},worker));
   if(failures.length)throw Error('一部のファイルを保存できませんでした。再実行すると失敗分だけ再送します。\n'+failures.join('\n'));
   status('全ファイルの存在・サイズ・譜面と音源の対応をサーバーで検証しています…');
   const result=await requestJSON('publish',{batch});
   published=true;
   $('progress').value=files.length;
   let replacement='';
   if(replaceTarget){
    const target=replaceTarget;
    try{
     const endpoint='/api/donbeat/manage?action=song&id='+encodeURIComponent(target.id)+'&index='+target.index;
     const response=await fetch(endpoint,{method:'DELETE',credentials:'same-origin',cache:'no-store'});
     const body=await response.json().catch(()=>({}));
     if(!response.ok)throw Error(body.error||'旧曲の削除に失敗しました。');
     replacement='\n旧曲「'+target.title+'」との差し替えも完了しました。';
     replaceTarget=null;$('replaceNotice').hidden=true;$('cancelReplace').hidden=true;
    }catch(e){replacement='\n新しい譜面は公開されましたが、旧曲の削除に失敗しました。収録曲管理から削除してください：'+e.message}
   }
   status('公開完了！ '+result.songCount+'譜面を追加しました。ジャンル：'+result.genres.join('、')+replacement+'\nDONBEATの選曲画面を再読み込みすると表示されます。',true);
   window.dispatchEvent(new Event('donbeat-catalog-updated'));
  }catch(e){error(e.message||String(e))}
  finally{busy=false;draw()}
 }
 $('folder').addEventListener('change',event=>void add(event.target.files,true));
 $('extra').addEventListener('change',event=>{void add(event.target.files,false);event.target.value=''});
 $('genre').addEventListener('change',()=>{if(!busy){resetUpload();void inspect()}});
 function clearSelection(){
  if(busy)return;
  chosen.clear();ready=false;issues=[];missing=[];resetUpload();
  $('folder').value='';$('extra').value='';$('progress').hidden=true;$('progress').value=0;
  draw();
 }
 function cancelReplace(){
  if(busy)return;
  replaceTarget=null;$('replaceNotice').hidden=true;$('cancelReplace').hidden=true;
  clearSelection();
 }
 window.DONBEATAdminUpload={
  startReplace(song){
   if(busy)return;
   clearSelection();replaceTarget={id:song.id,index:song.index,title:song.title};
   $('replaceNotice').textContent='「'+song.title+'」を差し替えます。新しいTJA/MCと対応音源を選択してください。全件確認・公開が完了してから旧曲を削除します。';
   $('replaceNotice').hidden=false;$('cancelReplace').hidden=false;
   $('genre').value=song.genre||'';
   draw();
  },
  cancelReplace
 };
 $('cancelReplace').addEventListener('click',cancelReplace);
 $('newBatch').addEventListener('click',()=>{cancelReplace();$('status').textContent='次の曲を選択できます。'});

 $('publish').addEventListener('click',()=>void publish());
 draw();
})();
