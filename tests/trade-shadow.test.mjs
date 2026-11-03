import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDailyPicks,publicDailyPicks} from '../lib/daily-picks.mjs';
import {auditFrozen} from '../lib/frozen-audit.mjs';
import {summarizeAudits} from '../lib/audit-summary.mjs';
const now=new Date('2026-11-02T23:04Z'),game={league:'NBA',eventID:'g',game:'NY @ BOS',home:'BOS',away:'NY',start:'2026-11-03T00:00Z'};
const profile={league:'NBA',subject:'Synthetic Player',id:'100',currentTeamID:'new',team:'BOS',asOf:now.toISOString(),url:'https://example.org/roster'};
const quote={league:'NBA',eventID:'g',kind:'Player Prop',periodID:'game',player:'Synthetic Player',playerID:'provider-100',stat:'points',book:'draftkings',side:'over',line:15.5,odds:-110,available:true,alt:false,asOf:now.toISOString(),observedAt:now.toISOString()};
const row=(date,teamID,value)=>({date,gameID:date,seasonType:'regular',seasonYear:2026,athleteID:'100',teamID,value,source:'https://example.org/final'});
const record={league:'NBA',subject:profile.subject,athleteID:'100',stat:'points',periodID:'game',profile,games:[...Array.from({length:5},(_,i)=>row('2026-10-'+(20+i),'old',30)),row('2026-10-29','new',5),row('2026-10-31','new',10)]};
const data={live:{games:[game],quotes:[quote,{...quote,side:'under'},{...quote,line:15,alt:true}]},rosters:[profile],records:[record],context:{rosters:[profile]}};
test('refresh captures an NBA trade trial before model eligibility and the audit grades paired references',async()=>{
 const report=await buildDailyPicks(data,{now});
 assert.equal(report.tradeCohort.length,2);
 const [over,under]=report.tradeCohort;
 assert.equal(over.tradeTrial.active,null);
 assert.equal(over.tradeTrial.currentOnly,.5/3);
 assert.equal(over.experimentalProbability,.5);
 assert.equal(over.tradeTrial.limited+under.tradeTrial.limited,1);
 assert.equal(over.marketBenchmark.under,-110);
 const publicReport=publicDailyPicks(report,'NBA',now);
 assert.equal(publicReport.tradeCohort,undefined);
 assert.equal(publicReport.picks.length,0);
 const records=[{...record,games:[...record.games,row('2026-11-03','new',20)]}];
 const audit=auditFrozen([{report,savedAt:'2026-11-02T23:05Z',path:'test'}],records,{day:'2026-11-02',scope:'trade',now:new Date('2026-11-03T12:00Z')});
 const t=summarizeAudits([audit]).trade;
 assert.equal(t.scored,2);
 assert.equal(t.players,1);
 assert.equal(t.games,1);
 assert.equal(t.scoredWithoutActive,2);
 assert.equal(t.currentOnly.lines,2);
 assert.equal(t.market.lines,2);
 assert.equal(t.active.lines,0);
});
test('missed capture window and future roster evidence produce no trade forecasts',async()=>{
 assert.equal((await buildDailyPicks(data,{now:new Date('2026-11-02T23:20Z')})).tradeCohort.length,0);
 const future={...profile,asOf:'2026-11-03T01:00Z'};
 assert.equal((await buildDailyPicks({...data,rosters:[future],context:{rosters:[future]}},{now})).tradeCohort.length,0);
});
test('paired scores give each date equal weight and compare the active model only where present',()=>{
 const base={athleteID:'100',eventID:'g',outcome:'win',tradeEvidence:{active:null,activeBrier:null,currentOnlyBrier:.25}};
 const a={...base,brier:.1,marketBrier:.2},b={...base,brier:.5,tradeEvidence:{active:.8,activeBrier:.04,currentOnlyBrier:.3}};
 const t=summarizeAudits([{day:'2026-11-02',scope:'trade',results:[a,a,a]},{day:'2026-11-04',scope:'trade',results:[b]}]).trade;
 assert.equal(t.currentOnly.lines,4);
 assert.equal(t.currentOnly.challenger,.3);
 assert.deepEqual(t.active,{lines:1,dates:1,challenger:.5,reference:.04});
 assert.equal(t.market.lines,3);
 assert.equal(t.scoredWithoutActive,3);
});
test('trade diagnostics distinguish the capture window, quote availability and roster failures',async()=>{
 const report=await buildDailyPicks(data,{now});
 const d=report.tradeDiagnostics.find(r=>r.book==='draftkings');
 assert.equal(d.insideWindow,true);
 assert.equal(d.examined,3);
 assert.equal(d.captured,2);
 assert.equal(d.trialExclusions.unsupportedLine,1);
 assert.equal(report.tradeDiagnostics.find(r=>r.book==='fanduel').quotes,0);
 const read=(report,savedAt)=>auditFrozen([{report,savedAt,path:'test'}],[],{day:'2026-11-02',scope:'trade',now:new Date('2026-11-03T12:00Z')}).captureDiagnostics.groups[0];
 assert.equal(read(report,'2026-11-02T23:05Z').retainedWindowChecks,1);
 assert.equal(read(report,'2026-11-02T23:16Z').retainedWindowChecks,0);
 const future={...profile,asOf:'2026-11-03T01:00Z'};
 const bad=await buildDailyPicks({...data,context:{rosters:[future]}},{now});
 assert.equal(bad.tradeDiagnostics[0].trialExclusions.rosterUnverified,2);
});

