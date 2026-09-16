'use strict';

// DON BEAT compatibility/runtime updates kept separate from the main engine.
// This file is loaded last so it can refine existing global behavior without
// duplicating the full parser/game files.

(function(){
  const originalChartFeatures=chartFeatures;

  function finiteNumber(value){
    const n=Number(value);
    return Number.isFinite(n)?n:null;
  }

  function inspectSpeedFeatures(c,result){
    let stop=!!c.features?.scrollStop;
    let reverse=!!c.features?.reverseScroll;
    let soflan=!!result.soflan;
    let noteScroll=!!result.scrollOnNotes;
    const baseBpm=finiteNumber(c.bpm);

    const inspectState=(lane,hs,bpm)=>{
      const l=finiteNumber(lane)??1,h=finiteNumber(hs)??1,b=finiteNumber(bpm);
      if(l!==1||h!==1||(baseBpm!==null&&b!==null&&b!==baseBpm))soflan=true;
      if(l!==1||h!==1)noteScroll=true;
      const effective=l*h;
      if(effective===0)stop=true;
      if(effective<0)reverse=true;
    };

    for(const n of [...(c.notes||[]),...(c.dummyNotes||[])]){
      const hs=finiteNumber(n.scroll)??1;
      if(hs!==1)soflan=noteScroll=true;
      if(hs===0)stop=true;
      if(hs<0)reverse=true;
      const bpm=finiteNumber(n.bpm);
      if(baseBpm!==null&&bpm!==null&&bpm!==baseBpm)soflan=true;
    }
    for(const e of c.motion||[])inspectState(e.scroll,e.hs,e.bpm);
    for(const e of c.visual||[])inspectState(e.scroll,e.hs,e.bpm);

    // Raw TJA inspection also covers charts created before parser-side feature
    // metadata was introduced and makes the badge rules explicit.
    if(c._tja?.lines){
      let lane=1,hs=1;
      for(const line of c._tja.lines){
        let match=line.match(/^#BPMCHANGE\s+([+-]?[\d.]+)/i);
        if(match){
          const bpm=finiteNumber(match[1]);
          if(baseBpm!==null&&bpm!==null&&bpm!==baseBpm)soflan=true;
          continue;
        }
        match=line.match(/^#ABSCROLL\s+([+-]?[\d.]+)/i);
        if(match){
          const value=finiteNumber(match[1]);
          if(value!==null){lane=value;if(value!==1)soflan=noteScroll=true;inspectState(lane,hs,baseBpm)}
          continue;
        }
        match=line.match(/^#SCROLL\s+([+-]?[\d.]+)/i);
        if(match){
          const value=finiteNumber(match[1]);
          if(value!==null){hs=value;if(value!==1)soflan=noteScroll=true;inspectState(lane,hs,baseBpm)}
        }
      }
    }

    result.soflan=soflan;
    result.scrollOnNotes=noteScroll;
    result.scrollStop=stop;
    result.reverseScroll=reverse;
    return result;
  }

  chartFeatures=function(c){
    return inspectSpeedFeatures(c,originalChartFeatures(c));
  };

  featureBadges=function(list){
    const box=document.createElement('span');box.className='feature-badges';
    const flags=list.map(chartFeatures);
    for(const [key,icon,label] of [
      ['soflan','↔','ソフランあり'],
      ['scrollStop','⏸','譜面停止あり'],
      ['reverseScroll','↶','逆走あり'],
      ['branch','⑂','譜面分岐あり'],
      ['dummy','◇','ダミーノーツあり'],
      ['damage','⚠','ダメージノーツあり'],
      ['fadeout','◐','フェードアウトあり'],
      ['mv','▶','MV付き']
    ]){
      if(!flags.some(f=>f[key]))continue;
      const badge=document.createElement('span');
      badge.className='feature-badge '+key+
        (key==='soflan'&&flags.some(f=>f.scrollOnNotes)?' scroll-on-notes':'')+
        (key==='fadeout'&&flags.some(f=>f.fadeOnNotes)?' fade-on-notes':'');
      badge.title=label;badge.setAttribute('aria-label',label);badge.textContent=icon+' '+label;box.append(badge);
    }
    return box;
  };

  // Re-render once so already-loaded built-in/catalog cards receive the new badges.
  try{renderSongSelection()}catch{}

  const originalLaunchDan=launchDan;

  async function decodeDanAudio(run,index){
    const entry=run.config.songs[index],c=entry.chart;
    if(entry.demo){run.buffers[index]=null;return}
    const file=c.audioFile;
    if(!file)throw Error((index+1)+'曲目の音源 '+(c.meta.WAVE||'')+' が未読込です。');
    if(run.buffers[index])return;
    run.audioCache??=new Map();
    if(run.audioCache.has(file)){run.buffers[index]=run.audioCache.get(file);return}
    let buffer;
    if(c===run.original.chart&&run.original.audioBuffer)buffer=run.original.audioBuffer;
    else if(c.preloadedAudio)buffer=c.preloadedAudio;
    else buffer=await audio().decodeAudioData(await file.arrayBuffer());
    if(danRun!==run||run.finished)return;
    run.audioCache.set(file,buffer);run.buffers[index]=buffer;
  }

  async function preloadDanMV(run,index){
    if(danRun!==run||run.finished)return;
    const c=run.config.songs[index].chart;
    const current=chart;
    try{chart=c;syncMV()}finally{chart=current}
    const v=$('mv');
    if(!c.videoFile||!v||v.readyState>=2)return;
    await new Promise(resolve=>{
      let settled=false;
      const done=()=>{if(settled)return;settled=true;clearTimeout(timer);v.removeEventListener('loadeddata',done);v.removeEventListener('canplay',done);v.removeEventListener('error',done);resolve()};
      const timer=setTimeout(done,10000);
      v.addEventListener('loadeddata',done,{once:true});
      v.addEventListener('canplay',done,{once:true});
      v.addEventListener('error',done,{once:true});
      if(v.readyState>=2)done();
    });
  }

  async function prepareDanSongAssets(run,index){
    if(danRun!==run||run.finished)return;
    let entry=run.config.songs[index];
    let c=entry.chart;
    if(c.serverEntry&&typeof prepareServerChart==='function'){
      c=await prepareServerChart(c);
      if(danRun!==run||run.finished)return;
      if(c&&c!==entry.chart){entry.chart=c;entry={...entry,chart:c};run.config.songs[index]=entry}
    }
    await decodeDanAudio(run,index);
    if(danRun!==run||run.finished)return;
    await preloadDanMV(run,index);
  }

  launchDan=async function(automatic=false){
    if(loading||importing||danRun)return;
    let config;
    try{config=resolveDanConfig();config.auto=automatic===true}catch(e){$('danError').textContent=e.message;return}
    loading=true;
    if(!$('danDialog').open)$('danDialog').showModal();
    $('danPlayAuto').disabled=true;$('danPlay').disabled=true;$('danClose').disabled=true;
    try{
      await audio().resume();
      pendingDan.armed=false;
      const run=danRun={config,buffers:new Array(config.songs.length),index:0,results:[],baseline:{score:0,good:0,ok:0,miss:0,rolls:0,maxCombo:0},songCombo:0,songMaxCombo:0,original:{chart,charts,audioBuffer,demoMode},finished:false,failed:false,audioCache:new Map()};
      $('danError').textContent='1/'+config.songs.length+'曲目を準備中…';
      await prepareDanSongAssets(run,0);
      if(danRun!==run||run.finished)return;
      $('danDialog').close();loading=false;
      await beginDanSong(false);
    }catch(e){
      $('danError').textContent='開始できませんでした：'+e.message;
      if(danRun)exitDan();
    }finally{
      loading=false;$('danPlayAuto').disabled=false;$('danPlay').disabled=false;$('danClose').disabled=false;
    }
  };

  async function showNextDanTitle(run,index){
    const entry=run.config.songs[index],title=entry.chart.meta.TITLE||'無題',overlay=$('overlay');
    state='dan-break';$('pause').disabled=true;
    const heading=danNode('h2',title,'dan-next-title');
    const detail=danNode('p',(index+1)+'曲目を読み込み中…','dan-next-loading');
    overlay.replaceChildren(heading,detail);overlay.style.display='flex';overlay.style.opacity='1';
    $('status').textContent='次の曲を読み込み中…';
    return {overlay,detail};
  }

  async function fadeOutNextDanTitle(view){
    await waitDanVisible();
    const animation=view.overlay.animate([{opacity:1},{opacity:0}],{duration:650,easing:'ease-in-out',fill:'forwards'});
    try{await animation.finished}catch{}
    animation.cancel();view.overlay.style.opacity='';view.overlay.style.display='none';
  }

  queueDanNext=async function(){
    if(danTransitionBusy||!danRun||state!=='dan-break')return;
    danTransitionBusy=true;const run=danRun,nextIndex=run.index+1;
    try{
      await waitDanVisible();
      if(danRun!==run||run.finished||nextIndex>=run.config.songs.length)return;
      const view=await showNextDanTitle(run,nextIndex);
      await prepareDanSongAssets(run,nextIndex);
      if(danRun!==run||run.finished)return;
      view.detail.textContent='準備完了';
      await fadeOutNextDanTitle(view);
      if(danRun!==run||run.finished)return;
      run.index=nextIndex;
      await beginDanSong(false);
    }catch(e){
      if(danRun===run&&!run.finished){
        $('status').textContent='次の曲を読み込めませんでした';
        $('overlay').replaceChildren(danNode('h2','読み込みエラー'),danNode('p',e.message));
        $('overlay').style.opacity='1';$('overlay').style.display='flex';
      }
    }finally{
      if(danRun===run)danTransitionBusy=false;
    }
  };

  // Keep a reference for debugging/rollback from the console if necessary.
  window.__donBeatOriginalLaunchDan=originalLaunchDan;
})();
