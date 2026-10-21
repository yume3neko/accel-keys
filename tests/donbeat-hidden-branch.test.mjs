import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {File} from 'node:buffer';
const root=new URL('../public/donbeat/',import.meta.url),read=name=>readFileSync(new URL(name,root),'utf8');
const config=`TITLE:Song
MODE:MEDLEY
SONG1:short.tja,3
MEASURES1:1,3
SONG2:short.tja,3
MEASURES2:3,4
SONG3:full.tja,3
MEASURES3:2,3
BRANCH1:accuracy,m,75,3,2`;
function engineFunction(name){const code=read('app.js'),at=code.search(new RegExp('^(?:async )?function '+name+'\\(','m')),end=code.indexOf('\n',at);if(at<0)throw Error(name);return code.slice(at,end).endsWith('}')?code.slice(at,end):code.slice(at,code.indexOf('\n}',end)+2)}
function env(automatic=false,source=config){
 const c=vm.createContext({console,structuredClone,setTimeout,clearTimeout,config:source,automatic});
 for(const name of ['tja.js','malody.js','dan.js','medley.js','medley-branch.js','medley-tools.js'])vm.runInContext(read(name),c);
 vm.runInContext(String.raw`
 const starts=[],gains=[],nodes=new Map();
 function $(id){if(!nodes.has(id))nodes.set(id,{value:id==='musicSpeed'?'1':'0',hidden:false,textContent:'',style:{},children:[],classList:{add(){},remove(){},toggle(){}},append(...items){this.children.push(...items)},replaceChildren(...items){this.children=items},setAttribute(){}});return nodes.get(id)}
 const document={getElementById:$,body:{classList:{add(){},remove(){},toggle(){}}}};
 const audioContext={currentTime:100,state:'running',resume:()=>Promise.resolve(),
  createBufferSource(){const node={playbackRate:{value:1},connect(to){this.to=to},start(...args){starts.push({node,args})},stop(){this.stopped=true},disconnect(){this.disconnected=true}};return node},
  createGain(){const node={values:[],connect(to){this.to=to},disconnect(){this.disconnected=true}};node.gain={value:1,cancelScheduledValues(t){node.values=node.values.filter(x=>x[1]<t)},setValueAtTime(v,t){node.values.push([v,t])}};gains.push(node);return node}};
 function audio(){return audioContext}const musicGain={};
 let chart,notes=[],score=0,good=0,ok=0,miss=0,rolls=0,maxCombo=0,combo=0,soul=0,balloonRolls=0,balloonPops=0,activeSongRate=1,startAt=100;
 let state='playing',auto=automatic,playbackVisualChart=null,beatIndex=0,feedback='',feedbackAt=0,pausedTime=0,raf=0,pauseResumeUntil=-Infinity,judgeFrom=-Infinity;
 let branchScoreLog=[],branchRollLog=[];const AUTO_ROLL_HZ=30,AUTO_BALLOON_MAX_HZ=60;
 function time(){return state==='playing'?(audioContext.currentTime-startAt)*activeSongRate:pausedTime}
 function judgmentOffsetSeconds(){return 0}function update(){}function showScoreGain(){}function resetDummyPlayback(){}function dummyNotesForPlay(){return chart.dummyNotes||[]}function updateDesktopPlayInfo(){}function updateDanHUD(){}function tone(){}function autoInputLocked(){return false}
 function stopAudio(){stopMedleyAudio()}function scheduleAudio(t){stopAudio();scheduleMedleyAudio(t)}
 function resetHibiki(){}function setPauseIcon(){}function loop(){}function cancelAnimationFrame(){}
 function normalizedPath(s){return s.toLowerCase()}function playbackAssetsAvailable(){return true}
 `,c);
 for(const name of ['soulNoteCount','judgmentWindows','judgeCore','judge','addRollHitsCore','addRollHits','autoBalloonHits','autoRollHits','hit','pauseRewindTime','resumeFromPause'])vm.runInContext(engineFunction(name),c);
 vm.runInContext(String.raw`
 const short=parseTJA('TITLE:Song\nBPM:120\nCOURSE:Oni\nLEVEL:8\n#START\n1000,\n2000,\n3000,\n4000,\n#END').charts[0];short.sourcePath='short.tja';short.preloadedAudio={duration:8,id:'short'};
 const full=parseTJA('TITLE:Full\nBPM:120\nCOURSE:Oni\nLEVEL:8\n#START\n4000,\n2000,\n1000,\n2000,\n1000,\n2000,\n#END').charts[0];full.sourcePath='full.tja';full.preloadedAudio={duration:12,id:'full'};
 const entries=[{chart:short},{chart:short},{chart:full}],parsed=parseDanConfig(config);
 const built=buildBranchedMedley(entries,parsed.songs,parsed.branch);
 chart=built.chart;notes=chart.notes.map(n=>({...n,done:false,hits:0}));
 danRun={index:0,config:{...parsed,auto:automatic,songs:entries},results:[],medley:{...built,stats:built.segments.map(medleyEmptyStats),displayIndex:-1}};
 setBranchedMedleyConfig(danRun,built.branch.no);
 scheduleMedleyAudio(0);
 `,c);
 return c;
}
const run=(c,code)=>vm.runInContext(code,c);
const json=(c,code)=>JSON.parse(run(c,'JSON.stringify('+code+')'));

