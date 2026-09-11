'use strict';
const danPool=[],danMetrics={ok:{label:'可',direction:'max'},miss:{label:'不可',direction:'max'},good:{label:'良',direction:'min'},rolls:{label:'連打',direction:'min'},score:{label:'スコア',direction:'min'},allcombo:{label:'たたけた数',direction:'min'},maxCombo:{label:'最大コンボ',direction:'min'}};
let danRun=null,danTimer=null,danNextId=1;
function danNode(tag,text,className){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n}
function rememberDanCharts(){for(const c of charts){const old=danPool.findIndex(e=>c.sourcePath&&e.chart.sourcePath===c.sourcePath&&e.chart.meta.COURSE===c.meta.COURSE&&e.chart!==c);if(old>=0)danPool.splice(old,1);if(!danPool.some(e=>e.chart===c))danPool.push({id:String(danNextId++),chart:c,demo:demoMode})}if($('danDialog').open)refreshDanSongs()}
function danSongLabel(entry){const c=entry.chart;return (c.meta.TITLE||'無題')+' / '+(names[c.meta.COURSE]||c.meta.COURSE||'おに')+(entry.demo?'（練習曲）':c.audioFile?'':'（音源未選択）')}
let pendingDan=null;
function danPreviewTitle(c){if(!c)return '？？？';const title=(c.meta.TITLE||'').normalize('NFC').trim(),file=(c.importName||c.sourcePath||'').split('/').pop().replace(/\.[^.]+$/,'').normalize('NFC').trim();return title&&title===file?title:'？？？'}
function danPendingTitle(song,index){let entry;try{entry=resolveDanConfig(true,index).songs[0]}catch{}return entry?danPreviewTitle(entry.chart):pendingDan.config.hide?.includes(index+1)?'？？？':song.chart}
function refreshDanSongs(){
 const box=$('danSummary');box.replaceChildren();if(!pendingDan){box.append(danNode('p','段位設定ファイルを読み込んでください。'));return}
 const c=pendingDan.config;box.append(danNode('h3',c.name));c.songs.forEach((song,i)=>box.append(danNode('p',(i+1)+'曲目：'+danPendingTitle(song,i)+(song.course!==undefined?' / '+['かんたん','ふつう','むずかしい','おに','裏おに'][song.course]:''))));
 box.append(danNode('p','魂：合格 '+c.gauge+'% / 金 '+c.goldGauge+'%以上'));
 for(const r of c.conditions)box.append(danNode('p',danMetrics[r.type].label+'（'+(r.scope==='total'?'全体':'曲ごと')+'）：'+r.red.join(' / ')+(' '+r.red.map((_,i)=>danLabel(r,i)).join(' / '))+'、金 '+r.gold.join(' / ')));
}
function openDan(){if(loading||importing||danRun||state==='playing'||state==='paused')return;rememberDanCharts();refreshDanSongs();$('danDialog').showModal()}
function parseDanConfig(text){
 const fields=new Map(),fail=m=>{throw Error('段位設定：'+m)};
 for(const raw of text.replace(/^\uFEFF/,'').split(/\r?\n/)){const line=raw.trim();if(!line||line.startsWith('//'))continue;const at=line.indexOf(':');if(at<0)fail('「キー:値」で記載してください。');const key=line.slice(0,at).trim().toUpperCase();if(fields.has(key))fail(key+' が重複しています。');fields.set(key,line.slice(at+1).trim());}
 const get=k=>{if(!fields.has(k))fail(k+' がありません。');return fields.get(k)};
 const number=v=>{if(!/^\d+$/.test(v)||!Number.isSafeInteger(Number(v)))fail('条件値は0以上の整数です。');return Number(v)};
 const limits=parts=>{if(parts.length!==3||!['m','l'].includes(parts[0]))fail('条件は m/l,赤合格,金合格 です。');const [op,a,b]=parts,red=number(a),gold=number(b);if(op==='m'?gold<red:gold>red)fail('金条件を通常以上に厳しくしてください。');return {op,red,gold}};
 const split=k=>get(k).split(',').map(x=>x.trim());const name=get('TITLE');if(!name)fail('TITLE が空です。');
 const songKeys=[...fields.keys()].filter(k=>/^SONG\d+$/.test(k)).sort((a,b)=>Number(a.slice(4))-Number(b.slice(4)));
 if(!songKeys.length)fail('SONG1 が必要です。');const songs=songKeys.map((k,i)=>{if(k!=='SONG'+(i+1)||!get(k))fail('SONGは1から連番で曲名を指定してください。');const value=get(k),at=value.lastIndexOf(',');if(at<0)return {chart:value};const title=value.slice(0,at).trim(),difficulty=value.slice(at+1).trim();if(!title||! /^[0-4]$/.test(difficulty))fail(k+' の難易度番号は0〜4です（MCは番号を省略）。');return {chart:title,course:Number(difficulty)}});
 const gaugeParts=split('EXAM1');if(gaugeParts.length!==2)fail('EXAM1 は 赤合格,金合格 です。');const [gauge,goldGauge]=gaugeParts.map(number);if(goldGauge>100||gauge>100||goldGauge<gauge)fail('魂ゲージは0〜100、金を通常以上にしてください。');
 const types={best:'good',good:'ok',miss:'miss',score:'score',roll:'rolls',combo:'maxCombo',allcombo:'allcombo'},conditions=[];
 const exams=[...fields.keys()].filter(k=>/^EXAM\d+$/.test(k)&&k!=='EXAM1').sort((a,b)=>Number(a.slice(4))-Number(b.slice(4)));
 for(const [index,key] of exams.entries()){if(key!=='EXAM'+(index+2))fail('EXAMは1から連番で指定してください。');const parts=split(key),[scope,type]=parts;if(!Object.hasOwn(types,type))fail(key+' の条件種類が不正です。');const c={type:types[type],scope:scope==='1'?'total':'song',red:[],gold:[],ops:[]};let values;
 if(scope==='1')values=[limits(parts.slice(2))];else if(scope==='2'&&parts.length===2)values=songs.map((_,i)=>limits(split(key+'-'+(i+1))));else fail(key+' の範囲は 1（全体）/ 2（曲別）です。');
 for(const v of values){c.red.push(v.red);c.gold.push(v.gold);c.ops.push(v.op)}conditions.push(c);}
 const hide=fields.has('HIDE')&&get('HIDE')?split('HIDE').map(number):[];if(hide.some(n=>n<1||n>songs.length))fail('HIDEの曲番号は1〜曲数の範囲で指定してください。');
 const allowed=new Set(['TITLE','HIDE','EXAM1',...songKeys,...exams]);for(const key of exams){const c=conditions[exams.indexOf(key)];if(c.scope==='song')songs.forEach((_,i)=>allowed.add(key+'-'+(i+1)))}for(const key of fields.keys())if(!allowed.has(key))fail('不明な項目：'+key);
 return {name,songs,gauge,goldGauge,conditions,hide};
}
function danOp(c,i=0){return c.ops?.[i]||(danOp(c,danRun.index)!=='m'?'le':'m')}
function danLabel(c,i=0){return danOp(c,i)==='m'?'以上':danOp(c,i)==='l'?'未満':'以下'}
function resolveDanConfig(preview=false,onlyIndex=null){
 if(!pendingDan)throw Error('段位設定ファイルを読み込んでください。');const c=pendingDan.config,dir=pendingDan.path.split('/').slice(0,-1).join('/');
 const selected=c.songs.map((song,i)=>{if(onlyIndex!==null&&i!==onlyIndex)return null;const path=normalizedPath(dir+'/'+song.chart);let matches=danPool.filter(e=>e.chart.sourcePath&&normalizedPath(e.chart.sourcePath)===path);
 if(!matches.length)matches=danPool.filter(e=>e.chart.sourcePath&&normalizedPath(e.chart.sourcePath)===normalizedPath(song.chart));
 if(!matches.length)matches=danPool.filter(e=>e.chart.sourcePath&&normalizedPath(e.chart.sourcePath).endsWith('/'+normalizedPath(song.chart)));
 if(!matches.length)matches=danPool.filter(e=>e.chart.importName&&normalizedPath(e.chart.importName)===normalizedPath(song.chart));
 if(!matches.length)matches=danPool.filter(e=>(e.chart.meta.TITLE||'').normalize('NFC')===song.chart.normalize('NFC'));
 if(song.course!==undefined){const courses={easy:0,normal:1,hard:2,oni:3,edit:4};matches=matches.filter(e=>{if(/\.mc$/i.test(e.chart.sourcePath||''))return false;const course=String(e.chart.meta.COURSE||'Oni').trim().toLowerCase();return (Object.hasOwn(courses,course)?courses[course]:/^[0-4]$/.test(course)?Number(course):-1)===song.course});}
 if(matches.length!==1)throw Error((i+1)+'曲目：'+danPendingTitle(song,i)+(matches.length?' が複数あります。難易度番号や譜面の相対パスで特定してください。':' に一致する譜面・難易度がありません。指定を確認して譜面を追加してください。'));
 if(!preview&&!matches[0].chart.audioFile)throw Error((i+1)+'曲目の音源 '+(matches[0].chart.meta.WAVE||'')+' が未読込です。');return matches[0];});
 return {...c,songs:selected.filter(Boolean),auto:false};
}
async function tryStartPendingDan(){if(!pendingDan||!pendingDan.armed||danRun)return;refreshDanSongs();} 
function danStats(){return {score,good,ok,miss,rolls,maxCombo,balloonRolls,balloonPops,allcombo:good+ok+rolls}}
function danSongStats(){const now=danStats(),base=danRun.baseline;return {score:now.score-base.score,good:now.good-base.good,ok:now.ok-base.ok,miss:now.miss-base.miss,rolls:now.rolls-base.rolls,soul,balloonRolls:now.balloonRolls-(base.balloonRolls||0),balloonPops:now.balloonPops-(base.balloonPops||0),maxCombo:danRun.songMaxCombo,allcombo:now.good-base.good+now.ok-base.ok+now.rolls-base.rolls}}
function danPass(value,threshold,c,i=0){const op=danOp(c,i);return op==='l'?value<threshold:op==='le'?value<=threshold:value>=threshold}
function evaluateDan(config,results,totals,gauge,complete=false){const status=gold=>{if(complete&&gauge<(gold?config.goldGauge:config.gauge))return false;for(const condition of config.conditions){const limits=gold?condition.gold:condition.red;if(condition.scope==='total'){if((complete||danOp(condition)!=='m')&&!danPass(totals[condition.type],limits[0],condition))return false}else{for(let i=0;i<results.length;i++)if(!danPass(results[i][condition.type],limits[i],condition,i))return false}}return true};return {pass:status(false),gold:status(true)}}
function danExceededMaximum(){if(!danRun)return false;const r=evaluateDan(danRun.config,danRun.results,danStats(),soul,false);if(!r.pass)return true;const current=danSongStats();return danRun.config.conditions.some(c=>c.scope==='song'&&danOp(c,danRun.index)!=='m'&&!danPass(current[c.type],c.red[danRun.index],c,danRun.index))}
// Optimistic remaining values: mark impossible only when even perfect remaining play cannot pass.
function danPossibleStats(songOnly){
 const current=danSongStats(),possible={...(songOnly?current:danStats())};let remaining=0;
 const t=time()-Number($('offset').value||0)/1000;
 const groups=[{chart,notes,current:true}];if(!songOnly)for(let i=danRun.index+1;i<danRun.config.songs.length;i++)groups.push({chart:danRun.config.songs[i].chart,notes:danRun.config.songs[i].chart.notes,current:false});
 for(const group of groups){const normalCount=group.chart.notes.filter(n=>n.type<=4).length,noteScore=Math.floor(1000000/Math.max(1,normalCount)/10)*10;
  for(const n of group.notes){if(group.current&&n.done)continue;if(n.type<=4){remaining++;possible.good++;possible.ok++;possible.miss++;possible.allcombo++;possible.score+=noteScore;continue}
   if(group.current&&n.end<t)continue;const hits=group.current?n.hits||0:0;let extra;
   if(danRun.config.auto)extra=Math.max(0,autoRollHits(n,n.end)-hits);
   else extra=n.type===7?Math.max(0,n.required-hits):Infinity;
   possible.rolls+=extra;possible.allcombo+=extra;possible.score+=extra*100;
   if(n.type===7&&hits+extra>=n.required)possible.score+=5000;
  }
 }
 possible.maxCombo=Math.max(possible.maxCombo,(songOnly?danRun.songCombo:combo)+remaining);return possible;
}
function danUnplayedMaximum(c){const normal=c.notes.filter(n=>n.type<=4).length,result={good:normal,ok:0,miss:0,maxCombo:normal,rolls:0,score:normal*Math.floor(1000000/Math.max(1,normal)/10)*10};for(const n of c.notes){if(n.type<5)continue;const hits=danRun.config.auto?autoRollHits(n,n.end):n.type===7?n.required:Infinity;result.rolls+=hits;result.score+=hits*100;if(n.type===7&&hits>=n.required)result.score+=5000}result.ok=normal;result.miss=normal;result.allcombo=normal+result.rolls;return result}
function danCurrentFailed(){
 if(!danRun)return false;if(danRun.failed||danExceededMaximum())return true;
 const whole=danPossibleStats(false),current=danPossibleStats(true);
 for(const c of danRun.config.conditions){const key=c.scope==='song'?danRun.index:0;if(danOp(c,key)==='m'&&!danPass((c.scope==='song'?current:whole)[c.type],c.red[key],c,key))return true;if(c.scope==='song')for(let i=danRun.index+1;i<danRun.config.songs.length;i++)if(danOp(c,i)==='m'&&!danPass(danUnplayedMaximum(danRun.config.songs[i].chart)[c.type],c.red[i],c,i))return true}
 // Gauge is checked at the end, or earlier only if no possible remaining gain can reach it.
 let maxGauge=soul;for(let i=danRun.index;i<danRun.config.songs.length;i++){const c=danRun.config.songs[i].chart,total=c.notes.filter(n=>n.type<=4).length,remaining=(i===danRun.index?notes:c.notes).filter(n=>n.type<=4&&!(i===danRun.index&&n.done)).length;maxGauge=Math.min(100,maxGauge+remaining*130/soulNoteCount())}
 return maxGauge+1e-9<danRun.config.gauge;
}
function notifyDanJudgment(error){if(!danRun)return;danRun.songCombo=error<=judgmentWindows().ok?danRun.songCombo+1:0;danRun.songMaxCombo=Math.max(danRun.songMaxCombo,danRun.songCombo)}
function gaugeColor(value,red,gold){return value>=gold?'rainbow':value>=red?'yellow':'red'}
function updateSoulDisplay(){const red=danRun?danRun.config.gauge:80,gold=danRun?danRun.config.goldGauge:100;
 $('gauge').className=gaugeColor(soul,red,gold);$('soulRed').style.left=red+'%';$('soulGold').style.left=gold+'%';
 $('soulBorders').textContent=(danRun?'赤 ':'クリア ')+red+'% ／ '+(danRun?'金 ':'満魂 ')+gold+'%';
 $('soulRed').title='通常合格 '+red+'%';$('soulGold').title='金合格 '+gold+'%';}
