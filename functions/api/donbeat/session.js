import {checkWriteOrigin,hasAdminSession,login,logout} from '../../_shared/donbeat-auth.js';
const noCache={'cache-control':'no-store'};
export async function onRequestGet({request,env}){
 return Response.json({authenticated:await hasAdminSession(request,env)},{headers:noCache});
}
export async function onRequestPost({request,env}){return login(request,env)}
export async function onRequestDelete({request}){
 const rejected=checkWriteOrigin(request);
 return rejected||logout();
}
