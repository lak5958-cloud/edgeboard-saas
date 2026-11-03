import {researchPolicy} from './research-policy.mjs';
import {preferQuote,quoteLineKey} from './quote-selection.mjs';
// Deterministic research scanner. No new odds, probability calibration or bets.
import {analyzeSelection,sampleSummary,quoteStatus,implied,normalizeStat,nameKey} from './insights.mjs';
import {forecast,payout} from './prediction.mjs';import {quotePeriod,marketKey} from './markets.mjs';import {contextReadback} from './context.mjs';import {belongsToGame,quoteProfile,identityRecords} from './rosters.mjs';
export const quoteIdentity=q=>JSON.stringify([marketKey(q),Number(q.line),Number(q.odds),q.asOf]);
const seriesKey=(league,player,stat,period)=>[league,nameKey(player),normalizeStat(stat),period||'game'].join('|');
const family=q=>[q.league,q.eventID||q.game,nameKey(q.player),normalizeStat(q.stat),quotePeriod(q),q.side].join('|');
function compare(a,b){return b.boundProxy-a.boundProxy||b.currentGames-a.currentGames||b.expectedNet-a.expectedNet||b.sampleGames-a.sampleGames||quoteIdentity(a.quote).localeCompare(quoteIdentity(b.quote));}
export async function scanGamePicks({game,quotes=[],records=[],context={},research=[],experts=[],now=new Date(),book='draftkings',includeAlts=true,priceBand='typical',limit=5},{onForecast=null,onSample=null,progress=()=>{},yieldEvery=100,yieldTask=()=>new Promise(r=>setTimeout(r,0))}={}){
 now=new Date(now);limit=Math.max(1,Math.min(10,Number(limit)||5));
 const counts={gameQuotes:0,scanned:0,eligiblePrices:0,modeled:0,positiveModelReturn:0,shortlisted:0,playersWithHistory:0};
 const excluded={wrongBook:0,unsupported:0,closedOrStale:0,priceBand:0,alternateExcluded:0,invalidPrice:0,rosterConflict:0,unavailableStatus:0,missingHistory:0,noForecast:0,smallSample:0,nonpositiveReturn:0,weakTail:0};
 const base={game,book,includeAlts,priceBand,generatedAt:now.toISOString(),ranking:'Lean first, then historical sampling-bound return proxy, current-team sample, experimental expected net. One selection per player; alternate variants are deduplicated. This is an unvalidated research order, not a confidence or profit guarantee.',counts,excluded,recommendations:[],watchlist:[],validated:false};
 if(!game)return {...base,status:'empty',message:'Select a game first.'};
 const all=quotes.filter(q=>q.league===game.league&&(game.eventID&&q.eventID?q.eventID===game.eventID:q.game===game.game));counts.gameQuotes=all.length;
 const index=new Map(),playerSeries=new Map();for(const s of records){const k=seriesKey(s.league,s.subject,s.stat,String(s.periodID||'game').toLowerCase());if(!index.has(k))index.set(k,[]);index.get(k).push(s);const pk=s.league+'|'+nameKey(s.subject);if(!playerSeries.has(pk))playerSeries.set(pk,[]);playerSeries.get(pk).push(s);}
 const profiles=context.rosters||[];
 const availability=new Map();const players=new Set(),priced=new Map();
 // Keep the newest update for each exact bookmaker selection; never interpolate.
 for(const q of all){const id=quoteLineKey(q);if(preferQuote(q,priced.get(id)))priced.set(id,q);}
 const scored=[];
 for(const q of priced.values()){
  counts.scanned++;if(counts.scanned%yieldEvery===0){progress({phase:'scan',processed:counts.scanned,total:priced.size});await yieldTask();}
  if(book!=='all'&&q.book!==book){excluded.wrongBook++;continue;}
  if(q.kind!=='Player Prop'||quotePeriod(q)!=='game'||!['over','under'].includes(q.side)||q.researchOnly){excluded.unsupported++;continue;}
  if(!includeAlts&&q.alt){excluded.alternateExcluded++;continue;}
  const cash=payout(q.odds),bp=implied(q.odds);if(cash===null||bp===null||q.line===null||q.line===''||!Number.isFinite(Number(q.line))){excluded.invalidPrice++;continue;}
  if(!quoteStatus(q,game,now).ok){excluded.closedOrStale++;continue;}
  if(priceBand==='typical'&&(Number(q.odds)<-300||Number(q.odds)>300)){excluded.priceBand++;continue;}
  const pk=q.league+'|'+nameKey(q.player),profile=quoteProfile(q,game,profiles),fresh=profile&&now-Date.parse(profile.asOf)>=0&&now-Date.parse(profile.asOf)<2*3600000;
  if(fresh&&!belongsToGame(profile,game)){excluded.rosterConflict++;continue;}
  if(!availability.has(pk))availability.set(pk,contextReadback(q,context,now,game).availability);
  if(availability.get(pk)?.blocked){excluded.unavailableStatus++;continue;}
  counts.eligiblePrices++;
  const key=seriesKey(q.league,q.player,q.stat,quotePeriod(q)),rr=identityRecords(index.get(key)||[],profile,profiles);if(!profile&&profiles.filter(p=>p.league===q.league&&nameKey(p.subject)===nameKey(q.player)).length>1){excluded.rosterConflict++;continue;}
  // Historical sample is recomputed at each exact line, using indexed source series.
  const sample=sampleSummary(q,rr);if(!sample){excluded.missingHistory++;continue;}
  players.add(pk);const model=forecast(q,sample,{now,game,evaluate:false});
  if(onSample)onSample(q,sample,model,profile);
  if(model.status!=='experimental'){excluded.noForecast++;continue;}counts.modeled++;
  if(onForecast)onForecast(q,model,profile||sample.profile);
  if(sample.n<researchPolicy(q.league).training||model.n<researchPolicy(q.league).training){excluded.smallSample++;continue;}
  if((model.trainingHits??sample.hits)<3){excluded.weakTail++;continue;}
  const expectedNet=model.pWin*cash-model.pLoss;if(!Number.isFinite(expectedNet)||expectedNet<=0){excluded.nonpositiveReturn++;continue;}counts.positiveModelReturn++;
  // A sorting proxy using the historical lower sampling bound, not a guaranteed EV floor.
  const boundProxy=model.interval[0]*cash-(1-model.interval[0]);
  scored.push({quote:q,expectedNet,boundProxy,currentGames:model.season?.currentN??sample.current.n,sampleGames:sample.n,series:rr});
 }
 counts.playersWithHistory=players.size;scored.sort(compare);
 // Avoid hundreds of alt lines from one player crowding the expensive analysis pass.
 const families=new Set(),perPlayer=new Map(),short=[];
 for(const s of scored){const f=family(s.quote),p=nameKey(s.quote.player);if(families.has(f)||(perPlayer.get(p)||0)>=2)continue;families.add(f);perPlayer.set(p,(perPlayer.get(p)||0)+1);short.push(s);}
 const analyzed=[];
 for(let i=0;i<short.length;i++){
  progress({phase:'analysis',processed:i,total:short.length});if(i%5===0)await yieldTask();const s=short[i],q=s.quote;
  const baseline=all.find(b=>!b.alt&&b.book===q.book&&family(b)===family(q))||null;
  const analysis=analyzeSelection(q,{game,records:identityRecords(playerSeries.get(q.league+'|'+nameKey(q.player))||s.series,quoteProfile(q,game,profiles),profiles),context,research,experts,baseline,now});
  if(!analysis.state.ok||analysis.context?.availability?.blocked||analysis.model.status!=='experimental'||!(analysis.model.expectedValue>0))continue;
  analyzed.push({...s,series:undefined,analysis,id:quoteIdentity(q)});
 }
 analyzed.sort((a,b)=>Number(b.analysis.decision.label==='LEAN')-Number(a.analysis.decision.label==='LEAN')||compare(a,b));
 const used=new Set(),chosen=[];for(const a of analyzed){const p=nameKey(a.quote.player);if(used.has(p))continue;used.add(p);chosen.push(a);if(chosen.length>=limit)break;}
 base.recommendations=chosen.filter(x=>x.analysis.decision.label==='LEAN');base.watchlist=chosen.filter(x=>x.analysis.decision.label!=='LEAN');counts.shortlisted=chosen.length;
 progress({phase:'done',processed:counts.scanned,total:priced.size});
 return {...base,status:chosen.length?'ready':'empty',message:base.recommendations.length?`${base.recommendations.length} experimental research lean(s); verify the exact book price and availability.`:chosen.length?'No qualifying picks under the current decision rules. The watchlist below shows the strongest positive-model-return candidates that still receive Pass.':'No supported positive-model-return candidates met these filters. No pick is forced.'};
}