function danGaugeStage(c,i,value){
 const red=c.red[i],gold=c.gold[i],down=danOp(c,i)!=='m';
 const second=down?!danPass(value,gold,c,i):danPass(value,red,c,i);
 const target=down?(second?red:gold):(second?gold:red);
 const base=second?(down?gold:red):0;
 const capacity=Math.max(0,target-base);
 const amount=Math.max(0,Math.min(capacity,down?target-value:value-base));
 const ratio=capacity?amount/capacity:(danPass(value,target,c,i)?1:0);
 return {down,second,target,capacity,amount,ratio,kind:down?(second?'赤':'金'):(second?'金':'赤'),remaining:Math.max(0,target-value)};
}
function danConditionView(c,i,value,pending=false){const red=c.red[i],gold=c.gold[i],stage=danGaugeStage(c,i,value),{down,second,target,capacity,amount,ratio,kind}=stage;
 const box=danNode('div',undefined,'exam-gauge'+(pending?' pending':''));
 const label=danNode('div',undefined,'exam-caption');label.append(danNode('b',(c.scope==='song'?(i+1)+'曲目 ':'全体 ')+danMetrics[c.type].label),danNode('span',pending?'未演奏':down?kind+'まで あと '+stage.remaining:String(value)));box.append(label);
 const track=danNode('div',undefined,'exam-track'+(second?' second-stage':'')),fill=danNode('i');
 const danger=down&&!pending&&stage.remaining<5;
 fill.className=(pending?'':danPass(value,gold,c,i)?'rainbow':danPass(value,red,c,i)?'yellow':'red')+(danger?' danger':'');fill.style.width=ratio*100+'%';track.append(fill);
 const mark=danNode('em',undefined,kind==='赤'?'border-red':'border-gold');mark.style.left=down?'0%':'100%';mark.title=kind+' '+target+danLabel(c,i);track.append(mark);
 track.setAttribute('role','meter');track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax',String(Math.max(1,capacity)));track.setAttribute('aria-valuenow',String(amount));track.setAttribute('aria-label',danMetrics[c.type].label+' '+kind+(down?'合格までの残り':'合格への進捗'));
 if(danger)track.className+=' danger';box.append(track,danNode('small',(second?'② ':'① ')+kind+' '+target+danLabel(c,i)+' ／ 赤 '+red+'・金 '+gold));return box;}
