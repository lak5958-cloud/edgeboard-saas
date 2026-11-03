import test from 'node:test';import assert from 'node:assert/strict';import {Readable} from 'node:stream';
import {redeemAccessCode} from '../lib/access-code.mjs';import {accessFor} from '../lib/auth.mjs';import handler from '../api/server.mjs';import {pageView} from '../public/views.mjs';
test('the exact code grants only complimentary Pro to the verified user and is repeatable',async()=>{
 const rows=new Map(),db=async(path,options)=>{assert.match(path,/on_conflict=user_id,kind/);assert.equal(options.headers.Prefer,'resolution=ignore-duplicates');const row=JSON.parse(options.body);rows.set(row.user_id+row.kind,row);};
 for(let i=0;i<2;i++)assert.equal((await redeemAccessCode({id:'verified-user'},'NIPPL3',db)).redeemed,true);
 assert.equal(rows.size,1);assert.deepEqual([...rows.values()][0],{user_id:'verified-user',kind:'complimentary',expires_at:null});
 for(const code of ['nippl3','wrong','',null,{code:'NIPPL3'},'x'.repeat(65)])await assert.rejects(redeemAccessCode({id:'verified-user'},code,()=>assert.fail('Invalid code must never write')),{status:400});
 await assert.rejects(redeemAccessCode(null,'NIPPL3',()=>assert.fail('Anonymous users must never write')),{status:401});
});
const response=()=>({setHeader(){},end(body){this.body=body}});
test('redeem route enforces sign-in, origin, method and rate limits and ignores client user IDs',async()=>{
 const keys=['APP_URL','RATE_LIMIT_SALT','SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY'],prior=Object.fromEntries(keys.map(k=>[k,process.env[k]])),original=globalThis.fetch;
 Object.assign(process.env,{APP_URL:'https://edgeboard.example',RATE_LIMIT_SALT:'synthetic-salt',SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_ANON_KEY:'synthetic',SUPABASE_SERVICE_ROLE_KEY:'synthetic'});
 let writes=[],allowed=true,rows=[];
 globalThis.fetch=async(url,options={})=>{url=String(url);let result=[];
  if(url.includes('/auth/v1/user'))result={id:'verified-user',email:'test@example.org'};
  else if(url.includes('consume_budget'))result=allowed;
  else if(options.method==='POST'){const row=JSON.parse(options.body);writes.push(row);rows=[row];result=null;}
  else result=rows;
  return new Response(JSON.stringify(result),{status:200});};
 const call=async({method='POST',cookie='eb_access=synthetic',origin='https://edgeboard.example',body={code:'NIPPL3',user_id:'someone-else',kind:'owner'}}={})=>{const req=Readable.from([Buffer.from(JSON.stringify(body))]);Object.assign(req,{url:'/api/access/redeem',method,headers:{cookie,origin}});const res=response();await handler(req,res);return res;};
 try{
  assert.equal((await call({cookie:''})).statusCode,401);assert.equal((await call({origin:'https://foreign.example'})).statusCode,403);assert.equal((await call({method:'GET'})).statusCode,405);
  allowed=false;assert.equal((await call()).statusCode,429);assert.equal(writes.length,0);allowed=true;
  assert.equal((await call()).statusCode,200);assert.deepEqual(writes,[{user_id:'verified-user',kind:'complimentary',expires_at:null}]);
  const access=await accessFor({headers:{cookie:'eb_access=synthetic'}},response());assert.equal(access.pro,true);assert.equal(access.owner,false);assert.equal(access.subscriptionActive,false);assert.equal(access.hasBillingAccount,false);
  rows=[{kind:'complimentary',expires_at:'2000-01-01T00:00:00Z'}];assert.equal((await accessFor({headers:{cookie:'eb_access=synthetic'}},response())).pro,false);
 }finally{globalThis.fetch=original;for(const key of keys){if(prior[key]===undefined)delete process.env[key];else process.env[key]=prior[key];}}
});
test('homepage credits Logan Kane and access-code entry requires a signed-in account without displaying the code',()=>{
 assert.match(pageView('/', 'NBA',{}),/Created by <strong>Logan Kane<\/strong>/);
 const signed=pageView('/account','NFL',{user:{email:'test@example.org'},pro:false});assert.match(signed,/id="accessCodeForm"/);assert.match(signed,/type="password"/);assert(!signed.includes('NIPPL3'));
 assert(!pageView('/account','NFL',{}).includes('id="accessCodeForm"'));
});
