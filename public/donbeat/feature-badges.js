'use strict';

(function(){
  const baseChartFeatures=chartFeatures;
  const baseRenderSongSelection=renderSongSelection;

  const finite=value=>{
    const n=Number(value);
    return Number.isFinite(n)?n:null;
  };

  function judgedNotes(c){
    return (c.notes||[]).filter(n=>(n.type>=1&&n.type<=7)||n.type===9||n.type===10);
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
        const red=scroll!==1||effective<0;
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
    return badge;
  }

  const branchNames={N:'普通',E:'玄人',M:'達人'};
  function openBranchMenu(c){
    let dialog=document.getElementById('branchForceDialog');
    if(!dialog){
      dialog=document.createElement('dialog');dialog.id='branchForceDialog';dialog.className='branch-force-dialog';
      document.body.append(dialog);
    }
    const current=['N','E','M','random'].includes(c._branchForce)?c._branchForce:'auto';
    dialog.replaceChildren();
    const heading=document.createElement('h3');heading.textContent='譜面分岐モード';
    const note=document.createElement('p');note.textContent='「ランダム」は到達可能な分岐先だけを抽選します。強制分岐とLEVELHOLDは譜面指定を優先します。';
    const options=document.createElement('div');options.className='branch-force-options';
    for(const [value,label] of [['auto','自動判定'],['random','ランダム'],['N','普通'],['E','玄人'],['M','達人']]){
      const button=document.createElement('button');button.type='button';button.textContent=(current===value?'✓ ':'')+label;
      if(current===value)button.className='primary';
      button.onclick=()=>{
        c._branchForce=value==='auto'?null:value;
        if(c===chart)chart._branchForce=c._branchForce;
        dialog.close();
        renderSongSelection();
      };
      options.append(button);
    }
    const close=document.createElement('button');close.type='button';close.textContent='閉じる';close.onclick=()=>dialog.close();
    dialog.append(heading,note,options,close);
    dialog.showModal();
  }

  function optionCheck(labelText,checked,onchange){
    const label=document.createElement('label');label.className='song-feature-option';
    const input=document.createElement('input');input.type='checkbox';input.checked=checked;input.onchange=()=>onchange(input.checked);
    label.append(input,document.createTextNode(' '+labelText));return label;
  }

  function injectSongOptions(){
    document.querySelectorAll('.song-choice-panel:not([hidden])').forEach(panel=>{
      if(panel.querySelector('.song-feature-options'))return;
      const select=panel.querySelector('select');
      const index=Number(select?.value);
      const c=Number.isInteger(index)?charts[index]:null;
      if(!c)return;
      const flags=chartFeatures(c),options=document.createElement('div');options.className='song-feature-options';
      if(flags.mv)options.append(optionCheck('MVを有効',c._mvEnabled!==false,enabled=>{
        c._mvEnabled=enabled;
        if(c===chart){chart._mvEnabled=enabled;syncMV()}
      }));
      if(flags.fadeout)options.append(optionCheck('フェードアウトを有効',c._fadeEnabled!==false,enabled=>{
        c._fadeEnabled=enabled;
        if(c===chart)chart._fadeEnabled=enabled;
      }));
      if(!options.children.length)return;
      const badges=panel.querySelector('.feature-badges');
      if(badges)badges.insertAdjacentElement('afterend',options);else panel.prepend(options);
    });
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
    if(flags.some(f=>f.branch)){
      const c=list.length===1?list[0]:null,forced=c&&['N','E','M'].includes(c._branchForce)?c._branchForce:null,random=c?._branchForce==='random';
      const label=forced?'譜面分岐あり（'+branchNames[forced]+'固定）':random?'譜面分岐あり（ランダム）':'譜面分岐あり';
      const badge=addBadge(box,'branch','⑂',label,random?'クリックしてランダム設定を変更':forced?'クリックして固定先を変更':'クリックして分岐モードを変更');
      if(c){badge.classList.add('interactive');badge.setAttribute('role','button');badge.tabIndex=0;
        const open=e=>{e.preventDefault();e.stopPropagation();openBranchMenu(c)};
        badge.onclick=open;badge.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){open(e)}};
      }
    }
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
    injectSongOptions();
  };

  const style=document.createElement('style');
  style.textContent=`
    .song-choice-title>.feature-badges{display:none!important}
    .song-choice-panel>.feature-badges{display:flex;margin:10px 0 4px}
    .feature-badge.badge-yellow{border-color:#cfaa50;color:#ffdc86;background:#3a311c}
    .feature-badge.badge-red{border-color:#e66b72;color:#ffadb2;background:#48232b}
    .feature-badge.badge-purple{border-color:#a86de8;color:#e2c1ff;background:#38264d}
    .feature-badge.soflan.scroll-on-notes,.feature-badge.fadeout.fade-on-notes{border-color:inherit;color:inherit;background:inherit}
    .feature-badge.interactive{cursor:pointer;user-select:none}
    .feature-badge.interactive:focus-visible{outline:2px solid currentColor;outline-offset:2px}
    .song-feature-options{display:flex;flex-wrap:wrap;gap:10px 16px;margin:8px 0 10px;padding:9px 11px;border:1px solid #343a43;border-radius:8px;background:#12171d}
    .song-feature-option{display:flex;align-items:center;gap:5px;cursor:pointer;font-size:.9rem}
    .song-feature-option input{width:18px;height:18px}
    .branch-force-dialog{max-width:min(92vw,430px)}
    .branch-force-dialog .branch-force-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:14px 0}
  `;
  document.head.append(style);

  try{renderSongSelection()}catch{}
})();