function updateDanHUD(){updateSoulDisplay();const hud=$('danHud');if(!danRun){hud.hidden=true;return}hud.hidden=false;hud.replaceChildren();hud.append(danNode('b',danRun.config.name+'　'+(danRun.index+1)+'/'+danRun.config.songs.length+'曲　'+(danRun.failed?'不合格確定・この曲まで':''),'dan-heading'));
 const grid=danNode('div',undefined,'exam-grid');for(const c of danRun.config.conditions){const group=danNode('div',undefined,'exam-group');const indices=c.scope==='song'?[danRun.index]:[0];for(const i of indices){const stats=c.scope==='total'?danStats():danRun.results[i]||danSongStats();group.append(danConditionView(c,i,stats?.[c.type]||0,!stats))}grid.append(group)}hud.append(grid);}
async function launchDan(automatic=false){if(loading||importing||danRun)return;let config;try{config=resolveDanConfig();config.auto=automatic===true}catch(e){$('danError').textContent=e.message;return}loading=true;$('danPlay').disabled=true;$('danClose').disabled=true;try{await audio().resume();const buffers=[],cache=new Map();for(let i=0;i<config.songs.length;i++){const e=config.songs[i],c=e.chart;$('danError').textContent=(i+1)+'/'+config.songs.length+'曲目の音源を準備中…';if(e.demo){buffers.push(null);continue}const file=c.audioFile;if(!file)throw Error((i+1)+'曲目の音源がありません。対応する音源を追加してください。');if(c===chart&&audioBuffer)cache.set(file,audioBuffer);if(!cache.has(file))cache.set(file,c.preloadedAudio||await audio().decodeAudioData(await file.arrayBuffer()));buffers.push(cache.get(file))}
 pendingDan.armed=false;danRun={config,buffers,index:0,results:[],baseline:{score:0,good:0,ok:0,miss:0,rolls:0,maxCombo:0},songCombo:0,songMaxCombo:0,original:{chart,charts,audioBuffer,demoMode},finished:false,failed:false};$('danDialog').close();loading=false;await beginDanSong();
 }catch(e){$('danError').textContent='開始できませんでした：'+e.message;if(danRun)exitDan()}finally{loading=false;$('danPlay').disabled=false;$('danClose').disabled=false}}
