'use strict';

(function(){
  const catalogURL=new URL('dan-presets/catalog.json',location.href);
  let catalogLoaded=false,catalogLoading=null;

  const cleanTitle=value=>String(value||'').normalize('NFC').trim();
  const baseName=value=>cleanTitle(value).replace(/\\/g,'/').split('/').pop().replace(/\.(?:mc|tja)$/i,'');
  const courseNumber=c=>{
    const course=String(c?.meta?.COURSE||'Oni').trim().toLowerCase();
    const map={easy:0,normal:1,hard:2,oni:3,edit:4};
    return Object.hasOwn(map,course)?map[course]:/^[0-4]$/.test(course)?Number(course):-1;
  };

  function serverPath(c){
    const raw=c?.serverEntry?.url||c?.serverEntry?.file||'';
    if(!raw)return '';
    try{return decodeURIComponent(new URL(raw,location.href).pathname)}catch{return raw}
  }

  function matchesSongRef(c,song){
    const target=normalizedPath(song.chart),base=cleanTitle(baseName(song.chart)).toLowerCase();
    const source=normalizedPath(c.sourcePath||'');
    const importName=normalizedPath(c.importName||'');
    const remote=normalizedPath(serverPath(c));
    const title=cleanTitle(c.meta?.TITLE).toLowerCase();
    const entryTitle=cleanTitle(c.serverEntry?.title).toLowerCase();
    return !!target&&(
      source===target||source.endsWith('/'+target)||
      importName===target||importName.endsWith('/'+target)||
      remote===target||remote.endsWith('/'+target)||
      title===base||entryTitle===base||title===cleanTitle(song.chart).toLowerCase()
    );
  }

  function removeStaleDanServerEntries(){
    for(let i=danPool.length-1;i>=0;i--){
      const c=danPool[i].chart;
      if(c?.serverPlaceholder&&!charts.includes(c))danPool.splice(i,1);
    }
  }

  async function ensureServerCatalog(){
    if(charts.some(c=>c.serverEntry))return;
    if(typeof loadServerCatalog==='function'){
      await loadServerCatalog();
      await new Promise(resolve=>setTimeout(resolve,0));
    }
  }

  async function ensurePresetSong(song){
    await ensureServerCatalog();
    let candidates=charts.filter(c=>matchesSongRef(c,song));
    let placeholder=candidates.find(c=>c.serverPlaceholder);
    if(placeholder){
      await prepareServerChart(placeholder);
      removeStaleDanServerEntries();
      candidates=charts.filter(c=>matchesSongRef(c,song)&&!c.serverPlaceholder);
    }
    if(song.course!==undefined)candidates=candidates.filter(c=>courseNumber(c)===song.course);
    if(!candidates.length)throw Error('サーバー収録曲「'+song.chart+'」が見つかりません。');
    if(candidates.length>1&&song.course===undefined){
      const unique=[...new Set(candidates.map(c=>c.sourcePath||c.meta?.TITLE))];
      if(unique.length>1)throw Error('サーバー収録曲「'+song.chart+'」を一意に特定できません。');
    }
    const selected=candidates[0];
    if(selected.serverEntry&&!selected.audioFile)await prepareServerChart(selected);
    song.chart=selected.meta?.TITLE||song.chart;
  }

  async function preparePresetConfig(config){
    for(const song of config.songs)await ensurePresetSong(song);
    removeStaleDanServerEntries();
    rememberDanCharts();
    return config;
  }

  async function selectPreset(entry,button){
    if(loading||importing||danRun||state==='playing'||state==='paused')return;
    const old=button.textContent;
    button.disabled=true;button.textContent='読み込み中…';
    $('danError').textContent='';loading=true;
    try{
      const url=new URL(entry.file,catalogURL);
      const response=await fetch(url,{cache:'no-cache'});
      if(!response.ok)throw Error('段位プリセット HTTP '+response.status);
      const config=await preparePresetConfig(parseDanConfig(await response.text()));
      pendingDan={config,path:url.pathname.replace(/^.*\/donbeat\//,''),armed:true,serverPreset:true};
      refreshDanSongs();
      $('danError').textContent='サーバープリセット「'+(entry.title||config.name)+'」を読み込みました。';
    }catch(e){
      $('danError').textContent='プリセットを読み込めませんでした：'+(e.message||e);
    }finally{
      loading=false;button.disabled=false;button.textContent=old;
    }
  }

  function ensurePresetPanel(){
    let panel=$('danServerPresets');if(panel)return panel;
    panel=document.createElement('section');panel.id='danServerPresets';panel.className='dan-server-presets';
    const h=danNode('h3','サーバープリセット');
    const status=danNode('p','プリセットを読み込み中…','dan-preview-status');status.id='danPresetStatus';
    const list=document.createElement('div');list.id='danPresetList';list.className='filebuttons';
    panel.append(h,status,list);
    const dialog=$('danDialog'),files=dialog.querySelector('.filebuttons');
    if(files)dialog.insertBefore(panel,files);else dialog.append(panel);
    return panel;
  }

  async function loadPresetCatalog(){
    if(catalogLoaded)return;
    if(catalogLoading)return catalogLoading;
    ensurePresetPanel();
    catalogLoading=(async()=>{
      const status=$('danPresetStatus'),list=$('danPresetList');
      try{
        const response=await fetch(catalogURL,{cache:'no-cache'});
        if(!response.ok)throw Error('HTTP '+response.status);
        const data=await response.json();
        if(!Array.isArray(data.presets))throw Error('presets配列がありません。');
        list.replaceChildren();
        for(const entry of data.presets){
          if(!entry||typeof entry.title!=='string'||typeof entry.file!=='string')continue;
          const b=document.createElement('button');b.type='button';b.textContent=entry.title;b.onclick=()=>selectPreset(entry,b);list.append(b);
        }
        status.textContent=list.children.length?'サーバーに登録された段位を選択できます。':'現在登録されているプリセットはありません。';
        catalogLoaded=true;
      }catch(e){
        status.textContent='プリセット一覧を読み込めません：'+(e.message||e);
      }finally{catalogLoading=null}
    })();
    return catalogLoading;
  }

  const oldOpenDan=openDan;
  openDan=function(){
    oldOpenDan();
    if($('danDialog').open)loadPresetCatalog();
  };

  ensurePresetPanel();
  loadPresetCatalog();
})();
