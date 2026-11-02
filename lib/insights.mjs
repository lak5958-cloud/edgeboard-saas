import {analyzeTeamSelection,teamSample} from './team-research.mjs';
import {belongsToGame} from './rosters.mjs';
import {observedContext} from './matchups.mjs';
import {forecast,exactDecision,usableRows} from './prediction.mjs';
import {contextReadback} from './context.mjs';
import {quotePeriod,periodLabel} from './markets.mjs';
import {normalizeSeasonGame,seasonYear} from './seasons.mjs';
// EdgeBoard v1.2 — audited readbacks. The sample is descriptive, not calibrated P(hit).
const numeric=x=>x!==''&&x!==null&&x!==undefined&&Number.isFinite(Number(x));
export const implied=o=>numeric(o)&&Math.abs(Number(o))>=100?(Number(o)<0?-Number(o)/(100-Number(o)):100/(100+Number(o))):null;
export function normalizeStat(x){
 let v=String(x||'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const alias={pts:'points',reb:'rebounds',rebs:'rebounds',ast:'assists',asts:'assists',
  '3pointersmade':'3pointersmade',threepointersmade:'3pointersmade',threepointsmade:'3pointersmade',
  fg3m:'3pointersmade',receivingreceptions:'receptions',recs:'receptions',rec:'receptions',targets:'receivingtargets',passcompletions:'passingcompletions',passattempts:'passingattempts',threes:'3pointersmade',threepointers:'3pointersmade',threepointersmade:'3pointersmade'};
 const football={longreception:'receivinglongestreception',receivinglongreception:'receivinglongestreception',longrushing:'rushinglongestrush',longpassing:'passinglongestcompletion'};return football[v]||alias[v]||v;
}
export function sameStat(a,b){return normalizeStat(a)!==''&&normalizeStat(a)===normalizeStat(b);}