async function beginDanSong(){clearTimeout(danTimer);if(!danRun||danRun.finished)return;const e=danRun.config.songs[danRun.index];chart=e.chart;demoMode=e.demo;audioBuffer=danRun.buffers[danRun.index];state='ready';danRun.baseline=danRun.index?danStats():{score:0,good:0,ok:0,miss:0,rolls:0,maxCombo:0};danRun.songCombo=0;danRun.songMaxCombo=0;$('title').textContent=chart.meta.TITLE||'無題';$('subtitle').textContent=danRun.config.name+' / '+(danRun.index+1)+'曲目';$('level').textContent='★ '+(chart.meta.LEVEL||'?');$('bpm').textContent=chart.bpm+' BPM';await start({dan:true,carry:danRun.index>0,seamless:danRun.index>0})}
function finishDanSong(){if(!danRun||danRun.finished)return;pausedTime=time();stopAudio();cancelAnimationFrame(raf);danRun.results.push(danSongStats());const complete=danRun.index===danRun.config.songs.length-1,result=evaluateDan(danRun.config,danRun.results,danStats(),soul,complete);if(danRun.failed||!result.pass||complete){showDanResult(danRun.failed||!result.pass);return}state='dan-break';$('pause').disabled=true;$('status').textContent='次の曲まで3秒';$('overlay').style.display='flex';$('overlay').replaceChildren();$('overlay').append(danNode('h2','次は '+danRun.config.songs[danRun.index+1].chart.meta.TITLE),danNode('p','3秒後に演奏を開始します'));const resume=danNode('button','再開（3秒後に開始）');resume.onclick=queueDanNext;$('overlay').append(resume);queueDanNext();}