test('medley syntax round-trips hidden fork and keeps normal config defaults',()=>{
 const c=env();assert.equal(run(c,'parsed.gauge'),80);assert.equal(run(c,'parsed.branch.pass'),2);
 assert.deepEqual(json(c,'parseDanConfig(serializeDanConfig(parsed))'),json(c,'parsed'));
 for(const bad of [config.replace('MEDLEY','NORMAL'),config.replace('75,3,2','101,3,2'),config.replace('75,3,2','75,2,2'),config.replace('BRANCH1:','BRANCH2:'),config.replace('accuracy,m','accuracy,x'),config.replace('accuracy,m,75','miss,l,0.5'),config+'\nBRANCH2:miss,l,1,3,2',config+'\nEXAM2:1,miss,l,1,1']){c.bad=bad;assert.throws(()=>run(c,'parseDanConfig(bad)'))}
});
test('each alternative reuses the same prefix and its own audio position; no unused ending follows',()=>{
 const c=env();assert.equal(run(c,'built.branch.boundary'),4);
 assert.equal(run(c,'built.branch.no.chart.duration'),8);assert.equal(run(c,'built.branch.yes.chart.duration'),14);
 assert.deepEqual(json(c,'built.branch.no.segments.map(s=>[s.from,s.to,s.start])'),[[0,4,0],[4,8,4]]);
 assert.deepEqual(json(c,'built.branch.yes.segments.map(s=>[s.from,s.to,s.start])'),[[0,4,0],[2,12,4]]);
 assert.equal(run(c,'short.notes.some(n=>n.done!==undefined)'),false);
});
test('both audio alternatives are reserved at the identical boundary before any animation frame',()=>{
 const c=env();assert.deepEqual(json(c,'starts.map(s=>[s.node.buffer.id,...s.args])'),[['short',100,0,4],['short',104,4,4],['full',104,2,10]]);
 assert.deepEqual(json(c,'gains.map(g=>g.values)'),[[[1,104]],[[0,104]]]);
});
test('last shared hit revises the audio gate; exact threshold passes and stats survive the fork',()=>{
 const c=env();run(c,'audioContext.currentTime=100;judge(notes[0],0);audioContext.currentTime=102;judge(notes[1],.05)');
 assert.equal(run(c,'danRun.medley.branch.pendingPass'),true);assert.deepEqual(json(c,'gains.map(g=>g.values)'),[[[0,104]],[[1,104]]]);
 const before=json(c,'[score,good,ok,miss,combo,maxCombo,soul]');
 run(c,'const oldFirst=notes[0];audioContext.currentTime=104;updateMedleyBranch(time())');
 assert.equal(run(c,'danRun.medley.branch.passed'),true);assert.equal(run(c,'chart.duration'),14);
 assert.deepEqual(json(c,'[score,good,ok,miss,combo,maxCombo,soul]'),before);assert.equal(run(c,'notes[0]===oldFirst'),true);
 assert.equal(run(c,'notes.find(n=>n.time===4).type'),2);assert.equal(run(c,'danRun.config.songs.length'),2);
 assert.equal(run(c,'starts.length'),3); // The frame never starts another source.
});
test('unmet condition selects normal ending and never fails the course early',()=>{
 const c=env();run(c,'audioContext.currentTime=100;judge(notes[0],0);audioContext.currentTime=104.02;updateMedleyBranch(time())');
 assert.equal(run(c,'danRun.medley.branch.passed'),false);assert.equal(run(c,'chart.duration'),8);
 assert.equal(run(c,'notes.find(n=>n.time===4).type'),3);assert.equal(run(c,'medleyFailed()'),false);
});
test('a late shared judgment cannot retroactively change the reserved audio route',()=>{
 const c=env();run(c,'audioContext.currentTime=100;judge(notes[0],0);audioContext.currentTime=104.01;judge(notes[1],0);updateMedleyBranch(time())');
 assert.equal(run(c,'good'),2);assert.equal(run(c,'danRun.medley.branch.passed'),false);assert.equal(run(c,'chart.duration'),8);
 assert.deepEqual(json(c,'gains.map(g=>g.values)'),[[[1,104]],[[0,104]]]);
});
test('future-tail input before the cut cannot satisfy a shared condition or score the wrong chart',()=>{
 const c=env();run(c,'audioContext.currentTime=103.99;hit(1)');
 assert.equal(run(c,'score'),0);assert.equal(run(c,'notes.find(n=>n.time===4).done'),false);
});
test('autoplay preselects the perfect prefix even if the first render is after the boundary',()=>{
 const c=env(true);assert.equal(run(c,'danRun.medley.branch.pendingPass'),true);
 assert.deepEqual(json(c,'gains.map(g=>g.values)'),[[[0,104]],[[1,104]]]);
 run(c,'audioContext.currentTime=107;updateMedleyBranch(time())');assert.equal(run(c,'chart.duration'),14);
});
test('pause before the boundary reschedules gates against the resumed clock without duplicating scores',async()=>{
 const c=env();run(c,"audioContext.currentTime=100;judge(notes[0],0);audioContext.currentTime=102;judge(notes[1],0);pausedTime=3;state='paused';stopAudio();audioContext.currentTime=200");
 const before=json(c,'[score,combo,soul]');
 run(c,'resumeFromPause()');await new Promise(r=>setImmediate(r));
 assert.deepEqual(json(c,'[score,combo,soul]'),before);
 assert.equal(run(c,'gains.length'),4);assert.equal(run(c,'gains[0].disconnected&&gains[1].disconnected'),true);
 assert.equal(run(c,'gains[2].values[0][1]'),run(c,'startAt+4'));
});
test('rewinding across a completed fork keeps its choice and schedules only that ending',()=>{
 const c=env(true);run(c,'audioContext.currentTime=104;updateMedleyBranch(time());stopAudio();startAt=200;scheduleMedleyAudio(1)');
 assert.equal(run(c,'starts.length'),5);assert.deepEqual(json(c,'starts.slice(3).map(s=>s.node.buffer.id)'),['short','full']);
 assert.equal(run(c,'gains.length'),2);assert.equal(run(c,'danRun.medley.branch.passed'),true);
});
test('song speed reserves a shared audio boundary and applies the selected source offset',()=>{
 const c=env(true);run(c,'stopAudio();activeSongRate=2;startAt=100;scheduleMedleyAudio(0)');
 assert.deepEqual(json(c,'starts.slice(-3).map(s=>s.args)'),[[100,0,4],[102,4,4],[102,2,10]]);
 assert.equal(run(c,'starts.at(-1).node.playbackRate.value'),2);assert.equal(run(c,'gains.at(-1).values.at(-1)[1]'),102);
});
test('candidate charts remain resolvable but are hidden from selection; preview reveals no target or condition',()=>{
 const c=env();run(c,"let charts=[short,full];pendingDan={config:parsed,path:'course.dan',localOnly:false};danPool.push({chart:short},{chart:full});hideMedleyBranchCandidates()");
 assert.equal(run(c,'short._hiddenMedleyCandidate'),false);assert.equal(run(c,'full._hiddenMedleyCandidate'),true);
 assert.equal(run(c,'resolveDanConfig(true,2).songs[0].chart===full'),true);
 run(c,"danNode=(tag,text)=>({tag,textContent:text});refreshDanStartOptions=()=>{};refreshDanSongs()");
 assert.deepEqual(json(c,"$('danSummary').children.map(n=>n.textContent)"),['Song','演奏できます。']);
});

