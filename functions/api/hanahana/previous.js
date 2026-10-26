import { japanYesterday, normalizeDai, parsePscube } from '../../../lib/hanahana-pscube.mjs';

const VERSION = 'hanahana-pages-v1';
const json = (body, status = 200) => new Response(JSON.stringify({service: VERSION, ...body}), {
  status, headers: {'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
});

export async function onRequestGet({request, waitUntil}) {
  const url = new URL(request.url);
  let dai;
  try { dai = normalizeDai(url.searchParams.get('dai') || ''); }
  catch(e) { return json({ok:false,error:e.message},400); }
  const date = japanYesterday();
  const source = 'https://www.pscube.jp/dedamajyoho-P-townDMMpachi/c728103/cgi-bin/nc-v06-001.php?cd_dai=' + dai;
  const sourceLink = source + '#' + date.replaceAll('-','');
  const cacheKey = new Request(url.origin + '/api/hanahana/previous?dai=' + dai + '&date=' + date);
  const cache = globalThis.caches?.default;
  if(cache) { const hit = await cache.match(cacheKey); if(hit) return hit; }
  let result;
  try {
    const res = await fetch(source, {redirect:'manual', signal:AbortSignal.timeout(15000), headers:{Accept:'text/html'}});
    if(!res.ok) result = json({ok:false,upstreamStatus:res.status,error:`データ提供サイトがHTTP ${res.status}を返しました。自動取得できません。`,source:sourceLink},502);
    else {
      const html = await res.text();
      if(html.length > 3000000) throw Error('ページサイズが想定を超えました。');
      const parsed = parsePscube(html,dai,date);
      result = json({ok:true,...parsed,source:sourceLink,fetchedAt:new Date().toISOString()});
    }
  } catch(e) {
    result = json({ok:false,error:e.name === 'TimeoutError' || e.name === 'AbortError' ? '接続がタイムアウトしました。' : e.message || 'データ提供サイトに接続できませんでした。',source:sourceLink},502);
  }
  // Reuse successful results for five minutes within this Pages project.
  if(cache && result.ok) {
    const copy = new Response(result.clone().body,{status:result.status,headers:result.headers});
    copy.headers.set('cache-control','public,max-age=300');
    waitUntil(cache.put(cacheKey,copy));
  }
  return result;
}
