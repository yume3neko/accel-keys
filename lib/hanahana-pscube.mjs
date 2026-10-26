const plain=s=>s.replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
export function japanYesterday(now=new Date()){
 const today=now.toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'}),d=new Date(today+'T00:00:00+09:00');d.setUTCDate(d.getUTCDate()-1);return d.toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'});
}
export function normalizeDai(value){if(!/^\d{1,4}$/.test(value)||+value<1)throw Error('台番号は1〜9999の整数で入力してください。');return String(+value).padStart(4,'0');}
export function parsePscube(html,dai,targetDate){
 const updated=html.match(/(20\d{2})\/(\d{2})\/(\d{2})\s+(\d{2}:\d{2})(?:&nbsp;|\s)*更新/);if(!updated)throw Error('更新日を確認できません。ページ形式が異なるか、アクセスが制限されています。');
 const match=html.match(/台番号\s*(\d{1,4})\s*</);if(!match||normalizeDai(match[1])!==dai)throw Error('要求した台番号と取得ページが一致しません。');
 const title=plain(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||''),name=title.split('｜').pop().normalize('NFKC');
 let family;if(/ニューキングハナハナV/.test(name))family='newking';else if(/スターハナハナ/.test(name))family='star';else if(/ドラゴンハナハナ.*閃光/.test(name))family='dragon';else if(/ハナハナホウオウ.*天翔/.test(name))family='tensho';else if(/キングハナハナ/.test(name)&&!/グレート|ニュー/.test(name))family='king';else throw Error('対応する6号機ノーマル・BTタイプの機種名を確認できません。');
 const base=`${updated[1]}-${updated[2]}-${updated[3]}`,offset=(Date.parse(base+'T00:00:00Z')-Date.parse(targetDate+'T00:00:00Z'))/86400000;
 if(!Number.isInteger(offset)||offset<0||offset>6)throw Error(`対象日 ${targetDate} は取得ページの掲載範囲外です（更新日 ${base}）。`);
 const cols=[...html.matchAll(/<td\b[^>]*class=["'][^"']*\bcolumn\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/gi)];
 const expected=offset===0?'本日':offset+'日前';let cells;
 for(const col of cols){const vals=[...col[1].matchAll(/<div\b[^>]*class=["'][^"']*\binner\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)].map(m=>plain(m[1]));if(vals[0]===expected){cells=vals;break;}}
 if(!cells||cells.length!==10)throw Error('日別データの列構成を確認できません。自動入力を中止しました。');
 const num=i=>{const s=cells[i].replaceAll(',','');if(!/^\d+$/.test(s))throw Error('日別数値に未集計・欠損があります。');return Number(s)};
 const b=num(1),r=num(2),g=num(6);if(!Number.isSafeInteger(g)||g<=0||b+r>g)throw Error('ゲーム数・ボーナス回数に不整合があります。');
 // Confirm the fixed columns against the displayed BB/RB ratios before using them.
 for(const [k,i] of [[b,3],[r,4]]){if(!k)continue;const ratio=cells[i].match(/^1\s*\/\s*([\d,.]+)$/);if(!ratio||Math.abs(Number(ratio[1].replaceAll(',',''))-g/k)>1.1)throw Error('表示確率とゲーム数・回数が一致しません。');}
 return {dai,date:targetDate,family,machine:name,updatedAt:base+' '+updated[4],g,b,r};
}