function showDanResult(forcedFailure=false){if(!danRun||danRun.finished)return;const interruptedSong=danRun.results.length<=danRun.index;if(interruptedSong)danRun.results.push(danSongStats());danRun.finished=true;pausedTime=time();state='dan-result';stopAudio();cancelAnimationFrame(raf);clearTimeout(danTimer);document.body.classList.remove('playing');$('pause').disabled=true;const complete=danRun.results.length===danRun.config.songs.length&&!forcedFailure,r=evaluateDan(danRun.config,danRun.results,danStats(),soul,complete),passed=complete&&r.pass,title=danRun.config.auto?'オート演奏終了':passed?r.gold?'金合格':'合格':'不合格';const box=$('danResultContent');box.replaceChildren();box.append(danNode('p',danRun.config.name),danNode('h2',title,'dan-result-title'));if(danRun.config.auto)box.append(danNode('p','オート演奏のため合格扱いにはなりません。条件上は '+(passed?r.gold?'金合格相当':'合格相当':'不合格相当')+'です。'));
 box.append(resultSoul(soul,danRun.config.gauge,danRun.config.goldGauge),resultStats(danStats()));
 const whole=danNode('div',undefined,'result-exams');for(const c of danRun.config.conditions.filter(c=>c.scope==='total'))whole.append(danConditionView(c,0,danStats()[c.type]));box.append(whole);
 for(let i=0;i<danRun.config.songs.length;i++){const entry=danRun.config.songs[i],stats=danRun.results[i],section=danNode('section',undefined,'result-song');section.append(danNode('h3',(i+1)+'. '+entry.chart.meta.TITLE),danNode('p',resultDifficulty(entry.chart)));if(stats){section.append(resultStats(stats),danNode('p','曲終了時の魂ゲージ（通し） '+Math.floor(stats.soul)+'%'));}else section.append(danNode('p','未演奏'));for(const c of danRun.config.conditions.filter(c=>c.scope==='song'))section.append(danConditionView(c,i,stats?.[c.type]||0,!stats));box.append(section);}
 const replay=async automatic=>{exitDan();await launchDan(automatic)};$('danResultEdit').onclick=()=>replay(false);$('danResultEditAuto').onclick=()=>replay(true);$('danResultExit').onclick=exitDan;
 $('overlay').style.display='flex';$('overlay').replaceChildren();$('overlay').append(danNode('h2',title));const view=danNode('button','コース結果を見る','primary');view.onclick=()=>$('danResult').showModal();$('overlay').append(view);$('status').textContent=title;arrangeResult(true);$('danResult').showModal();}
