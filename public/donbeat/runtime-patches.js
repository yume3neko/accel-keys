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

})();
