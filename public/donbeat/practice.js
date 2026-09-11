'use strict';
function practicePlan(chart,target,automatic){
 const measures=chart.measures||[];
 let index=0;for(let i=0;i<measures.length;i++){if(measures[i].time<=target)index=i;else break}
 let lead=target;
 if(!automatic&&measures.length){const current=measures[index],prior=measures[Math.max(0,index-2)];const fraction=Math.max(0,Math.min(1,(target-current.time)/Math.max(.000001,current.end-current.time)));lead=prior.time+fraction*(prior.end-prior.time);if(index<2)lead=measures[0].time}
 return {target,lead:Math.min(target,lead),index};
}
let seekTarget=0;
function openSeek(){
 if(loading||importing||danRun||state==='playing'||state==='paused'||(!demoMode&&!audioBuffer))return;
 const input=$('seekSeconds');input.min=Math.min(0,chart.measures?.[0]?.time||0);input.max=Math.max(Number(input.min),chart.duration-.001);
 seekTarget=Math.max(Number(input.min),Math.min(Number(input.max),seekTarget));input.value=seekTarget.toFixed(2);$('seekError').textContent='';
 $('seekHint').textContent=false?'オート：指定位置までの通常音符を全良として集計して開始します。':'手動：2小節前から助走し、コンボ0で開始。オート：指定位置まで全良として開始します。';
 $('seekDialog').showModal();renderSeek();locateSeek();
}
function seekInput(){const value=Number($('seekSeconds').value);if($('seekSeconds').value===''||!Number.isFinite(value)||value<Number($('seekSeconds').min)||value>Number($('seekSeconds').max)){$('seekError').textContent='指定できる範囲の秒数を入力してください。';return false}seekTarget=value;$('seekError').textContent='';const plan=practicePlan(chart,seekTarget,false);$('seekLocation').textContent=`第${plan.index+1}小節付近 · ${seekTarget.toFixed(2)}秒`;renderSeek();return true}
function locateSeek(){if(!seekInput())return;const rowHeight=$('seekChart').clientHeight/3;const plan=practicePlan(chart,seekTarget,false);$('seekChart').scrollTop=Math.floor(plan.index/2)*rowHeight;renderSeek()}
function renderSeek(){
 const viewport=$('seekChart'),measures=chart.measures||[],rowHeight=viewport.clientHeight/3||86,total=Math.ceil(measures.length/2);let inner=viewport.firstElementChild;if(!inner){inner=document.createElement('div');inner.style.position='relative';viewport.append(inner)}inner.style.height=(total*rowHeight)+'px';inner.replaceChildren();const begin=Math.max(0,Math.floor(viewport.scrollTop/rowHeight));
 for(let row=begin;row<Math.min(total,begin+4);row++){
  const wrapper=document.createElement('div');wrapper.className='seek-row';Object.assign(wrapper.style,{position:'absolute',top:(row*rowHeight)+'px',width:'100%',height:rowHeight+'px'});const surface=document.createElement('canvas');surface.style.height=rowHeight+'px';surface.setAttribute('aria-label',`第${row*2+1}〜${Math.min(row*2+2,measures.length)}小節`);wrapper.append(surface);inner.append(wrapper);
  const w=viewport.clientWidth,h=rowHeight,dpr=Math.min(devicePixelRatio||1,2);surface.width=w*dpr;surface.height=h*dpr;const c=surface.getContext('2d');c.scale(dpr,dpr);c.fillStyle='#141b24';c.fillRect(0,0,w,h);const margin=18,half=(w-margin*2)/2,y=h*.64,r=h<70?6:8;
  for(let side=0;side<2;side++){
   const mi=row*2+side,m=measures[mi];if(!m)continue;const left=margin+side*half,span=Math.max(.000001,m.end-m.time);const x=t=>left+(t-m.time)/span*half;
   c.save();c.beginPath();c.rect(left,0,half,h);c.clip();c.strokeStyle='#647183';c.lineWidth=1;for(let beat=0;beat<=4;beat++){const px=left+half*beat/4;c.beginPath();c.moveTo(px,y-16);c.lineTo(px,y+16);c.stroke()}for(const dy of [-16,16]){c.beginPath();c.moveTo(left,y+dy);c.lineTo(left+half,y+dy);c.stroke()}
   c.fillStyle='#c8d1dd';c.font='12px sans-serif';c.fillText(`${mi+1}  ·  ${m.time.toFixed(1)}s`,left+4,15);
   for(const n of chart.notes){if(n.time>=m.end||(n.end??n.time)<m.time)continue;const px=x(n.time),radius=n.type===3||n.type===4||n.type===6?r*1.3:r;
    if(n.type>=5){c.strokeStyle='#efc255';c.lineWidth=radius*1.5;c.lineCap='round';c.beginPath();c.moveTo(Math.max(left,px),y);c.lineTo(Math.min(left+half,x(n.end)),y);c.stroke()}
    if(n.time<m.time)continue;c.fillStyle=n.type>=5?'#efc255':n.type===1||n.type===3?'#fa725a':'#5dc5e3';c.strokeStyle='#f5eee0';c.lineWidth=1.2;c.beginPath();c.arc(px,y,radius,0,Math.PI*2);c.fill();c.stroke();
   }
   if(seekTarget>=m.time&&seekTarget<m.end){const selected=x(seekTarget);c.fillStyle='#ffd56520';c.fillRect(left,0,half,h);c.strokeStyle='#ffe298';c.lineWidth=2;c.beginPath();c.moveTo(selected,20);c.lineTo(selected,h);c.stroke()}
   c.restore();c.strokeStyle='#e0e6ec';c.beginPath();c.moveTo(left,y-19);c.lineTo(left,y+19);c.stroke();
  }
  let down=null;surface.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY}});surface.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>8)return;const px=e.clientX-surface.getBoundingClientRect().left,side=Math.max(0,Math.min(1,Math.floor((px-margin)/half))),m=measures[row*2+side];if(!m)return;const fraction=Math.max(0,Math.min(.999999,(px-margin-side*half)/half));let selected=m.time+fraction*(m.end-m.time);const nearest=chart.notes.filter(n=>n.time>=m.time&&n.time<m.end).reduce((best,n)=>!best||Math.abs(n.time-selected)<Math.abs(best.time-selected)?n:best,null);if(nearest&&Math.abs(nearest.time-selected)/(m.end-m.time)*half<=10)selected=nearest.time;seekTarget=Math.min(Number($('seekSeconds').max),selected);$('seekSeconds').value=String(seekTarget);seekInput()});
 }
}
function initPractice(){
 $('seekClose').onclick=()=>$('seekDialog').close();$('seekSeconds').oninput=seekInput;$('seekLocate').onclick=locateSeek;$('seekChart').addEventListener('scroll',renderSeek,{passive:true});
 $('seekPlayAuto').onclick=()=>{if(!seekInput())return;$('seekDialog').close();start({target:seekTarget,auto:true})};$('seekPlay').onclick=()=>{if(!seekInput())return;$('seekDialog').close();start({target:seekTarget})};
 window.addEventListener('resize',()=>{if($('seekDialog').open)renderSeek()});
}
