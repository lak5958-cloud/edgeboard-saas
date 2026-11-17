import {sb,required,AppError} from './cloud.mjs';
const cookies=req=>Object.fromEntries(String(req.headers.cookie||'').split(';').map(s=>s.trim().split(/=(.*)/s)).filter(x=>x[0]));
export function sessionCookies(res,session){const secure=required('APP_URL').startsWith('https:')?'; Secure':'';res.setHeader('Set-Cookie',[`eb_access=${session?.access_token||''}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${session?session.expires_in||3600:0}${secure}`,`eb_refresh=${session?.refresh_token||''}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${session?2592000:0}${secure}`]);}
export async function userFor(req,res){const c=cookies(req);if(!c.eb_access&&!c.eb_refresh)return null;try{return await sb('/auth/v1/user',{headers:{Authorization:'Bearer '+c.eb_access}},false);}catch{if(!c.eb_refresh)return null;try{const s=await sb('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:c.eb_refresh})},false);sessionCookies(res,s);return s.user;}catch{return null;}}}
export async function accessFor(req,res){const user=await userFor(req,res);if(!user)return {user:null,pro:false,owner:false};const rows=await sb('/rest/v1/entitlements?user_id=eq.'+encodeURIComponent(user.id)+'&select=kind,expires_at,customer_id');const owner=rows.some(e=>e.kind==='owner');return {user:{id:user.id,email:user.email},owner,hasBillingAccount:rows.some(e=>e.kind==='subscription'&&e.customer_id),subscriptionActive:rows.some(e=>e.kind==='subscription'&&e.expires_at&&Date.parse(e.expires_at)>Date.now()),pro:owner||rows.some(e=>e.kind==='grader'||e.kind==='complimentary'&&(!e.expires_at||Date.parse(e.expires_at)>Date.now())||e.kind==='subscription'&&e.expires_at&&Date.parse(e.expires_at)>Date.now())};}
export function requirePro(access){if(!access.user)throw new AppError(401,'Sign in to open research.');if(!access.pro)throw new AppError(402,'Research requires EdgeBoard Pro.');}
export async function login(res,email,password,signup=false){if(typeof email!=='string'||!email.includes('@')||typeof password!=='string'||password.length<8||email.length>254||password.length>256)throw new AppError(400,'Enter a valid email and a password of at least eight characters.');const s=await sb(signup?'/auth/v1/signup':'/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})},false);if(s.access_token)sessionCookies(res,s);return {signedIn:!!s.access_token,message:s.access_token?'Signed in.':'Check your email to confirm your account, then sign in.'};}

/** Request a password reset through Supabase Auth; never disclose whether an address exists. */
export async function requestPasswordReset(email){
 if(typeof email!=='string'||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new AppError(400,'Enter a valid email address.');
 const redirect=required('APP_URL')+'/login';
 try{await sb('/auth/v1/recover?redirect_to='+encodeURIComponent(redirect),{method:'POST',body:JSON.stringify({email})},false);}
 catch(error){if(error.status===429)throw new AppError(429,'Too many password-reset requests. Try again later.');if(error.status>=500)throw error;}
 return {message:'If an account exists for that email, a password reset link will be sent. Check your inbox and spam folder.'};
}

/** Complete an emailed recovery token without creating a session until normal sign-in. */
export async function completePasswordReset(token,password){
 if(typeof token!=='string'||token.length<24||token.length>8192||!/^[A-Za-z0-9._-]+$/.test(token))throw new AppError(400,'This recovery link is invalid or expired. Request a new link.');
 if(typeof password!=='string'||password.length<8||password.length>256)throw new AppError(400,'Choose a password of at least eight characters.');
 try{
  await sb('/auth/v1/user',{method:'PUT',headers:{Authorization:'Bearer '+token},body:JSON.stringify({password})},false);
  return {message:'Password updated. You can now sign in with your new password.'};
 }catch(error){if(error.status===401||error.status===403||error.status===422)throw new AppError(400,'This recovery link is expired or invalid. Request a new link.');throw error;}
}
