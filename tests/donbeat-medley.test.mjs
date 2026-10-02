import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const root=new URL('../public/donbeat/',import.meta.url);
const read=name=>readFileSync(new URL(name,root),'utf8');
function env(){
 const c=vm.createContext({console,setTimeout,clearTimeout,structuredClone,plain});
 for(const name of ['tja.js','malody.js','dan.js','medley.js','medley-tools.js'])vm.runInContext(read(name),c);
 vm.runInContext(`let chart,notes=[],score=0,good=0,ok=0,miss=0,rolls=0,maxCombo=0,combo=0,soul=0,balloonRolls=0,balloonPops=0,activeSongRate=1,startAt=100,now=0;function time(){return now}function judgmentOffsetSeconds(){return 0}function soulNoteCount(){return notes.filter(n=>n.type<=4).length||1}function judgmentWindows(n){return {good:.025,ok:.075,miss:.109}}`,c);
 return c;
}
const plain={meta:{TITLE:'A',LEVEL:'8'},bpm:120,duration:4,notes:[{time:0,type:1,bpm:120,scroll:1},{time:1,type:2,bpm:120,scroll:1},{time:2,type:1,bpm:120,scroll:1},{time:3,type:2,bpm:120,scroll:1}],measures:[{time:0,end:2},{time:2,end:4}],bars:[],beats:[]};
function install(c,specs=[{range:[0,2]},{range:[1,3]}]){
 c.entries=[{chart:structuredClone(plain)},{chart:{...structuredClone(plain),meta:{TITLE:'B',LEVEL:'3'}}}];c.specs=specs;
 vm.runInContext(`const built=buildMedley(entries,specs);chart=built.chart;notes=chart.notes.map(n=>({...n,done:false,hits:0}));danRun={index:0,config:{songs:built.segments.map(s=>({chart:s.chart})),conditions:[],gauge:0,goldGauge:100,auto:false},medley:{...built,stats:built.segments.map(medleyEmptyStats)},results:[]}`,c);
}
function danMatchingEnv(){
 const c=env();
 vm.runInContext("function normalizedPath(s){return s.normalize('NFC').toLowerCase()}function playbackAssetsAvailable(){return true}",c);
 return c;
}
test('mixed local dan upload searches only its own charts, not R2 or earlier uploads',()=>{
 const c=danMatchingEnv();
 c.setting={name:'course.dan'};c.chartFile={name:'Same.tja'};c.audioFile={name:'music.ogg'};
 c.local={...structuredClone(plain),sourcePath:'pack/Same.tja',importName:'course-pack.zip',meta:{TITLE:'Same',COURSE:'Oni'}};
 c.remote={...structuredClone(plain),sourcePath:'r2/Same.tja',importName:'course-pack.zip',serverEntry:{file:'r2/Same.tja'},meta:{TITLE:'Same',COURSE:'Oni'}};
 c.previous={...structuredClone(plain),sourcePath:'older/Same.tja',meta:{TITLE:'Same',COURSE:'Oni'}};
 vm.runInContext("pendingDan={config:parseDanConfig('TITLE:Course\\nSONG1:Same,3\\nEXAM1:80,100'),path:'pack/course.dan',localOnly:danHasLocalAssets([setting,chartFile,audioFile],setting),localCharts:new Set()};danPool.push({chart:remote},{chart:previous},{chart:local});rememberDanImportedCharts([local],pendingDan)",c);
 assert.equal(vm.runInContext('pendingDan.localOnly',c),true);
 assert.equal(vm.runInContext('danCandidateCharts().length',c),1);
 assert.equal(vm.runInContext('resolveDanConfig(true).songs[0].chart===local',c),true);
 assert.equal(vm.runInContext("pendingDan.config.songs[0].chart='r2/Same.tja';(()=>{try{resolveDanConfig(true);return false}catch(e){return /ローカル譜面/.test(e.message)}})()",c),true);
});
test('local upload scope activates for charts or media but not dan-only or README',()=>{
 const c=danMatchingEnv();c.setting={name:'course.dan'};
 for(const name of ['a.tja','a.MC','audio.ogg','image.webp','video.mp4']){
  c.extra={name};
  assert.equal(vm.runInContext('danHasLocalAssets([setting,extra],setting)',c),true,name);
 }
 assert.equal(vm.runInContext('danHasLocalAssets([setting],setting)',c),false);
 c.extra={name:'README.txt'};
 assert.equal(vm.runInContext('danHasLocalAssets([setting,extra],setting)',c),false);
});
test('missing bundled song never falls back to a remote chart with the same title',()=>{
 const c=danMatchingEnv();
 c.local={...structuredClone(plain),sourcePath:'pack/Other.tja',meta:{TITLE:'Other',COURSE:'Oni'}};
 c.remote={...structuredClone(plain),sourcePath:'r2/Missing.tja',serverEntry:{file:'r2/Missing.tja'},meta:{TITLE:'Missing',COURSE:'Oni'}};
 vm.runInContext("pendingDan={config:parseDanConfig('TITLE:Course\\nSONG1:Missing,3\\nEXAM1:80,100'),path:'pack/course.dan',localOnly:true,localCharts:new Set([local])};danPool.push({chart:local},{chart:remote})",c);
 assert.throws(()=>vm.runInContext('resolveDanConfig(true)',c),/一致するローカル譜面/);
 assert.equal(vm.runInContext('pendingDan.localCharts.size',c),1);
});
test('dan-only files retain catalog matching and local packages can receive additional charts',()=>{
 const c=danMatchingEnv();
 c.remote={...structuredClone(plain),sourcePath:'r2/R2.tja',serverEntry:{file:'r2/R2.tja'},meta:{TITLE:'R2',COURSE:'Oni'}};
 c.first={...structuredClone(plain),sourcePath:'pack/First.tja',meta:{TITLE:'First',COURSE:'Oni'}};
 c.later={...structuredClone(plain),sourcePath:'pack/Next.tja',meta:{TITLE:'Next',COURSE:'Oni'}};
 vm.runInContext("pendingDan={config:parseDanConfig('TITLE:Course\\nSONG1:R2,3\\nEXAM1:80,100'),path:'course.dan',localOnly:false,localCharts:new Set()};danPool.push({chart:remote},{chart:first},{chart:later})",c);
 assert.equal(vm.runInContext('resolveDanConfig(true).songs[0].chart===remote',c),true);
 vm.runInContext("pendingDan={config:parseDanConfig('TITLE:Course\\nSONG1:Next,3\\nEXAM1:80,100'),path:'pack/course.dan',localOnly:true,localCharts:new Set([first])}",c);
 assert.throws(()=>vm.runInContext('resolveDanConfig(true)',c),/一致するローカル譜面/);
 vm.runInContext('rememberDanImportedCharts([later])',c);
 assert.equal(vm.runInContext('resolveDanConfig(true).songs[0].chart===later',c),true);
});
test('bundled TJA retains difficulty matching with two charts in the same file',()=>{
 const c=danMatchingEnv();
 c.easy={...structuredClone(plain),sourcePath:'pack/Multi.tja',meta:{TITLE:'Multi',COURSE:'Easy'}};
 c.oni={...structuredClone(plain),sourcePath:'pack/Multi.tja',meta:{TITLE:'Multi',COURSE:'Oni'}};
 c.remote={...structuredClone(plain),sourcePath:'r2/Multi.tja',serverEntry:{file:'r2/Multi.tja'},meta:{TITLE:'Multi',COURSE:'Oni'}};
 vm.runInContext("pendingDan={config:parseDanConfig('TITLE:Course\\nSONG1:Multi,3\\nEXAM1:80,100'),path:'pack/course.dan',localOnly:true,localCharts:new Set()};danPool.push({chart:easy},{chart:oni},{chart:remote});rememberDanImportedCharts([easy,oni])",c);
 assert.equal(vm.runInContext('resolveDanConfig(true).songs[0].chart===oni',c),true);
});
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
test('seam guard removes overlapping TJA/MC fades and leaves remote effects alone',()=>{
 const c=env();
 c.previous={...structuredClone(plain),fades:[
  {time:.25,end:.75,direction:0,mode:'lane'},
  {time:1.8,end:2.7,direction:0,mode:'all'}
 ]};
 c.next={...structuredClone(plain),fades:[
  {time:1.2,end:1.8,direction:0,mode:'note'},
  {time:2.5,end:3,direction:1,mode:'note'}
 ]};
 vm.runInContext('const guarded=buildMedley([{chart:previous},{chart:next}],[{range:[0,2.5]},{range:[1,3]}]);danRun={medley:guarded}',c);
 assert.equal(vm.runInContext('JSON.stringify(guarded.segments[0].seamWindows)',c),'[[1.5,2.5]]');
 assert.equal(vm.runInContext('JSON.stringify(guarded.segments[1].seamWindows)',c),'[[1,2]]');
 assert.equal(vm.runInContext('JSON.stringify(guarded.segments.map(s=>s.safeFades.map(f=>f.time)))',c),'[[0.25],[2.5]]');
 assert.equal(vm.runInContext('medleySeamActive(2.25)',c),true);
 assert.equal(vm.runInContext('medleySeamActive(2.5)',c),true);
 assert.equal(vm.runInContext('medleySeamActive(3.6)',c),false);
 assert.equal(vm.runInContext('JSON.stringify(medleyFadeAt(2.5))',c),'{"info":1,"lane":1,"note":1,"button":1}');
 c.chartFadeAt=(events)=>({length:events.length});
 assert.equal(vm.runInContext('medleyFadeAt(.5).length',c),1);
 assert.equal(vm.runInContext('medleyFadeAt(4).length',c),1);
});
test('MC scroll/jump muted at joins, but hs and earlier scroll/jump remain',()=>{
 const c=env();
 c.mc={
  meta:{mode:5,song:{title:'MC Seam'},version:'Oni'},
  time:[{beat:[0,0,1],bpm:120}],
  note:[{beat:[0,0,1],type:1,sound:'music.ogg'},{beat:[0,0,1],style:0},{beat:[0,4,1],style:0},{beat:[0,8,1],style:0}],
  effect:[
   {beat:[0,1,1],scroll:3},
   {beat:[0,2,1],jump:500},
   {beat:[0,3,1],hs:2},
   {beat:[0,7,2],scroll:4,jump:2000}
  ]
 };
 c.second=structuredClone(plain);
 vm.runInContext('const mcChart=parseMalody(JSON.stringify(mc)).charts[0];const guardedMC=buildMedley([{chart:mcChart},{chart:second}],[{range:[0,2.5]},{}]);danRun={medley:guardedMC}',c);
 assert.equal(vm.runInContext('guardedMC.chart.notes[1].scroll',c),2);
 assert.equal(vm.runInContext('medleyDistance(guardedMC.chart.notes[1],1.75)',c),.5);
 assert.equal(vm.runInContext('medleyDistance(guardedMC.chart.notes[0],1)',c),-3.5);
 assert.equal(vm.runInContext('guardedMC.chart.motion.filter(m=>m.time<=2).at(-1).scroll',c),1);
 assert.equal(vm.runInContext('guardedMC.chart.motion.filter(m=>m.time<=2).at(-1).hs',c),2);
 assert.equal(vm.runInContext('guardedMC.segments[0].visualChart.visual.find(e=>e.time===1.75).jumpDistance',c),1.5);
 assert.equal(vm.runInContext('mcChart.visual.find(e=>e.time===1.75).jumpDistance',c),17.5);
});
test('TJA ABSCROLL muted but SCROLL, BPM and GOGO survive the join',()=>{
 const c=env();
 c.tja='TITLE:Scroll\nBPM:120\nCOURSE:Oni\n#START\n#ABSCROLL 3\n1000,\n#SCROLL 4\n#ABSCROLL 6\n#BPMCHANGE 240\n#GOGOSTART\n1000,\n#END';
 vm.runInContext('const tjaChart=parseTJA(tja).charts[0];const guardedTja=buildMedley([{chart:tjaChart},{chart:structuredClone(plain)}],[{range:[0,2.5]},{}]);danRun={medley:guardedTja}',c);
 assert.equal(vm.runInContext('guardedTja.chart.notes[1].scroll',c),4);
 assert.equal(vm.runInContext('medleyDistance(guardedTja.chart.notes[0],.5)',c),-1.5);
 assert.equal(vm.runInContext('medleyDistance(guardedTja.chart.notes[1],1.75)',c),1);
 assert.equal(vm.runInContext('guardedTja.chart.motion.filter(m=>m.time<=2).at(-1).scroll',c),1);
 assert.equal(vm.runInContext('guardedTja.chart.motion.filter(m=>m.time<=2).at(-1).hs',c),4);
 assert.equal(vm.runInContext('guardedTja.chart.motion.filter(m=>m.time<=2).at(-1).bpm',c),240);
 assert.equal(vm.runInContext('guardedTja.chart.gogoEvents.find(e=>e.time===2).active',c),true);
 assert.equal(vm.runInContext('tjaChart.visual.filter(e=>e.time===2).at(-1).scroll',c),6);
});
test('TJA SCROLL still works when there is no ABSCROLL track',()=>{
 const c=env();c.tja='TITLE:Scroll\nBPM:120\nCOURSE:Oni\n#START\n1000,\n#SCROLL 4\n1000,\n#END';
 vm.runInContext('const noAb=parseTJA(tja).charts[0];const guarded=buildMedley([{chart:noAb},{chart:structuredClone(plain)}],[{range:[0,2.5]},{}]);danRun={medley:guarded}',c);
 assert.equal(vm.runInContext('guarded.segments[0].visualChart',c),null);
 assert.equal(vm.runInContext('guarded.chart.notes[1].scroll',c),4);
 assert.equal(vm.runInContext('medleyDistance(guarded.chart.notes[1],1.75)',c),1);
 assert.equal(vm.runInContext('guarded.chart.motion.filter(m=>m.time<=2).at(-1).hs',c),4);
});
test('overlapping guards cover an entire very short middle excerpt',()=>{
 const c=env();
 c.a=structuredClone(plain);c.b=structuredClone(plain);c.z=structuredClone(plain);
 vm.runInContext('const short=buildMedley([{chart:a},{chart:b},{chart:z}],[{range:[0,2]},{range:[1,1.5]},{}])',c);
 assert.equal(vm.runInContext('JSON.stringify(short.segments[1].seamWindows)',c),'[[1,1.5]]');
 assert.equal(vm.runInContext('short.chart.duration',c),6.5);
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
test('autoplay previews the whole medley even if its roll exam is unattainable',()=>{
 const c=env();install(c);
 vm.runInContext("danRun.config.conditions=[{scope:'total',type:'rolls',red:[100],gold:[500],ops:['m']}];danRun.config.auto=true;now=-4",c);
 assert.equal(vm.runInContext('medleyFailed()',c),false);
 vm.runInContext('now=1',c);
 assert.equal(vm.runInContext('medleyFailed()',c),false);
 vm.runInContext('danRun.config.auto=false',c);
 assert.equal(vm.runInContext('medleyFailed()',c),true);
 vm.runInContext('now=-4',c);
 assert.equal(vm.runInContext('medleyFailed()',c),false);
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


test('adjusted dan export round-trips ranges, quoted titles, hidden songs and all exams',()=>{
 const c=env();c.source='TITLE:調整テスト\nMODE:MEDLEY\nSONG1:"A, \"mix\"",3\nSONG2:B\nMEASURES1:1,2\nRANGE2:1.25,3.5\nEXAM1:80,100\nEXAM2:1,miss,l,10,1\nEXAM3:2,best\nEXAM3-1:m,1,2\nEXAM3-2:m,2,3\nHIDE:2';
 // Use an escaped quote in the chart name, as emitted by the serializer.
 c.source=c.source.replace('A, "mix"','A, ""mix""');
 assert.equal(vm.runInContext('JSON.stringify(parseDanConfig(serializeDanConfig(parseDanConfig(source))))===JSON.stringify(parseDanConfig(source))',c),true);
});
test('selected-song practice slices chart specs without mutating original exams',()=>{
 const c=env();install(c);c.document={getElementById:id=>({value:id==='danStartMode'?'practice':'1'})};
 vm.runInContext("pendingDan={config:{songs:specs}};danRun.config.conditions=[{scope:'total',type:'miss',red:[1],gold:[1],ops:['l']}];const selected=danStartConfig(danRun.config)",c);
 assert.equal(vm.runInContext('selected.songs.length',c),1);
 assert.equal(vm.runInContext('JSON.stringify(selected.specs)',c),'[{"range":[1,3]}]');
 assert.equal(vm.runInContext('selected.previousSong===danRun.config.songs[0]',c),true);
 assert.equal(vm.runInContext('selected.conditions.length',c),0);
 assert.equal(vm.runInContext('danRun.config.conditions.length',c),1);
});
test('previous-song audio occupies exactly three seconds and resume clips the prelude',()=>{
 const c=env();install(c);c.starts=[];
 vm.runInContext("const buffer={duration:20};const previous={...entries[0].chart,preloadedAudio:buffer};danRun.config.previousSong={chart:previous};danRun.config.previousSpec={range:[0,10]};danRun.config.mode='MEDLEY';danRun.leadIn=danLeadInPlan(danRun.config,chart);const musicGain={};function audio(){return {createBufferSource(){return {playbackRate:{},connect(){},start(...args){starts.push(args)}}}}}activeSongRate=1;startAt=100;scheduleDanLeadIn(-3);scheduleDanLeadIn(-1);scheduleDanLeadIn(0)",c);
 assert.deepEqual(c.starts.map(a=>Array.from(a)),[[97,7,3],[99,9,1]]);
 assert.equal(vm.runInContext('danLeadInActive(-.001)',c),true);
 assert.equal(vm.runInContext('danLeadInActive(0)',c),false);
});
test('practice lead-in scores nothing until selected song starts, including autoplay',async()=>{
 const c=env();install(c);engine(c);
 vm.runInContext("danRun.config.auto=true;danRun.config.practice=true;danRun.config.mode='MEDLEY';danRun.config.previousSong={chart:entries[0].chart};danRun.config.previousSpec={range:[0,4]}",c);
 await vm.runInContext('start({dan:true,seamless:true})',c);
 assert.equal(vm.runInContext('pausedTime',c),-3);
 vm.runInContext('audioContext.currentTime=startAt-.1;loop()',c);
 assert.equal(vm.runInContext('good+ok+miss+score',c),0);
 vm.runInContext('audioContext.currentTime=startAt+.01;loop()',c);
 assert.equal(vm.runInContext('good',c),1);
 assert.equal(vm.runInContext('danCurrentFailed()',c),false);
});

test('editor validates before updating draft, keeps untouched measures and applies only on request',()=>{
 const c=env();install(c);
 const nodes=new Map();c.document={getElementById:id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',disabled:false});return nodes.get(id)}};
 vm.runInContext("function drawMedleyPreview(){}function refreshDanSongs(){}pendingDan={config:{songs:[{measures:[1,2]},{range:[1,4]}]}};medleyEditorState={owner:pendingDan,entries,draft:structuredClone(pendingDan.config),index:0,built:buildMedley(entries,pendingDan.config.songs)}",c);
 c.document.getElementById('medleyEnd').value='2';c.document.getElementById('medleyFrom').value='1';
 assert.equal(vm.runInContext('applyMedleyBoundary()',c),true);
 assert.equal(vm.runInContext('JSON.stringify(medleyEditorState.draft.songs[0])',c),'{"measures":[1,2]}');
 c.document.getElementById('medleyEnd').value='1.75';c.document.getElementById('medleyFrom').value='1.25';
 assert.equal(vm.runInContext('applyMedleyBoundary()',c),true);
 assert.equal(vm.runInContext('JSON.stringify(pendingDan.config.songs[0])',c),'{"measures":[1,2]}');
 assert.equal(vm.runInContext('JSON.stringify(medleyEditorState.draft.songs[0])',c),'{"range":[0,1.75]}');
 c.document.getElementById('medleyFrom').value='100';
 assert.equal(vm.runInContext('applyMedleyBoundary()',c),false);
 assert.equal(vm.runInContext('medleyEditorState.draft.songs[1].range[0]',c),1.25);
 c.document.getElementById('medleyFrom').value='1.25';
 assert.equal(vm.runInContext('commitMedleyEdits()',c),true);
 assert.equal(vm.runInContext('pendingDan.config.songs[0].range[1]',c),1.75);
});
