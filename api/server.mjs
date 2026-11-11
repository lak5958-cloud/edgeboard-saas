import {performanceFile,readPublishedAudit} from '../lib/published-audit.mjs';
import {readSnapshotObject} from '../lib/cloud.mjs';
import {prepareFantasyForecast,gradeFantasyForecasts} from '../lib/fantasy-forecast.mjs';
import {researchHealth} from '../lib/research-health.mjs';
import {workloadAudit} from '../lib/workload-audit.mjs';
import {auditDates} from '../lib/audit-summary.mjs';
import outsideSeed from '../lib/outside-seed.json' with {type:'json'};
import {redeemAccessCode} from '../lib/access-code.mjs';
import {publicGameMarkets} from '../lib/game-markets.mjs';
import {tradeEvidence,groundedBrief,briefPrompt,defaultBriefSelection} from '../lib/ai-evidence.mjs';
import {availablePickMarkets} from '../lib/pick-markets.mjs';
import {workspaceScope,workspaceMeta,workspacePage} from '../lib/research-workspace.mjs';
import {withCurrentProfiles} from '../lib/profiles.mjs';
import {runRefresh} from '../lib/refresh.mjs';import {publicDailyPicks} from '../lib/daily-picks.mjs';
import {gzipSync} from 'node:zlib';import {pageRows} from '../lib/snapshot-pages.mjs';
import {createHash,timingSafeEqual} from 'node:crypto';import {AppError,required,sb,snapshot,snapshotRevision,bundle,request} from '../lib/cloud.mjs';import {accessFor,requirePro,login,sessionCookies,userFor} from '../lib/auth.mjs';import {billingReadiness,verifyBillingConfig,checkout,stripe,verifyWebhook,handleStripeEvent} from '../lib/billing.mjs';import {playerList,analyzeTrade} from '../lib/fantasy.mjs';import {scanGamePicks} from '../lib/picks.mjs';
export const config={api:{bodyParser:false}};
const json=(res,status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','private, no-store');const body=JSON.stringify(data);if(Buffer.byteLength(body)>32768){res.setHeader('Content-Encoding','gzip');res.setHeader('Vary','Accept-Encoding');res.end(gzipSync(body));}else res.end(body);};
async function rawBody(req){const parts=[];let size=0;for await(const part of req){size+=part.length;if(size>65536)throw new AppError(413,'Request is too large.');parts.push(part);}return Buffer.concat(parts);}
async function budget(req,scope,max=60){const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0],key=createHash('sha256').update(required('RATE_LIMIT_SALT')+scope+ip).digest('hex');const ok=await sb('/rest/v1/rpc/consume_budget',{method:'POST',body:JSON.stringify({budget_key:key,max_uses:max,window_seconds:3600})});if(!ok)throw new AppError(429,'Hourly request limit reached. Please try again later.');}
function origin(req){if(req.headers.origin!==required('APP_URL'))throw new AppError(403,'Request origin is not allowed.');}
const allowed=new Set(['live-data.json','evidence.json','evidence.auto.json','evidence.players.json','research.json','research.user.json','outside-picks.user.json','roster-cache.json','stat-sync-status.json','player-history-status.json','context.auto.json','context.user.json','matchups.auto.json','model-report.json','validation-report.json','historical-report.json','team-history.json','future-schedule.json','fantasy-game-logs.json','refresh-status.json']);
export default async function handler(req,res){try{
 const url=new URL(req.url,'http://local'),route=String(req.query?.route||url.searchParams.get('route')||url.pathname.replace(/^\/api\//,'')).replace(/^\//,'');
 if(route==='internal/refresh'){
  const a=Buffer.from(String(req.headers.authorization||'')),b=Buffer.from('Bearer '+(process.env.CRON_SECRET||''));if(!process.env.CRON_SECRET||a.length!==b.length||!timingSafeEqual(a,b))throw new AppError(401,'Refresh authentication required.');if(req.method!=='GET')throw new AppError(405,'GET required.');return json(res,200,await runRefresh({maxEvents:80,manual:url.searchParams.get('trigger')==='owner'}));
 }
 if(route==='billing/webhook'){
  if(req.method!=='POST')throw new AppError(405,'POST required.');const event=verifyWebhook(await rawBody(req),req.headers['stripe-signature'],required('STRIPE_WEBHOOK_SECRET'));
  await handleStripeEvent(event);return json(res,200,{received:true});
 }
 if(req.method!=='GET'&&req.method!=='POST')throw new AppError(405,'Method not allowed.');
 if(req.method==='POST')origin(req);
 if(route==='billing/config'){
  if(url.searchParams.get('verify')==='1'){
   if(req.method!=='GET')throw new AppError(405,'GET required.');
   requirePro(await accessFor(req,res));
   await budget(req,'billing-config',10);
   return json(res,200,await verifyBillingConfig());
  }
  return json(res,200,billingReadiness());
 }
 if(route==='health')return json(res,200,{version:'1.12.1',saasVersion:'2.2.0',refreshSupported:true,connected:!!process.env.SUPABASE_URL});
 if(route==='session')return json(res,200,await accessFor(req,res));
 if(['auth/login','auth/signup'].includes(route)){if(req.method!=='POST')throw new AppError(405,'POST required.');await budget(req,'auth',20);const b=JSON.parse((await rawBody(req)).toString());return json(res,200,await login(res,b.email,b.password,route.endsWith('signup')));}
 if(route==='auth/logout'){if(req.method!=='POST')throw new AppError(405,'POST required.');const user=await userFor(req,res);sessionCookies(res,null);return json(res,200,{signedOut:true});}
 if(route==='headshot'){const league=String(url.searchParams.get('league')||'').toLowerCase(),id=url.searchParams.get('id')||'';if(!['nba','nfl'].includes(league)||!/^\d{1,12}$/.test(id))throw new AppError(400,'Invalid player image.');const image=await fetch(`https://a.espncdn.com/i/headshots/${league}/players/full/${id}.png`,{signal:AbortSignal.timeout(10000)});if(!image.ok||!image.headers.get('content-type')?.startsWith('image/png'))throw new AppError(404,'Player image unavailable.');const bytes=Buffer.from(await image.arrayBuffer());if(bytes.length>1500000)throw new AppError(404,'Player image unavailable.');res.statusCode=200;res.setHeader('Content-Type','image/png');res.setHeader('Cache-Control','public, max-age=86400, s-maxage=604800');res.setHeader('X-Content-Type-Options','nosniff');return res.end(bytes);}
 if(route==='players'){const league=url.searchParams.get('league');if(!['NBA','NFL'].includes(league))throw new AppError(400,'Choose NBA or NFL.');const data=await bundle({rostersOnly:true});return json(res,200,{players:playerList(data,league),snapshotAt:data.live.generatedAt||null});}
 if(route==='fantasy/analyze'){if(req.method!=='POST')throw new AppError(405,'POST required.');await budget(req,'fantasy');const input=JSON.parse((await rawBody(req)).toString());const trade=analyzeTrade(await bundle({fantasyOnly:true}),input);return json(res,200,{...trade,forecastKey:prepareFantasyForecast(trade)?.key||null});}
 if(route==='ai/brief'){
  if(req.method!=='POST')throw new AppError(405,'POST required.');const access=await accessFor(req,res);if(!access.user)throw new AppError(401,'Sign in for an AI trade brief.');await budget(req,'ai-'+access.user.id,access.pro?20:3);
  const b=JSON.parse((await rawBody(req)).toString()),trade=analyzeTrade(await bundle({fantasyOnly:true}),b);
  required('AI_MODEL');const evidence=tradeEvidence(trade,{pro:access.pro});
  const result=await request('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+required('OPENAI_API_KEY'),'Content-Type':'application/json'},body:JSON.stringify(briefPrompt(evidence))});
  let grounded,provider='OpenAI';
  try {
   const selected=JSON.parse(result.choices?.[0]?.message?.content||'{}');
   grounded=groundedBrief(evidence,selected,{withSources:true});
  } catch(error) {
   if(!(error instanceof SyntaxError)&&error.status!==502)throw error;
   grounded=groundedBrief(evidence,defaultBriefSelection(evidence),{withSources:true});
   provider='EdgeBoard';
  }
  return json(res,200,{...grounded,trade:{...trade,forecastKey:prepareFantasyForecast(trade)?.key||null},provider,
   recommendation:trade.recommendation,sources:[...new Set([...trade.give,...trade.receive].flatMap(p=>p.sources))]});
 }
 if(route==='data-status'){const status=await snapshot('refresh-status.json',{});return json(res,200,{...status,oddsConfigured:!!process.env.SPORTSGAMEODDS_API_KEY,scheduledIntervalMinutes:10});}
 if(route==='game-markets'){const [report,live]=await Promise.all([snapshot('daily-game-markets.json',{}),snapshot('live-data.json',{})]);return json(res,200,publicGameMarkets(report,live,Object.fromEntries(url.searchParams)));}
 if(route==='pick-markets'){const [live,profiles]=await Promise.all([snapshot('live-data.json',{}),snapshot('roster-cache.json',[])]);return json(res,200,availablePickMarkets(live,profiles,Object.fromEntries(url.searchParams)));}
 if(route==='slate-readiness'){
  const league=url.searchParams.get('league')||'NBA',book=url.searchParams.get('book')||'draftkings';
  if(!['NBA','NFL'].includes(league)||!['draftkings','fanduel'].includes(book))throw new AppError(400,'Choose a supported sport and sportsbook.');
  const report=await snapshot('daily-picks.json',{}),readiness=report.slateReadiness;
  return json(res,200,readiness?{checkedAt:readiness.checkedAt,today:readiness.today,tomorrow:readiness.tomorrow,rows:readiness.rows.filter(r=>r.league===league&&r.book===book),stale:Date.now()-Date.parse(readiness.checkedAt)>20*60000}:{checkedAt:null,rows:[]});
 }
 if(route==='picks'){const league=url.searchParams.get('league')||'NBA';if(!['NBA','NFL'].includes(league))throw new AppError(400,'Choose NBA or NFL.');const report=await snapshot('daily-picks.json',{});return json(res,200,publicDailyPicks(report,league,new Date(),url.searchParams.get('book')||'draftkings'));}
 const access=await accessFor(req,res);
 if(route==='fantasy/forecasts'){
  if(!access.user)throw new AppError(401,'Sign in to save and review fantasy forecasts.');
  const user=encodeURIComponent(access.user.id);
  const table='/rest/v1/fantasy_forecasts';
  if(req.method==='POST'){
   await budget(req,'fantasy-forecast-'+access.user.id,12);
   const {input,expectedKey}=JSON.parse((await rawBody(req)).toString())||{};
   if(!input||typeof expectedKey!=='string'||!/^[0-9a-f]{64}$/.test(expectedKey))throw new AppError(400,'Analyze the trade before saving a forecast.');
   const existing=await sb(table+'?user_id=eq.'+user+'&forecast_key=eq.'+expectedKey+'&select=captured_at');
   if(existing.length)return json(res,200,{saved:true,capturedAt:existing[0].captured_at});
   const trade=analyzeTrade(await bundle({fantasyOnly:true}),input),prepared=prepareFantasyForecast(trade);
   if(!prepared||prepared.key!==expectedKey)throw new AppError(409,'The scoring evidence changed. Analyze the trade again before saving.');
   await sb(table+'?on_conflict=user_id,forecast_key',{method:'POST',
    headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},
    body:JSON.stringify({user_id:access.user.id,forecast_key:prepared.key,captured_at:trade.generatedAt,forecast:prepared.forecast})});
   const saved=await sb(table+'?user_id=eq.'+user+'&forecast_key=eq.'+prepared.key+'&select=captured_at');
   return json(res,200,{saved:true,capturedAt:saved[0].captured_at});
  }
  const rows=await sb(table+'?user_id=eq.'+user+'&select=forecast_key,captured_at,forecast&order=captured_at.desc,forecast_key.asc&limit=30');
  return json(res,200,{forecasts:rows.length?gradeFantasyForecasts(rows,await snapshot('fantasy-game-logs.json',[])):[]});
 }
 if(route==='access/redeem'){if(req.method!=='POST')throw new AppError(405,'POST required.');if(!access.user)throw new AppError(401,'Sign in before redeeming an access code.');await budget(req,'access-code',10);await budget(req,'access-code-user-'+access.user.id,10);const b=JSON.parse((await rawBody(req)).toString());return json(res,200,await redeemAccessCode(access.user,b?.code));}
 if(route==='billing/review'){if(!access.owner)throw new AppError(403,'Owner access required.');if(req.method==='POST'){const b=JSON.parse((await rawBody(req)).toString());if(!/^evt_[A-Za-z0-9]+$/.test(b.id||''))throw new AppError(400,'Invalid billing event.');await sb('/rest/v1/billing_events?id=eq.'+encodeURIComponent(b.id),{method:'PATCH',body:JSON.stringify({review_required:false,result:'Owner marked reviewed. No automatic monetary action.'})});return json(res,200,{reviewed:true});}return json(res,200,{events:await sb('/rest/v1/billing_events?review_required=eq.true&order=created_at.desc&limit=20')});}
 if(route==='billing/checkout'){if(req.method!=='POST')throw new AppError(405,'POST required.');if(!access.user)throw new AppError(401,'Sign in before checkout.');if(access.pro)throw new AppError(409,'You already have Pro access. No new subscription is needed.');await budget(req,'checkout',10);const s=await checkout(access.user);return json(res,200,{url:s.url});}
 if(route==='billing/portal'){if(req.method!=='POST')throw new AppError(405,'POST required.');if(!access.user)throw new AppError(401,'Sign in first.');const rows=await sb('/rest/v1/entitlements?user_id=eq.'+encodeURIComponent(access.user.id)+'&kind=eq.subscription&select=customer_id');if(!rows[0]?.customer_id)throw new AppError(400,'No billing account found.');const p=await stripe('billing_portal/sessions',{customer:rows[0].customer_id,return_url:required('APP_URL')+'/account',...(process.env.STRIPE_PORTAL_CONFIGURATION_ID?{configuration:process.env.STRIPE_PORTAL_CONFIGURATION_ID}:{})});return json(res,200,{url:p.url});}
 if(route==='research-health'){requirePro(access);const league=url.searchParams.get('league')||'NFL',book=url.searchParams.get('book')||'draftkings';if(!['NBA','NFL'].includes(league)||!['draftkings','fanduel'].includes(book))throw new AppError(400,'Choose a supported sport and sportsbook.');return json(res,200,researchHealth(await bundle(),{league,book}));}
 if(route==='workload-audit'){requirePro(access);const data=await bundle({workloadOnly:true});return json(res,200,workloadAudit(data.records,data.rosters));}
 if(route==='frozen-audit-dates'){requirePro(access);return json(res,200,{dates:auditDates(await snapshot('frozen-index.json',[]))});}
 if(route==='frozen-audit'){
  requirePro(access);if(req.method!=='GET')throw new AppError(405,'GET required.');
  const day=url.searchParams.get('day')||'2026-11-02';if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day)throw new AppError(400,'Choose a valid audit date.');const scope=url.searchParams.get('scope')||'shortlist';
  if(!['shortlist','cohort','trade','games'].includes(scope))throw new AppError(400,'Choose a supported audit group.');
  if(url.searchParams.get('preferGraded')==='1'&&scope!=='trade'){
   const graded=await snapshot(performanceFile(day,scope),null);
   if(graded)return json(res,200,graded);
  }
  const index=await snapshot('frozen-index.json',[]);
  return json(res,200,await readPublishedAudit(index,day,scope,{deadline:Date.now()+200000}));
 }
 if(route==='research-workspace'){
  requirePro(access);const part=url.searchParams.get('part')||'meta';if(!['meta','quotes','records'].includes(part)||!['NBA','NFL'].includes(url.searchParams.get('league')||'NBA'))throw new AppError(400,'Choose a supported research scope.');let version=await snapshotRevision({fresh:part==='meta'});const expected=url.searchParams.get('version');if(expected&&expected!==version)version=await snapshotRevision({fresh:true});
  if(expected&&expected!==version)throw new AppError(409,'Published data changed during this read. Reloading the latest complete snapshot.');
  if(part==='meta'&&url.searchParams.get('known')===version)return json(res,200,{version,unchanged:true});
  const data=await bundle({researchOnly:true,includeHistory:url.searchParams.get('league')==='NFL'}),scope=workspaceScope(data,{league:url.searchParams.get('league')||'NBA',game:url.searchParams.get('game')||'',eventID:url.searchParams.get('eventID')||'',allowRemoved:part==='meta'&&url.searchParams.get('allowRemoved')==='1',unselected:part==='meta'&&url.searchParams.get('unselected')==='1'});let result;
  if(part==='meta'){const feed=await snapshot('outside-feed.json',outsideSeed);const [notes,userNotes,experts,statSync,playerHistory,factors,model,validation,historical,refreshStatus]=await Promise.all([snapshot('research.json',[]),snapshot('research.user.json',[]),snapshot('outside-picks.user.json',[]),snapshot('stat-sync-status.json',{}),snapshot('player-history-status.json',{}),snapshot('context.user.json',{}),snapshot('model-report.json',{}),snapshot('validation-report.json',{}),snapshot('historical-report.json',{}),snapshot('refresh-status.json',{})]);const {results,...summary}=model;result=workspaceMeta(data,scope,{oddsStatus:refreshStatus.odds||null,notes:[...(Array.isArray(notes)?notes:[]),...(Array.isArray(userNotes)?userNotes:[])],experts:[...(Array.isArray(experts)?experts:[]),...(feed.picks||[])],outsideStatus:{checkedAt:feed.checkedAt||null,sources:feed.sources||[]},statSync,playerHistory,modelReport:{...summary,policyComparison:validation},historicalReport:historical});result.context.factors.push(...(factors.factors||[]).filter(f=>f.league===scope.league&&f.eventID===scope.selected?.eventID));}
  else result=workspacePage(scope,part,url.searchParams.get('cursor'));
  if(await snapshotRevision()!==version)throw new AppError(409,'Published data changed during this read. Reloading the latest complete snapshot.');
  return json(res,200,{...result,version});
 }
 if(route.startsWith('research-data/')){requirePro(access);const file=route.slice(14);if(file==='expert-picks.csv'){res.setHeader('Content-Type','text/csv');return res.end('');}if(!allowed.has(file))throw new AppError(404,'File not available.');let data=await snapshot(file,file.includes('evidence')||file.includes('roster')||file.includes('research')||file.includes('picks')?[]:{});if(file.startsWith('evidence')&&Array.isArray(data)){const profiles=await snapshot('roster-cache.json',[]);data=withCurrentProfiles(data,profiles);}if((file.startsWith('evidence')&&Array.isArray(data))||file==='live-data.json'){let page;try{page=pageRows(file==='live-data.json'?data.quotes||[]:data,url.searchParams.get('cursor')||0,{maxRows:file==='live-data.json'?3000:150});}catch(e){throw new AppError(400,e.message)}if(page.next)res.setHeader('X-Next-Cursor',page.next);return json(res,200,file==='live-data.json'?{...data,quotes:page.items}:page.items);}return json(res,200,data);}
 if(route==='model-report-summary'){requirePro(access);const {results,...summary}=await snapshot('model-report.json',{});return json(res,200,summary);}
 if(route==='refresh'){if(req.method!=='POST')throw new AppError(405,'POST required.');if(!access.owner)throw new AppError(403,'Only the site owner can request a provider refresh.');await budget(req,'owner-refresh',12);const queued=await sb('/rest/v1/rpc/queue_refresh',{method:'POST',body:JSON.stringify({bearer_token:required('CRON_SECRET')})});return json(res,202,{running:true,queued:!!queued,message:'Refresh queued on the server. You can keep browsing.'});}
 if(route==='refresh-status'){requirePro(access);const rows=await sb('/rest/v1/refresh_jobs?id=eq.main&select=lease_until,last_result,started_at');const job=rows[0]||{};return json(res,200,{...job.last_result,running:Date.parse(job.lease_until)>Date.now(),startedAt:job.started_at,oddsConfigured:!!process.env.SPORTSGAMEODDS_API_KEY,scheduledIntervalMinutes:10});}
 if(['historical-evaluation-status','player-history-status'].includes(route)){requirePro(access);return json(res,200,{running:false,ok:null,message:'Cloud snapshots are read-only. Data collection and evaluation run through the owner pipeline.'});}
 if(['historical-evaluation','player-history','research-notes','outside-picks'].includes(route)){requirePro(access);throw new AppError(409,'This desktop action is not available in the hosted console. Use the owner pipeline; multi-user notes are not yet migrated.');}
 throw new AppError(404,'Endpoint not found.');
 }catch(e){json(res,e instanceof SyntaxError?400:e.status||500,{error:e instanceof SyntaxError?'Invalid request JSON.':e.status?e.message:'The request could not complete. Please retry.'});}}
