'use strict';

(function(){
  const baseChartFeatures=chartFeatures;
  const baseRenderSongSelection=renderSongSelection;

  const finite=value=>{
    const n=Number(value);
    return Number.isFinite(n)?n:null;
  };

  function judgedNotes(c){
    return (c.notes||[]).filter(n=>(n.type>=1&&n.type<=7)||n.type===9);
  }

  function overlapsNotes(notes,start,end){
    return notes.some(n=>{
      const noteStart=finite(n.time);
      const noteEnd=finite(n.end)??noteStart;
      return noteStart!==null&&noteStart<end&&noteEnd>=start;
    });
  }

  function speedLevel(c){
    const notes=judgedNotes(c);
    const baseBpm=finite(c.bpm);
    const events=(c.visual?.length?c.visual:c.motion)||[];
    let level=0;

    if(events.length){
      for(let i=0;i<events.length;i++){
        const e=events[i],next=events[i+1];
        const start=finite(e.time)??-Infinity;
        const end=next?(finite(next.time)??Infinity):Infinity;
        const bpm=finite(e.bpm)??baseBpm;
        const scroll=finite(e.scroll)??1;
        const hs=finite(e.hs)??1;
        const effective=scroll*hs;

        // #ABSCROLL / Malody scroll effects are the scroll-gimmick family.
        // Negative effective speed is also treated as the red family.
        const red=!!c.features?.hbscroll||c._tja?.scrollMode==='hb'||scroll!==1||effective<0;
        // BPM changes and ordinary forward #SCROLL / hs changes are yellow.
        const yellow=(baseBpm!==null&&bpm!==null&&bpm!==baseBpm)||(hs!==1&&effective>=0);

        if(red){
          level=Math.max(level,2);
          if(end>start&&overlapsNotes(notes,start,end))level=3;
        }else if(yellow){
          level=Math.max(level,1);
        }
      }
    }else{
      // Placeholder/server metadata fallback. The fully loaded chart is
      // recalculated from its timeline before the expanded panel settles.
      if(c.features?.reverseScroll)level=2;
      else if(c.features?.soflan)level=1;
    }
    return level;
  }

  function fadeTargets(e){
    return e.mode==='all'?['info','lane','note','button']:[e.mode];
  }

  function fadeLevel(c){
    const fades=[...(c.fades||[])].sort((a,b)=>a.time-b.time);
    if(!fades.length){
      if(c.features?.fadeout)return c.features?.fadeOnNotes?2:1;
      return 0;
    }
    const notes=judgedNotes(c);
    let level=0;
    for(let i=0;i<fades.length;i++){
      const e=fades[i];
      if(e.direction!==0)continue;
      level=Math.max(level,1);
      for(const target of fadeTargets(e)){
        const restore=fades.slice(i+1).find(f=>f.direction===1&&fadeTargets(f).includes(target));
        const start=finite(e.time)??-Infinity;
        const end=restore?(finite(restore.end)??finite(restore.time)??Infinity):Infinity;
        if(overlapsNotes(notes,start,end)){level=2;break}
      }
      if(level===2)break;
    }
    return level;
  }

  chartFeatures=function(c){
    const result=baseChartFeatures(c);
    const soflanLevel=speedLevel(c),fadeoutLevel=fadeLevel(c);
    result.soflanLevel=soflanLevel;
    result.soflan=soflanLevel>0;
    result.fadeoutLevel=fadeoutLevel;
    result.fadeout=fadeoutLevel>0;
    result.fadeOnNotes=fadeoutLevel===2;
    return result;
  };

  function addBadge(box,klass,icon,label,title){
    const badge=document.createElement('span');
    badge.className='feature-badge '+klass;
    badge.textContent=icon+' '+label;
    badge.title=title||label;
    badge.setAttribute('aria-label',title||label);
    box.append(badge);
  }

  featureBadges=function(list){
    const box=document.createElement('span');box.className='feature-badges';
    if(list.some(c=>c?.serverPlaceholder))return box;
    const flags=list.map(chartFeatures);
    const soflan=Math.max(0,...flags.map(f=>f.soflanLevel||0));
    const fade=Math.max(0,...flags.map(f=>f.fadeoutLevel||0));

    if(soflan===1)addBadge(box,'soflan badge-yellow','↔','ソフランあり','BPM変動・正方向のスクロール変速あり');
    if(soflan===2)addBadge(box,'soflan badge-red','↔','ソフランあり','スクロールギミック・逆走スクロールあり');
    if(soflan===3)addBadge(box,'soflan badge-purple','↔','ソフランあり','判定ノーツ区間にスクロールギミック・逆走あり');

    if(flags.some(f=>f.scrollStop))addBadge(box,'scrollStop','⏸','譜面停止あり');
    if(flags.some(f=>f.reverseScroll))addBadge(box,'reverseScroll','↶','逆走あり');
    if(flags.some(f=>f.branch))addBadge(box,'branch','⑂','譜面分岐あり');
    if(flags.some(f=>f.dummy))addBadge(box,'dummy','◇','ダミーノーツあり');
    if(flags.some(f=>f.damage))addBadge(box,'damage','⚠','ダメージノーツあり');

    if(fade===1)addBadge(box,'fadeout badge-yellow','◐','フェードアウトあり','ノーツがない区間にフェードアウトあり');
    if(fade===2)addBadge(box,'fadeout badge-purple','◐','フェードアウトあり','判定ノーツ区間にフェードアウトあり');

    if(flags.some(f=>f.mv))addBadge(box,'mv','▶','MV付き');
    return box;
  };

  // Keep every badge inside the expanded song information panel. The base
  // renderer also creates a summary badge set in the collapsed title; remove it.
  renderSongSelection=function(){
    baseRenderSongSelection();
    document.querySelectorAll('.song-choice-title > .feature-badges').forEach(n=>n.remove());
    document.querySelectorAll('.song-choice-panel > .feature-badges:empty').forEach(n=>n.remove());
  };

  const style=document.createElement('style');
  style.textContent=`
    .song-choice-title>.feature-badges{display:none!important}
    .song-choice-panel>.feature-badges{display:flex;margin:10px 0 4px}
    .feature-badge.badge-yellow{border-color:#cfaa50;color:#ffdc86;background:#3a311c}
    .feature-badge.badge-red{border-color:#e66b72;color:#ffadb2;background:#48232b}
    .feature-badge.badge-purple{border-color:#a86de8;color:#e2c1ff;background:#38264d}
    .feature-badge.soflan.scroll-on-notes,.feature-badge.fadeout.fade-on-notes{border-color:inherit;color:inherit;background:inherit}
  `;
  document.head.append(style);

  try{renderSongSelection()}catch{}
})();
