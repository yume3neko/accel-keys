import {correctSecret,createSession,clearSession,hasSession,requireSession,noStore} from '../../_lib/donbeat-session.js';
const json=noStore;
export async function onRequestGet({request,env}){
 if(!env.DONBEAT_ADMIN_TOKEN)return json({authenticated:false,configured:false},503);
 return json({authenticated:await hasSession(request,env)});
}
export async function onRequestPost({request,env}){
 if(!env.DONBEAT_ADMIN_TOKEN||env.DONBEAT_ADMIN_TOKEN.length<16)return json({error:'Cloudflare PagesにDONBEAT_ADMIN_TOKENを設定してください。'},503);
 const origin=request.headers.get('origin'),url=new URL(request.url);
 if(origin&&origin!==url.origin||request.headers.get('sec-fetch-site')==='cross-site')return json({error:'このサイトからログインしてください。'},403);
 if(Number(request.headers.get('content-length'))>3000)return json({error:'入力が大きすぎます。'},413);
 let data;try{data=await request.json()}catch{return json({error:'パスワードの形式が不正です。'},400)}
 if(!await correctSecret(data?.token,env))return json({error:'管理者トークンが正しくありません。'},401);
 const response=json({authenticated:true,expiresIn:28800});
 response.headers.set('Set-Cookie',await createSession(env,request));return response;
}
export async function onRequestDelete({request,env}){
 const response=json({authenticated:false});response.headers.set('Set-Cookie',clearSession(request));return response;
}
