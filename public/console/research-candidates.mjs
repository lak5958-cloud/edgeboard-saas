import {usableRows} from './prediction.mjs';
import {readOpportunity,opportunityKind} from './opportunity.mjs';
import {normalizeStat} from './insights.mjs';
import {teamCode} from './rosters.mjs';

export const CANDIDATE_VERSION='opportunity-context-count-v1';
const number=x=>typeof x==='number'&&Number.isFinite(x);
const mean=values=>values.length?values.reduce((sum,x)=>sum+x,0)/values.length:null;
const https=x=>/^https:\/\//.test(x||'');
const nonnegative=x=>number(x)&&x>=0;
const key=q=>JSON.stringify([q.league,q.eventID,q.book,q.playerID,q.stat,q.side,q.line]);
function probabilities(values,q){
 const wins=values.filter(v=>q.side==='over'?v>q.line:v<q.line).length;
 const pushes=values.filter(v=>v===q.line).length;
 return {pWin:wins/values.length,pPush:pushes/values.length,pLoss:(values.length-wins-pushes)/values.length};
}
export function marketFamily(q){
 const stat=normalizeStat(q.stat);
 if(/longest/.test(stat))return 'longest';
 if(/touchdown/.test(stat))return 'touchdowns';
 if(/yards/.test(stat))return 'yards';
 if(/receptions|assists|rebounds|steals|blocks|threepointersmade|3pointersmade/.test(stat))return 'counts';
 return 'scoring';
}
// Poisson is a candidate distribution for low counts, evaluated against empirical forecasts.
export function poissonForecast(lambda,q){
 if(!nonnegative(lambda)||lambda>80||!number(q.line)||q.line<0)return null;
 const maximum=Math.floor(q.line);
 if(maximum>500)return null;
 let mass=Math.exp(-lambda),cdf=0,push=0;
 for(let count=0;count<=maximum;count++){
  if(count>0)mass*=lambda/count;
  cdf+=mass;
  if(count===q.line)push=mass;
 }
 cdf=Math.min(1,cdf);
 const under=cdf-push,over=Math.max(0,1-cdf);
 return {pWin:q.side==='over'?over:under,pPush:push,pLoss:q.side==='over'?under:over};
}
export function candidateForecasts(q,sample,game,context={},now=new Date()){
 const result={version:CANDIDATE_VERSION,status:'research-only',family:marketFamily(q),createdAt:now.toISOString(),selectionKey:key(q),workload:null,models:[],features:{},sources:[],missing:[]};
 const profile=sample?.profile,start=Date.parse(game?.start),cutoff=Math.min(now.getTime(),start);
 if(!q.eventID||q.eventID!==game?.eventID||!Number.isFinite(cutoff)||now.getTime()>=start||!profile?.id||!profile.currentTeamID||!number(q.line)||!['over','under'].includes(q.side))return {...result,missing:['A verified athlete, event, pregame time and exact line are required.']};
 result.athleteID=String(profile.id);
 const rows=usableRows(sample.rows,new Date(cutoff).toISOString().slice(0,10)).filter(r=>String(r.teamID)===String(profile.currentTeamID)&&r.seasonYear===sample.currentYear).slice(-40);
 const family=marketFamily(q),kind=q.league==='NBA'?'minutes':opportunityKind(q.stat);
 const exposure=r=>kind==='minutes'?(nonnegative(r.minutes)?r.minutes:null):readOpportunity(r,q.stat);
 const measured=rows.filter(r=>nonnegative(exposure(r))),recent=rows.slice(-5);
 const recentMeasured=recent.filter(r=>nonnegative(exposure(r)));
 if(kind&&measured.length>=5&&recentMeasured.length>=3){
  const values=recentMeasured.map(exposure),projection=mean(values),rates=measured.filter(r=>exposure(r)>0);
  result.workload={kind,projection,historicalMean:mean(measured.map(exposure)),recentGames:values.length,trainingGames:measured.length,zeroExposureGames:measured.length-rates.length,min:Math.min(...values),max:Math.max(...values),method:'Mean of up to five earlier current-team games. Recent observed exposure is resampled to represent workload variation.'};
  result.sources.push(...recentMeasured.map(r=>({url:r.source,date:r.date})));
  if(rates.length>=5&&family!=='longest'&&projection>0){
   const simulated=rates.flatMap(r=>values.map(amount=>Math.max(0,Math.round(r.value/exposure(r)*amount))));
   result.models.push({id:'workload-resample-v1',...probabilities(simulated,q),trainingGames:rates.length,scenarioCount:simulated.length,method:'Current-team output per measured minute, attempt or target, combined with recent observed workload. Integer rounding and stable efficiency are assumptions. These scenarios are dependent.'});
  }
  if(family==='longest')result.missing.push('Longest-play outcomes require an extreme-value model; workload is recorded without linear scaling.');
 }else result.missing.push('Insufficient measured current-team minutes, targets or attempts for a workload estimate.');
 if(['counts','touchdowns'].includes(family)&&rows.length>=8&&rows.every(r=>Number.isInteger(r.value)&&r.value>=0)){
  const lambda=mean(rows.map(r=>r.value)),p=poissonForecast(lambda,q);
  if(p)result.models.push({id:'poisson-count-v1',...p,lambda,trainingGames:rows.length,method:'Poisson candidate using the earlier current-team mean. Equal mean and variance is a testable assumption.'});
 }
 // Sources contain only earlier games. Final-game defense statistics never enter their own pregame forecast.
 const own=teamCode(profile.team,q.league),opponent=[game.home,game.away].map(t=>teamCode(t,q.league)).find(t=>t&&t!==own);
 const teamRows=(context.matchups?.games||[]).filter(r=>r.league===q.league&&r.seasonType==='regular'&&r.seasonYear===sample.currentYear&&r.date<new Date(cutoff).toISOString().slice(0,10)&&https(r.source));
 const unique=new Map();
 for(const r of teamRows){
  if(!r.teamID||!r.gameID)continue;
  const id=String(r.teamID)+'|'+r.gameID,old=unique.get(id);
  const signature=x=>JSON.stringify([x.allowed,x.defensiveRating,x.pace]);
  unique.set(id,old&&(old.conflict||signature(old)!==signature(r))?{conflict:true}:r);
 }
 const all=[...unique.values()].filter(r=>!r.conflict),opponentRows=all.filter(r=>teamCode(r.team,q.league)===opponent).sort((a,b)=>a.date.localeCompare(b.date)).slice(-10),stat=normalizeStat(q.stat);
 for(const [feature,read] of [['defenseAllowed',r=>r.allowed?.[stat]],['defensiveRating',r=>r.defensiveRating],['pace',r=>r.pace]]){
  const opponents=opponentRows.map(read).filter(nonnegative),league=all.map(read).filter(nonnegative),baseline=mean(league);
  if(opponents.length>=3&&league.length>=10&&baseline>0){
   result.features[feature]={ratio:mean(opponents)/baseline,mean:mean(opponents),baseline,games:opponents.length,unit:feature==='defensiveRating'?'points per 100 estimated possessions':feature==='pace'?'estimated possessions per 48 minutes':'team total per game'};
   result.sources.push(...opponentRows.filter(r=>nonnegative(read(r))).map(r=>({url:r.source,date:r.date})));
  }else result.missing.push(feature+' lacks a verified earlier opponent/league sample.');
 }
 const usage=rows.filter(r=>nonnegative(r.usagePct)),recentUsage=rows.slice(-5).filter(r=>nonnegative(r.usagePct));
 if(q.league==='NBA'&&usage.length>=5&&recentUsage.length>=3&&mean(usage.map(r=>r.usagePct))>0){
  result.features.usage={ratio:mean(recentUsage.map(r=>r.usagePct))/mean(usage.map(r=>r.usagePct)),mean:mean(recentUsage.map(r=>r.usagePct)),baseline:mean(usage.map(r=>r.usagePct)),games:recentUsage.length,unit:'observed usage percent'};
 }else result.missing.push('Measured usage coverage is insufficient for a usage feature.');
 result.sources=[...new Map(result.sources.filter(s=>https(s.url)).map(s=>[s.url,s])).values()];
 return result;
}
export function archivedCandidates(p,savedAt,start,athleteID){
 const r=p.researchCandidates,at=Date.parse(r?.createdAt);
 if(r?.version!==CANDIDATE_VERSION||r.status!=='research-only'||r.selectionKey!==key(p.quote)||r.athleteID!==athleteID||at<Date.parse(p.asOf)||!Number.isFinite(at)||at>Date.parse(savedAt)||at>=start)return null;
 const models=(r.models||[]).filter(m=>[m.pWin,m.pPush,m.pLoss].every(x=>nonnegative(x)&&x<=1)&&Math.abs(m.pWin+m.pPush+m.pLoss-1)<1e-8);
 return {...r,models};
}