test('incoming note previews follow the selected audio candidate without changing judgment objects',()=>{
 const c=env();assert.equal(run(c,'medleyBranchRenderNotes().find(n=>n.time===4).type'),3);
 run(c,'audioContext.currentTime=100;judge(notes[0],0);audioContext.currentTime=102;judge(notes[1],0)');
 assert.equal(run(c,'medleyBranchRenderNotes().find(n=>n.time===4).type'),2);
 assert.equal(run(c,'notes.find(n=>n.time===4).type'),3);
 run(c,'audioContext.currentTime=104;updateMedleyBranch(time())');
 assert.equal(run(c,'medleyBranchRenderNotes().find(n=>n.time===4).type'),2);
 assert.equal(run(c,'medleyBranchRenderNotes()===medleyBranchRenderNotes()'),true);
});

test('the ordinary play button launches the hidden medley with the requested autoplay mode',async()=>{
 const c=env();vm.runInContext(engineFunction('start'),c);
 run(c,"let charts=[short,full];chart=short;pendingDan={config:parsed,path:'course.dan'};danPool.push({chart:short},{chart:full});danRun=null;let requestedAuto=null;launchDan=async automatic=>{requestedAuto=automatic}");
 await run(c,'start({auto:true})');assert.equal(run(c,'requestedAuto'),true);
 await run(c,'start()');assert.equal(run(c,'requestedAuto'),false);
});

