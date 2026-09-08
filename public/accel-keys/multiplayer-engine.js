// Shared deterministic chart: hit times do not depend on screen size or frame rate.
export function bpm(mode, elapsed) {
  if (mode === 'cosmos') return 90 + Math.floor(Math.max(0, elapsed) / 4000) * 6;
  const speed = Math.floor((1 + Math.max(0, elapsed) / 30000) * 10 + 1e-6) / 10;
  if (speed <= 4) return 60000 / [1050,900,760,640,530,440,360][Math.min(6, Math.floor((speed-1)/.5))];
  if (speed <= 6) return 60000/360;
  if (speed >= 8.1) return 60000/140 + (1+Math.floor((speed-8.1)/.5+1e-6))*30;
  return 60000/[290,230,180,140][Math.max(0,Math.min(3,Math.floor((speed-6.1)/.5)))];
}
export function multiplier(mode, elapsed) {
  const value = Math.floor((1+Math.max(0,elapsed)/30000)*10+1e-6)/10;
  return mode === 'cosmos' ? value : Math.min(8,value);
}
export function makeChart(mode, seed, saved = null) {
  let state=seed>>>0, index=0, previous=-1, time=0, progress=0;
  if(saved)({state,index,previous,time,progress}=saved);
  function random(){state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;}
  return {
    save(){return {state,index,previous,time,progress};},
    next(){
      // Integrate across density boundaries, preserving fractional notes.
      const step=mode==='cosmos'?4000:3000;
      for(;;){
        const boundary=(Math.floor(time/step)+1)*step;
        const rate=bpm(mode,time)/60000;
        const needed=(1-progress)/rate;
        if(time+needed<=boundary+1e-7){time=Math.min(time+needed,boundary);progress=0;break;}
        progress+=(boundary-time)*rate;time=boundary;
      }
      let lane;
      if(mode==='cosmos')lane=[3,1,2,0][index%4];
      else {lane=Math.floor(random()*4);if(lane===previous)lane=(lane+1+Math.floor(random()*3))%4;}
      previous=lane;
      return {id:++index,lane,at:2500+time};
    }
  };
}


