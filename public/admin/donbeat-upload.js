(()=>{
 const $=id=>document.getElementById(id),dialog=$('donbeatUpload'),message=$('uploadMessage');let plan=null,busy=false;
 const headers=()=>({authorization:'Bearer '+(sessionStorage.getItem('accel-admin-token')||'')});
 const path=f=>(f.chartPath||f.webkitRelativePath||f.name).replace(/\\/g,'/');
 const normalize=p=>{const result=[];for(const part of p.normalize('NFC').split('/')){if(part==='..')result.pop();else if(part&&part!=='.')result.push(part)}return result.join('/').toLowerCase()};
 const flags=c=>{const f={...c.features,branch:!!c.branchEvents?.length,dummy:!!c.dummyNotes?.length,damage:c.notes.some(n=>n.type===9),fadeout:!!c.fades?.some(e=>e.direction===0),mv:!!c.meta.VIDEO};for(const line of c._tja?.lines||[]){if(/^#BRANCHSTART/i.test(line))f.branch=true;if(/^#DUMMYSTART/i.test(line))f.dummy=true;if(!line.startsWith('#')&&/9/.test(line))f.damage=true;const m=line.match(/^#(BPMCHANGE|ABSCROLL|SCROLL)\s+([+-]?[\d.]+)/i);if(m&&(m[1].toUpperCase()==='BPMCHANGE'&&+m[2]!==c.bpm||m[1].toUpperCase()==='ABSCROLL'&&+m[2]!==1||m[1].toUpperCase()==='SCROLL'&&+m[2]<0))f.soflan=true}return f};
 async function api(query,options={}){const r=await fetch('/api/admin/donbeat'+query,{...options,headers:{...headers(),...options.headers}});const data=await r.json();if(!r.ok)throw Error(data.error||'通信に失敗しました');return data}
 $('donbeatUploadOpen').onclick=async()=>{dialog.showModal();message.textContent='接続を確認中…';try{await api('');message.textContent='譜面と音源を選択してください。';}catch(e){message.textContent=e.message}};
 $('uploadClose').onclick=()=>{if(!busy)dialog.close()};dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault()});
 async function inspect(input){if(busy)return;plan=null;$('uploadSend').disabled=true;$('uploadPreview').replaceChildren();message.textContent='譜面を確認中…';
  try{const files=[];for(const f of input){if(/\.(zip|mcz)$/i.test(f.name))files.push(...await readChartArchive(f));else files.push(f)}
   const used=new Map(),songs=[];
   const resolve=(chartPath,name,required)=>{if(!name){if(required)throw Error(chartPath+'：音源指定がありません');return null}const target=normalize(chartPath.split('/').slice(0,-1).join('/')+'/'+name);let matches=files.filter(f=>normalize(path(f))===target);if(!matches.length)matches=files.filter(f=>normalize(f.name)===normalize(name.split(/[\\/]/).pop()));if(matches.length!==1)throw Error(name+'：対応ファイルがないか、同名ファイルが複数あります');return matches[0]};
   for(const f of files.filter(f=>/\.(mc|tja)$/i.test(f.name))){const bytes=await f.arrayBuffer();let source;try{source=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{source=new TextDecoder('shift-jis').decode(bytes)}
    if(/\.mc$/i.test(f.name)&&Number(JSON.parse(source.replace(/^\uFEFF/,'' )).meta?.mode)!==5)continue;
    const parsed=/\.mc$/i.test(f.name)?parseMalody(source):parseTJA(source),features={};let audioPath,videoPath;
    for(const c of parsed.charts){const audio=resolve(path(f),c.meta.WAVE,true),video=resolve(path(f),c.meta.VIDEO,false);if(audioPath&&audioPath!==path(audio))throw Error('同じ譜面ファイル内で異なる音源は登録できません');audioPath=path(audio);used.set(audioPath,audio);if(video){if(videoPath&&videoPath!==path(video))throw Error('同じ譜面ファイル内で異なる動画は登録できません');videoPath=path(video);used.set(videoPath,video)}for(const [k,v] of Object.entries(flags(c)))features[k] ||= v}
    used.set(path(f),f);songs.push({title:parsed.charts[0].meta.TITLE||f.name,chartPath:path(f),audioPath,videoPath,features});
   }
   if(!songs.length)throw Error('対応するMC/TJA譜面がありません');
   for(const [name,f] of used){if(f.size>90*1024*1024)throw Error(name+'：1ファイル90MiBを超えています');if(!name.split('/').every(p=>p&&p!=='.'&&p!=='..'))throw Error('ファイルのパスが不正です')}
   plan={songs,used};for(const song of songs){const li=document.createElement('li');li.textContent=song.title;$('uploadPreview').append(li)}
   message.textContent=songs.length+'曲・'+used.size+'ファイルを登録できます。';$('uploadSend').disabled=false;
  }catch(e){message.textContent=e.message}
 }
 $('uploadFiles').onchange=e=>inspect(e.target.files);$('uploadFolder').onchange=e=>inspect(e.target.files);
 const upload=(id,name,file,progress)=>new Promise((resolve,reject)=>{const x=new XMLHttpRequest();x.open('PUT','/api/admin/donbeat?id='+id+'&path='+encodeURIComponent(name));x.setRequestHeader('authorization',headers().authorization);x.timeout=300000;x.upload.onprogress=e=>progress(e.loaded);x.onerror=()=>reject(Error('通信が切断されました'));x.ontimeout=()=>reject(Error('転送がタイムアウトしました'));x.onload=()=>{let data;try{data=JSON.parse(x.responseText)}catch{data={}}if(x.status>=200&&x.status<300)resolve();else reject(Error(data.error||'アップロード HTTP '+x.status))};x.send(file)});
 $('uploadSend').onclick=async()=>{if(!plan||busy)return;busy=true;for(const id of ['uploadFiles','uploadFolder','uploadSend','uploadClose'])$(id).disabled=true;const id=crypto.randomUUID();let published=false;
  try{await api('');const total=[...plan.used.values()].reduce((s,f)=>s+f.size,0);let done=0;
   for(const [name,file] of plan.used){let error;for(let attempt=0;attempt<3;attempt++){try{await upload(id,name,file,loaded=>{$('uploadProgress').value=(done+loaded)/total;message.textContent='転送中 '+Math.floor((done+loaded)/total*100)+'%：'+file.name});error=null;break}catch(e){error=e}}if(error)throw error;done+=file.size}
   message.textContent='選曲一覧へ公開中…';const result=await api('?id='+id,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({songs:plan.songs})});published=true;$('uploadProgress').value=1;message.textContent=result.count+'曲を公開しました。DON BEATを再読み込みすると表示されます。';plan=null;
  }catch(e){message.textContent='登録できませんでした：'+e.message;if(!published)try{await api('?id='+id,{method:'DELETE'})}catch{message.textContent+='（未公開データの削除に失敗しました）'}}
  finally{busy=false;for(const id of ['uploadFiles','uploadFolder','uploadClose'])$(id).disabled=false;$('uploadSend').disabled=!plan}
 };
})();