export function nameKey(s){return String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z\s-]/g,'').replace(/\s+(jr|sr|ii|iii|iv)$/,'').replace(/\s+/g,' ').trim();}
export function sameName(a,b){return !!nameKey(a)&&nameKey(a)===nameKey(b);}
export function matchingEvidence(q,records=[]){
 // All currently imported ESPN final box scores and legacy game-log samples
 // describe FULL GAMES. Never apply those totals to 1Q/1H/period props.
 const period=quotePeriod(q);
 if(period==='unknown')return [];
 return records.filter(e=>e.league===q.league&&sameName(e.subject,q.player)&&sameStat(q.stat,e.stat)&&String(e.periodID||'game').toLowerCase()===period);
}
export function evidenceCoverage(q,records=[],loadingError=''){
 const all=Array.isArray(records)?records:[];
 const candidate=all.filter(e=>e&&e.league===q?.league&&sameName(e.subject,q?.player));
 const period=quotePeriod(q||{});
 const byPeriod=candidate.filter(e=>String(e.periodID||'game').toLowerCase()===period);
 const exact=byPeriod.filter(e=>sameStat(e.stat,q?.stat));
 const dates=new Set(usableRows(exact.flatMap(e=>normalizeGameRows(e)),String(q.asOf||new Date().toISOString()).slice(0,10)).map(g=>g.date));
 const unclassified=exact.flatMap(e=>Array.isArray(e.games)?e.games:[]).filter(g=>normalizeSeasonGame(g).seasonType!=='regular').length;
 const phaseCounts={regular:0,preseason:0,postseason:0,unknown:0};for(const e of exact)for(const g of e.games||[])phaseCounts[normalizeSeasonGame(g).seasonType]++;
 const playerStats=[...new Set(candidate.map(e=>`${e.stat} [${e.periodID||'game'}]`))].sort();
 let message;
 if(loadingError)message=`Game-log file could not load: ${loadingError}. Check the refresh and local server.`;
 else if(!all.length)message='No game-log series were received by the dashboard. Run the statistics updater and check its status file.';
 else if(!candidate.length)message=`Received ${all.length} game-log series, but none have the player name '${q?.player||'unknown'}' in ${q?.league||'this league'}. The importer may not have collected this player.`;
 else if(!byPeriod.length)message=`Found ${candidate.length} series for this player, but none for ${periodLabel(period)}. Full-game results cannot verify a quarter/half prop.`;
 else if(!exact.length)message=`Found ${byPeriod.length} series for this player and period, but not the selected statistic '${q?.stat||''}'. Available: ${playerStats.slice(0,8).join(', ')||'none'}.`;
 else if(!dates.size)message=`Found ${exact.length} matching series, but no eligible prior sourced outcomes. Saved phases: ${phaseCounts.regular} regular, ${phaseCounts.preseason} preseason, ${phaseCounts.postseason} postseason, ${phaseCounts.unknown} unknown. Regular rows can also be excluded for missing links, invalid values/dates, conflicting duplicates, or a date on/after the quote. Run Update-Stats.ps1 -Player '${q.player}' to reverify identifiable saved games; unknown phases are never guessed.`;
 else message=`Matched ${dates.size} dated result${dates.size===1?'':'s'} for ${q.player} / ${q.stat} / ${periodLabel(period)}. Adjusting the line recalculates observed hit counts.`;
 return {totalSeries:all.length,playerSeries:candidate.length,periodSeries:byPeriod.length,exactSeries:exact.length,gameCount:dates.size,unclassified,phaseCounts,playerStats,message};
}
export function quoteStatus(q,game=null,now=new Date(),maxAge=75){
 if(!q)return {ok:false,label:'NO MARKET',reason:'No actual sportsbook quote has been received.'};
 if(quotePeriod(q)==='unknown')return {ok:false,label:'PERIOD UNVERIFIED',reason:'Provider quote does not identify a full-game, quarter or half period. Market cannot be safely analyzed.'};
 if(q.available!==true)return {ok:false,label:'NOT OFFERED',reason:'The provider marks this exact threshold unavailable.'};
 const at=Date.parse(q.asOf||'');if(!Number.isFinite(at))return {ok:false,label:'UNVERIFIED',reason:'No verifiable quote update timestamp.'};
 const mins=(now.getTime()-at)/60000;if(mins<-2||mins>maxAge)return {ok:false,label:'STALE',reason:`Quote timestamp ${mins<0?'is in the future':`is ${Math.floor(mins)} minutes old`}. Refresh before relying on this price.`};
 const starts=Date.parse(game?.start||'');if(Number.isFinite(starts)&&now.getTime()>=starts)return {ok:false,label:'STARTED',reason:'Pregame betting window has passed.'};
 const status=String(game?.status||'').toLowerCase();if(/final|finished|completed|cancelled|live|in progress/.test(status))return {ok:false,label:'STARTED',reason:'Game is no longer an upcoming pregame market.'};
 return {ok:true,label:'PRICE CURRENT',reason:'The selection is offered with a recent timestamp; value remains unproven.'};
}
export function thresholdHit(value,q){if(!numeric(value)||!numeric(q?.line))return null;const side=String(q.side||'').toLowerCase();if(Number(value)===Number(q.line))return null;if(side==='over')return Number(value)>Number(q.line);if(side==='under')return Number(value)<Number(q.line);return null;}
function avg(a){return a.length?a.reduce((s,v)=>s+v,0)/a.length:null}
function sd(a){if(a.length<2)return null;const m=avg(a);return Math.sqrt(a.reduce((s,v)=>s+(v-m)**2,0)/(a.length-1))}
function normalizeGameRows(e){
 if(!Array.isArray(e.games)||!e.games.length)return [];
 return e.games.map((g,i)=>({...normalizeSeasonGame(g),source:[g.source,g.url,e.url].find(u=>/^https:\/\//.test(String(u||'')))||'',value:Number(g.value),date:String(g.date||'').slice(0,10),_index:i}))
  .filter(g=>numeric(e.games[g._index]?.value)&&Number.isFinite(g.value)&&/^\d{4}-\d{2}-\d{2}$/.test(g.date)&&g.seasonType==='regular')
  .sort((a,b)=>String(b.date).localeCompare(String(a.date))||a._index-b._index);
}
export function sampleSummary(q,records=[]){
 if(!q||q.kind!=='Player Prop'||!['over','under'].includes(String(q.side||'').toLowerCase()))return null;
 const evidence=matchingEvidence(q,records).filter(x=>normalizeGameRows(x).length).sort((a,b)=>normalizeGameRows(b).length-normalizeGameRows(a).length)[0];if(!evidence)return null;
 // Store a longer, clearly separated regular-season history. "Last 5/10" can span
 // two regular seasons but must never blend preseason and postseason.
 const rows=usableRows(matchingEvidence(q,records).flatMap(e=>normalizeGameRows(e)),String(q.asOf||new Date().toISOString()).slice(0,10)).reverse();if(!rows.length)return null;const values=rows.map(x=>x.value),count=n=>{const a=rows.slice(0,n).map(g=>thresholdHit(g.value,q));return {n:a.length,hits:a.filter(x=>x===true).length,pushes:a.filter(x=>x===null).length}};
 const last5=count(5),last10=count(10),all=count(rows.length),minutes=rows.map(x=>Number(x.minutes)).filter(Number.isFinite).filter(x=>x>0);
 const currentYear=seasonYear(q.league,String(q.asOf||new Date().toISOString()).slice(0,10))||Math.max(...rows.map(x=>x.seasonYear||0));const thisYear=rows.filter(x=>x.seasonYear===currentYear),previous=rows.filter(x=>x.seasonYear!==currentYear);
 const split=rr=>({n:rr.length,hits:rr.filter(g=>thresholdHit(g.value,q)===true).length,mean:avg(rr.map(g=>g.value))});
 const profile=matchingEvidence(q,records).map(e=>e.profile).filter(Boolean).sort((a,b)=>String(b.asOf).localeCompare(String(a.asOf)))[0]||null;
 return {profile,n:all.n,hits:all.hits,pushes:all.pushes,mean:avg(values),sd:sd(values),min:Math.min(...values),max:Math.max(...values),values,rows,last5,last10,all,minutesAvg:avg(minutes),recentMean:avg(values.slice(0,5)),evidence,currentYear,current:split(thisYear),previous:split(previous),crossSeason:rows.slice(0,10).some(x=>x.seasonYear!==currentYear)};
}

export function thresholdDirection(q,baseline){
 if(!q||!baseline||!numeric(q.line)||!numeric(baseline.line)||Number(q.line)===Number(baseline.line))return 'Standard threshold';
 const diff=Number(q.line)-Number(baseline.line),side=String(q.side||'').toLowerCase();const harder=side==='over'?diff>0:side==='under'?diff<0:null;
 return harder===null?'Different quoted threshold':harder?'More demanding threshold':'More forgiving threshold';
}
export function lineLadder(q,quotes,records=[],teamContext=null){return quotes.map(alt=>{const s=teamContext?teamSample(alt,teamContext.game,teamContext.games):sampleSummary(alt,records);return {line:alt.line,odds:alt.odds,breakEven:implied(alt.odds),available:alt.available,asOf:alt.asOf,alt:alt.alt,hits:s?.hits??null,n:s?.n??null};});}
export function matchingOutside(q,experts=[]){return experts.filter(e=>e.league===q.league&&sameName(e.subject,q.player)&&sameStat(e.market,q.stat)&&String(e.periodID||'unknown')===quotePeriod(q)).map(e=>{
 const match=String(e.side||'').toLowerCase()===String(q.side||'').toLowerCase(); const exact=match&&numeric(e.line)&&numeric(q.line)&&Number(e.line)===Number(q.line);
 return {...e,alignment:exact?'EXACT MATCH':match?'SAME DIRECTION · DIFFERENT LINE':'OPPOSING / DIFFERENT SIDE',exact,match};
 });}
export function analyzeSelection(q,{game=null,records=[],research=[],experts=[],baseline=null,now=new Date(),maxAge=75,context={}}={}){
 if(q&&['Spread','Moneyline','Total','Team Total'].includes(q.kind))return analyzeTeamSelection(q,{game,context,now,baseline},{quoteStatus,exactDecision,implied});
 let state=quoteStatus(q,game,now,maxAge);const sample=sampleSummary(q,records);
 const roster=(context.rosters||[]).find(p=>p.league===q?.league&&sameName(p.subject,q?.player));
 if(roster&&game&&now-Date.parse(roster.asOf)>=0&&now-Date.parse(roster.asOf)<2*3600000&&!belongsToGame(roster,game))state={ok:false,label:'ROSTER CONFLICT',reason:`The quoted player’s current sourced roster (${roster.team}) does not match this game. Refresh the provider/rosters before using the quote.`};const isPlayer=q?.kind==='Player Prop';
 const sourceNotes=research.filter(n=>n.league===q?.league&&(sameName(n.subject,q?.player)||n.subject===q?.game)&&(n.periodID==null||String(n.periodID).toLowerCase()===quotePeriod(q)));
 const relatedExperts=matchingOutside(q,experts), bp=implied(q?.odds),baseP=implied(baseline?.odds),direction=thresholdDirection(q,baseline);
 const why=[],risks=[],observations=[];
 if(sample){
   why.push(`Last ${sample.n} VERIFIED REGULAR-SEASON games: ${sample.hits} hit${sample.hits===1?'':'s'} at ${q.side.toUpperCase()} ${q.line} (${(100*sample.hits/sample.n).toFixed(0)}% observed). Last 5: ${sample.last5.hits}/${sample.last5.n}; last 10: ${sample.last10.hits}/${sample.last10.n}.`);
   why.push(`Current ${q.league==='NFL'?sample.currentYear:sample.currentYear+'–'+String(sample.currentYear+1).slice(-2)} regular season: ${sample.current.hits}/${sample.current.n}. Older regular seasons: ${sample.previous.hits}/${sample.previous.n}. ${sample.crossSeason?'Last-ten may include previous-season games: roster and role changes reduce comparability.':'Last-ten is entirely within one season when sufficient games exist.'}`);
   why.push(`Observed ${q.stat}: ${sample.mean.toFixed(1)} mean, ${sample.sd===null?'unknown':sample.sd.toFixed(1)} sample SD, range ${sample.min}–${sample.max}. Last-five average: ${sample.recentMean.toFixed(1)}.`);
   if(sample.minutesAvg!==null)why.push(`Minutes played averaged ${sample.minutesAvg.toFixed(1)} in the ${sample.rows.filter(r=>Number(r.minutes)>0).length} sourced games with minutes. Changes to projected minutes directly affect opportunity.`);
   if(sample.n<10)risks.push(`Only ${sample.n} recorded outcomes. ${sample.hits}/${sample.n} is not a calibrated future win probability.`);
   else risks.push(`Even ${sample.n} historical observations cannot directly account for changed role, opponent or availability. Observed streaks are not independent forecasts.`);
   for(const [key,label] of [['usagePct','Box-score usage estimate (%)'],['pace','Possession estimate per 48 team minutes'],['opponentDefenseRating','Opponent points allowed per 100 estimated possessions in these games']]){const vals=sample.rows.slice(0,10).map(r=>r[key]).filter(numeric).map(Number);if(vals.length)why.push(`${label}: ${avg(vals).toFixed(2)} across ${vals.length} recent sourced games. Historical description, not tonight’s matchup or a fitted adjustment.`);}
   const at=sample.rows.find(x=>x.date)?.date; if(at)observations.push(`Latest linked game: ${at}. Source: ${sample.evidence.source||'game logs'}.`);
 }else if(isPlayer){risks.push(`No verified ${periodLabel(quotePeriod(q)).toLowerCase()} game log is linked for this player and statistic. Historical mean, last-five/last-ten hit rates and projection remain unverified.`);}
 if(bp!==null){why.push(`Actual quoted price ${Number(q.odds)>0?'+':''}${q.odds} requires ${(bp*100).toFixed(1)}% wins among non-push settlements to break even (excluding fees).`);}
 if(baseline&&Number(q.line)!==Number(baseline.line)&&bp!==null){
   why.push(`${direction}: standard ${baseline.line} (${Number(baseline.odds)>0?'+':''}${baseline.odds}) requires ${baseP===null?'unknown':(baseP*100).toFixed(1)+'%'}; this ${q.line} alternative requires ${(bp*100).toFixed(1)}%. This moves the required probability from ${baseP===null?'unknown':(baseP*100).toFixed(1)+'%'} to ${(bp*100).toFixed(1)}%. A cheaper price alone does not establish better value.`);
   if(sample){const b=sampleSummary(baseline,records);if(b)why.push(`In the same ${sample.n}-game sample, the standard line hit ${b.hits} times and this alternate hit ${sample.hits} times. Difference: ${sample.hits-b.hits} outcomes.`);}
 }
 if(q.noVigProb!==null&&q.noVigProb!==undefined&&numeric(q.noVigProb))observations.push(`Same-book two-sided no-vig price proxy ${(Number(q.noVigProb)*100).toFixed(1)}%; this is not independent hit probability.`);
 for(const n of sourceNotes){if(n.summary)why.push(`${n.channel||'Research'} (${n.date||'undated'}): ${n.summary}`);if(n.factor)risks.push(`${n.factor} [${n.channel||'research'}]`);}
 if(relatedExperts.length)observations.push(`${relatedExperts.filter(x=>x.match).length} outside pick(s) support this direction; ${relatedExperts.filter(x=>!x.match).length} differ. None is counted as calibrated probability.`);
 if(quotePeriod(q)!=='game'&&isPlayer){risks.push(`This is a ${periodLabel(quotePeriod(q)).toLowerCase()} prop. Full-game statistics must not be presented as period-specific hit rates.`);}
 if(!state.ok)risks.unshift(state.reason);
 if(!sourceNotes.length)risks.push('No dated, player-specific injury/opponent analysis is linked. Check official lineup and opponent data before wagering.');
 const evidenceScore=Math.min(10,(state.ok?1:0)+(sample?Math.min(4,Math.ceil(sample.n/5)+1):0)+(sourceNotes.length?2:0)+(relatedExperts.length?1:0));
 if(sample?.profile){const p=sample.profile;why.push(`Roster: ${p.teamName||p.team}; checked ${p.asOf}. Reported debut year ${p.debutYear??'unknown'}, experience ${p.experienceYears??'unknown'} years. Missing prior logs alone do not establish rookie status.`);}
 const model=forecast(q,sample,{now,game});
 const factors=contextReadback(q||{},context,now,game);
 why.push(...factors.why);risks.push(...factors.risks);const observed=observedContext(q||{},sample,records,context,game,now);why.push(...observed.why);risks.push(...observed.risks);factors.sources.push(...observed.sources);
 if(model.status==='experimental'){
 if(model.season)why.push(`Season-aware inputs: ${model.season.currentN} current-team games, ${model.season.priorN} comparable prior-season games. Current-season weight ${(100*model.season.currentWeight).toFixed(1)}%; prior strength ${model.season.priorStrength}; effective sample ${model.season.effectiveN.toFixed(1)}. Old-team prior games excluded: ${model.season.otherTeam}.`);
 why.push(`EXPERIMENTAL model: win ${(100*model.pWin).toFixed(1)}%, push ${(100*model.pPush).toFixed(1)}%, loss ${(100*model.pLoss).toFixed(1)}%. Based on ${model.n} earlier sourced appearances. Historical sampling interval ${(100*model.interval[0]).toFixed(1)}–${(100*model.interval[1]).toFixed(1)}%; not a calibrated forecast interval.`);
 if(model.expectedValue!==null)why.push(`Experimental expected net per 1 unit at this exact price: ${model.expectedValue.toFixed(3)} units, using P(win) × payout − P(loss), with pushes refunded. This is a model calculation, not an established betting edge.`);
 if(model.season)why.push(`Current-season chronological replay: ${model.backtest?.currentSeasonN??0} outcomes; Brier ${model.backtest?.currentSeasonBrier?.toFixed(4)??'unavailable'}. Previous-season test results are not a substitute for present-season validation.`);
 why.push(`Chronological current-threshold replay: ${model.backtest.n} test outcomes; multiclass Brier ${model.backtest.brier?.toFixed(4)??'unavailable'}; log loss ${model.backtest.logLoss?.toFixed(4)??'unavailable'}. Not historical price validation.`);
 if(model.minutes)why.push(`NBA minutes scenario: ${model.minutes.projectedMinutes.toFixed(1)} minutes from the prior five recorded appearances; scenario win ${(100*model.minutes.pWin).toFixed(1)}%. This is a mechanical estimate, not a confirmed rotation projection.`);
 risks.push(...model.caveats);
 }else risks.push(`Forecast unavailable: ${model.reason}`);
 const decision=exactDecision({state,quote:q,model,breakEven:bp,availability:factors.availability});
 const verdict = decision.summary;

 return {model,context:factors,state,sample,why,risks,observations,verdict,decision,evidenceScore,sourceNotes,relatedExperts,direction,breakEven:bp};
}

export function decidePick({state,sample,breakEven,quote={}}){return exactDecision({state,quote,breakEven,model:null});}