function exitDan(){clearTimeout(danTimer);if(!danRun)return;const old=danRun.original;danRun=null;chart=old.chart;charts=old.charts;audioBuffer=old.audioBuffer;demoMode=old.demoMode;stopAudio();cancelAnimationFrame(raf);$('danResult').close();$('danHud').hidden=true;unlock();$('title').textContent=chart.meta.TITLE||'無題';$('subtitle').textContent=chart.meta.SUBTITLE||'';$('level').textContent='★ '+(chart.meta.LEVEL||'?');$('bpm').textContent=chart.bpm+' BPM';reset()}
function initDan(){
 $('danOpen').onclick=openDan;$('danClose').onclick=()=>$('danDialog').close();$('danDialog').addEventListener('cancel',e=>{if(loading)e.preventDefault()});$('danPlay').onclick=()=>launchDan(false);$('danPlayAuto').onclick=()=>launchDan(true);
 for(const id of ['danFiles','danFolder'])$(id).onchange=async e=>{await loadFiles(e.target.files);e.target.value=''};
 $('danResultEdit').onclick=()=>{exitDan();openDan()};$('danResultExit').onclick=exitDan;document.addEventListener('visibilitychange',()=>{if(document.hidden&&state==='dan-break')clearTimeout(danTimer)});
}