test('adding a missing ending later keeps the common song selectable and resolves the complete local package',async()=>{
 const c=env();Object.assign(c,{File,TextDecoder});
 for(const name of ['filePath','normalizedPath','decodeDanText','loadFiles'])vm.runInContext(engineFunction(name),c);
 run(c,String.raw`
  let charts=[],audioFiles=new Map(),loading=false,importing=false,demoMode=false;danRun=null;state='ready';
  function fillCourses(){$('course').value=String(Math.max(0,charts.findIndex(c=>!c._hiddenMedleyCandidate)))}
  function attachVideos(){}function attachSpinners(){}function unlock(){}function refreshDanSongs(){}
  async function choose(){chart=charts[Number($('course').value)];rememberDanCharts()}
 `);
 const shortText='TITLE:Song\nBPM:120\nWAVE:short.ogg\nCOURSE:Oni\n#START\n1000,\n1000,\n1000,\n1000,\n#END';
 const fullText=shortText.replace('Song','Full').replace('short.ogg','full.ogg');
 c.first=[new File([config],'course.dan'),new File([shortText],'short.tja'),new File(['audio'],'short.ogg')];
 await run(c,'loadFiles(first)');assert.equal(run(c,'chart.meta.TITLE'),'Song');
 c.second=[new File([fullText],'full.tja'),new File(['audio'],'full.ogg')];
 await run(c,'loadFiles(second)');assert.equal(run(c,'chart.meta.TITLE'),'Song');
 assert.equal(run(c,'resolveDanConfig().songs.length'),3);
 assert.equal(run(c,'charts.find(c=>c.meta.TITLE==="Full")._hiddenMedleyCandidate'),true);
});