test('simulated provider refresh publishes immutable odds and audit refuses conflicting outcomes',async t=>{
 const {normalizeEvents}=await import('../lib/odds-provider.mjs');
 const {publishUpdates}=await import('../lib/refresh.mjs');
 const {snapshot,clearSnapshotCache}=await import('../lib/cloud.mjs');
 const {decodeSnapshot}=await import('../lib/snapshot-pages.mjs');
 const {compareBooks}=await import('../public/console/books.mjs');
 const {slateReadiness}=await import('../lib/slate-readiness.mjs');
 const start=game.start,observedAt=now.toISOString();
 const odds=Object.fromEntries(['over','under'].map(side=>['points-provider100-game-ou-'+side,{byBookmaker:{draftkings:{odds:-110,overUnder:15.5,available:true},fanduel:{odds:110,overUnder:15.5,available:true}}}]));
 const event={leagueID:'NBA',eventID:'g',status:{startsAt:start},teams:{home:{abbreviation:'BOS'},away:{abbreviation:'NY'}},players:{provider100:{name:profile.subject}},odds};
 const next={...event,eventID:'tomorrow',status:{startsAt:'2026-11-04T00:00Z'}};
 const live=normalizeEvents([event,next],observedAt);
 const readiness=slateReadiness({...data,live},now);
 assert.equal(readiness.rows.find(r=>r.day==='2026-11-03'&&r.book==='fanduel').playersWithHistory,1);
 const q=live.quotes.find(q=>q.eventID==='g'&&q.book==='draftkings');
 const prices=compareBooks(q,[...live.quotes,{...q,line:16.5,book:'fanduel',odds:300}],game,now);
 assert.equal(prices.length,2);
 assert(prices.find(p=>p.book==='fanduel').breakEvenChange<0);
 const report=await buildDailyPicks({...data,live},{now});
 t.mock.timers.enable({apis:['Date'],now:now.getTime()+60000});
 const prior={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY};
 process.env.SUPABASE_URL='https://synthetic.supabase.co';
 process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic';
 const objects=new Map([['manifest.json',JSON.stringify({files:{}})]]);
 t.mock.method(globalThis,'fetch',async (url,options={})=>{
  const pathname=new URL(url).pathname;
  if(pathname.startsWith('/rest/v1/refresh_jobs'))return Response.json([{token:'lease'}]);
  const key=pathname.split('/edgeboard/')[1];
  if(options.method==='POST'){objects.set(key,options.body);return Response.json({ok:true});}
  return objects.has(key)?new Response(objects.get(key)):new Response('',{status:404});
 });
 try{
  clearSnapshotCache();
  await publishUpdates({'live-data.json':live,'daily-picks.json':report},'lease');
  const index=await snapshot('frozen-index.json',[]);
  assert.equal(index.length,1);
  const info=JSON.parse(objects.get('manifest.json')).files['daily-picks.json'];
  const saved=decodeSnapshot(objects.get(index[0].path),info);
  assert.equal(saved.tradeCohort.length,4);
  const reports=[{...index[0],report:saved}],day='2026-11-02';
  const audit=(games)=>auditFrozen(reports,[{...record,games:[...record.games,...games]}],{day,scope:'trade',now:new Date('2026-11-03T12:00Z')});
  const final=row('2026-11-03','new',20);
  assert.equal(audit([final]).scored,4);
  assert.equal(audit([final,{...final,value:3}]).unsettled,4);
  assert.equal(auditFrozen([{...reports[0],savedAt:'2026-11-02T23:16Z'}],[record],{day,scope:'trade',now:new Date('2026-11-03T12:00Z')}).results.length,0);
 }finally{
  for(const [key,value] of [['SUPABASE_URL',prior.url],['SUPABASE_SERVICE_ROLE_KEY',prior.key]]){
   if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
  clearSnapshotCache();
 }
});
