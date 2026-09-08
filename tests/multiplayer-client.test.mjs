import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {onRequestPost} from '../functions/api/multiplayer.js';
import {makeChart,bpm,multiplier} from '../public/accel-keys/multiplayer-engine.js';
// Execute the actual frontend with a minimal DOM against the real API handler.
const source=fs.readFileSync(new URL('../public/accel-keys/multiplayer.js',import.meta.url),'utf8').replace(/^import .*\n/,'');
function client(env){
 const elements=new Map(),storage=new Map();let now=1000;
 const context=new Proxy({createLinearGradient:()=>({addColorStop(){}})},{get:(o,k)=>o[k]??(()=>{})});
 const el=()=>({value:'',hidden:false,textContent:'',style:{},children:[],classList:{add(){},remove(){}},append(...v){this.children.push(...v)},replaceChildren(...v){this.children=v},getContext:()=>context,getBoundingClientRect:()=>({width:390,height:500,left:0}),clientWidth:390,clientHeight:500});
 const element=id=>{if(!elements.has(id))elements.set(id,el());return elements.get(id)};
 for(const [id,value]of [['mode','time'],['kind','battle']])element(id).value=value;
 const buttons=Array.from({length:4},(_,i)=>({...el(),dataset:{lane:String(i)}}));
 const sandbox={makeChart,bpm,multiplier,console,crypto,AbortController,URL,performance:{now:()=>now},devicePixelRatio:1,
 document:{getElementById:element,createElement:el,body:el(),querySelectorAll:()=>buttons,querySelector:s=>buttons[Number(s.match(/\d/)[0])]},
 localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,String(v))},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,String(v))},
 location:{href:'https://example.test/accel-keys/multiplayer.html'},navigator:{},ResizeObserver:class{observe(){}},addEventListener(){},setTimeout(){return 1},clearTimeout(){},requestAnimationFrame(){return 1},cancelAnimationFrame(){},confirm:()=>true,
 fetch:async(url,options)=>onRequestPost({env,request:new Request(new URL(url,'https://example.test'),options)})};
 vm.createContext(sandbox);vm.runInContext(source+'\nglobalThis.test={send,frame,press,leave,get room(){return room},get stats(){return stats},get notes(){return notes},get startPerf(){return startPerf}}',sandbox);
 return {api:sandbox.test,e:element,storage,tick(t){now=t;sandbox.test.frame(t)}};
}
test('actual clients: same chart, countdown, hits, shared game and results',async()=>{
 const db=new DatabaseSync(':memory:');const env={DB:{prepare(sql){let args=[];return{bind(...a){args=a;return this},async run(){return{meta:{changes:db.prepare(sql).run(...args).changes}}},async first(){return db.prepare(sql).get(...args)}}}}};
 const a=client(env),b=client(env);
 try{
 await a.api.send('create',{code:'ABCD23',mode:'cosmos',kind:'coop',name:'A'});await b.api.send('join',{code:'ABCD23',name:'B'});
 await a.api.send('ready',{ready:true});await b.api.send('ready',{ready:true});await a.api.send('start');await b.api.send('sync');
 assert.equal(a.e('play').hidden,false);assert.equal(b.e('play').hidden,false);
 a.tick(a.api.startPerf-3000);assert.equal(a.e('overlay').textContent,'3');
 // Keeping the local clock anchor near present avoids simulating a disconnect.
 const initial=a.api.startPerf;a.tick(initial+3166.6666667);b.tick(b.api.startPerf+3166.6666667);
 assert.equal(a.api.notes[0].lane,3);assert.equal(a.api.notes[0].at,b.api.notes[0].at);
 a.api.press(3);b.api.press(3);assert.equal(a.api.stats.hits,1);assert.equal(a.api.stats.score,b.api.stats.score);
 // Let the server accept a completed elapsed segment without real-time waiting.
 const row=db.prepare('SELECT state FROM multiplayer_rooms WHERE code=?').get('ABCD23'),room=JSON.parse(row.state);room.startAt=Date.now()-10000;db.prepare('UPDATE multiplayer_rooms SET state=? WHERE code=?').run(JSON.stringify(room),'ABCD23');
 a.api.stats.miss=5;b.api.stats.miss=3;
 await a.api.send('sync');await b.api.send('sync');await a.api.send('sync');
 assert.equal(a.e('results').hidden,false);assert.equal(b.e('results').hidden,false);assert.equal(a.e('play').hidden,true);assert.equal(a.e('resultTitle').textContent,'協力プレイ終了');
 await a.api.leave();assert.equal(a.e('setup').hidden,false);
 }finally{db.close();}
});


test('debug password field supports long passwords without saving a player name',async()=>{
 const c=client({});c.e('codeInput').value='000000';c.e('codeInput').oninput();
 assert.equal(c.e('name').type,'password');assert.equal(c.e('name').maxLength,4096);assert.equal(c.e('create').disabled,true);
 c.e('name').value='long-test-password-never-save';await c.e('joinForm').onsubmit({preventDefault(){}});
 assert.equal(c.e('name').value,'');assert.equal([...c.storage.values()].some(v=>String(v).includes('long-test-password')),false);
 c.e('codeInput').value='ABCD23';c.e('codeInput').oninput();assert.equal(c.e('name').type,'text');assert.equal(c.e('name').maxLength,4096);
});