const noBlueConfig=config.replace('accuracy,m,75','note2+4,l,1');
test('note types are counted individually, including bad timing strikes but excluding notes left untouched',()=>{
 for(const type of [1,2,3,4])for(const error of [0,.05,.09]){
  const c=env(false,noBlueConfig);c.type=type;c.error=error;
  run(c,'notes[0].type=type;audioContext.currentTime=100+error;hit(type===1||type===3?1:2)');
  assert.equal(run(c,'danRun.medley.stats[0].noteHits[type]'),1);
  assert.equal(run(c,'danRun.medley.stats[0].noteHits.reduce((a,b)=>a+b,0)'),1);
  assert.equal(run(c,'danRun.medley.branch.pendingPass'),type===1||type===3);
 }
 const c=env(false,noBlueConfig);
 run(c,'audioContext.currentTime=102.2;judge(notes[1],1)');
 assert.equal(run(c,'miss'),1);assert.equal(run(c,'medleyBranchStats().noteHits[2]'),0);
 assert.equal(run(c,'danRun.medley.branch.pendingPass'),true);
});
test('roll and balloon strikes retain their individual note types; empty rim taps do not count',()=>{
 for(const type of [5,6,7,9]){
  const c=env(false,noBlueConfig);c.type=type;
  run(c,'audioContext.currentTime=101;hit(2);notes.push({type,time:1,end:1.9,medleyIndex:0,done:false,hits:0,required:3});audioContext.currentTime=101.2;hit(1);hit(1)');
  assert.equal(run(c,'medleyBranchStats().noteHits[type]'),2);
  assert.equal(run(c,'medleyBranchStats().noteHits[2]'),0);
  assert.equal(run(c,'danRun.medley.branch.pendingPass'),true);
 }
 const c=env();run(c,'notes.unshift({type:10,time:0,medleyIndex:0,done:false});hit(1)');
 assert.equal(run(c,'medleyBranchStats().noteHits[10]'),1);
});
test('generic type sums work at the audio boundary and autoplay predicts every common note type',()=>{
 const c=env(false,noBlueConfig);
 assert.equal(run(c,'danRun.medley.branch.pendingPass'),true);
 run(c,'hit(1);audioContext.currentTime=102;hit(2)');
 assert.equal(run(c,'danRun.medley.branch.pendingPass'),false);
 run(c,'audioContext.currentTime=104;updateMedleyBranch(time())');
 assert.equal(run(c,'danRun.medley.branch.passed'),false);
 const automatic=env(true,noBlueConfig);
 assert.deepEqual(json(automatic,'medleyBranchStats().noteHits.slice(1,5)'),[1,1,0,0]);
 assert.equal(run(automatic,'danRun.medley.branch.pendingPass'),false);
 const noHits=env(false,noBlueConfig);
 run(noHits,'audioContext.currentTime=104;updateMedleyBranch(time())');
 assert.equal(run(noHits,'danRun.medley.branch.passed'),true);
});
test('TJA song branch parses its exact command time, quoted target and original offset/meter/BPM',()=>{
 const c=env();c.text='TITLE:Source\nBPM:120\nOFFSET:-1.25\nCOURSE:Oni\n#START\n#MEASURE 3/4\n1000,\n#BPMCHANGE 60\n2000,\n#SONGBRANCH note2+4, l, 1, "full, mix.tja", 3\n#GOGOSTART\n3000,\n#END';
 assert.equal(run(c,'parseTJA(text).charts[0].songBranch.time'),5.75);
 assert.deepEqual(json(c,'parseTJA(text).charts[0].songBranch'),{time:5.75,metric:'note2+4',op:'l',threshold:1,target:'full, mix.tja',measure:3});
 assert.deepEqual(json(c,'parseTJA(text).warnings'),[]);
 assert.equal(run(c,'parseTJA(text).charts[0].notes.at(-1).time'),5.75);
 for(const bad of ['note2+2,l,1,full.tja,2','note8,l,1,full.tja,2','note2,l,.5,full.tja,2','note2,l,1,full.ogg,2','note2,l,1,../full.tja,2','note2,l,1,/full.tja,2','note2,l,1,full.tja,0','note2,x,1,full.tja,2']){
  c.bad=textReplace(c.text,bad);assert.throws(()=>run(c,'parseTJA(bad)'),/SONGBRANCH/);
 }
 c.bad=c.text.replace('#GOGOSTART','#SONGBRANCH note1,m,1,other.tja,1');assert.throws(()=>run(c,'parseTJA(bad)'),/1か所/);
 function textReplace(text,definition){return text.replace(/#SONGBRANCH[^\n]+/,'#SONGBRANCH '+definition)}
});
test('TJA alone arms hidden playback in every difficulty, keeps local scope and hides all target courses',()=>{
 const c=env();run(c,`
  const courseNames=['Easy','Normal','Hard','Oni','Edit'];
  const allShort=courseNames.map(course=>{const c=parseTJA('TITLE:Song\\nBPM:120\\nCOURSE:'+course+'\\n#START\\n1000,\\n2000,\\n#SONGBRANCH note2+4,l,1,full.tja,2\\n3000,\\n4000,\\n#END').charts[0];return {...c,sourcePath:'short.tja',uploadedLocal:true}});
  const allFull=courseNames.map(course=>({...full,meta:{...full.meta,COURSE:course},uploadedLocal:true}));
  const scope=new Set([...allShort,...allFull]);allShort.forEach(c=>c._songBranchLocalCharts=scope);
  let charts=[...allShort,...allFull];pendingDan=null;danRun=null;danPool.length=0;danPool.push(...charts.map(chart=>({chart})));
 `);
 for(let i=0;i<5;i++){
  c.courseIndex=i;run(c,'chart=allShort[courseIndex];activateTjaSongBranch(chart);hideMedleyBranchCandidates()');
  assert.equal(run(c,'pendingDan.embedded&&pendingDan.localOnly'),true);
  assert.equal(run(c,'pendingHiddenMedley()'),true);
  assert.equal(run(c,'resolveDanConfig().songs[2].chart===allFull[courseIndex]'),true);
  assert.equal(run(c,'allShort.every(c=>!c._hiddenMedleyCandidate)&&allFull.every(c=>c._hiddenMedleyCandidate)'),true);
  assert.equal(run(c,'pendingDan.config.songs[0].range[0]'),0);
 }
 run(c,'charts=allFull.slice();hideMedleyBranchCandidates()');
 assert.equal(run(c,'allShort.every(c=>charts.includes(c))'),true);
});
test('loading only TJA and audio activates the embedded fork, and later target imports preserve all source difficulties',async()=>{
 const c=env();Object.assign(c,{File,TextDecoder});
 for(const name of ['filePath','normalizedPath','decodeDanText','loadFiles'])vm.runInContext(engineFunction(name),c);
 run(c,String.raw`
  let charts=[],audioFiles=new Map(),loading=false,importing=false,demoMode=false;danRun=null;pendingDan=null;state='ready';
  function fillCourses(){$('course').value=String(Math.max(0,charts.findIndex(c=>!c._hiddenMedleyCandidate)))}
  function attachVideos(){}function attachSpinners(){}function unlock(){}function refreshDanSongs(){}
  async function choose(){chart=charts[Number($('course').value)];rememberDanCharts()}
 `);
 const courses=['Easy','Normal','Hard','Oni','Edit'];
 const shortText='TITLE:Song\nBPM:120\nWAVE:short.ogg\n'+courses.map(course=>'COURSE:'+course+'\n#START\n1000,\n2000,\n#SONGBRANCH note2+4,l,1,full.tja,2\n3000,\n4000,\n#END').join('\n');
 const fullText=shortText.replace('TITLE:Song','TITLE:Full').replace('short.ogg','full.ogg').replaceAll('#SONGBRANCH note2+4,l,1,full.tja,2\n','');
 c.first=[new File([shortText],'short.tja'),new File(['audio'],'short.ogg')];
 await run(c,'loadFiles(first)');assert.equal(run(c,'pendingDan.embedded'),true);
 c.second=[new File([fullText],'full.tja'),new File(['audio'],'full.ogg')];
 await run(c,'loadFiles(second)');
 assert.equal(run(c,'charts.filter(c=>c.songBranch&&!c._hiddenMedleyCandidate).length'),5);
 assert.equal(run(c,'resolveDanConfig().songs.length'),3);
});