export function replayCandidates(q,sample,context={}){
 const rows=usableRows(sample?.rows||[],'9999-12-31').filter(r=>String(r.teamID)===String(sample?.profile?.currentTeamID)).slice(-80);
 const paired=[];
 for(let i=5;i<rows.length;i++){
  const target=rows[i],start=target.start||target.date+'T12:00:00Z',now=new Date(Date.parse(start)-1);
  if(!Number.isFinite(now.getTime()))continue;
  const past=rows.slice(0,i).filter(r=>r.date<target.date);
  const historicalSample={...sample,currentYear:target.seasonYear,rows:past};
  const game={eventID:q.eventID,league:q.league,start,home:target.team,away:target.opponent};
  const candidate=candidateForecasts(q,historicalSample,game,context,now);
  const current=past.filter(r=>r.seasonYear===target.seasonYear);
  if(current.length<5)continue;
  const baseline=probabilities(current.map(r=>r.value),q);
  const actual=target.value===q.line?'push':(q.side==='over'?target.value>q.line:target.value<q.line)?'win':'loss';
  for(const model of candidate.models)paired.push({date:target.date,gameID:target.gameID,model:model.id,actual,pWin:model.pWin,pPush:model.pPush,baselineWin:baseline.pWin,baselinePush:baseline.pPush});
 }
 return {tests:paired.length,models:[...new Set(paired.map(p=>p.model))].map(id=>{
  const test=paired.filter(p=>p.model===id&&p.actual!=='push'&&p.pPush<1&&p.baselinePush<1);
  return {id,n:test.length,brier:mean(test.map(p=>(p.pWin/(1-p.pPush)-Number(p.actual==='win'))**2)),baselineBrier:mean(test.map(p=>(p.baselineWin/(1-p.baselinePush)-Number(p.actual==='win'))**2))};
 }),method:'Reconstructed earlier-statistics replay at the currently selected threshold. Each test uses earlier dates and the historical current team. Baseline is current-season/current-team empirical history on the identical test rows. Historical lineup and injury snapshots are unavailable. Historical odds and profitability are not evaluated.'};
}
