import {slateReadiness} from './slate-readiness.mjs';
import {tradeShadow} from './trade-shadow.mjs';
import {contextReadback} from './context.mjs';
import {quoteLineKey} from './quote-selection.mjs';
import {indexMarketPairs,marketBenchmark} from './market-benchmark.mjs';
import {readinessSnapshot} from './selection-readiness.mjs';
import {shadowForecast} from './shadow-model.mjs';
import {modelInputAudit} from './input-audit.mjs';
import {scanGamePicks} from './picks.mjs';import {matchupEvidence} from './pick-evidence.mjs';import {observedContext} from './matchups.mjs';import {teamCode} from './rosters.mjs';import {quoteStatus,implied,nameKey} from './insights.mjs';
export const BOOKS=['draftkings','fanduel'];
const easternDay=date=>new Date(date).toLocaleDateString('en-CA',{timeZone:'America/New_York'});
function entry(x,game,rosters,context,records,now,pairIndex){const a=x.analysis,p=a.sample?.profile||rosters.find(p=>p.league===x.quote.league&&nameKey(p.subject)===nameKey(x.quote.player)&&[game.home,game.away].some(t=>teamCode(t,p.league)===teamCode(p.team,p.league))),observed=observedContext(x.quote,a.sample,records,context,game,now),fit=a.model.season||{},currentRows=(a.sample?.rows||[]).filter(r=>r.seasonYear===a.sample.currentYear&&String(r.teamID)===String(fit.teamID)).slice(0,40),priorRows=fit.priorN?(a.sample?.rows||[]).filter(r=>r.seasonYear===a.sample.currentYear-1&&String(r.teamID)===String(fit.teamID)).slice(0,40):[],matchup=matchupEvidence(x.quote,game,p,context,a.sample?.currentYear,now);return {marketBenchmark:marketBenchmark(x.quote,pairIndex,game,now),readiness:readinessSnapshot(x.quote,a,p),shadow:shadowForecast(a.model,x.quote,now),inputAudit:modelInputAudit(x.quote,a),matchup,modelEvidence:{policy:a.decision.policy,name:a.model.name,conditionalWin:a.decision.conditionalWin,pPush:a.model.pPush,mean:fit.mean,currentN:fit.currentN,currentHits:currentRows.filter(r=>x.quote.side==='over'?r.value>x.quote.line:r.value<x.quote.line).length,priorN:fit.priorN,priorHits:priorRows.filter(r=>x.quote.side==='over'?r.value>x.quote.line:r.value<x.quote.line).length,currentWeight:fit.currentWeight,currentMinutes:fit.currentMinutes,priorMinutes:fit.priorMinutes,priorStrength:fit.priorStrength,lower:a.model.interval?.[0],replay:a.model.backtest?.n,roleChange:fit.roleChange,opportunityShift:fit.opportunityShift,otherTeam:fit.otherTeam,currentOldTeam:fit.currentOldTeam},matchupNotes:[...observed.why,...(a.context?.why||[]).filter(t=>!observed.why.includes(t))],contextRisks:observed.risks,quote:x.quote,game,player:x.quote.player,stat:x.quote.stat,side:x.quote.side,line:x.quote.line,odds:x.quote.odds,book:x.quote.book,asOf:x.quote.asOf,label:a.decision.label,reason:a.decision.reason,checks:a.decision.checks||[],sample:a.sample?.n||0,currentGames:x.currentGames,last5:a.sample?.last5,last10:a.sample?.last10,average:a.sample?.mean??null,range:a.sample?{min:a.sample.min,max:a.sample.max}:null,headshot:p?.id&&/^\d+$/.test(p.id)?`https://a.espncdn.com/i/headshots/${p.league.toLowerCase()}/players/full/${p.id}.png`:null,team:p?.team||null,position:p?.position||null,availability:a.context?.availability||null,experimentalProbability:a.model.pWin,breakEven:implied(x.quote.odds),experimentalNet:a.model.expectedValue,risks:a.risks||[],sources:[...new Set([...(a.sample?.rows||[]).slice(0,5).map(r=>r.source),...(matchup?.sources||[]),...observed.sources.map(s=>s.url),...(a.context?.sources||[]).map(s=>s.url)])]};}
export async function buildDailyPicks(data,{now=new Date(),deadline=Infinity}={}){
 const pairIndex=indexMarketPairs(data.live.quotes||[]);
 const report={version:2,modelVersion:'season-team-guard-v4-temporal-coverage',generatedAt:now.toISOString(),snapshotAt:data.live.generatedAt||null,slateDate:easternDay(now),byBook:{},validated:false,evaluationCohort:[],tradeCohort:[],tradeDiagnostics:[]};
 for(const book of BOOKS){report.byBook[book]={leagues:{}};for(const league of ['NBA','NFL']){const picks=[],watchlist=[],counts={},excluded={};let scannedGames=0;const games=(data.live.games||[]).filter(g=>g.league===league&&Number.isFinite(Date.parse(g.start))&&easternDay(g.start)===easternDay(now));const bookQuotes=(data.live.quotes||[]).filter(q=>q.league===league&&q.book===book);for(const game of games){if(Date.now()>deadline)break;const quotes=bookQuotes.filter(q=>q.eventID===game.eventID);const minutesToStart=(Date.parse(game.start)-now.getTime())/60000, cohort=[],trade=[];
 const insideWindow=minutesToStart<=60&&minutesToStart>=45;
 let examined=0,eligible=0;
 const trialExclusions={};
 const onForecast=minutesToStart<=60&&minutesToStart>=45?(quote,model,profile)=>{
  if(!profile?.id)return;
  const alt=quote.alt===true;
  cohort.push({quote,model,profile,alt,key:quoteLineKey(quote)});
  const group=cohort.filter(p=>p.alt===alt);
  if(group.length>12){
   group.sort((a,b)=>a.key.localeCompare(b.key));
   cohort.splice(cohort.indexOf(group.at(-1)),1);
  }
 }:null;
 const onSample=onForecast&&league==='NBA'?(quote,sample,model,profile)=>{
  examined++;
  const trial=tradeShadow(quote,game,sample,model,profile,now,reason=>{trialExclusions[reason]=(trialExclusions[reason]||0)+1;});
  if(!trial)return;
  eligible++;
  const alt=quote.alt===true;
  trade.push({quote,trial,alt,key:quoteLineKey(quote)});
  const group=trade.filter(p=>p.alt===alt);
  if(group.length>12){
   group.sort((a,b)=>a.key.localeCompare(b.key));
   trade.splice(trade.indexOf(group.at(-1)),1);
  }
 }:null;
 const r=await scanGamePicks({game,quotes,book,records:data.records,context:data.context,now,limit:5},{onForecast,onSample});
 if(league==='NBA')report.tradeDiagnostics.push({
  eventID:game.eventID,game:game.game,start:game.start,book,checkedAt:now.toISOString(),insideWindow,
  quotes:quotes.length,examined,eligible,captured:trade.length,trialExclusions,
  historyMissing:r.excluded.missingHistory||0,rosterConflict:r.excluded.rosterConflict||0,
  staleOrClosed:r.excluded.closedOrStale||0,unavailable:r.excluded.unavailableStatus||0
 });
 for(const {quote,trial,alt} of trade)report.tradeCohort.push({quote,game,player:quote.player,stat:quote.stat,side:quote.side,line:quote.line,odds:quote.odds,book,asOf:quote.asOf,athleteID:trial.roster.id,experimentalProbability:trial.limited,modelEvidence:{pPush:0},marketBenchmark:marketBenchmark(quote,pairIndex,game,now),tradeTrial:trial,label:'TRADE SHADOW',alt});

 for(const {quote,model,profile,alt} of cohort){
  const context=contextReadback(quote,data.context||{},now,game);
  report.evaluationCohort.push({quote,game,player:quote.player,stat:quote.stat,side:quote.side,line:quote.line,odds:quote.odds,book,asOf:quote.asOf,athleteID:profile.id,experimentalProbability:model.pWin,modelEvidence:{pPush:model.pPush},shadow:shadowForecast(model,quote,now),marketBenchmark:marketBenchmark(quote,pairIndex,game,now),pregameContext:{availability:context.availability,measurements:context.measurements},label:'EVALUATION',alt});
 }
 for(const [k,v] of Object.entries(r.counts))counts[k]=(counts[k]||0)+v;for(const [k,v] of Object.entries(r.excluded))excluded[k]=(excluded[k]||0)+v;picks.push(...r.recommendations.map(x=>entry(x,game,data.rosters||[],data.context||{},data.records||[],now,pairIndex)));watchlist.push(...r.watchlist.map(x=>entry(x,game,data.rosters||[],data.context||{},data.records||[],now,pairIndex)));scannedGames++;}const order=(a,b)=>(b.experimentalNet||0)-(a.experimentalNet||0);report.byBook[book].leagues[league]={picks:picks.sort(order).slice(0,5),watchlist:watchlist.sort(order).slice(0,5),counts,excluded,scannedGames,totalGames:games.length,complete:scannedGames===games.length};}}
 if(Date.now()<deadline)report.slateReadiness=slateReadiness(data,now);
 return report;
}
export function publicDailyPicks(report,league,now=new Date(),book='draftkings'){
 if(!BOOKS.includes(book))throw Object.assign(Error('Choose DraftKings or FanDuel.'),{status:400});
 const r=report?.byBook?.[book]?.leagues?.[league]||(book==='draftkings'?report?.leagues?.[league]:null)||{},fresh=a=>(a||[]).filter(p=>p.quote?.book===book&&quoteStatus(p.quote,p.game,now).ok),picks=fresh(r.picks),watchlist=fresh(r.watchlist),name=book==='fanduel'?'FanDuel':'DraftKings',coverage=r.counts?.gameQuotes||0;
 return {book,picks,watchlist,counts:r.counts||{},excluded:r.excluded||{},generatedAt:report?.generatedAt||null,snapshotAt:report?.snapshotAt||null,complete:r.complete??false,coverage,message:picks.length?`${picks.length} ${name} research lean${picks.length===1?'':'s'} met our screening rules at the listed prices.`:watchlist.length?`No ${name} picks clear every check yet. The watchlist explains what is still missing.`:!coverage?`No ${name} quotes were available in this scan for today's ${league} games. We never substitute another sportsbook's prices.`:`No current ${name} picks qualify. Prices may have changed, games may have started, or the evidence may be too limited.`,method:'Historical results and model estimates are research tools, not guarantees. Watchlist items remain Pass. Prices and eligibility are checked again when you load this page.'};
}