function queueDanNext(){clearTimeout(danTimer);danTimer=setTimeout(()=>{if(!danRun||state!=='dan-break'||document.hidden)return;danRun.index++;beginDanSong()},3000)}

function resultDifficulty(c){const course=c.meta.COURSE,level=c.meta.LEVEL;return (course?(names[course]||course):'')+(level&&level!=='?'?'　★ '+level:'');}
function resultStats(stats){const box=danNode('div',undefined,'result-stats');for(const [label,value] of [['スコア',stats.score],['良',stats.good],['可',stats.ok],['不可',stats.miss],['最大コンボ',stats.maxCombo],['合計連打数',stats.rolls]]){const cell=danNode('div');cell.append(danNode('small',label),danNode('strong',Number(value||0).toLocaleString()));box.append(cell)}return box;}
function resultSoul(value,red=80,gold=100){const section=danNode('div',undefined,'result-soul');section.append(danNode('b','魂ゲージ '+Math.floor(value)+'%'));const meter=danNode('div',undefined,'meter'),fill=danNode('i',undefined,gaugeColor(value,red,gold));fill.style.width=value+'%';meter.append(fill);for(const [kind,limit] of [['red',red],['gold',gold]]){const mark=danNode('em',undefined,'border-'+kind);mark.style.left=limit+'%';meter.append(mark)}section.append(meter,danNode('small',(danRun?'赤 ':'クリア ')+red+'% ／ '+(danRun?'金 ':'満魂 ')+gold+'%'));return section;}
function showSingleResult(){const box=$('danResultContent');box.replaceChildren();box.append(danNode('p',chart.meta.TITLE||'無題'),danNode('h2',auto?'オート演奏終了':soul>=80?'クリア！':'演奏終了','dan-result-title'),danNode('p',resultDifficulty(chart)));if(practiceTarget!==null)box.append(danNode('p','途中から演奏：'+practiceTarget.toFixed(2)+'秒〜'));box.append(resultSoul(soul),resultStats(danStats()));$('danResultExit').onclick=()=>{$('danResult').close();reset()};$('danResultEdit').onclick=()=>{$('danResult').close();start()};$('danResultEditAuto').onclick=()=>{$('danResult').close();start({auto:true})};$('overlay').replaceChildren();$('overlay').style.display='flex';const view=danNode('button','リザルトを見る','primary');view.onclick=()=>$('danResult').showModal();$('overlay').append(view);$('status').textContent='演奏終了';arrangeResult(false);$('danResult').showModal();}

function arrangeResult(course){const box=$('danResultContent'),nodes=Array.from(box.children),summary=danNode('section',undefined,'result-summary'),songs=danNode('div',undefined,'result-song-list');box.className=course?'course-result':'single-result';for(const node of nodes.slice(2)){if(node.className==='result-song')songs.append(node);else summary.append(node)}box.replaceChildren(...nodes.slice(0,2),summary);if(course)box.append(songs);}
