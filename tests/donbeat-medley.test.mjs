import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const root=new URL('../public/donbeat/',import.meta.url);
const read=name=>readFileSync(new URL(name,root),'utf8');
function env(){
 const c=vm.createContext({console,setTimeout,clearTimeout});
 for(const name of ['tja.js','malody.js','dan.js','medley.js'])vm.runInContext(read(name),c);
 vm.runInContext(`let chart,notes=[],score=0,good=0,ok=0,miss=0,rolls=0,maxCombo=0,combo=0,soul=0,balloonRolls=0,balloonPops=0,activeSongRate=1,startAt=100,now=0;function time(){return now}function judgmentOffsetSeconds(){return 0}function soulNoteCount(){return notes.filter(n=>n.type<=4).length||1}function judgmentWindows(n){return {good:.025,ok:.075,miss:.109}}`,c);
 return c;
}
const plain={meta:{TITLE:'A',LEVEL:'8'},bpm:120,duration:4,notes:[{time:0,type:1,bpm:120,scroll:1},{time:1,type:2,bpm:120,scroll:1},{time:2,type:1,bpm:120,scroll:1},{time:3,type:2,bpm:120,scroll:1}],measures:[{time:0,end:2},{time:2,end:4}],bars:[],beats:[]};
function install(c,specs=[{range:[0,2]},{range:[1,3]}]){
 c.entries=[{chart:structuredClone(plain)},{chart:{...structuredClone(plain),meta:{TITLE:'B',LEVEL:'3'}}}];c.specs=specs;
 vm.runInContext(`const built=buildMedley(entries,specs);chart=built.chart;notes=chart.notes.map(n=>({...n,done:false,hits:0}));danRun={index:0,config:{songs:built.segments.map(s=>({chart:s.chart})),conditions:[],gauge:0,goldGauge:100,auto:false},medley:{...built,stats:built.segments.map(medleyEmptyStats)},results:[]}`,c);
}
test('mode defaults, quoted titles, ranges and invalid configuration',()=>{
 const c=env();c.config='TITLE:test\nMODE:MEDLEY\nSONG1:"A,B",3\nRANGE1:1.25,5\nSONG2:B\nMEASURES2:2,5\nEXAM1:80,100';
 assert.equal(vm.runInContext('parseDanConfig(config).mode',c),'MEDLEY');
 assert.equal(vm.runInContext('parseDanConfig(config).songs[0].chart',c),'A,B');
 for(const change of [x=>x.replace('MEDLEY','x'),x=>x.replace('MEDLEY','NORMAL'),x=>x.replace('1.25,5','5,1'),x=>x.replace('2,5','1.2,5'),x=>x+'\nRANGE9:1,5',x=>x+'\nMEASURES1:1,3']){c.bad=change(c.config);assert.throws(()=>vm.runInContext('parseDanConfig(bad)',c));}
 c.normal='TITLE:test\nSONG1:A,3\nEXAM1:80,100';assert.equal(vm.runInContext('parseDanConfig(normal).mode',c),'NORMAL');
});
test('contiguous timeline, exclusive end, no original mutation and next note preview',()=>{
 const c=env();install(c);
 assert.equal(vm.runInContext('chart.duration',c),5);
 assert.equal(vm.runInContext('JSON.stringify(notes.map(n=>[n.time,n.medleyIndex]))',c),'[[0,0],[1,0],[2,1],[3,1],[4,1]]');
 assert.equal(vm.runInContext('entries[1].chart.notes[1].time',c),1);
 assert.equal(vm.runInContext('medleyDistance(notes[2],1.5)',c),.5);
 assert.equal(vm.runInContext('medleyDistance(notes[2],2)',c),0);
});
test('TJA measures account for OFFSET, BPM changes and meter; clipped rolls',()=>{
 const c=env();c.tja='TITLE:A\nBPM:120\nOFFSET:1\nCOURSE:Oni\nLEVEL:8\n#START\n1000,\n#BPMCHANGE 240\n#MEASURE 3/4\n5000,\n0008,\n#END';
 vm.runInContext('const tc=parseTJA(tja).charts[0];const mb=buildMedley([{chart:tc}],[{measures:[2,3]}])',c);
 assert.equal(vm.runInContext('mb.segments[0].from',c),1);
 assert.equal(vm.runInContext('mb.chart.duration',c),1.5);
 assert.equal(vm.runInContext('mb.chart.notes[0].end',c),1.3125);
 assert.equal(vm.runInContext('mb.chart.motion[0].bpm',c),240);
 assert.throws(()=>vm.runInContext('medleyRange(tc,{measures:[1,99]})',c));
});
test('audio sources use shared clock, rate, offsets; resume skips completed songs',()=>{
 const c=env();install(c);const scheduled=[],stopped=[];
 c.musicGain={};c.audio=()=>({createBufferSource:()=>({playbackRate:{value:1},connect(){},start(...args){scheduled.push(args)},stop(){stopped.push(1)},disconnect(){}})});
 vm.runInContext('for(const s of danRun.medley.segments)s.buffer={duration:4};activeSongRate=2;scheduleMedleyAudio(-4)',c);
 assert.deepEqual(scheduled,[[100,0,2],[101,1,3]]);
 vm.runInContext('stopMedleyAudio();scheduleMedleyAudio(2.5)',c);
 assert.equal(stopped.length,2);assert.deepEqual(scheduled[2],[101.25,1.5,2.5]);
});
test('late previous-song and early next-song hits retain original stats and thresholds',()=>{
 const c=env();install(c);
 vm.runInContext('danRun.index=1;const before=danStats();good++;score+=100;combo++;maxCombo=combo;medleyRecord(notes[1],before,0)',c);
 assert.equal(vm.runInContext('danRun.medley.stats[0].good',c),1);
 assert.equal(vm.runInContext('danRun.medley.stats[1].good',c),0);
 assert.equal(vm.runInContext('medleySourceChart(notes[1]).meta.LEVEL',c),'8');
 vm.runInContext('danRun.index=0;const before2=danStats();good++;score+=100;combo++;maxCombo=combo;medleyRecord(notes[2],before2,0)',c);
 assert.equal(vm.runInContext('danRun.medley.stats[1].good',c),1);
 assert.equal(vm.runInContext('maxCombo',c),2);
});
test('impossible per-song minimum and total maximum fail; future notes stay reachable',()=>{
 const c=env();install(c);
 vm.runInContext("danRun.config.conditions=[{scope:'song',type:'good',red:[2,2],gold:[2,2],ops:['m','m']}]",c);
 assert.equal(vm.runInContext('medleyFailed()',c),false);
 vm.runInContext('notes[0].done=true;miss++;danRun.medley.stats[0].miss++',c);
 assert.equal(vm.runInContext('medleyFailed()',c),true);
 vm.runInContext("danRun.config.conditions=[{scope:'total',type:'miss',red:[1],gold:[1],ops:['l']}]",c);
 assert.equal(vm.runInContext('medleyFailed()',c),true);
});
test('untrimmed final MC-style note at duration is preserved',()=>{
 const c=env();c.c={...structuredClone(plain),duration:3};
 assert.equal(vm.runInContext('buildMedley([{chart:c}],[{}]).chart.notes.length',c),4);
});
test('last song ignores RANGE end, retaining its remaining notes and full audio tail',()=>{
 const c=env();c.first={...structuredClone(plain),preloadedAudio:{duration:4}};
 c.last={...structuredClone(plain),preloadedAudio:{duration:6}};
 vm.runInContext('const full=buildMedley([{chart:first},{chart:last}],[{range:[0,2]},{range:[1,2]}]);const longEnd=buildMedley([{chart:last}],[{range:[1,999]}])',c);
 assert.equal(vm.runInContext('full.segments[0].to',c),2);
 assert.equal(vm.runInContext('full.segments[1].from',c),1);
 assert.equal(vm.runInContext('full.segments[1].to',c),6);
 assert.equal(vm.runInContext('full.chart.duration',c),7);
 assert.equal(vm.runInContext('longEnd.chart.duration',c),5);
 assert.equal(vm.runInContext('JSON.stringify(full.chart.notes.map(n=>[n.time,n.medleyIndex]))',c),'[[0,0],[1,0],[2,1],[3,1],[4,1]]');
 c.musicGain={};const scheduled=[];c.audio=()=>({createBufferSource:()=>({playbackRate:{value:1},connect(){},start(...args){scheduled.push(args)},stop(){},disconnect(){}})});
 vm.runInContext('danRun={medley:full};activeSongRate=1;for(const s of full.segments)s.buffer={duration:s.original.preloadedAudio.duration};scheduleMedleyAudio(0)',c);
 assert.deepEqual(scheduled,[[100,0,2],[102,1,5]]);
});
test('last song ignores MEASURES end, including when it is the only song',()=>{
 const c=env();c.first=structuredClone(plain);c.last=structuredClone(plain);
 vm.runInContext('const byMeasure=buildMedley([{chart:first},{chart:last}],[{measures:[1,2]},{measures:[2,3]}]);const alone=buildMedley([{chart:last}],[{measures:[1,2]}]);const longEnd=buildMedley([{chart:last}],[{measures:[1,999]}])',c);
 assert.equal(vm.runInContext('byMeasure.segments[0].end',c),2);
 assert.equal(vm.runInContext('byMeasure.segments[1].to',c),4);
 assert.equal(vm.runInContext('alone.chart.duration',c),4);
 assert.equal(vm.runInContext('longEnd.chart.duration',c),4);
 assert.equal(vm.runInContext('alone.chart.notes.length',c),4);
});

