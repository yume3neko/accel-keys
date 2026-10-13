import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const root=new URL('../public/donbeat/',import.meta.url);
const read=n=>readFileSync(new URL(n,root),'utf8');
function env(){const c=vm.createContext({console});vm.runInContext(read('tja.js'),c);const app=read('app.js');vm.runInContext(app.slice(app.indexOf('const AUTO_ROLL_HZ='),app.indexOf('function addRollHitsCore(')),c);vm.runInContext(app.slice(app.indexOf('function drawRhythmNote('),app.indexOf('function drawGame(')),c);vm.runInContext(app.slice(app.indexOf('function visualBpmState('),app.indexOf('function updateVisualBpm(')),c);vm.runInContext(read('multi-course.js'),c);return c}
function chart(course='Easy'){return {meta:{TITLE:'Song',COURSE:course,LEVEL:'3'},duration:4,notes:[{time:1,type:1},{time:2,type:2}],bars:[]}}
test('independent counters and notes never modify imported difficulties',()=>{const c=env();c.a=chart();c.b=chart('Oni');vm.runInContext('const x=makeMultiLane(a),y=makeMultiLane(b);advanceMultiLane(x,1)',c);assert.equal(vm.runInContext('x.combo',c),1);assert.equal(vm.runInContext('y.combo',c),0);assert.equal(c.a.notes[0].done,undefined)});
test('rewind and repeat frames do not award judgments twice',()=>{const c=env();c.a=chart();vm.runInContext('const x=makeMultiLane(a);advanceMultiLane(x,2);const scored=x.score;advanceMultiLane(x,0);advanceMultiLane(x,2)',c);assert.equal(vm.runInContext('x.combo',c),2);assert.equal(vm.runInContext('x.score===scored',c),true)});
test('roll and balloon hits retain automatic caps through pause rewind',()=>{const c=env();c.a={...chart(),notes:[{time:1,end:2,type:5},{time:3,end:4,type:7,required:8}]};vm.runInContext('const x=makeMultiLane(a);advanceMultiLane(x,2);advanceMultiLane(x,1);advanceMultiLane(x,4);advanceMultiLane(x,4)',c);assert.equal(vm.runInContext('x.rolls',c),38);assert.equal(vm.runInContext('x.score',c),3800)});
test('one shared audio clock waits for the longest difficulty and deduplicates simultaneous sound',()=>{const c=env();c.a=chart();c.b={...chart('Oni'),duration:8};const sounds=[];Object.assign(c,{time:()=>5,pauseResumeUntil:0,tone:t=>sounds.push(t),syncMV(){},drawMultiCourse(){},finishMultiCourse(){throw Error('finished too early')},requestAnimationFrame:()=>1,loop(){},audioBuffer:{duration:3}});vm.runInContext('let raf;multiRun={charts:[a,b],lanes:[makeMultiLane(a),makeMultiLane(b)]};loopMultiCourse()',c);assert.deepEqual(sounds,[2])});
test('restart rebuilds every lane from its original chart',()=>{const c=env();c.a=chart();vm.runInContext('multiRun={charts:[a],lanes:[]};resetMultiLanes();advanceMultiLane(multiRun.lanes[0],4);resetMultiLanes()',c);assert.equal(vm.runInContext('multiRun.lanes[0].score',c),0);assert.equal(vm.runInContext('multiRun.lanes[0].notes.some(n=>n.done)',c),false)});
test('renderer draws one row per selected course without modifying playback counters',()=>{
 const c=env(),labels=[];c.a=chart();c.b=chart('Edit');Object.assign(c,{names:{Easy:'かんたん',Edit:'裏'},pauseResumeUntil:-Infinity,danLeadInActive:()=>false,activeSongRate:1,state:'playing',width:1000,height:400,time:()=>1,ctx:new Proxy({fillText:t=>labels.push(t)}, {get:(o,k)=>o[k]||(()=>{})}),$:id=>({value:'1',textContent:''}),isGogoTime:()=>false});
 vm.runInContext('const chart=a;multiRun={lanes:[makeMultiLane(a),makeMultiLane(b)]};drawMultiCourse()',c);
 assert(labels.includes('かんたん ★3'));assert(labels.includes('裏 ★3'));assert.equal(vm.runInContext('multiRun.lanes.every(l=>l.score===0)',c),true);
});

test('per-course visual BPM follows timing changes, scroll, HS, song speed and meter',()=>{
 const c=env();c.$=()=>({value:'1.5'});c.activeSongRate=2;c.state='playing';c.a={bpm:120,motion:[{time:0,bpm:120,hs:1,scroll:1},{time:2,bpm:180,hs:2,scroll:.5}],measures:[{time:0,numerator:4,denominator:4},{time:2,numerator:3,denominator:4}]};
 assert.equal(vm.runInContext('multiVisualLabel(a,1)',c),'4/4 拍子   見た目 120 BPM × 1 HS × 1.5 設定 × 2 曲速 = 360 BPM');assert.equal(vm.runInContext('multiVisualLabel(a,2)',c),'3/4 拍子   見た目 180 BPM × 2 HS × 0.5 × 1.5 設定 × 2 曲速 = 540 BPM');
});
test('MV-enabled lanes retain transparent backgrounds and disabled MV restores opaque lanes',()=>{
 const c=env();c.a=chart();const fills=[];const context=new Proxy({fillRect(){fills.push([this.fillStyle,this.globalAlpha])}},{get:(o,k)=>o[k]||(()=>{})});
 Object.assign(c,{names:{Easy:'かんたん'},pauseResumeUntil:-Infinity,danLeadInActive:()=>false,activeSongRate:1,state:'playing',width:1000,height:400,time:()=>0,ctx:context,$:()=>({value:'1'}),isGogoTime:()=>false});
 vm.runInContext('const chart=a;chart.videoFile={};multiRun={lanes:[makeMultiLane(a)]};drawMultiCourse()',c);assert.equal(fills[0][0],'#191d2244');assert.equal(fills[1][1],.35);assert.equal(context.globalAlpha,1);fills.length=0;
 vm.runInContext('chart._mvEnabled=false;drawMultiCourse()',c);assert.equal(fills[0][0],'#191d22');assert.equal(fills[1][1],1);
});