// Run the actual engine lifecycle with DOM/audio adapters. No browser timing
// or network is needed to test scoring, pause rewind and chart-clock boundaries.
function engineFunction(name){const code=read('app.js'),at=code.search(new RegExp('^(?:async )?function '+name+'\\(','m')),lineEnd=code.indexOf('\n',at),first=code.slice(at,lineEnd);return first.endsWith('}')?first:code.slice(at,code.indexOf('\n}',lineEnd)+2)}
function engine(c){
 vm.runInContext(`
 let state='ready',loading=false,importing=false,raf=0,auto=false,demoMode=false,practiceTarget=null,judgeFrom=-Infinity,pauseResumeUntil=-Infinity,pausedTime=0,feedback='',feedbackAt=0,beatIndex=0,audioBuffer=null,playbackVisualChart=null,branchChoices=[],branchScoreLog=[],branchRollLog=[],branchTransitions=[];
 const AUTO_ROLL_HZ=30,AUTO_BALLOON_MAX_HZ=60;
 const nodes=new Map();function $(id){if(!nodes.has(id))nodes.set(id,{value:id==='musicSpeed'?'1':'0',style:{},classList:{add(){},remove(){},toggle(){}},replaceChildren(){},append(){},setAttribute(){}});return nodes.get(id)}
 const document={body:{classList:{add(){},remove(){},toggle(){}}}},audioContext={currentTime:0,state:'running'},musicGain={};function audio(){return {...audioContext,resume:()=>Promise.resolve(),createBufferSource:()=>({playbackRate:{value:1},connect(){},start(){},stop(){},disconnect(){}})}}
 function cancelAnimationFrame(){}function requestAnimationFrame(){return 1}function desktopPlayMode(){return true}function updateDesktopPlayInfo(){}function clearScoreGains(){}function resetDummyPlayback(){}function resetHibiki(){}function setPauseIcon(){}function resize(){}function draw(){}function update(){}function updateDanHUD(){}function updateBranchRoute(){}function updateDummyPlayback(){}function pulseAutoPad(){}function tone(){}function showScoreGain(){}function stopAudio(){stopMedleyAudio()}function scheduleAudio(t){stopAudio();scheduleMedleyAudio(t)}function playbackAssetsAvailable(){return true}
 function finish(){state='done'}function time(){return state==='playing'?audioContext.currentTime-startAt:pausedTime}
 `,c);
 for(const name of ['judgmentWindows','judgeCore','judge','addRollHitsCore','addRollHits','autoBalloonHits','autoRollHits','songDuration','loop','start','pauseRewindTime','resumeFromPause'])vm.runInContext(engineFunction(name),c);
}
test('real engine autoplay carries combo and records both songs, rolls, pause without double counts',async()=>{
 const c=env();install(c);engine(c);
 vm.runInContext('danRun.config.auto=true',c);
 await vm.runInContext('start({dan:true,seamless:true})',c);
 assert.equal(vm.runInContext('state',c),'playing');
 vm.runInContext('audioContext.currentTime=startAt+1.01;loop()',c);
 assert.equal(vm.runInContext('good',c),2);
 vm.runInContext("pausedTime=time();state='paused';stopAudio()",c);
 vm.runInContext('resumeFromPause()',c);await new Promise(resolve=>setImmediate(resolve));
 vm.runInContext('audioContext.currentTime=startAt+.5;loop()',c);
 assert.equal(vm.runInContext('good',c),2);
 vm.runInContext('audioContext.currentTime=startAt+3.1;loop()',c);
 assert.equal(vm.runInContext('good',c),4);assert.equal(vm.runInContext('combo',c),4);
 assert.equal(vm.runInContext('JSON.stringify(danRun.medley.stats.map(s=>[s.good,s.maxCombo]))',c),'[[2,2],[2,2]]');
 vm.runInContext('audioContext.currentTime=startAt+5.2;loop()',c);assert.equal(vm.runInContext('state',c),'done');
});
test('real judge uses note difficulty across transition and attributes balloon hits',()=>{
 const c=env();install(c);engine(c);
 vm.runInContext('danRun.index=1;chart.meta.LEVEL=3;judgeCore(notes[1],.09)',c);
 assert.equal(vm.runInContext('miss',c),1); // Expert chart .075 ok window, not Easy .108442.
 vm.runInContext('const balloon={medleyIndex:1,time:2,end:3,type:7,hits:0,required:5};addRollHits(balloon,5)',c);
 assert.equal(vm.runInContext('danRun.medley.stats[1].rolls',c),5);
 assert.equal(vm.runInContext('danRun.medley.stats[1].balloonPops',c),1);
});
